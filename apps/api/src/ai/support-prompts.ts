// ── Support Bot Prompts & Knowledge Base ────────────────────────────
// System prompts and canned answers for the in-app AI support bot.

export const SUPPORT_SYSTEM_PROMPT = `You are the friendly built-in AI assistant for "Crontech", an AI website and video builder.
Your job: help complete novices succeed without ever needing a human.
Rules:
- Always speak in plain English. Never use jargon like "passkey", "WebAuthn", "tRPC", "CRDT", "WebGPU".
- Keep answers short (1-3 sentences) unless the user asks for detail.
- Be warm, encouraging, and confident.
- When useful, suggest a single next action the user can click.
- If you don't know, say so and point them to the help docs.`;

export interface KnowledgeEntry {
  readonly question: string;
  readonly answer: string;
  readonly keywords: ReadonlyArray<string>;
}

export const KNOWLEDGE_BASE: ReadonlyArray<KnowledgeEntry> = [
  {
    question: "How do I create a website?",
    answer:
      "Click 'Builder' in the menu, then describe what you want in the chat box. Try something like 'a landing page for my coffee shop'. Your site appears instantly.",
    keywords: ["website", "site", "landing", "page", "create", "build", "make"],
  },
  {
    question: "How do I upload or edit a video?",
    answer:
      "Open the 'Video' page from the menu. Drag a clip in or pick a sample, then ask the assistant to trim, add captions, or change the look.",
    keywords: ["video", "edit", "upload", "clip", "trim"],
  },
  {
    question: "How do I invite a teammate?",
    answer:
      "Go to Settings > Team and click 'Invite'. Drop in their email and we'll send them a link. They can join even on the free plan.",
    keywords: ["invite", "team", "teammate", "share", "collaborator"],
  },
  {
    question: "How do I upgrade my plan?",
    answer:
      "Open the Billing page and pick a plan. Upgrades take effect immediately and you can cancel anytime.",
    keywords: ["upgrade", "plan", "billing", "pay", "subscribe", "pro"],
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes! You're already on the free tier. Click 'Try for Free' on the sign-up page or 'Start Trial' from your dashboard for full features for 14 days.",
    keywords: ["trial", "free", "cost", "price"],
  },
  {
    question: "How do I save my work?",
    answer:
      "Everything saves automatically as you go. To keep it across devices, add an email in Settings.",
    keywords: ["save", "auto", "lose", "store"],
  },
  {
    question: "How do I export my site?",
    answer:
      "In the Builder, click the 'Export' button in the top right. You can download your site as a ZIP or publish it live.",
    keywords: ["export", "download", "publish", "deploy"],
  },
  {
    question: "Where is my dashboard?",
    answer: "Click the 'Dashboard' link in the top menu. It shows all your projects in one place.",
    keywords: ["dashboard", "home", "projects"],
  },
];

export interface PageContext {
  readonly path: string;
  readonly title: string;
  readonly suggestions: ReadonlyArray<string>;
}

export const PAGE_CONTEXT: Record<string, PageContext> = {
  "/": {
    path: "/",
    title: "Home",
    suggestions: ["What is this?", "How do I get started?", "Is there a free plan?"],
  },
  "/dashboard": {
    path: "/dashboard",
    title: "Dashboard",
    suggestions: ["Create my first website", "How do I invite a teammate?", "Where do I edit videos?"],
  },
  "/builder": {
    path: "/builder",
    title: "Composer",
    suggestions: [
      "How do I generate a component tree from a prompt?",
      "Which compute tier will my request route to?",
      "How do I export the generated components?",
    ],
  },
  "/video": {
    path: "/video",
    title: "Video Editor",
    suggestions: ["How do I upload a video?", "How do I add captions?", "How do I export my video?"],
  },
  "/billing": {
    path: "/billing",
    title: "Billing",
    suggestions: ["How do I upgrade?", "What's in the Pro plan?", "How do I cancel?"],
  },
  "/settings": {
    path: "/settings",
    title: "Settings",
    suggestions: ["How do I invite a teammate?", "How do I change my email?", "How do I sign out?"],
  },
  "/collab": {
    path: "/collab",
    title: "Collaboration",
    suggestions: ["How do I start a room?", "How do I invite people?", "What can we do together?"],
  },
};

export function getPageContext(path: string): PageContext {
  return (
    PAGE_CONTEXT[path] ?? {
      path,
      title: "Crontech",
      suggestions: ["How do I get started?", "Show me what I can build", "How do I get help?"],
    }
  );
}

export function buildSystemPromptForPage(path: string): string {
  const ctx = getPageContext(path);
  return `${SUPPORT_SYSTEM_PROMPT}\n\nThe user is currently on the "${ctx.title}" page (${ctx.path}). Tailor answers to that context when relevant.`;
}

/** Lightweight keyword match for offline / demo mode answers. */
export function findCannedAnswer(question: string): string | null {
  const q = question.toLowerCase();
  let best: { entry: KnowledgeEntry; score: number } | null = null;
  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }
  return best ? best.entry.answer : null;
}
