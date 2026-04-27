/**
 * Job processor registry.
 *
 * Maps job types to handler functions. The main worker calls
 * `getProcessor(jobType)` for each incoming job and delegates
 * to the registered handler.
 */

import type { Job } from "bullmq";
import type { JobType } from "./jobs";
import { JOB_SCHEMAS } from "./jobs";

// ── Processor type ────────────────────────────────────────────────────

export type JobProcessor = (
  data: Record<string, unknown>,
  job: Job,
) => Promise<void>;

// ── Registry ──────────────────────────────────────────────────────────

const registry = new Map<JobType, JobProcessor>();

/**
 * Register a processor for a given job type.
 */
export function registerProcessor(
  jobType: JobType,
  handler: JobProcessor,
): void {
  registry.set(jobType, handler);
}

/**
 * Get the registered processor for a job type, or undefined.
 */
export function getProcessor(jobType: JobType): JobProcessor | undefined {
  return registry.get(jobType);
}

/**
 * Check whether a processor is registered for a given job type.
 */
export function hasProcessor(jobType: JobType): boolean {
  return registry.has(jobType);
}

/**
 * List all registered job types.
 */
export function registeredTypes(): JobType[] {
  return [...registry.keys()];
}

/**
 * Clear all registered processors (useful for tests).
 */
export function clearProcessors(): void {
  registry.clear();
}

// ── Main dispatch function ────────────────────────────────────────────

/**
 * Dispatch a BullMQ job to the appropriate registered processor.
 *
 * Validates the payload against the job type's Zod schema before
 * calling the handler. Throws if no processor is registered.
 */
export async function dispatch(job: Job): Promise<void> {
  const jobType = job.name as JobType;
  const processor = registry.get(jobType);

  if (!processor) {
    throw new Error(`No processor registered for job type: ${jobType}`);
  }

  // Validate payload against schema
  const schema = JOB_SCHEMAS[jobType];
  if (schema) {
    schema.parse(job.data);
  }

  await processor(job.data as Record<string, unknown>, job);
}

// ── Default stub processors ───────────────────────────────────────────

registerProcessor("send_email", async (data, _job) => {
  // Delegates to the existing email client in apps/api.
  // In production, import { sendEmail } from "../../email/client"
  // and call it here. Stubbed for now.
  console.info("[queue:send_email] Processing:", data["to"], data["subject"]);
});

registerProcessor("process_webhook", async (data, _job) => {
  // Delegates to the webhook dispatcher.
  // In production, import { runDispatcher } and enqueue the delivery.
  console.info(
    "[queue:process_webhook] Processing:",
    data["webhookId"],
    data["eventType"],
  );
});

registerProcessor("provision_tenant", async (data, _job) => {
  console.info(
    "[queue:provision_tenant] Provisioning tenant:",
    data["tenantId"],
    "plan:",
    data["plan"],
  );
  // Stub: will call tenant-manager.provisionTenantDB()
});

registerProcessor("generate_site", async (data, _job) => {
  console.info(
    "[queue:generate_site] Generating site:",
    data["siteId"],
    "for tenant:",
    data["tenantId"],
  );
  // Stub: will call AI site builder agent
});
