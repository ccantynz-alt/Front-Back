import { z } from "zod";
import { inngest } from "./client";

// ── Zod schemas for all workflow event payloads ──────────────────

export const AIPipelineEventSchema = z.object({
  documents: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  query: z.string(),
  model: z.string().optional(),
  userId: z.string(),
  sessionId: z.string().optional(),
});

export const VideoProcessEventSchema = z.object({
  videoId: z.string(),
  sourceUrl: z.string().url(),
  format: z.string(),
  userId: z.string(),
  options: z
    .object({
      generateThumbnails: z.boolean().default(true),
      transcribe: z.boolean().default(true),
      generateSummary: z.boolean().default(true),
      maxDurationSeconds: z.number().positive().optional(),
    })
    .optional(),
});

export const SiteBuildEventSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  requirements: z.string(),
  style: z
    .object({
      theme: z.string().optional(),
      colorScheme: z.string().optional(),
      layout: z.string().optional(),
    })
    .optional(),
  targetPages: z.array(z.string()).optional(),
});

// ── TypeScript event type map for Inngest ────────────────────────

export type WorkflowEvents = {
  "ai/pipeline.requested": {
    data: z.infer<typeof AIPipelineEventSchema>;
  };
  "video/process.requested": {
    data: z.infer<typeof VideoProcessEventSchema>;
  };
  "site/build.requested": {
    data: z.infer<typeof SiteBuildEventSchema>;
  };
};

// ── Type-safe event sending helpers ──────────────────────────────

export async function sendAIPipelineEvent(
  data: z.infer<typeof AIPipelineEventSchema>,
): Promise<void> {
  const validated = AIPipelineEventSchema.parse(data);
  await inngest.send({
    name: "ai/pipeline.requested",
    data: validated,
  });
}

export async function sendVideoProcessEvent(
  data: z.infer<typeof VideoProcessEventSchema>,
): Promise<void> {
  const validated = VideoProcessEventSchema.parse(data);
  await inngest.send({
    name: "video/process.requested",
    data: validated,
  });
}

export async function sendSiteBuildEvent(
  data: z.infer<typeof SiteBuildEventSchema>,
): Promise<void> {
  const validated = SiteBuildEventSchema.parse(data);
  await inngest.send({
    name: "site/build.requested",
    data: validated,
  });
}
