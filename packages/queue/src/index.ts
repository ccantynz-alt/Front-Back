/**
 * @back-to-the-future/queue — Durable background job queue (BullMQ + Redis).
 *
 * Provides typed job enqueue functions, a processor registry, and
 * a BullMQ worker with dead-letter queue support.
 */

export {
  getQueue,
  getDLQ,
  startWorker,
  closeQueue,
  QUEUE_NAME,
  DLQ_NAME,
} from "./client";

export {
  SendEmailJobSchema,
  ProcessWebhookJobSchema,
  ProvisionTenantJobSchema,
  GenerateSiteJobSchema,
  JobTypeSchema,
  JOB_SCHEMAS,
  enqueueEmail,
  enqueueWebhook,
  enqueueTenantProvision,
  enqueueSiteGeneration,
  type SendEmailJob,
  type ProcessWebhookJob,
  type ProvisionTenantJob,
  type GenerateSiteJob,
  type JobType,
} from "./jobs";

export {
  registerProcessor,
  getProcessor,
  hasProcessor,
  registeredTypes,
  clearProcessors,
  dispatch,
  type JobProcessor,
} from "./processors";
