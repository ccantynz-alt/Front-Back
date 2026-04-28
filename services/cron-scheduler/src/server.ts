// ── Crontech Cron Scheduler — HTTP API ───────────────────────────────
// A pure-stdlib HTTP server (Bun.serve / fetch handler) that exposes
// the registry + scheduler. Every endpoint requires a Bearer token —
// the scheduler is an internal control-plane service and is never
// exposed unauthenticated. Requests are JSON in / JSON out.
//
// The handler is exported as a single `fetch(request)` function so
// tests can drive it without binding a real socket and so the same
// implementation runs on Cloudflare Workers if we ever push the
// control plane to the edge.

import { CronParseError, nextFires, parseCron } from "./parser";
import {
  type CreateJobInput,
  type DispatchTarget,
  type Job,
  type JobRegistry,
  type RetryPolicy,
} from "./registry";
import type { Scheduler } from "./scheduler";

export interface ServerOptions {
  registry: JobRegistry;
  scheduler: Scheduler;
  /** Bearer token required for every request. */
  authToken: string;
}

export interface ApiHandler {
  fetch(req: Request): Promise<Response>;
}

export function createApi(opts: ServerOptions): ApiHandler {
  return {
    fetch: (req) => handle(req, opts),
  };
}

async function handle(req: Request, opts: ServerOptions): Promise<Response> {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${opts.authToken}`) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  try {
    const route = matchRoute(req.method, url.pathname);
    switch (route.kind) {
      case "create-job":
        return await createJobRoute(req, opts);
      case "get-job":
        return getJobRoute(route.jobId, opts);
      case "delete-job":
        return deleteJobRoute(route.jobId, opts);
      case "pause-job":
        return setStatusRoute(route.jobId, "paused", opts);
      case "resume-job":
        return setStatusRoute(route.jobId, "active", opts);
      case "trigger-job":
        return await triggerRoute(route.jobId, opts);
      case "list-runs":
        return listRunsRoute(route.jobId, url, opts);
      case "list-dead-letters":
        return listDeadLettersRoute(url, opts);
      case "list-jobs":
        return listJobsRoute(url, opts);
      case "health":
        return jsonResponse(200, { ok: true });
      case "not-found":
        return jsonResponse(404, { error: "not found" });
    }
  } catch (err) {
    if (err instanceof CronParseError) {
      return jsonResponse(400, {
        error: "invalid_cron",
        message: err.message,
      });
    }
    if (err instanceof BadRequest) {
      return jsonResponse(400, { error: "bad_request", message: err.message });
    }
    return jsonResponse(500, {
      error: "internal_error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

class BadRequest extends Error {}

type RouteMatch =
  | { kind: "health" }
  | { kind: "list-jobs" }
  | { kind: "create-job" }
  | { kind: "get-job"; jobId: string }
  | { kind: "delete-job"; jobId: string }
  | { kind: "pause-job"; jobId: string }
  | { kind: "resume-job"; jobId: string }
  | { kind: "trigger-job"; jobId: string }
  | { kind: "list-runs"; jobId: string }
  | { kind: "list-dead-letters" }
  | { kind: "not-found" };

function matchRoute(method: string, path: string): RouteMatch {
  if (path === "/health" && method === "GET") return { kind: "health" };
  if (path === "/jobs" && method === "GET") return { kind: "list-jobs" };
  if (path === "/jobs" && method === "POST") return { kind: "create-job" };
  if (path === "/dead-letter" && method === "GET")
    return { kind: "list-dead-letters" };

  const jobMatch = path.match(/^\/jobs\/([A-Za-z0-9_-]+)$/);
  if (jobMatch) {
    const jobId = jobMatch[1] as string;
    if (method === "GET") return { kind: "get-job", jobId };
    if (method === "DELETE") return { kind: "delete-job", jobId };
  }
  const pauseMatch = path.match(/^\/jobs\/([A-Za-z0-9_-]+)\/pause$/);
  if (pauseMatch && method === "POST") {
    return { kind: "pause-job", jobId: pauseMatch[1] as string };
  }
  const resumeMatch = path.match(/^\/jobs\/([A-Za-z0-9_-]+)\/resume$/);
  if (resumeMatch && method === "POST") {
    return { kind: "resume-job", jobId: resumeMatch[1] as string };
  }
  const triggerMatch = path.match(/^\/jobs\/([A-Za-z0-9_-]+)\/trigger$/);
  if (triggerMatch && method === "POST") {
    return { kind: "trigger-job", jobId: triggerMatch[1] as string };
  }
  const runsMatch = path.match(/^\/jobs\/([A-Za-z0-9_-]+)\/runs$/);
  if (runsMatch && method === "GET") {
    return { kind: "list-runs", jobId: runsMatch[1] as string };
  }
  return { kind: "not-found" };
}

async function createJobRoute(
  req: Request,
  opts: ServerOptions,
): Promise<Response> {
  const body = await readJson(req);
  const input = parseCreateInput(body);
  const job = opts.registry.createJob(input);
  opts.scheduler.refreshNextFire(job.jobId);
  const fresh = opts.registry.getJob(job.jobId) ?? job;
  const preview = nextFires(
    fresh.parsed,
    { after: Date.now(), timezone: fresh.tz },
    5,
  );
  return jsonResponse(201, {
    job: serializeJob(fresh),
    nextFires: preview,
  });
}

function getJobRoute(jobId: string, opts: ServerOptions): Response {
  const job = opts.registry.getJob(jobId);
  if (!job) return jsonResponse(404, { error: "job_not_found" });
  const recent = opts.registry.listRuns(jobId).slice(-20);
  return jsonResponse(200, { job: serializeJob(job), recentRuns: recent });
}

function deleteJobRoute(jobId: string, opts: ServerOptions): Response {
  const removed = opts.registry.deleteJob(jobId);
  if (!removed) return jsonResponse(404, { error: "job_not_found" });
  return jsonResponse(200, { deleted: jobId });
}

function setStatusRoute(
  jobId: string,
  status: "active" | "paused",
  opts: ServerOptions,
): Response {
  const job = opts.registry.getJob(jobId);
  if (!job) return jsonResponse(404, { error: "job_not_found" });
  opts.registry.setStatus(jobId, status);
  opts.scheduler.refreshNextFire(jobId);
  const fresh = opts.registry.getJob(jobId);
  return jsonResponse(200, fresh ? { job: serializeJob(fresh) } : {});
}

async function triggerRoute(
  jobId: string,
  opts: ServerOptions,
): Promise<Response> {
  const job = opts.registry.getJob(jobId);
  if (!job) return jsonResponse(404, { error: "job_not_found" });
  const run = await opts.scheduler.triggerNow(jobId);
  return jsonResponse(202, { triggered: jobId, run });
}

function listRunsRoute(
  jobId: string,
  url: URL,
  opts: ServerOptions,
): Response {
  const job = opts.registry.getJob(jobId);
  if (!job) return jsonResponse(404, { error: "job_not_found" });
  const sinceParam = url.searchParams.get("since");
  const since =
    sinceParam !== null && sinceParam !== ""
      ? Number.parseInt(sinceParam, 10)
      : undefined;
  if (since !== undefined && !Number.isFinite(since)) {
    throw new BadRequest("`since` must be a valid integer ms-epoch");
  }
  const runs = opts.registry.listRuns(jobId, since);
  return jsonResponse(200, { runs });
}

function listDeadLettersRoute(url: URL, opts: ServerOptions): Response {
  const tenantId = url.searchParams.get("tenantId") ?? undefined;
  const filter = tenantId !== undefined ? { tenantId } : undefined;
  const dead = opts.registry.listDeadLetters(filter);
  return jsonResponse(200, { deadLetter: dead });
}

function listJobsRoute(url: URL, opts: ServerOptions): Response {
  const tenantId = url.searchParams.get("tenantId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  if (status !== undefined && status !== "active" && status !== "paused") {
    throw new BadRequest('`status` must be "active" or "paused"');
  }
  const filter: { tenantId?: string; status?: "active" | "paused" } = {};
  if (tenantId !== undefined) filter.tenantId = tenantId;
  if (status !== undefined) filter.status = status as "active" | "paused";
  const jobs = opts.registry.listJobs(filter);
  return jsonResponse(200, { jobs: jobs.map(serializeJob) });
}

function parseCreateInput(body: unknown): CreateJobInput {
  if (!isObject(body)) throw new BadRequest("body must be a JSON object");

  const tenantId = body["tenantId"];
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new BadRequest("`tenantId` must be a non-empty string");
  }
  const cronExpr = body["cronExpr"];
  if (typeof cronExpr !== "string" || cronExpr.length === 0) {
    throw new BadRequest("`cronExpr` must be a non-empty string");
  }
  // Eagerly validate (parser will be re-run by registry).
  parseCron(cronExpr);

  const target = parseTarget(body["target"]);
  const retryPolicy = parseRetryPolicy(body["retryPolicy"]);
  const status = parseStatus(body["status"]);
  const tz = body["tz"];
  if (tz !== undefined && (typeof tz !== "string" || tz.length === 0)) {
    throw new BadRequest("`tz` must be a non-empty string when provided");
  }
  const jobId = body["jobId"];
  if (
    jobId !== undefined &&
    (typeof jobId !== "string" || !/^[A-Za-z0-9_-]+$/.test(jobId))
  ) {
    throw new BadRequest("`jobId` must match /^[A-Za-z0-9_-]+$/");
  }

  const out: CreateJobInput = { tenantId, cronExpr, target };
  if (typeof tz === "string") out.tz = tz;
  if (typeof jobId === "string") out.jobId = jobId;
  if (retryPolicy !== undefined) out.retryPolicy = retryPolicy;
  if (status !== undefined) out.status = status;
  return out;
}

function parseTarget(value: unknown): DispatchTarget {
  if (!isObject(value)) throw new BadRequest("`target` must be an object");
  const type = value["type"];
  if (type !== "edge-runtime" && type !== "worker" && type !== "webhook") {
    throw new BadRequest(
      '`target.type` must be "edge-runtime", "worker", or "webhook"',
    );
  }
  const endpoint = value["endpoint"];
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    throw new BadRequest("`target.endpoint` must be a non-empty string");
  }
  const headers = value["headers"];
  if (
    headers !== undefined &&
    (!isObject(headers) ||
      !Object.values(headers).every((v) => typeof v === "string"))
  ) {
    throw new BadRequest("`target.headers` must be a string-valued object");
  }
  const target: DispatchTarget = { type, endpoint };
  if (value["payload"] !== undefined) target.payload = value["payload"];
  if (headers !== undefined) target.headers = headers as Record<string, string>;
  return target;
}

function parseRetryPolicy(value: unknown): Partial<RetryPolicy> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new BadRequest("`retryPolicy` must be an object");
  const out: Partial<RetryPolicy> = {};
  if (value["maxAttempts"] !== undefined) {
    if (
      typeof value["maxAttempts"] !== "number" ||
      !Number.isInteger(value["maxAttempts"]) ||
      value["maxAttempts"] < 1
    ) {
      throw new BadRequest("`retryPolicy.maxAttempts` must be an integer >= 1");
    }
    out.maxAttempts = value["maxAttempts"];
  }
  if (value["backoffMs"] !== undefined) {
    if (
      typeof value["backoffMs"] !== "number" ||
      !Number.isFinite(value["backoffMs"]) ||
      value["backoffMs"] < 0
    ) {
      throw new BadRequest("`retryPolicy.backoffMs` must be a number >= 0");
    }
    out.backoffMs = value["backoffMs"];
  }
  if (value["maxBackoffMs"] !== undefined) {
    if (
      typeof value["maxBackoffMs"] !== "number" ||
      !Number.isFinite(value["maxBackoffMs"]) ||
      value["maxBackoffMs"] < 0
    ) {
      throw new BadRequest("`retryPolicy.maxBackoffMs` must be a number >= 0");
    }
    out.maxBackoffMs = value["maxBackoffMs"];
  }
  return out;
}

function parseStatus(value: unknown): "active" | "paused" | undefined {
  if (value === undefined) return undefined;
  if (value === "active" || value === "paused") return value;
  throw new BadRequest('`status` must be "active" or "paused"');
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest("body is not valid JSON");
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function serializeJob(job: Job): Record<string, unknown> {
  return {
    jobId: job.jobId,
    tenantId: job.tenantId,
    cronExpr: job.cronExpr,
    tz: job.tz,
    target: job.target,
    retryPolicy: job.retryPolicy,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    lastRunAt: job.lastRunAt,
    nextRunAt: job.nextRunAt,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
