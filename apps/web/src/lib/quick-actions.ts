// ── Quick Actions System ───────────────────────────────────────────
// Pre-defined automated flows that do complex things in one click.
// Plain English. Designed for novices who want results, not configuration.

export interface QuickAction {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "create" | "deploy" | "team" | "ai" | "export" | "settings";
  shortcut?: string;
  execute: () => Promise<void>;
}

// In-memory recents (persists in localStorage when available).
const RECENT_KEY = "btf:recent-actions";

export function getRecentActionIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function recordActionUse(id: string): void {
  if (typeof localStorage === "undefined") return;
  const recents = getRecentActionIds().filter((x) => x !== id);
  recents.unshift(id);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, 10)));
  } catch {
    // ignore quota errors
  }
}

function notify(message: string): void {
  if (typeof window !== "undefined") {
    // Lightweight in-page notification fallback.
    console.info(`[QuickAction] ${message}`);
  }
}

function navigate(path: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "create-from-template",
    name: "Create Landing Page from Template",
    description: "Pick a template and start a new project in one click.",
    icon: "rocket",
    category: "create",
    shortcut: "g t",
    execute: async () => {
      notify("Opening templates gallery...");
      navigate("/templates");
    },
  },
  {
    id: "duplicate-last-project",
    name: "Duplicate Last Project",
    description: "Make a copy of your most recent project to riff on.",
    icon: "copy",
    category: "create",
    execute: async () => {
      notify("Duplicating last project...");
      navigate("/dashboard?duplicate=last");
    },
  },
  {
    id: "deploy-production",
    name: "Deploy to Production",
    description: "Push your current project live to the global edge network.",
    icon: "rocket-launch",
    category: "deploy",
    shortcut: "g d",
    execute: async () => {
      notify("Starting production deploy...");
      navigate("/dashboard?deploy=true");
    },
  },
  {
    id: "invite-team",
    name: "Invite 5 Team Members",
    description: "Send invitations to your team in one batch.",
    icon: "users",
    category: "team",
    execute: async () => {
      notify("Opening team invite flow...");
      navigate("/settings?tab=team&invite=batch");
    },
  },
  {
    id: "enable-ai",
    name: "Enable AI Assistance",
    description: "Turn on the AI co-pilot across the whole platform.",
    icon: "sparkles",
    category: "ai",
    execute: async () => {
      notify("Enabling AI assistance...");
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("btf:ai-enabled", "true");
      }
    },
  },
  {
    id: "export-zip",
    name: "Export Project as ZIP",
    description: "Download your project as a ready-to-deploy ZIP file.",
    icon: "download",
    category: "export",
    execute: async () => {
      notify("Preparing ZIP download...");
      navigate("/dashboard?export=zip");
    },
  },
  {
    id: "open-builder",
    name: "Open Visual Builder",
    description: "Jump straight into the drag-and-drop website builder.",
    icon: "wand",
    category: "create",
    shortcut: "g b",
    execute: async () => {
      navigate("/builder");
    },
  },
  {
    id: "open-ai-playground",
    name: "Open AI Playground",
    description: "Experiment with the AI assistants and prompts.",
    icon: "flask",
    category: "ai",
    execute: async () => {
      navigate("/ai-playground");
    },
  },
  {
    id: "open-chat",
    name: "Open Claude Chat",
    description: "Chat with Claude via Anthropic API.",
    icon: "message",
    category: "ai",
    execute: async () => {
      navigate("/chat");
    },
  },
  {
    id: "open-repos",
    name: "Open Repositories",
    description: "View GitHub repos, PRs, issues, and CI status.",
    icon: "code",
    category: "deploy",
    execute: async () => {
      navigate("/repos");
    },
  },
  {
    id: "go-dashboard",
    name: "Go to Dashboard",
    description: "Return to your main dashboard.",
    icon: "home",
    category: "settings",
    shortcut: "g h",
    execute: async () => {
      navigate("/dashboard");
    },
  },
  {
    id: "open-billing",
    name: "Open Billing & Plans",
    description: "Manage your subscription and payment methods.",
    icon: "credit-card",
    category: "settings",
    execute: async () => {
      navigate("/billing");
    },
  },
];

export function findActionById(id: string): QuickAction | undefined {
  return QUICK_ACTIONS.find((a) => a.id === id);
}

export function searchActions(query: string): QuickAction[] {
  const q = query.toLowerCase().trim();
  if (!q) return QUICK_ACTIONS;
  return QUICK_ACTIONS.filter((a) => {
    const haystack = `${a.name} ${a.description} ${a.category} ${a.id}`.toLowerCase();
    // Simple fuzzy: every char of query must appear in order in haystack.
    let i = 0;
    for (const ch of haystack) {
      if (ch === q[i]) i++;
      if (i >= q.length) return true;
    }
    return haystack.includes(q);
  });
}

export async function runAction(id: string): Promise<void> {
  const action = findActionById(id);
  if (!action) return;
  recordActionUse(id);
  await action.execute();
}
