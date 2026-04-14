/**
 * Job type definitions with Zod schemas.
 *
 * Each job type has a schema that validates the payload at enqueue time.
 * Typed enqueue functions provide compile-time safety for producers.
 */

import { z } from "zod";
import { getQueue } from "./client";

// ── Job schemas ───────────────────────────────────────────────────────

export const SendEmailJobSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  templateId: z.string().optional(),
});
export type SendEmailJob = z.infer<typeof SendEmailJobSchema>;

export const ProcessWebhookJobSchema = z.object({
  webhookId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
export type ProcessWebhookJob = z.infer<typeof ProcessWebhookJobSchema>;

export const ProvisionTenantJobSchema = z.object({
  tenantId: z.string().min(1),
  plan: z.enum(["free", "starter", "pro", "enterprise"]),
});
export type ProvisionTenantJob = z.infer<typeof ProvisionTenantJobSchema>;

export const GenerateSiteJobSchema = z.object({
  siteId: z.string().min(1),
  tenantId: z.string().min(1),
  prompt: z.string().min(1),
});
export type GenerateSiteJob = z.infer<typeof GenerateSiteJobSchema>;

// ── Job type enum ─────────────────────────────────────────────────────

export const JobTypeSchema = z.enum([
  "send_email",
  "process_webhook",
  "provision_tenant",
  "generate_site",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

/**
 * Map of job type to its Zod schema for runtime validation.
 */
export const JOB_SCHEMAS: Record<JobType, z.ZodType> = {
  send_email: SendEmailJobSchema,
  process_webhook: ProcessWebhookJobSchema,
  provision_tenant: ProvisionTenantJobSchema,
  generate_site: GenerateSiteJobSchema,
};

// ── Typed enqueue functions ───────────────────────────────────────────

export async function enqueueEmail(data: SendEmailJob): Promise<string> {
  const validated = SendEmailJobSchema.parse(data);
  const job = await getQueue().add("send_email", validated);
  return job.id ?? crypto.randomUUID();
}

export async function enqueueWebhook(
  data: ProcessWebhookJob,
): Promise<string> {
  const validated = ProcessWebhookJobSchema.parse(data);
  const job = await getQueue().add("process_webhook", validated);
  return job.id ?? crypto.randomUUID();
}

export async function enqueueTenantProvision(
  data: ProvisionTenantJob,
): Promise<string> {
  const validated = ProvisionTenantJobSchema.parse(data);
  const job = await getQueue().add("provision_tenant", validated);
  return job.id ?? crypto.randomUUID();
}

export async function enqueueSiteGeneration(
  data: GenerateSiteJob,
): Promise<string> {
  const validated = GenerateSiteJobSchema.parse(data);
  const job = await getQueue().add("generate_site", validated);
  return job.id ?? crypto.randomUUID();
}
