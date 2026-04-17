/**
 * Shared HTTP client for the tenant/project orchestrator.
 *
 * Originally inlined inside `trpc/procedures/tenant.ts`. Extracted here so
 * the inbound Gluecron push-notification hook can invoke the same deploy
 * path the tenant.deploy tRPC procedure uses — without duplicating the
 * URL, timeout, or error-normalisation logic.
 */

import { TRPCError } from "@trpc/server";

const ORCHESTRATOR_URL = process.env["ORCHESTRATOR_URL"] ?? "http://127.0.0.1:9000";

/**
 * POST/GET to the orchestrator at `${ORCHESTRATOR_URL}${path}`. Returns the
 * parsed JSON body on 2xx; throws a `TRPCError` with the server-side error
 * message on non-2xx. Mirrors the behaviour of the inline client that was
 * previously in `tenant.ts` so the tRPC procedure can continue to rely on
 * TRPCError semantics.
 */
export async function orchestratorFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    signal: AbortSignal.timeout(120_000),
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    const errMsg = (data as { error?: string }).error ?? `Orchestrator error ${res.status}`;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errMsg });
  }
  return data as T;
}

export interface OrchestratorDeployInput {
  appName: string;
  repoUrl: string;
  branch: string;
  domain: string;
  subdomain?: string;
  port: number;
  runtime: "nextjs" | "bun";
  envVars?: Record<string, string>;
}

export interface OrchestratorDeployResult {
  containerId: string;
  appName: string;
  domain: string;
  url: string;
  status: string;
  healthCheck: string;
}

/**
 * Trigger an app deployment via the orchestrator's `/deploy` endpoint.
 * Same wire shape the `tenant.deploy` tRPC procedure uses.
 */
export async function orchestratorDeploy(
  input: OrchestratorDeployInput,
): Promise<OrchestratorDeployResult> {
  return orchestratorFetch<OrchestratorDeployResult>("/deploy", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
