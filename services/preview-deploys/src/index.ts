/**
 * Crontech preview-deploys service entrypoint.
 *
 * Wires concrete HTTP clients (build-runner, deploy-orchestrator, GitHub
 * Comments) to the PreviewOrchestrator and starts a Bun HTTP server.
 *
 * Required env:
 *   - PREVIEW_DOMAIN          (e.g. preview.crontech.dev)
 *   - GITHUB_BOT_TOKEN        — PAT for the @crontech-bot account
 *   - GITHUB_WEBHOOK_SECRET   — HMAC secret matching the GitHub App
 *   - BUILD_RUNNER_URL        — base URL of services/build-runner
 *   - DEPLOY_ORCHESTRATOR_URL — base URL of services/deploy-orchestrator
 *
 * Optional env:
 *   - PORT                    — defaults to 7070
 */

import { HttpBuildRunnerClient } from "./clients/build-runner";
import { HttpDeployOrchestratorClient } from "./clients/deploy-orchestrator";
import { HttpGitHubCommentsClient } from "./github/comments";
import { PreviewOrchestrator } from "./orchestrator";
import { createHandler } from "./server";
import { InMemoryStateStore } from "./state/store";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function buildHandler(): (req: Request) => Promise<Response> {
  const previewDomain = requireEnv("PREVIEW_DOMAIN");
  const githubToken = requireEnv("GITHUB_BOT_TOKEN");
  const webhookSecret = requireEnv("GITHUB_WEBHOOK_SECRET");
  const buildRunnerUrl = requireEnv("BUILD_RUNNER_URL");
  const deployOrchestratorUrl = requireEnv("DEPLOY_ORCHESTRATOR_URL");

  const orchestrator = new PreviewOrchestrator({
    buildRunner: new HttpBuildRunnerClient(buildRunnerUrl),
    deployer: new HttpDeployOrchestratorClient(deployOrchestratorUrl),
    comments: new HttpGitHubCommentsClient(githubToken),
    store: new InMemoryStateStore(),
    config: { previewDomain },
  });

  return createHandler({ orchestrator, config: { webhookSecret } });
}

if (import.meta.main) {
  const port = Number.parseInt(process.env["PORT"] ?? "7070", 10);
  const handler = buildHandler();
  Bun.serve({ port, fetch: handler });
  console.log(`[preview-deploys] listening on :${port}`);
}
