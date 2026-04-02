/**
 * WebCodecs feature detection and codec capability querying.
 *
 * Provides runtime checks for WebCodecs API availability and probes the
 * browser for supported video codecs (H.264, VP9, AV1) via
 * `VideoEncoder.isConfigSupported()`.
 */

import type {
  CodecSupportResult,
  HardwarePreference,
  SupportedCodecsReport,
  VideoCodecId,
  VideoCodecName,
  WebCodecsSupport,
} from "./types";
import { CODEC_STRINGS } from "./types";

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/**
 * Checks whether the current environment supports the core WebCodecs APIs:
 * `VideoEncoder`, `VideoDecoder`, `AudioEncoder`, `AudioDecoder`.
 */
export function isWebCodecsSupported(): WebCodecsSupport {
  const videoEncoder = typeof globalThis.VideoEncoder === "function";
  const videoDecoder = typeof globalThis.VideoDecoder === "function";
  const audioEncoder = typeof globalThis.AudioEncoder === "function";
  const audioDecoder = typeof globalThis.AudioDecoder === "function";

  return {
    videoEncoder,
    videoDecoder,
    audioEncoder,
    audioDecoder,
    allSupported: videoEncoder && videoDecoder && audioEncoder && audioDecoder,
  };
}

// ---------------------------------------------------------------------------
// Codec probing
// ---------------------------------------------------------------------------

/** Default dimensions used when probing codec support. */
const PROBE_WIDTH = 1920;
const PROBE_HEIGHT = 1080;
const PROBE_BITRATE = 5_000_000;
const PROBE_FRAMERATE = 30;

/**
 * Probe a single codec for encoder support.
 *
 * Returns `null` when the `VideoEncoder` API is not available at all.
 */
async function probeCodec(
  name: VideoCodecName,
  codecString: VideoCodecId,
  hardwareAcceleration: HardwarePreference = "prefer-hardware",
): Promise<CodecSupportResult | null> {
  if (typeof globalThis.VideoEncoder !== "function") {
    return null;
  }

  try {
    const result = await VideoEncoder.isConfigSupported({
      codec: codecString,
      width: PROBE_WIDTH,
      height: PROBE_HEIGHT,
      bitrate: PROBE_BITRATE,
      framerate: PROBE_FRAMERATE,
      hardwareAcceleration,
    });

    // Try to detect if hardware acceleration is actually used by checking
    // the returned config. The spec says the UA may override the hint.
    const returnedHw =
      (result.config as VideoEncoderConfig | undefined)
        ?.hardwareAcceleration ?? hardwareAcceleration;

    return {
      codec: name,
      codecString,
      supported: result.supported === true,
      hardwareAccelerated:
        result.supported === true && returnedHw === "prefer-hardware",
    };
  } catch {
    return {
      codec: name,
      codecString,
      supported: false,
      hardwareAccelerated: false,
    };
  }
}

/**
 * Queries the browser for support of H.264, VP9, and AV1 video encoding.
 *
 * Results are ordered by preference (AV1 > VP9 > H.264). The `bestCodec`
 * field is set to the highest-preference codec that is supported, or `null`
 * if none are supported.
 */
export async function getSupportedCodecs(
  hardwareAcceleration: HardwarePreference = "prefer-hardware",
): Promise<SupportedCodecsReport> {
  const codecs: readonly [VideoCodecName, VideoCodecId][] = [
    ["av1", CODEC_STRINGS.av1],
    ["vp9", CODEC_STRINGS.vp9],
    ["h264", CODEC_STRINGS.h264],
  ];

  const probeResults = await Promise.all(
    codecs.map(([name, str]) => probeCodec(name, str, hardwareAcceleration)),
  );

  const results: CodecSupportResult[] = probeResults.filter(
    (r): r is CodecSupportResult => r !== null,
  );

  const best = results.find((r) => r.supported) ?? null;

  return {
    results,
    bestCodec: best?.codec ?? null,
  };
}

/**
 * Returns the best available codec for encoding.
 *
 * Preference order: AV1 > VP9 > H.264. Returns `null` when no codec is
 * supported (e.g. WebCodecs unavailable).
 */
export async function getBestCodec(
  hardwareAcceleration: HardwarePreference = "prefer-hardware",
): Promise<VideoCodecName | null> {
  const report = await getSupportedCodecs(hardwareAcceleration);
  return report.bestCodec;
}
