# Week 5 — GateTest (QA / Security Vertical)

> **Priority:** P0
> **Target:** GateTest platform
> **Why this one:** GateTest is Crontech's QA/security product. Migrating it proves the platform can host the very tools that guard other platforms. It also lets us dogfood GateTest on Crontech itself — the ultimate recursion.

## Pre-flight

- [ ] Week 4 (AI-Immigration) complete and stable for ≥72h
- [ ] `@crontech/audit-log` battle-tested on Astra and AI-Immigration
- [ ] Snyk integration pattern documented (we track `snyk/snyk` in Sentinel as a competitor — learn from their public API shape)
- [ ] CodeClimate / Codacy integration patterns documented (also tracked competitors)
- [ ] Decision: does GateTest run its own scan workers, or delegate to upstream tools (Snyk, Trivy, Semgrep)?

## Day 1 — Inventory

- [ ] Current scan engines GateTest wraps
- [ ] Rule set catalog (OWASP Top 10, CIS benchmarks, custom rules)
- [ ] Customer count and active scan volume
- [ ] Scan result storage (size, retention, format)
- [ ] CI/CD integrations (GitHub Actions, GitLab CI, CircleCI)
- [ ] Reporting formats (SARIF, JSON, PDF)
- [ ] Alerting channels (Slack, email, webhooks)

## Day 2 — Scaffold

- [ ] Branch `migration/week-5-gatetest`
- [ ] `apps/gatetest/` workspace
- [ ] Neon DB for scan metadata
- [ ] R2 bucket for scan artifacts (reports, source snapshots)
- [ ] Worker queue for async scan jobs (Cloudflare Queues or a simple Postgres-backed queue)
- [ ] Env vars:
  - `GATETEST_NEON_URL`
  - `GATETEST_R2_ENDPOINT`
  - `GATETEST_R2_ACCESS_KEY_ID`
  - `GATETEST_R2_SECRET_ACCESS_KEY`
  - `GATETEST_GITHUB_APP_ID` (if GateTest operates as a GitHub App)
  - `GATETEST_GITHUB_PRIVATE_KEY`

## Day 3 — Scan engine port

GateTest's heart is the scan engine. Port carefully:

- [ ] Static analysis engine (likely Semgrep or similar)
- [ ] Dependency vulnerability scanner (npm audit, pip-audit, cargo-audit, etc.)
- [ ] Secret scanner (git-secrets, trufflehog)
- [ ] License scanner
- [ ] Custom Crontech rules (rules we've written that encode our own doctrine — e.g. "detect Vercel deploy config in a repo that claims to be Crontech-native")

Each engine runs in an isolated worker process (security: don't let a malicious repo compromise the main app).

## Day 4 — Port UI & API

- [ ] Dashboard (scan history, open findings, trend charts)
- [ ] Per-scan detail view (findings, source context, remediation guides)
- [ ] Rule management UI
- [ ] Project/repo connections
- [ ] Webhook receivers (GitHub push events, GitLab pipeline events)
- [ ] Public API for programmatic scan triggering
- [ ] SARIF export
- [ ] PDF report generator (compliance-friendly format)

## Day 5 — Recursive dogfood

The best test of GateTest is running it against Crontech itself:

- [ ] Configure GateTest to scan the Front-Back repo
- [ ] Run a full scan
- [ ] Review findings
- [ ] Fix the ones worth fixing
- [ ] Assert: GateTest finds the same vulnerabilities that upstream Snyk/Dependabot find on the same repo

If GateTest can catch its own bugs, it's ready.

## Day 6 — Cutover

- [ ] Deploy to `gatetest-new.crontech.nz`
- [ ] Parallel scans: old GateTest and new GateTest run the same jobs, compare outputs
- [ ] Once parallel outputs match for 24h, flip DNS
- [ ] Monitor scan job latency in Grafana (p99 should be under the old SLA)

## Day 7 — Decommission

- [ ] Archive old scan results to R2 (retention: 2 years for compliance)
- [ ] Archive old repo
- [ ] Cancel old hosting
- [ ] Flip `week-5-gatetest` in progress.json to completed

## Exit criteria

- [ ] GateTest serving from Crontech
- [ ] Every historical scan accessible
- [ ] Scan engines running in isolated workers
- [ ] Crontech itself (Front-Back repo) scanned by GateTest, all P0/P1 findings fixed
- [ ] Public API working
- [ ] 0 dead links, 0 dead buttons
- [ ] OTel traces flowing
- [ ] `/admin/progress` shows week-5 completed

## Rollback plan

Rollback triggers:

- Scan engine producing false positives/negatives vs old system
- Scan queue backing up beyond SLA
- Customer CI/CD integrations breaking
- Webhook delivery failures

Rollback procedure:

1. DNS flip to old GateTest
2. Any scans missed during the outage get re-run on the old system
3. Root cause in post-mortem before retry

## Risks unique to GateTest

- **Security tool supply chain.** GateTest scans other people's code. Any compromise of GateTest = compromise of its users. Signing and provenance matter.
- **Performance.** Static analysis is CPU-heavy. The Hetzner CX32 may not be enough if scan volume is high — scale the worker pool to a second box if needed.
- **False positive rate.** If the new stack produces different findings than the old one, users will lose trust fast. Parallel-run data must match.
- **Customer webhooks.** If GateTest webhooks their customers' CI pipelines, a webhook URL change breaks everyone.

## What this week proves

By the end of Week 5:

- Crontech hosts its own QA/security platform
- Our security platform finds the security issues in our own platform
- We have a recursive proof of quality that competitors cannot match without doing the same (and they won't)

Public narrative:

> "Every line of Crontech is scanned by GateTest. Every GateTest scan runs on Crontech. If there's a bug in either, both catch it."
