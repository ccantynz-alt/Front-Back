// ── framework detection ────────────────────────────────────────────────
// Reads a project's package.json + filesystem to classify the framework.
// Returns one of: solidstart | nextjs | astro | vite | bun | node | static | unknown
//
// Detection precedence (most specific wins):
//   1. dependencies / devDependencies (most reliable)
//   2. config files (next.config.*, astro.config.*, vite.config.*)
//   3. presence of a `start`/`build` script (-> bun/node)
//   4. presence of index.html only (-> static)
//   5. fallback: unknown

import * as path from "node:path";
import type { Framework } from "./schemas";

interface PackageJson {
  readonly name?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly engines?: Readonly<Record<string, string>>;
}

export interface FilesystemProbe {
  readPackageJson(dir: string): Promise<PackageJson | null>;
  hasFile(dir: string, filename: string): Promise<boolean>;
}

const defaultProbe: FilesystemProbe = {
  async readPackageJson(dir: string): Promise<PackageJson | null> {
    const pkgPath = path.join(dir, "package.json");
    const file = Bun.file(pkgPath);
    if (!(await file.exists())) return null;
    try {
      const text = await file.text();
      return JSON.parse(text) as PackageJson;
    } catch {
      return null;
    }
  },
  async hasFile(dir: string, filename: string): Promise<boolean> {
    return Bun.file(path.join(dir, filename)).exists();
  },
};

function hasDep(pkg: PackageJson, name: string): boolean {
  return name in (pkg.dependencies ?? {}) || name in (pkg.devDependencies ?? {});
}

function detectFromDeps(pkg: PackageJson): Framework | null {
  if (hasDep(pkg, "@solidjs/start") || hasDep(pkg, "solid-start")) return "solidstart";
  if (hasDep(pkg, "next")) return "nextjs";
  if (hasDep(pkg, "astro")) return "astro";
  if (hasDep(pkg, "vite")) return "vite";
  return null;
}

async function detectFromConfigFiles(
  dir: string,
  probe: FilesystemProbe,
): Promise<Framework | null> {
  const configs: ReadonlyArray<readonly [string, Framework]> = [
    ["next.config.js", "nextjs"],
    ["next.config.mjs", "nextjs"],
    ["next.config.ts", "nextjs"],
    ["astro.config.mjs", "astro"],
    ["astro.config.ts", "astro"],
    ["astro.config.js", "astro"],
    ["vite.config.ts", "vite"],
    ["vite.config.js", "vite"],
    ["vite.config.mjs", "vite"],
  ];
  for (const [filename, framework] of configs) {
    if (await probe.hasFile(dir, filename)) return framework;
  }
  return null;
}

function detectFromScripts(pkg: PackageJson): Framework | null {
  const buildScript = pkg.scripts?.["build"];
  const startScript = pkg.scripts?.["start"];
  if (!buildScript && !startScript) return null;
  // bun runtime hint (engines.bun or scripts referencing bun)
  const bunHinted =
    pkg.engines?.["bun"] !== undefined ||
    (buildScript ?? "").includes("bun ") ||
    (startScript ?? "").includes("bun ");
  return bunHinted ? "bun" : "node";
}

export async function detectFramework(
  dir: string,
  probe: FilesystemProbe = defaultProbe,
): Promise<Framework> {
  const pkg = await probe.readPackageJson(dir);

  // No package.json — could still be a static site (just an index.html)
  if (!pkg) {
    if (await probe.hasFile(dir, "index.html")) return "static";
    return "unknown";
  }

  const fromDeps = detectFromDeps(pkg);
  if (fromDeps) return fromDeps;

  const fromConfig = await detectFromConfigFiles(dir, probe);
  if (fromConfig) return fromConfig;

  const fromScripts = detectFromScripts(pkg);
  if (fromScripts) return fromScripts;

  // Final fallback: package.json with no build hint but an index.html
  if (await probe.hasFile(dir, "index.html")) return "static";

  return "unknown";
}
