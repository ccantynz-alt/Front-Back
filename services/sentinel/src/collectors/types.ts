import { z } from "zod";

export type Severity = "low" | "medium" | "high" | "critical";

export type RepoPriority = "critical" | "high" | "medium";

export type RepoCategory = "framework" | "backend" | "api" | "ai";

export const IntelligenceItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  collectedAt: z.string(),
});

export type IntelligenceItem = z.infer<typeof IntelligenceItemSchema>;

export interface CollectorResult {
  source: string;
  items: IntelligenceItem[];
  collectedAt: string;
  success: boolean;
  error: string | undefined;
  durationMs: number;
}

export interface Collector {
  name: string;
  cronExpression: string;
  intervalMs: number;
  collect(): Promise<CollectorResult>;
}

export interface TrackedRepo {
  owner: string;
  repo: string;
  displayName: string;
  priority: RepoPriority;
  category: RepoCategory;
  description: string;
  defaultBranch: string;
  lastKnownRelease: string | null;
  lastKnownReleaseAt: string | null;
  lastCommitCheckAt: string | null;
  baselineCommitsPerWeek: number | null;
}

export const TrackedRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  displayName: z.string(),
  priority: z.enum(["critical", "high", "medium"]),
  category: z.enum(["framework", "backend", "api", "ai"]),
  description: z.string(),
  defaultBranch: z.string(),
  lastKnownRelease: z.string().nullable(),
  lastKnownReleaseAt: z.string().nullable(),
  lastCommitCheckAt: z.string().nullable(),
  baselineCommitsPerWeek: z.number().nullable(),
});

export const TrackedReposFileSchema = z.object({
  repos: z.array(TrackedRepoSchema),
  lastUpdated: z.string().nullable(),
  schemaVersion: z.number(),
});

export type TrackedReposFile = z.infer<typeof TrackedReposFileSchema>;

/** Static fallback list used when tracked-repos.json cannot be loaded. */
export const DEFAULT_TRACKED_REPOS: TrackedRepo[] = [
  {
    owner: "vercel",
    repo: "next.js",
    displayName: "Next.js",
    priority: "critical",
    category: "framework",
    description: "React framework for production.",
    defaultBranch: "canary",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "remix-run",
    repo: "remix",
    displayName: "Remix",
    priority: "high",
    category: "framework",
    description: "Full-stack web framework.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "sveltejs",
    repo: "kit",
    displayName: "SvelteKit",
    priority: "high",
    category: "framework",
    description: "Full-stack Svelte framework.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "QwikDev",
    repo: "qwik",
    displayName: "Qwik",
    priority: "medium",
    category: "framework",
    description: "Resumable framework.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "withastro",
    repo: "astro",
    displayName: "Astro",
    priority: "high",
    category: "framework",
    description: "Content-focused web framework.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "honojs",
    repo: "hono",
    displayName: "Hono",
    priority: "critical",
    category: "backend",
    description: "Ultrafast web framework.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "solidjs",
    repo: "solid",
    displayName: "SolidJS",
    priority: "critical",
    category: "framework",
    description: "Our primary frontend framework.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "trpc",
    repo: "trpc",
    displayName: "tRPC",
    priority: "critical",
    category: "api",
    description: "End-to-end typesafe APIs.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "vercel",
    repo: "ai",
    displayName: "Vercel AI SDK",
    priority: "critical",
    category: "ai",
    description: "AI SDK for streaming and generative UI.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
  {
    owner: "langchain-ai",
    repo: "langchainjs",
    displayName: "LangChain JS",
    priority: "high",
    category: "ai",
    description: "JS framework for LLM applications.",
    defaultBranch: "main",
    lastKnownRelease: null,
    lastKnownReleaseAt: null,
    lastCommitCheckAt: null,
    baselineCommitsPerWeek: null,
  },
];

export const SEARCH_KEYWORDS = [
  "AI framework",
  "web framework",
  "WebGPU",
  "edge computing",
  "CRDT",
  "SolidJS",
  "browser AI",
  "real-time collaboration",
];

export const TRACKED_NPM_PACKAGES = [
  "next",
  "remix",
  "svelte",
  "@sveltejs/kit",
  "astro",
  "hono",
  "solid-js",
  "@solidjs/start",
  "@trpc/server",
  "@trpc/client",
  "ai",
  "@ai-sdk/openai",
  "langchain",
  "@langchain/core",
  "drizzle-orm",
  "yjs",
  "zod",
];
