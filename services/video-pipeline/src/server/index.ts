// ── Video Pipeline Server (Hono) ────────────────────────────────────────
// Internal control plane for server-tier transcoding. Runs after the
// browser tier has either declined to handle a job (via structured
// fallback) or for jobs that originate server-side.

import { Hono } from "hono";
import { z } from "zod";
import { negotiateCodec } from "../core/codec";
import {
  CONTAINERS,
  AUDIO_CODECS,
  VIDEO_CODECS,
  type JobRecord,
  type JobState,
  type ProgressEvent,
  type SourceRef,
  type TargetSpec,
} from "../core/types";
import {
  type FfmpegRunner,
  SubprocessFfmpegRunner,
} from "./ffmpeg-runner";
import { JobStore, TenantQueue } from "./queue";
import {
  HttpObjectStorage,
  type ObjectStorage,
} from "./storage";

// ── Zod schemas ─────────────────────────────────────────────────────────

export const transcodeRequestSchema = z.object({
  tenantId: z.string().min(1).max(128),
  sourceUrl: z.string().url(),
  target: z.object({
    container: z.enum(CONTAINERS),
    videoCodec: z.enum(VIDEO_CODECS),
    audioCodec: z.enum(AUDIO_CODECS),
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(4320),
    bitrate: z.number().int().positive().optional(),
    fps: z.number().int().positive().max(240).optional(),
  }),
});

export type TranscodeRequest = z.infer<typeof transcodeRequestSchema>;

// ── Server context ──────────────────────────────────────────────────────

export interface ServerDeps {
  readonly storage: ObjectStorage;
  readonly ffmpeg: FfmpegRunner;
  readonly store: JobStore;
  readonly queue: TenantQueue;
  readonly tmpDir: string;
  readonly newId: () => string;
}

export function defaultDeps(): ServerDeps {
  const baseUrl = process.env["VIDEO_STORAGE_URL"] ?? "http://localhost:9100";
  return {
    storage: new HttpObjectStorage(baseUrl),
    ffmpeg: new SubprocessFfmpegRunner(),
    store: new JobStore(),
    queue: new TenantQueue(),
    tmpDir: process.env["VIDEO_TMP_DIR"] ?? "/tmp/video-pipeline",
    newId: () => crypto.randomUUID(),
  };
}

// ── SSE encoding ────────────────────────────────────────────────────────

export function encodeSseEvent(ev: ProgressEvent): string {
  return `event: progress\ndata: ${JSON.stringify(ev)}\n\n`;
}

export function encodeSseDone(record: JobRecord): string {
  return `event: done\ndata: ${JSON.stringify({
    id: record.id,
    state: record.state,
    resultUrl: record.resultUrl ?? null,
  })}\n\n`;
}

// ── Job runner ──────────────────────────────────────────────────────────

interface JobRunnerInput {
  readonly deps: ServerDeps;
  readonly job: JobRecord;
  readonly emit: (ev: ProgressEvent) => void;
}

async function runJob(input: JobRunnerInput): Promise<void> {
  const { deps, job, emit } = input;
  const { storage, ffmpeg, store, tmpDir } = deps;

  const transition = (state: JobState, progress: number, message?: string) => {
    store.update(job.id, { state, progress });
    const ev: ProgressEvent =
      message === undefined ? { state, progress } : { state, progress, message };
    emit(ev);
  };

  try {
    transition("running", 0, "Downloading source");

    const inputPath = `${tmpDir}/${job.id}-in`;
    const outputPath = `${tmpDir}/${job.id}-out.${job.target.container}`;
    if (job.source.kind === "url") {
      await storage.download(job.source.url, inputPath);
    } else {
      throw new Error("Server tier requires a URL source");
    }

    for await (const ev of ffmpeg.run({
      inputPath,
      outputPath,
      target: job.target,
    })) {
      // Map ffmpeg progress (0..1) to overall 0.1..0.8 of the job.
      const overall = 0.1 + ev.progress * 0.7;
      transition("running", overall, ev.message);
    }

    transition("uploading", 0.85, "Uploading result");
    const key = `${job.tenantId}/${job.id}.${job.target.container}`;
    const resultUrl = await storage.upload(outputPath, key);

    store.update(job.id, { state: "done", progress: 1, resultUrl });
    const final = store.get(job.id);
    if (final) {
      const doneEv: ProgressEvent = {
        state: "done",
        progress: 1,
        message: "Complete",
      };
      emit(doneEv);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.update(job.id, { state: "failed", error: message });
    emit({ state: "failed", progress: 0, message });
  }
}

// ── Public submit (used by tests + the HTTP route) ──────────────────────

export interface SubmitResult {
  readonly job: JobRecord;
  readonly stream: AsyncGenerator<ProgressEvent, void, void>;
}

export function submitJob(deps: ServerDeps, req: TranscodeRequest): SubmitResult {
  const reqT = req.target;
  const target: TargetSpec = {
    container: reqT.container,
    videoCodec: reqT.videoCodec,
    audioCodec: reqT.audioCodec,
    width: reqT.width,
    height: reqT.height,
    ...(reqT.bitrate !== undefined ? { bitrate: reqT.bitrate } : {}),
    ...(reqT.fps !== undefined ? { fps: reqT.fps } : {}),
  };
  const negotiation = negotiateCodec(target);
  if (!negotiation.accepted) {
    throw new Error(`Codec negotiation failed: ${negotiation.reason}`);
  }

  const id = deps.newId();
  const now = Date.now();
  const source: SourceRef = { kind: "url", url: req.sourceUrl };
  const initial: JobRecord = {
    id,
    tenantId: req.tenantId,
    state: "queued",
    source,
    target,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  deps.store.put(initial);

  // Bridge: run the job via the queue and bridge progress events into an
  // async generator the caller can consume / forward to SSE.
  const events: ProgressEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let finished = false;

  const emit = (ev: ProgressEvent) => {
    events.push(ev);
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  deps.queue.enqueue(req.tenantId, {
    job: initial,
    run: async () => {
      const cur = deps.store.get(id) ?? initial;
      try {
        await runJob({ deps, job: cur, emit });
      } finally {
        finished = true;
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      }
    },
  });

  async function* stream(): AsyncGenerator<ProgressEvent, void, void> {
    while (true) {
      if (events.length > 0) {
        const next = events.shift();
        if (next) yield next;
        continue;
      }
      if (finished) return;
      await new Promise<void>((r) => {
        resolveNext = r;
      });
    }
  }

  return { job: initial, stream: stream() };
}

// ── Hono app ────────────────────────────────────────────────────────────

export function createApp(deps: ServerDeps = defaultDeps()): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "video-pipeline",
      timestamp: new Date().toISOString(),
    }),
  );

  app.post("/transcode", async (c) => {
    let parsed: TranscodeRequest;
    try {
      const body: unknown = await c.req.json();
      parsed = transcodeRequestSchema.parse(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid request";
      return c.json({ error: message }, 400);
    }

    let submitted: SubmitResult;
    try {
      submitted = submitJob(deps, parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submit failed";
      return c.json({ error: message }, 400);
    }

    const { job, stream } = submitted;

    const sse = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(
          enc.encode(
            `event: queued\ndata: ${JSON.stringify({ id: job.id })}\n\n`,
          ),
        );
        try {
          for await (const ev of stream) {
            controller.enqueue(enc.encode(encodeSseEvent(ev)));
          }
          const final = deps.store.get(job.id);
          if (final) controller.enqueue(enc.encode(encodeSseDone(final)));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(sse, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  app.get("/jobs/:id", (c) => {
    const id = c.req.param("id");
    const job = deps.store.get(id);
    if (!job) return c.json({ error: "Not found" }, 404);
    return c.json(job);
  });

  return app;
}

// ── Entrypoint when run via `bun run start` ─────────────────────────────

if (import.meta.main) {
  const app = createApp();
  const port = Number.parseInt(process.env["VIDEO_PIPELINE_PORT"] ?? "9101", 10);
  console.log(`[video-pipeline] Listening on :${port}`);
  Bun.serve({ port, fetch: app.fetch });
}

export { JobStore, TenantQueue } from "./queue";
export {
  HttpObjectStorage,
  type ObjectStorage,
} from "./storage";
export {
  type FfmpegRunner,
  SubprocessFfmpegRunner,
} from "./ffmpeg-runner";
