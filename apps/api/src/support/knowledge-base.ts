/**
 * Static knowledge base for the AI support system.
 * Searched by keyword scoring before being passed to the AI drafter.
 */

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  category:
    | "billing"
    | "auth"
    | "ai"
    | "collaboration"
    | "api"
    | "account"
    | "other";
  keywords: string[];
}

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // Billing
  {
    id: "kb-pricing",
    question: "How much does Marco Reid cost?",
    answer:
      "We offer three plans: Free (forever, with limits), Pro at $29/month, and Enterprise (custom). All paid plans are billed monthly or yearly with a 20% discount for annual billing. Visit /pricing for full details.",
    category: "billing",
    keywords: ["price", "pricing", "cost", "plan", "plans", "tier", "subscription", "how much"],
  },
  {
    id: "kb-upgrade",
    question: "How do I upgrade my plan?",
    answer:
      "Go to Settings > Billing, choose your plan, and click Upgrade. Your new plan activates immediately and we prorate the difference for the current period.",
    category: "billing",
    keywords: ["upgrade", "change plan", "switch plan", "higher tier"],
  },
  {
    id: "kb-downgrade",
    question: "How do I downgrade my plan?",
    answer:
      "Visit Settings > Billing and select a lower plan. The change takes effect at the end of your current billing period so you keep the features you paid for.",
    category: "billing",
    keywords: ["downgrade", "lower plan", "cheaper plan"],
  },
  {
    id: "kb-refund",
    question: "What is your refund policy?",
    answer:
      "We offer a 14-day refund on first-time paid subscriptions. Email support@yourdomain.com with your account email and we will process the refund within two business days.",
    category: "billing",
    keywords: ["refund", "money back", "return"],
  },
  {
    id: "kb-cancel",
    question: "How do I cancel my subscription?",
    answer:
      "Open Settings > Billing > Cancel Subscription. Your account stays active until the end of the current billing period and your data is retained for 30 days after that.",
    category: "billing",
    keywords: ["cancel", "cancellation", "stop billing", "end subscription"],
  },
  {
    id: "kb-invoice",
    question: "Where can I find my invoices?",
    answer:
      "All invoices are available in Settings > Billing > Invoices. You can download a PDF copy of any invoice from that page.",
    category: "billing",
    keywords: ["invoice", "receipt", "tax", "vat"],
  },
  {
    id: "kb-payment-failed",
    question: "My payment failed. What do I do?",
    answer:
      "Update your card in Settings > Billing > Payment Method. We retry failed charges automatically for seven days before downgrading the account.",
    category: "billing",
    keywords: ["payment failed", "card declined", "billing error"],
  },
  {
    id: "kb-trial",
    question: "Is there a free trial?",
    answer:
      "The Free plan is permanent and unlimited in time. Pro features can be tried with a 14-day money-back guarantee.",
    category: "billing",
    keywords: ["trial", "free trial", "try"],
  },

  // Auth / Passkeys
  {
    id: "kb-passkey-setup",
    question: "How do I set up a passkey?",
    answer:
      "On the login page, click Sign Up and follow the prompt. Your device will create a passkey backed by Face ID, Touch ID, Windows Hello, or your password manager. No password needed.",
    category: "auth",
    keywords: ["passkey", "passkeys", "sign up", "register", "webauthn", "fido"],
  },
  {
    id: "kb-login-issue",
    question: "I cannot log in.",
    answer:
      "Make sure you are using the same device or password manager that holds your passkey. If your passkey is lost, contact support for an account recovery flow.",
    category: "auth",
    keywords: ["login", "cannot log in", "sign in", "locked out", "access"],
  },
  {
    id: "kb-add-device",
    question: "How do I add a new device?",
    answer:
      "Sign in on your existing device, go to Settings > Security > Add Device, and follow the QR code prompt to register a new passkey on the new device.",
    category: "auth",
    keywords: ["new device", "add device", "second device"],
  },
  {
    id: "kb-2fa",
    question: "Do you support two-factor authentication?",
    answer:
      "Passkeys provide stronger protection than passwords + 2FA. They are phishing-immune and bound to the device, so a separate second factor is not required.",
    category: "auth",
    keywords: ["2fa", "two factor", "mfa", "authenticator"],
  },

  // AI features
  {
    id: "kb-ai-builder",
    question: "How do I use the AI website builder?",
    answer:
      "Open /builder, describe the page you want in plain English, and the AI will generate a fully composed layout from our component catalog. You can edit, regenerate, or export at any time.",
    category: "ai",
    keywords: ["builder", "website", "site", "generate", "ai builder"],
  },
  {
    id: "kb-ai-video",
    question: "How do I use the AI video editor?",
    answer:
      "Open /video, upload a clip or paste a prompt, and the AI will assemble cuts, transitions, and effects directly on your GPU using WebGPU. No upload to a render farm required.",
    category: "ai",
    keywords: ["video", "video editor", "edit video", "clip"],
  },
  {
    id: "kb-ai-tiers",
    question: "What is three-tier compute?",
    answer:
      "We run AI on your client GPU (free), our edge network (sub-50ms), or cloud GPUs (heavy lifting). The platform routes each request to the cheapest tier that can handle it.",
    category: "ai",
    keywords: ["compute", "tier", "webgpu", "client gpu", "edge"],
  },
  {
    id: "kb-ai-privacy",
    question: "Is my data used for AI training?",
    answer:
      "No. Your prompts and content are never used to train models. Client-side WebGPU inference means many requests never leave your device at all.",
    category: "ai",
    keywords: ["training", "privacy", "data", "model training"],
  },
  {
    id: "kb-ai-models",
    question: "Which AI models do you use?",
    answer:
      "Llama 3.1 8B in the browser via WebLLM, plus a hosted frontier model on the edge and cloud tiers. The platform picks the right one for each request automatically.",
    category: "ai",
    keywords: ["model", "llm", "llama", "gpt", "claude"],
  },

  // Collaboration
  {
    id: "kb-collab-room",
    question: "How do I create a collaboration room?",
    answer:
      "Open /collab and click New Room. Share the room URL with anyone you want to invite. CRDT sync handles conflict-free editing automatically.",
    category: "collaboration",
    keywords: ["collab", "collaboration", "room", "shared", "crdt"],
  },
  {
    id: "kb-collab-invite",
    question: "How do I invite someone to a room?",
    answer:
      "Copy the room URL from the top of the room. Anyone with the link can join. For private rooms, generate a one-time invite token from the room settings.",
    category: "collaboration",
    keywords: ["invite", "share", "team", "guest"],
  },
  {
    id: "kb-collab-ai",
    question: "Can AI agents join my room?",
    answer:
      "Yes. Click Invite AI from any room toolbar. The AI agent joins as a real participant with its own cursor and can help draft, edit, and review in real time.",
    category: "collaboration",
    keywords: ["ai agent", "agent", "ai participant", "copilot"],
  },
  {
    id: "kb-collab-limits",
    question: "How many people can join a room?",
    answer:
      "Free rooms support up to 5 simultaneous users. Pro supports 25, and Enterprise has no limit.",
    category: "collaboration",
    keywords: ["limit", "max users", "participants", "capacity"],
  },

  // API
  {
    id: "kb-api-key",
    question: "How do I get an API key?",
    answer:
      "Go to Settings > API Keys and click Create Key. Copy the key immediately because we only show it once. All keys start with btf_sk_.",
    category: "api",
    keywords: ["api key", "key", "token", "api access"],
  },
  {
    id: "kb-api-rate-limit",
    question: "What are the API rate limits?",
    answer:
      "Free: 60 requests/min. Pro: 600 requests/min. Enterprise: custom. Rate limit headers are included on every response so you can back off gracefully.",
    category: "api",
    keywords: ["rate limit", "throttle", "429", "too many requests"],
  },
  {
    id: "kb-webhooks",
    question: "How do webhooks work?",
    answer:
      "Register a webhook URL in Settings > Webhooks. We POST signed JSON payloads on events you subscribe to. Verify the signature header before trusting the body.",
    category: "api",
    keywords: ["webhook", "webhooks", "callback", "event"],
  },
  {
    id: "kb-api-docs",
    question: "Where is the API documentation?",
    answer:
      "Full API reference is at /docs. You will find interactive examples for every endpoint, authentication, rate limits, and webhook payloads.",
    category: "api",
    keywords: ["docs", "documentation", "reference", "api docs"],
  },

  // Account
  {
    id: "kb-change-email",
    question: "How do I change my email address?",
    answer:
      "Open Settings > Account > Email, enter the new address, and confirm via the link we send. Your passkeys remain valid throughout the change.",
    category: "account",
    keywords: ["change email", "update email", "email address"],
  },
  {
    id: "kb-delete-account",
    question: "How do I delete my account?",
    answer:
      "Settings > Account > Delete Account. This permanently removes your data after a 30-day grace period during which you can restore the account by logging in.",
    category: "account",
    keywords: ["delete account", "remove account", "close account"],
  },
  {
    id: "kb-export-data",
    question: "Can I export all my data?",
    answer:
      "Yes. Settings > Account > Export Data generates a ZIP of every project, document, and asset tied to your account. The export is ready in under a minute for most accounts.",
    category: "account",
    keywords: ["export", "download data", "backup", "gdpr export"],
  },
  {
    id: "kb-team",
    question: "How do team accounts work?",
    answer:
      "Pro and Enterprise plans support team workspaces with role-based access. Add members from Settings > Team and assign roles: admin, editor, or viewer.",
    category: "account",
    keywords: ["team", "workspace", "members", "roles"],
  },
  {
    id: "kb-status",
    question: "Is there a status page?",
    answer:
      "Live system status is at /status. You can subscribe to incident updates via email or RSS.",
    category: "other",
    keywords: ["status", "uptime", "outage", "down"],
  },
  {
    id: "kb-contact",
    question: "How do I contact a human?",
    answer:
      "Reply to any email from us or use /support and ask for a human. We escalate to a real person whenever the AI confidence drops below our threshold.",
    category: "other",
    keywords: ["human", "real person", "talk to someone", "agent"],
  },
];

export interface KnowledgeMatch {
  entry: KnowledgeEntry;
  score: number;
}

/**
 * Lightweight keyword scorer used to pre-select knowledge base entries
 * before handing them to the AI drafter. No embeddings required.
 */
export function searchKnowledgeBase(
  query: string,
  limit: number = 5,
): KnowledgeMatch[] {
  const normalized = query.toLowerCase();
  const results: KnowledgeMatch[] = [];

  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }
    if (normalized.includes(entry.question.toLowerCase().slice(0, 10))) {
      score += 5;
    }
    if (score > 0) {
      results.push({ entry, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
