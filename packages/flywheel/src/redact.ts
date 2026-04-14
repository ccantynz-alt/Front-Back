// ── Secret redaction ─────────────────────────────────────────────────
// Every turn body is passed through redact() before insertion so
// nothing sensitive (API keys, auth tokens, webhook secrets) ever
// lands in the flywheel tables. Patterns below are conservative: they
// match the formats we actually use and nothing else, because false
// positives in conversational text destroy retrieval quality.

const PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/g, label: "ANTHROPIC_KEY" },
  { re: /sk-[A-Za-z0-9]{32,}/g, label: "OPENAI_KEY" },
  { re: /sk_(test|live)_[A-Za-z0-9]{20,}/g, label: "STRIPE_SECRET" },
  { re: /pk_(test|live)_[A-Za-z0-9]{20,}/g, label: "STRIPE_PUBLISHABLE" },
  { re: /rk_(test|live)_[A-Za-z0-9]{20,}/g, label: "STRIPE_RESTRICTED" },
  { re: /whsec_[A-Za-z0-9]{20,}/g, label: "STRIPE_WEBHOOK" },
  { re: /ghp_[A-Za-z0-9]{30,}/g, label: "GITHUB_PAT" },
  { re: /gho_[A-Za-z0-9]{30,}/g, label: "GITHUB_OAUTH" },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, label: "SLACK_TOKEN" },
  { re: /re_[A-Za-z0-9]{20,}/g, label: "RESEND_KEY" },
  { re: /btf_sk_[a-f0-9]{30,}/g, label: "CRONTECH_API_KEY" },
  {
    re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    label: "JWT",
  },
];

export function redact(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { re, label } of PATTERNS) {
    out = out.replace(re, `[REDACTED:${label}]`);
  }
  return out;
}

// Cap content length so a runaway turn (e.g. a 2MB tool result) does
// not bloat the DB. 64KB per turn is plenty of context for retrieval.
const MAX_TURN_CHARS = 64_000;

export function clipContent(input: string): string {
  if (input.length <= MAX_TURN_CHARS) return input;
  return `${input.slice(0, MAX_TURN_CHARS)}\n\n[… ${input.length - MAX_TURN_CHARS} chars clipped]`;
}

export function sanitize(input: string): string {
  return clipContent(redact(input));
}
