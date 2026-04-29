// ── Server tests — queue, SSE, mocked ffmpeg + storage ─────────────────

import { describe, expect, test } from "bun:test";
import {
  createApp,
  encodeSseDone,
  encodeSseEvent,
  submitJob,
  type ServerDeps,
  type TranscodeRequest,
} from "./index";
import type { FfmpegRunInput, FfmpegRunner } from "./ffmpeg-runner";
import { JobStore, TenantQueue } from "./queue";
import type { ObjectStorage } from "./storage";
import type { JobRecord, ProgressEvent } from "../core/types";

class MockStorage implements ObjectStorage {
  public readonly downloaded: string[] = [];
  public readonly uploaded: { local: string; key: string }[] = [];
  async download(url: string, _localPath: string): Promise<void> {
    this.downloaded.push(url);
  }
  async upload(localPath: string, key: string): Promise<string> {
    this.uploaded.push({ local: localPath, key });
    return `mock://${key}`;
  }
}

class ScriptedFfmpeg implements FfmpegRunner {
  public lastInput?: FfmpegRunInput;
  async *run(input: FfmpegRunInput): AsyncGenerator<ProgressEvent, void, void> {
    this.lastInput = input;
    yield { state: "running", progress: 0, message: "start" };
    yield { state: "running", progress: 0.5, message: "halfway" };
    yield { state: "running", progress: 1, message: "complete" };
  }
}

class FailingFfmpeg implements FfmpegRunner {
  // eslint-disable-next-line require-yield
  async *run(_input: FfmpegRunInput): AsyncGenerator<ProgressEvent, void, void> {
    throw new Error("synthetic ffmpeg failure");
  }
}

function buildDeps(ffmpeg: FfmpegRunner = new ScriptedFfmpeg()): ServerDeps {
  let counter = 0;
  return {
    storage: new MockStorage(),
    ffmpeg,
    store: new JobStore(),
    queue: new TenantQueue(),
    tmpDir: "/tmp/video-pipeline-test",
    newId: () => `job-${++counter}`,
  };
}

const sampleReq: TranscodeRequest = {
  tenantId: "tenant-a",
  sourceUrl: "https://cdn.example.com/source.mov",
  target: {
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1280,
    height: 720,
  },
};

async function drain(
  stream: AsyncGenerator<ProgressEvent, void, void>,
): Promise<ProgressEvent[]> {
  const events: ProgressEvent[] = [];
  for await (const ev of stream) events.push(ev);
  return events;
}

describe("submitJob (happy path)", () => {
  test("runs the queue, calls storage + ffmpeg, transitions states", async () => {
    const deps = buildDeps();
    const result = submitJob(deps, sampleReq);
    expect(result.job.state).toBe("queued");
    expect(result.job.tenantId).toBe("tenant-a");

    const events = await drain(result.stream);

    const states = events.map((e) => e.state);
    expect(states).toContain("running");
    expect(states).toContain("uploading");
    expect(states).toContain("done");

    const final = deps.store.get(result.job.id);
    expect(final?.state).toBe("done");
    expect(final?.resultUrl).toMatch(/^mock:\/\/tenant-a\//);
  });

  test("propagates ffmpeg failures into a failed job state", async () => {
    const deps = buildDeps(new FailingFfmpeg());
    const result = submitJob(deps, sampleReq);
    const events = await drain(result.stream);
    const last = events[events.length - 1];
    expect(last?.state).toBe("failed");
    const final = deps.store.get(result.job.id);
    expect(final?.state).toBe("failed");
    expect(final?.error).toContain("synthetic ffmpeg failure");
  });
});

describe("submitJob — validation", () => {
  test("rejects an unsupported container/codec combo at submit time", () => {
    const deps = buildDeps();
    expect(() =>
      submitJob(deps, {
        ...sampleReq,
        target: { ...sampleReq.target, videoCodec: "vp9" }, // mp4 + vp9 invalid
      }),
    ).toThrow(/Codec negotiation failed/);
  });
});

describe("queue ordering", () => {
  test("two submissions for the same tenant are processed FIFO", async () => {
    const deps = buildDeps();
    const a = submitJob(deps, { ...sampleReq, sourceUrl: "https://x/a.mov" });
    const b = submitJob(deps, { ...sampleReq, sourceUrl: "https://x/b.mov" });

    await drain(a.stream);
    await drain(b.stream);

    const finalA = deps.store.get(a.job.id);
    const finalB = deps.store.get(b.job.id);
    expect(finalA?.state).toBe("done");
    expect(finalB?.state).toBe("done");
    expect(finalA?.createdAt).toBeLessThanOrEqual(finalB?.createdAt ?? 0);
  });
});

describe("SSE encoding", () => {
  test("encodeSseEvent yields a well-formed event:progress frame", () => {
    const ev = encodeSseEvent({
      state: "running",
      progress: 0.5,
      message: "halfway",
    });
    expect(ev.startsWith("event: progress\n")).toBe(true);
    expect(ev).toContain("data: ");
    expect(ev.endsWith("\n\n")).toBe(true);
    const json = ev.split("data: ")[1]?.trim() ?? "";
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toMatchObject({ state: "running", progress: 0.5 });
  });

  test("encodeSseDone yields a done frame referencing the job id", () => {
    const record: JobRecord = {
      id: "job-1",
      tenantId: "t",
      state: "done",
      source: { kind: "url", url: "https://x/y.mov" },
      target: {
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        width: 1280,
        height: 720,
      },
      progress: 1,
      createdAt: 0,
      updatedAt: 0,
      resultUrl: "mock://t/job-1.mp4",
    };
    const f = encodeSseDone(record);
    expect(f.startsWith("event: done\n")).toBe(true);
    expect(f).toContain("job-1");
    expect(f).toContain("mock://t/job-1.mp4");
  });
});

describe("HTTP routes", () => {
  test("GET /health returns ok", async () => {
    const app = createApp(buildDeps());
    const res = await app.fetch(new Request("http://x/health"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  test("POST /transcode 400s on bad payload", async () => {
    const app = createApp(buildDeps());
    const res = await app.fetch(
      new Request("http://x/transcode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("GET /jobs/:id returns 404 for unknown id", async () => {
    const app = createApp(buildDeps());
    const res = await app.fetch(new Request("http://x/jobs/missing"));
    expect(res.status).toBe(404);
  });

  test("GET /jobs/:id returns the record after submitJob", async () => {
    const deps = buildDeps();
    const result = submitJob(deps, sampleReq);
    await drain(result.stream);
    const app = createApp(deps);
    const res = await app.fetch(new Request(`http://x/jobs/${result.job.id}`));
    expect(res.status).toBe(200);
    const json = (await res.json()) as JobRecord;
    expect(json.id).toBe(result.job.id);
    expect(json.state).toBe("done");
  });
});
