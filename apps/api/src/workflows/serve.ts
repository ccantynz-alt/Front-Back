import { Hono } from "hono";
import { serve } from "inngest/hono";
import { inngest } from "./client";
import { workflowFunctions } from "./index";

/**
 * Hono route handler for Inngest.
 * Mounts the Inngest API at /api/inngest for function registration,
 * event receiving, and the Inngest Dev Server UI.
 */
export const inngestApp = new Hono();

const handler = serve({
  client: inngest,
  functions: workflowFunctions,
});

inngestApp.use("/inngest", async (c) => {
  return handler(c);
});
