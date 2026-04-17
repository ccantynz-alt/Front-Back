// ── Framework Detection ───────────────────────────────────────────────
// Reads a project's package.json and file structure to determine the
// framework, build command, start command, and output directory.

import * as path from "node:path";
import type { FrameworkDetection, FrameworkType } from "./types";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(appDir: string): Promise<PackageJson | null> {
  const pkgPath = path.join(appDir, "package.json");
  const file = Bun.file(pkgPath);
  if (!(await file.exists())) return null;
  const text = await file.text();
  return JSON.parse(text) as PackageJson;
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return (
    name in (pkg.dependencies ?? {}) || name in (pkg.devDependencies ?? {})
  );
}

async function hasFile(appDir: string, filename: string): Promise<boolean> {
  return Bun.file(path.join(appDir, filename)).exists();
}

function detectFromDeps(pkg: PackageJson): FrameworkType | null {
  if (hasDep(pkg, "@solidjs/start") || hasDep(pkg, "solid-start")) {
    return "solidstart";
  }
  if (hasDep(pkg, "next")) {
    return "nextjs";
  }
  if (hasDep(pkg, "astro")) {
    return "astro";
  }
  if (hasDep(pkg, "vite")) {
    return "vite";
  }
  return null;
}

async function detectFromFiles(appDir: string): Promise<FrameworkType | null> {
  if (await hasFile(appDir, "next.config.js")) return "nextjs";
  if (await hasFile(appDir, "next.config.mjs")) return "nextjs";
  if (await hasFile(appDir, "next.config.ts")) return "nextjs";
  if (await hasFile(appDir, "astro.config.mjs")) return "astro";
  if (await hasFile(appDir, "astro.config.ts")) return "astro";
  if (await hasFile(appDir, "vite.config.ts")) return "vite";
  if (await hasFile(appDir, "vite.config.js")) return "vite";
  if (await hasFile(appDir, "vite.config.mjs")) return "vite";
  return null;
}

function isStaticProject(pkg: PackageJson): boolean {
  const buildScript = pkg.scripts?.["build"] ?? "";
  const hasNoStart = !pkg.scripts?.["start"];
  const hasNoDev = !pkg.scripts?.["dev"];
  const looksStatic =
    buildScript.includes("vite build") && hasNoStart && hasNoDev;
  return looksStatic;
}

function getFrameworkConfig(
  framework: FrameworkType,
  pkg: PackageJson,
): FrameworkDetection {
  const buildScript = pkg.scripts?.["build"];

  switch (framework) {
    case "solidstart":
      return {
        framework: "solidstart",
        buildCommand: buildScript ?? "bun run build",
        startCommand: "bun run .output/server/index.mjs",
        outputDir: ".output",
        needsServer: true,
      };

    case "nextjs":
      return {
        framework: "nextjs",
        buildCommand: buildScript ?? "bun run build",
        startCommand: "bun run start",
        outputDir: ".next",
        needsServer: true,
      };

    case "astro": {
      const hasSSR =
        hasDep(pkg, "@astrojs/node") || hasDep(pkg, "@astrojs/deno");
      return {
        framework: "astro",
        buildCommand: buildScript ?? "bun run build",
        startCommand: hasSSR ? "bun run ./dist/server/entry.mjs" : "",
        outputDir: "dist",
        needsServer: hasSSR,
      };
    }

    case "vite":
      return {
        framework: "vite",
        buildCommand: buildScript ?? "bun run build",
        startCommand: "",
        outputDir: "dist",
        needsServer: false,
      };

    case "static":
      return {
        framework: "static",
        buildCommand: buildScript ?? "",
        startCommand: "",
        outputDir: "dist",
        needsServer: false,
      };

    case "bun":
      return {
        framework: "bun",
        buildCommand: buildScript ?? "bun run build",
        startCommand: pkg.scripts?.["start"] ?? "bun run src/index.ts",
        outputDir: "dist",
        needsServer: true,
      };
  }
}

export async function detectFramework(
  appDir: string,
): Promise<FrameworkDetection> {
  const pkg = await readPackageJson(appDir);

  if (!pkg) {
    return {
      framework: "static",
      buildCommand: "",
      startCommand: "",
      outputDir: ".",
      needsServer: false,
    };
  }

  const fromDeps = detectFromDeps(pkg);
  if (fromDeps) {
    if (fromDeps === "vite" && isStaticProject(pkg)) {
      return getFrameworkConfig("static", pkg);
    }
    return getFrameworkConfig(fromDeps, pkg);
  }

  const fromFiles = await detectFromFiles(appDir);
  if (fromFiles) {
    return getFrameworkConfig(fromFiles, pkg);
  }

  if (pkg.scripts?.["start"]) {
    return getFrameworkConfig("bun", pkg);
  }

  return getFrameworkConfig("static", pkg);
}
