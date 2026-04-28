# preview-deploys

Per-PR ephemeral preview deployments for Crontech. Every push to a PR ships a
live preview at a deterministic, human-readable hostname; closing the PR tears
it down. Faster than Vercel because the build runs on Bun, the runtime is
V8 isolates (not Node containers), and the URL scheme is deterministic so
reviewers can deep-link without scrolling through PR comments.

## Architecture

```
GitHub PR webhook ─► /pr-events ─► PreviewOrchestrator ─► build-runner
                                                       └─► deploy-orchestrator
                                                       └─► GitHub Comments API
```

The service owns:

- **PR-event listener** — accepts GitHub `pull_request` webhooks for
  `opened`, `synchronize`, `reopened`, `closed`. HMAC-validated via
  `X-Hub-Signature-256`.
- **Hostname generator** — deterministic
  `<owner>-<repo>-pr<number>-<sha7>.<PREVIEW_DOMAIN>`. DNS-safe, RFC 1035
  compliant, capped at 63 chars per label.
- **Orchestrator** — pending → building → deploying → live state machine,
  with per-PR mutex so concurrent sync events serialise. New sync events
  cancel the in-flight build before kicking off a fresh one.
- **GitHub PR comment** — posted once per PR, identified by a hidden
  `<!-- crontech-preview-deploys -->` marker. Subsequent transitions update
  the same comment in place — never spammy.
- **Teardown** — closing the PR cancels any in-flight build and removes
  the deployment from the edge tunnel.

The service does **not** clone repos, build artefacts, or push to the edge
itself — those concerns belong to `services/build-runner` and
`services/deploy-orchestrator`. We just choreograph.

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/pr-events` | GitHub PR webhook receiver. Requires `X-Hub-Signature-256`. |
| `GET` | `/pr/:prId/status` | Returns the latest preview state. `prId` is URL-encoded `owner/repo#number`. |
| `POST` | `/pr/:prId/teardown` | Manual teardown. |
| `GET` | `/healthz` | Liveness. |

### PR-event flow

1. GitHub posts a `pull_request` webhook to `/pr-events`.
2. Signature verified with `GITHUB_WEBHOOK_SECRET` (constant-time compare).
3. Payload validated by Zod. Unknown actions are dropped early.
4. The orchestrator acquires a per-PR mutex.
5. For `opened`/`reopened`/`synchronize`:
   - Cancel any in-flight build for this PR.
   - Generate a fresh hostname for the new SHA.
   - Trigger build → deploy.
   - Upsert the PR comment at every status transition.
6. For `closed`:
   - Cancel any in-flight build.
   - Tear down the deployment from the edge.
   - Update the PR comment to "Torn down".

## Hostname scheme

```
crontech-back-to-the-future-pr42-abcdef1.preview.crontech.dev
└──────┘ └──────────────────┘ └──┘ └────┘ └─────────────────┘
 owner          repo            #     sha7        PREVIEW_DOMAIN
```

- Lowercase, `[a-z0-9-]` only.
- 63-char DNS-label limit honoured (owner/repo truncated proportionally).
- Empty owner/repo (after sanitisation) and non-hex SHAs are rejected.

## Comment idempotency

Every comment body begins with `<!-- crontech-preview-deploys -->`. The
orchestrator stores the comment ID alongside the preview state, so subsequent
transitions PATCH the same comment instead of creating new ones. A PR with
20 sync events still has exactly one Crontech preview comment.

## State machine

```
opened/sync   ─►  pending  ─►  building  ─►  deploying  ─►  live
                                  └─► failed         └─► failed
closed        ─►  torn-down
```

Failures preserve the last hostname and the error message; the next sync
event clears the error and re-attempts the chain.

## Concurrency

`PreviewOrchestrator` holds a per-PR promise chain. Concurrent calls to
`handlePrEvent` for the same `prId` run sequentially, so cancel-then-start
never races. Operations on different PRs run in parallel.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PREVIEW_DOMAIN` | yes | e.g. `preview.crontech.dev` |
| `GITHUB_BOT_TOKEN` | yes | PAT for the `@crontech-bot` account |
| `GITHUB_WEBHOOK_SECRET` | yes | HMAC secret matching the GitHub App |
| `BUILD_RUNNER_URL` | yes | Base URL of `services/build-runner` |
| `DEPLOY_ORCHESTRATOR_URL` | yes | Base URL of `services/deploy-orchestrator` |
| `PORT` | no | Defaults to `7070`. |

## Testing

```sh
bun test services/preview-deploys
```

All collaborators are mocked at the interface boundary
(`BuildRunnerClient`, `DeployOrchestratorClient`, `GitHubCommentsClient`),
so tests exercise the real state machine without hitting the network.

## Roadmap

- v1 (this): in-memory state, single replica.
- v2: Turso-backed state store so the service can scale horizontally and
  survive restarts mid-build.
- v3: streaming build/deploy logs back into the PR comment as a collapsed
  details block.
