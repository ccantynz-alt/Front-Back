import { inngest } from "../client";

interface TranscriptionResult {
  transcribed: boolean;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  language: string;
  confidence: number;
}

interface SummaryResult {
  generated: boolean;
  summary: string;
  keyTopics: string[];
  wordCount: number;
}

/**
 * Video Processing Workflow — durable video pipeline.
 *
 * Steps:
 * 1. validate-input — check video format and size
 * 2. extract-metadata — get duration, resolution, codec info
 * 3. generate-thumbnails — create preview thumbnails
 * 4. transcribe — send to AI for transcription (long step)
 * 5. generate-summary — AI summary of transcript
 *
 * Configurable concurrency limits prevent GPU/API overload.
 * Each step retries up to 3 times independently.
 */
export const videoProcessWorkflow = inngest.createFunction(
  {
    id: "video-process",
    name: "Video Processing Pipeline",
    retries: 3,
    concurrency: [
      {
        limit: 10,
        key: "event.data.userId",
      },
    ],
    triggers: [{ event: "video/process.requested" }],
  },
  async ({ event, step }) => {
    const { videoId, sourceUrl, format, userId, options } = event.data;

    // Step 1: Validate input — check format and size
    const validation = await step.run("validate-input", async () => {
      const supportedFormats = [
        "mp4",
        "webm",
        "mov",
        "avi",
        "mkv",
        "m4v",
      ];
      const isSupported = supportedFormats.includes(format.toLowerCase());

      if (!isSupported) {
        throw new Error(
          `Unsupported video format: ${format}. Supported: ${supportedFormats.join(", ")}`,
        );
      }

      // TODO: Replace with actual HEAD request to check file size
      return {
        videoId,
        format: format.toLowerCase(),
        sourceUrl,
        valid: true,
        estimatedSizeBytes: 0,
      };
    });

    // Step 2: Extract metadata — duration, resolution, codec
    const metadata = await step.run("extract-metadata", async () => {
      // TODO: Replace with actual ffprobe / WebCodecs metadata extraction
      return {
        videoId: validation.videoId,
        duration: 0,
        resolution: { width: 1920, height: 1080 },
        codec: "h264",
        fps: 30,
        bitrate: 0,
        audioCodec: "aac",
        fileSize: validation.estimatedSizeBytes,
      };
    });

    // Step 3: Generate preview thumbnails
    const thumbnails = await step.run("generate-thumbnails", async () => {
      if (options?.generateThumbnails === false) {
        return { generated: false, thumbnails: [] as string[], count: 0 };
      }

      // TODO: Replace with actual thumbnail extraction (ffmpeg / WebCodecs)
      const count = Math.min(Math.ceil(metadata.duration / 30), 10) || 3;
      const thumbnailUrls = Array.from(
        { length: count },
        (_, i: number) => `thumbnails/${videoId}/thumb-${i}.jpg`,
      );

      return {
        generated: true,
        thumbnails: thumbnailUrls,
        count,
      };
    });

    // Step 4: Transcribe — AI transcription (long-running step)
    const transcription = await step.run(
      "transcribe",
      async (): Promise<TranscriptionResult> => {
        if (options?.transcribe === false) {
          return {
            transcribed: false,
            text: "",
            segments: [],
            language: "",
            confidence: 0,
          };
        }

        // TODO: Replace with actual Whisper / transcription API call
        // This step may take several minutes for long videos
        return {
          transcribed: true,
          text: "Transcription placeholder — wire up Whisper / ASR service here",
          segments: [],
          language: "en",
          confidence: 0,
        };
      },
    );

    // Step 5: Generate AI summary of transcript
    const summary = await step.run(
      "generate-summary",
      async (): Promise<SummaryResult> => {
        if (
          options?.generateSummary === false ||
          !transcription.transcribed
        ) {
          return { generated: false, summary: "", keyTopics: [], wordCount: 0 };
        }

        // TODO: Replace with actual AI SDK summary generation
        return {
          generated: true,
          summary: "Summary placeholder — wire up Vercel AI SDK here",
          keyTopics: [],
          wordCount: 0,
        };
      },
    );

    return {
      status: "completed" as const,
      videoId,
      userId,
      metadata,
      thumbnails,
      transcription: {
        transcribed: transcription.transcribed,
        language: transcription.language,
        segmentCount: transcription.segments.length,
      },
      summary: {
        generated: summary.generated,
        keyTopics: summary.generated ? summary.keyTopics : undefined,
      },
      timestamp: new Date().toISOString(),
    };
  },
);
