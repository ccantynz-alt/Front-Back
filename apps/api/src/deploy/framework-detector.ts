// ── Framework Detection Engine ──────────────────────────────────────
// Given a public GitHub repo URL, fetches key files in parallel to
// auto-detect the framework and return the optimal build configuration.
// This powers the "Quick Deploy" flow — paste a URL, deploy in 30s.

import { z } from "zod";

// ── Types & Schemas ─────────────────────────────────────────────────

export const FrameworkId = z.enum([
  "solidstart",
  "nextjs",
  "astro",
  "remix",
  "hono",
  "vite",
  "express",
  "static",
  "docker",
  "unknown",
]);
export type FrameworkId = z.infer<typeof FrameworkId>;

export const DetectedConfigSchema = z.object({
  framework: FrameworkId,
  buildCommand: z.string(),
  installCommand: z.string(),
  runtime: z.enum(["bun", "node", "static", "docker"]),
  port: z.number().int().positive(),
  outputDir: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type DetectedConfig = z.infer<typeof DetectedConfigSchema>;

// ── Default Configs ─────────────────────────────────────────────────

const FRAMEWORK_DEFAULTS: Record<FrameworkId, Omit<DetectedConfig, "confidence">> = {
  solidstart: {
    framework: "solidstart",
    buildCommand: "bun run build",
    installCommand: "bun install",
    runtime: "bun",
    port: 3000,
    outputDir: ".output",
  },
  nextjs: {
    framework: "nextjs",
    buildCommand: "npm run build",
    installCommand: "npm install",
    runtime: "node",
    port: 3000,
    outputDir: ".next",
  },
  astro: {
    framework: "astro",
    buildCommand: "npm run build",
    installCommand: "npm install",
    runtime: "node",
    port: 4321,
    outputDir: "dist",
  },
  remix: {
    framework: "remix",
    buildCommand: "npm run build",
    installCommand: "npm install",
    runtime: "node",
    port: 3000,
    outputDir: "build",
  },
  hono: {
    framework: "hono",
    buildCommand: "bun build src/index.ts --outdir dist",
    installCommand: "bun install",
    runtime: "bun",
    port: 3000,
    outputDir: "dist",
  },
  vite: {
    framework: "vite",
    buildCommand: "npm run build",
    installCommand: "npm install",
    runtime: "node",
    port: 5173,
    outputDir: "dist",
  },
  express: {
    framework: "express",
    buildCommand: "npm run build",
    installCommand: "npm install",
    runtime: "node",
    port: 3000,
    outputDir: "dist",
  },
  static: {
    framework: "static",
    buildCommand: "",
    installCommand: "",
    runtime: "static",
    port: 80,
    outputDir: ".",
  },
  docker: {
    framework: "docker",
    buildCommand: "docker build",
    installCommand: "",
    runtime: "docker",
    port: 3000,
    outputDir: "",
  },
  unknown: {
    framework: "unknown",
    buildCommand: "npm run build",
    installCommand: "npm install",
    runtime: "node",
    port: 3000,
    outputDir: "dist",
  },
};

// ── GitHub URL Parser ───────────────────────────────────────────────

export const GitHubRepoUrlSchema = z
  .string()
  .min(1)
  .refine(
    (url) => {
      const parsed = parseGitHubUrl(url);
      return parsed !== null;
    },
    { message: "Invalid GitHub repository URL. Expected: https://github.com/owner/repo" },
  );

interface RepoRef {
  owner: string;
  repo: string;
}

export function parseGitHubUrl(url: string): RepoRef | null {
  // Handle various GitHub URL formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // github.com/owner/repo
  // owner/repo (shorthand)
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/$/, "");

  // Full URL pattern
  const fullMatch = /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)/.exec(trimmed);
  if (fullMatch?.[1] && fullMatch[2]) {
    return { owner: fullMatch[1], repo: fullMatch[2] };
  }

  // Shorthand: owner/repo
  const shortMatch = /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/.exec(trimmed);
  if (shortMatch?.[1] && shortMatch[2]) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

// ── GitHub Raw Content Fetcher ──────────────────────────────────────

const GITHUB_API = "https://api.github.com";

interface FetchResult {
  path: string;
  content: string | null;
  found: boolean;
}

async function fetchRepoFile(
  owner: string,
  repo: string,
  path: string,
): Promise<FetchResult> {
  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3.raw",
        "User-Agent": "Crontech-Deploy-Agent/1.0",
      },
    });

    if (!res.ok) {
      return { path, content: null, found: false };
    }

    const content = await res.text();
    return { path, content, found: true };
  } catch {
    return { path, content: null, found: false };
  }
}

// ── Detection Logic ─────────────────────────────────────────────────

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function parsePackageJson(content: string): PackageJson | null {
  try {
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return (
    pkg.dependencies?.[name] !== undefined ||
    pkg.devDependencies?.[name] !== undefined
  );
}

/**
 * Detect the framework from a public GitHub repo URL.
 * Fetches key files in parallel for speed. Returns the detected
 * framework config with a confidence level.
 */
export async function detectFramework(repoUrl: string): Promise<DetectedConfig> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repository URL.");
  }

  const { owner, repo } = parsed;

  // Verify the repo exists and is accessible
  const repoCheck = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Crontech-Deploy-Agent/1.0",
    },
  });

  if (repoCheck.status === 404) {
    throw new Error(`Repository not found: ${owner}/${repo}. Is it public?`);
  }
  if (repoCheck.status === 401 || repoCheck.status === 403) {
    throw new Error(`Access denied: ${owner}/${repo}. Only public repositories are supported.`);
  }
  if (!repoCheck.ok) {
    throw new Error(`GitHub API error (${repoCheck.status}) while checking ${owner}/${repo}.`);
  }

  // Fetch all detection files in parallel — this is where speed matters
  const filesToCheck = [
    "package.json",
    "next.config.js",
    "next.config.ts",
    "next.config.mjs",
    "astro.config.mjs",
    "astro.config.ts",
    "app.config.ts",
    "remix.config.js",
    "remix.config.mjs",
    "Dockerfile",
    "index.html",
    "vite.config.ts",
    "vite.config.js",
  ];

  const results = await Promise.all(
    filesToCheck.map((path) => fetchRepoFile(owner, repo, path)),
  );

  const fileMap = new Map<string, FetchResult>();
  for (const result of results) {
    fileMap.set(result.path, result);
  }

  const has = (path: string): boolean => fileMap.get(path)?.found === true;
  const get = (path: string): string | null => fileMap.get(path)?.content ?? null;

  // Parse package.json for dependency detection
  const pkgContent = get("package.json");
  const pkg = pkgContent ? parsePackageJson(pkgContent) : null;

  // Detection priority (most specific to least specific):

  // 1. SolidStart — check app.config.ts + solid-start dep
  if (has("app.config.ts")) {
    const appConfig = get("app.config.ts");
    if (
      appConfig &&
      (appConfig.includes("solid") || appConfig.includes("vinxi")) &&
      pkg &&
      (hasDep(pkg, "@solidjs/start") || hasDep(pkg, "solid-start"))
    ) {
      const config = buildConfig("solidstart", "high", pkg);
      return config;
    }
  }

  // 2. Next.js — config file or dependency
  if (has("next.config.js") || has("next.config.ts") || has("next.config.mjs")) {
    return buildConfig("nextjs", "high", pkg);
  }
  if (pkg && hasDep(pkg, "next")) {
    return buildConfig("nextjs", "medium", pkg);
  }

  // 3. Astro — config file or dependency
  if (has("astro.config.mjs") || has("astro.config.ts")) {
    return buildConfig("astro", "high", pkg);
  }
  if (pkg && hasDep(pkg, "astro")) {
    return buildConfig("astro", "medium", pkg);
  }

  // 4. Remix — config file or dependency
  if (has("remix.config.js") || has("remix.config.mjs")) {
    return buildConfig("remix", "high", pkg);
  }
  if (pkg && (hasDep(pkg, "@remix-run/react") || hasDep(pkg, "remix"))) {
    return buildConfig("remix", "medium", pkg);
  }

  // 5. SolidStart by dependency alone (no app.config.ts found)
  if (pkg && (hasDep(pkg, "@solidjs/start") || hasDep(pkg, "solid-start"))) {
    return buildConfig("solidstart", "medium", pkg);
  }

  // 6. Hono
  if (pkg && hasDep(pkg, "hono")) {
    return buildConfig("hono", "medium", pkg);
  }

  // 7. Express
  if (pkg && hasDep(pkg, "express")) {
    return buildConfig("express", "medium", pkg);
  }

  // 8. Vite (generic)
  if (has("vite.config.ts") || has("vite.config.js")) {
    return buildConfig("vite", "medium", pkg);
  }
  if (pkg && hasDep(pkg, "vite")) {
    return buildConfig("vite", "low", pkg);
  }

  // 9. Docker
  if (has("Dockerfile")) {
    return buildConfig("docker", "high", null);
  }

  // 10. Static — only index.html, no package.json
  if (has("index.html") && !pkg) {
    return buildConfig("static", "high", null);
  }

  // 11. Static with package.json but no recognizable framework
  if (has("index.html") && pkg) {
    return buildConfig("static", "low", pkg);
  }

  // Fallback
  return { ...FRAMEWORK_DEFAULTS.unknown, confidence: "low" };
}

function buildConfig(
  framework: FrameworkId,
  confidence: DetectedConfig["confidence"],
  pkg: PackageJson | null,
): DetectedConfig {
  const defaults = FRAMEWORK_DEFAULTS[framework];
  const config: DetectedConfig = { ...defaults, confidence };

  // If package.json has a "build" script, prefer that
  if (pkg?.scripts?.["build"] && framework !== "static" && framework !== "docker") {
    // Use the package manager's run command based on detected runtime
    const hasLockBun =
      pkg.dependencies?.["bun"] !== undefined ||
      pkg.devDependencies?.["bun"] !== undefined;
    if (hasLockBun || config.runtime === "bun") {
      config.buildCommand = "bun run build";
      config.installCommand = "bun install";
    } else {
      config.buildCommand = "npm run build";
      config.installCommand = "npm install";
    }
  }

  return config;
}
