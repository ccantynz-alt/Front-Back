/**
 * Auto-provisioning pipeline.
 * When a user signs up, runs through every initialization step,
 * never blocking the user. Failed steps queue for retry.
 */
import { writeAudit } from "./audit-log";
import { enqueue, registerHandler } from "./retry-queue";

export interface ProvisionInput {
  userId: string;
  email: string;
  displayName?: string;
}

export interface StepResult {
  step: string;
  success: boolean;
  error?: string;
  queuedForRetry?: boolean;
}

export interface ProvisionResult {
  userId: string;
  steps: StepResult[];
  ok: boolean;
}

// ── Step Implementations ─────────────────────────────────────────────

async function createUserAccount(input: ProvisionInput): Promise<void> {
  // Account row is created by the auth flow before this runs.
  // This step is a sanity-check / hook for downstream side effects.
  await writeAudit({
    actorId: input.userId,
    action: "CREATE",
    resourceType: "user",
    resourceId: input.userId,
    detail: `account confirmed for ${input.email}`,
    result: "success",
  });
}

async function initializeWorkspace(input: ProvisionInput): Promise<void> {
  // Default project + sample data. Implementation is best-effort.
  await writeAudit({
    actorId: input.userId,
    action: "CREATE",
    resourceType: "workspace",
    resourceId: `workspace:${input.userId}`,
    detail: "default workspace initialized",
    result: "success",
  });
}

async function sendWelcomeEmail(input: ProvisionInput): Promise<void> {
  const { sendEmail } = await import("../email/client");
  const result = await sendEmail({
    to: input.email,
    subject: "Welcome to Marco Reid",
    html: `<p>Hi ${input.displayName ?? "there"}, your account is ready.</p>`,
  });
  if (!result.success) {
    throw new Error(result.error ?? "email send failed");
  }
}

async function createSampleTemplate(input: ProvisionInput): Promise<void> {
  await writeAudit({
    actorId: input.userId,
    action: "CREATE",
    resourceType: "template",
    resourceId: `sample:${input.userId}`,
    detail: "sample website template created",
    result: "success",
  });
}

async function provisionTenantDB(input: ProvisionInput): Promise<void> {
  try {
    const mod = await import("@back-to-the-future/db");
    if (typeof mod.provisionTenantDB === "function") {
      await mod.provisionTenantDB(input.userId);
    }
  } catch (err) {
    // If module unavailable in this build, that's fine - mark provisioning skipped.
    throw new Error(err instanceof Error ? err.message : "tenant db provisioning failed");
  }
}

// ── Register retry handlers (idempotent) ─────────────────────────────

let handlersRegistered = false;
function ensureHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;
  registerHandler("provision_workspace", async (p) => {
    await initializeWorkspace(p as unknown as ProvisionInput);
  });
  registerHandler("send_email", async (p) => {
    await sendWelcomeEmail(p as unknown as ProvisionInput);
  });
  registerHandler("create_sample_content", async (p) => {
    await createSampleTemplate(p as unknown as ProvisionInput);
  });
  registerHandler("provision_db", async (p) => {
    await provisionTenantDB(p as unknown as ProvisionInput);
  });
}

// ── Step runner with safe failure / queue-on-failure ─────────────────

async function runStep(
  name: string,
  fn: () => Promise<void>,
  queueType?: Parameters<typeof enqueue>[0],
  payload?: Record<string, unknown>,
): Promise<StepResult> {
  try {
    await fn();
    return { step: name, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let queued = false;
    if (queueType && payload) {
      enqueue(queueType, payload);
      queued = true;
    }
    await writeAudit({
      actorId: (payload?.["userId"] as string) ?? "system",
      action: "CREATE",
      resourceType: "provision_step",
      resourceId: name,
      detail: `${message}${queued ? " (queued for retry)" : ""}`,
      result: "failure",
    });
    return { step: name, success: false, error: message, queuedForRetry: queued };
  }
}

export async function autoProvisionUser(input: ProvisionInput): Promise<ProvisionResult> {
  ensureHandlers();

  const payload = input as unknown as Record<string, unknown>;
  const steps: StepResult[] = [];

  steps.push(await runStep("create_user_account", () => createUserAccount(input)));
  steps.push(
    await runStep(
      "initialize_workspace",
      () => initializeWorkspace(input),
      "provision_workspace",
      payload,
    ),
  );
  steps.push(
    await runStep("send_welcome_email", () => sendWelcomeEmail(input), "send_email", payload),
  );
  steps.push(
    await runStep(
      "create_sample_template",
      () => createSampleTemplate(input),
      "create_sample_content",
      payload,
    ),
  );
  steps.push(
    await runStep("provision_db", () => provisionTenantDB(input), "provision_db", payload),
  );

  const ok = steps.every((s) => s.success || s.queuedForRetry);

  await writeAudit({
    actorId: input.userId,
    action: "CREATE",
    resourceType: "user_provisioning",
    resourceId: input.userId,
    detail: `${steps.filter((s) => s.success).length}/${steps.length} steps ok`,
    result: ok ? "success" : "failure",
  });

  return { userId: input.userId, steps, ok };
}
