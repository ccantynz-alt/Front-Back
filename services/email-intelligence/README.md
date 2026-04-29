# @back-to-the-future/email-intelligence

The AI-native moat-extender Mailgun cannot retrofit. Every email decision —
spam-risk, subject line, send time, A/B variant — has AI woven through it
from the ground up.

This service ships four modules behind one HTTP API:

| Module | Endpoint | What it does |
|---|---|---|
| Spam-risk scorer | `POST /score-spam` | Heuristic 0–100 spam score + optional LLM second opinion. Transparent signals list. |
| Subject-line optimiser | `POST /optimise-subject` | Generates rule-based + LLM variants. Predicts open-rate with confidence intervals. |
| Send-time optimiser | `POST /optimise-send-time` | Aggregates per-recipient open behaviour, returns top-N send-time candidates in the next 7 days. |
| A/B variant scorer | `POST /score-variants` | Ranks N email variants on spam-risk, predicted open, predicted click, and historical priors. |

All endpoints require `Authorization: Bearer ${EMAIL_INTELLIGENCE_TOKEN}`.

## Endpoints

### `POST /score-spam`

```json
// request
{
  "subject": "Your invoice for April 2026",
  "html": "<p>...</p>",
  "text": "Hi Alex, ...",
  "fromDomain": "billing.acme.com",
  "headers": { "list-unsubscribe": "<mailto:u@acme.com>" },
  "fromDomainRegisteredAt": "2024-01-04T00:00:00Z"
}
// response
{
  "heuristicScore": 12,
  "llmScore": 18,            // present only when an LLM client is configured
  "verdict": "pass",         // pass | review | block
  "signals": [
    { "code": "subject.allcaps", "label": "...", "points": 12, "detail": "..." }
  ]
}
```

#### Signal codes

| Code | Meaning |
|---|---|
| `subject.allcaps` | Subject is mostly uppercase |
| `subject.allcaps.partial` | Subject has heavy uppercase |
| `subject.exclamation.density` | 3+ exclamation marks in the subject |
| `subject.exclamation.medium` | 2 exclamation marks in the subject |
| `subject.keywords` | Subject contains spam-trigger keywords |
| `body.keywords` | Body contains spam-trigger keywords |
| `body.link_ratio.high` | Excessive link-to-text ratio |
| `body.link_ratio.medium` | Elevated link-to-text ratio |
| `body.link_only` | Body is links-only with no readable text |
| `body.hidden_html` | `display:none`, `visibility:hidden`, or white-on-white text detected |
| `body.missing_text_part` | HTML present but plain-text alternative missing |
| `headers.missing_unsubscribe` | Bulk-style send missing `List-Unsubscribe` |
| `from.suspicious_tld` | FROM domain uses a high-abuse TLD |
| `from.recent_registration` | FROM domain registered in the last 30 days |
| `llm.second_opinion` | LLM scored the message (informational) |

### `POST /optimise-subject`

```json
// request
{
  "subject": "Update on your account",
  "audience": { "industry": "fintech", "region": "US" }
}
// response
{
  "variants": [
    {
      "subject": "{{firstName}}, Update on your account",
      "predictedOpenRate": 0.27,
      "confidenceInterval": [0.22, 0.32],
      "source": "rule",          // input | rule | llm
      "rationale": ["Personalisation token detected", ...]
    }
  ]
}
```

### `POST /optimise-send-time`

```json
// request
{
  "recipientHistory": [
    { "sentAt": "2026-04-14T09:00:00Z", "opened": true },
    { "sentAt": "2026-04-21T17:00:00Z", "opened": false }
  ],
  "recipientTimezone": "America/New_York"
}
// response
{
  "candidates": [
    {
      "sendAt": "2026-04-30T13:00:00.000Z",
      "localHour": 9,
      "localDayOfWeek": 4,
      "predictedOpenProbability": 0.42,
      "observationCount": 7
    }
  ]
}
```

Algorithm: per-recipient open rate is aggregated by `(dayOfWeek, hourOfDay)` in
the recipient's local timezone, smoothed with a beta-binomial prior, then the
top-N cells are projected forward to the next matching local time within
the next 7 days.

### `POST /score-variants`

```json
// request
{
  "variants": [
    { "id": "a", "subject": "...", "html": "<p>...</p>", "fromDomain": "acme.com" },
    { "id": "b", "subject": "...", "html": "<p>...</p>", "fromDomain": "acme.com" }
  ],
  "historical": [
    { "id": "a", "opens": 800, "clicks": 200, "sent": 1000 }
  ]
}
// response
{
  "ranked": [
    {
      "id": "a",
      "subject": "...",
      "spamRisk": 4,
      "predictedOpenRate": 0.32,
      "predictedClickRate": 0.18,
      "compositeScore": 0.412,
      "rank": 1,
      "rationale": ["..."]
    }
  ]
}
```

Composite score: `predictedOpenRate × (1 − spamRisk/100) × (1 + 4·predictedClickRate)`.
Historical priors are blended into the predictions via Bayesian shrinkage:
`weight = sent / (sent + 50)`.

## LLM client interface

The LLM client is fully pluggable. Spam scoring, subject-variant generation,
and the variant-scorer second opinion all accept any implementation of
`LlmClient`:

```ts
interface LlmClient {
  complete(req: {
    purpose: string;
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; provider?: string; model?: string }>;
}
```

Two implementations ship in-package:

- **`HttpAiGatewayClient`** — production default. Calls `services/ai-gateway`'s
  `/v1/chat/completions` endpoint over HTTP. Configure via `AI_GATEWAY_URL` +
  `AI_GATEWAY_TOKEN`.
- **`StubLlmClient`** — deterministic test stub. Pass canned responses keyed
  by `purpose`. Records all calls in `callLog` for assertions.

Each module degrades gracefully if the LLM call fails: spam scoring returns
the heuristic score alone; subject optimiser falls back to rule-based
variants; variant scorer keeps its heuristic spam-risk.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `EMAIL_INTELLIGENCE_TOKEN` | yes | — | Bearer token expected on every request. |
| `EMAIL_INTELLIGENCE_PORT` | no | `9094` | TCP port to bind. |
| `AI_GATEWAY_URL` | no | — | Base URL of `services/ai-gateway`. Without it, LLM features are off. |
| `AI_GATEWAY_TOKEN` | no | — | Bearer token for the gateway. |

## Development

```sh
bun run dev      # hot-reload server
bun test         # full suite (5 test files)
bun run check    # tsc --noEmit
bunx biome check . # lint
```

## Why this exists

Mailgun, SendGrid, Postmark, Resend — none of them give you AI-native
deliverability. They give you APIs. We give you decisions. Every send goes
through four AI checks before it leaves your application. The competition
ships infrastructure; we ship intelligence.
