import { Inngest } from "inngest";

/**
 * Inngest client for Back to the Future durable workflows.
 * Used across all workflow functions for AI pipelines, video processing,
 * and site building.
 */
export const inngest = new Inngest({
  id: "back-to-the-future",
});
