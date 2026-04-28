# @back-to-the-future/video-pipeline

> **Stream-class video transcoding — beats Cloudflare Stream + Vercel video.**
> Crontech does WebGPU client-side encoding/transforms before falling back
> to server-side ffmpeg. Vercel/Cloudflare can't do that.

This service ships in two halves:

- **BROWSER** (`/browser`) — a WebGPU + WebCodecs client lib. When the
  user's device can do it, transcode on the user's GPU. **$0/sec, sub-50ms.**
- **SERVER** (`/server`) — a Hono service that drives sandboxed `ffmpeg`
  subprocesses, streams progress over SSE, and stores results in object
  storage. The fallback tier when the browser can't or won't.

A pure-functions **CORE** (`/core`) is shared between both — codec
negotiation, resolution clamping, bitrate calculation, ffmpeg arg
construction. No IO. Fully unit-tested.

---

## Browser API

```ts
import { transcode, BrowserTranscodeError } from "@back-to-the-future/video-pipeline/browser";

try {
  for await (const ev of transcode({
    source: { kind: "blob", blob: file },
    target: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1280,
      height: 720,
    },
  })) {
    setProgress(ev.progress);
  }
} catch (err) {
  if (err instanceof BrowserTranscodeError) {
    // Fallback to the server tier — err.code is one of:
    //   no_webcodecs | no_webgpu | unsupported_codec |
    //   unsupported_container | resolution_too_large |
    //   shader_compile_failed | negotiation_failed
    await uploadToServerTier(file);
  } else {
    throw err;
  }
}
```

The function returns an **async iterator** of `ProgressEvent`s — each tick
gives `{ state, progress, message? }`. The state machine is
`queued → running → done | failed` on the browser tier (no `uploading`
because the browser writes its result locally).

Feature detection is dependency-injected so callers can mock it in tests:

```ts
import { canBrowserHandle, detectCapabilitiesFromGlobal }
  from "@back-to-the-future/video-pipeline/browser";

const env = detectCapabilitiesFromGlobal();
if (canBrowserHandle(env, target).canBrowserHandle) { /* … */ }
```

---

## Server API

The Hono app exposes three routes:

| Method | Path             | Description |
|--------|------------------|-------------|
| GET    | `/health`        | Liveness probe |
| POST   | `/transcode`     | Submit a job; response is an SSE stream of `progress` events ending in `done` |
| GET    | `/jobs/:id`      | Fetch a job record (state, progress, resultUrl) |

`POST /transcode` body (Zod-validated):

```json
{
  "tenantId": "tenant-a",
  "sourceUrl": "https://cdn.example.com/source.mov",
  "target": {
    "container": "mp4",
    "videoCodec": "h264",
    "audioCodec": "aac",
    "width": 1920,
    "height": 1080,
    "bitrate": 5000000,
    "fps": 30
  }
}
```

SSE response shape (one frame per event):

```
event: queued
data: {"id":"<uuid>"}

event: progress
data: {"state":"running","progress":0.5,"message":"ffmpeg encoding"}

event: progress
data: {"state":"uploading","progress":0.85,"message":"Uploading result"}

event: done
data: {"id":"<uuid>","state":"done","resultUrl":"https://…"}
```

### Job state machine

```
queued → running → uploading → done
                              ↘ failed (from any non-terminal state)
```

### Tenant scoping

Every job carries a `tenantId`. The in-memory `TenantQueue` guarantees
that submissions from the same tenant are processed FIFO; different
tenants run independently and concurrently. Production swaps the
in-memory queue for Durable Objects without touching the server logic.

---

## Codec support matrix

| Container | Video codecs           | Audio codecs   | Browser tier |
|-----------|------------------------|----------------|--------------|
| `mp4`     | h264, h265, av1        | aac, mp3       | h264 only    |
| `webm`    | vp9, av1               | opus           | vp9 only     |
| `mov`     | h264, h265             | aac            | server only  |

- **Resolution** is clamped to **3840×2160 (4K)** and forced to even
  dimensions on both tiers.
- **Bitrate** is auto-computed from resolution × fps × codec baseline
  bpp when callers don't supply one. h265/av1/vp9 each receive a
  smaller bpp budget than h264 because they're far more efficient.

---

## Environment variables

| Var                    | Default                     | Description |
|------------------------|-----------------------------|-------------|
| `VIDEO_PIPELINE_PORT`  | `9101`                      | Hono server port |
| `VIDEO_STORAGE_URL`    | `http://localhost:9100`     | Object-storage base URL (R2/S3 wrapper) |
| `VIDEO_TMP_DIR`        | `/tmp/video-pipeline`       | Local scratch dir for ffmpeg input/output |

---

## Testing

```sh
bun test services/video-pipeline
bunx tsc --noEmit -p services/video-pipeline
bunx biome check services/video-pipeline
```

All tests run **without** invoking real ffmpeg or hitting real storage —
both are dependency-injected via `FfmpegRunner` and `ObjectStorage`
interfaces, with mocks in `src/server/server.test.ts`.

---

## Why this beats the competition

- **Cloudflare Stream**: server-only. No client-side encoding. You pay
  per-second for every transcode.
- **Vercel video**: thin wrapper over Mux. Same problem.
- **Crontech**: when the user has a modern GPU, the encode happens on
  their hardware for free. When they don't, we fall back to server-side
  ffmpeg with structured fallback codes — no surprise failures.
