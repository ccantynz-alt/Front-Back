// ── framework detection tests ─────────────────────────────────────────
// Covers: SolidStart, Next.js, Astro, Vite, Bun, Node, static, unknown.

import { describe, expect, test } from "bun:test";
import { detectFramework } from "../src/framework";
import { MockFilesystemProbe } from "./util/mock-deps";

const DIR = "/checkout";

describe("detectFramework", () => {
  test("detects SolidStart via @solidjs/start dependency", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      dependencies: { "@solidjs/start": "^1.0.0" },
    });
    expect(await detectFramework(DIR, probe)).toBe("solidstart");
  });

  test("detects SolidStart via legacy solid-start dep", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      dependencies: { "solid-start": "^0.4.0" },
    });
    expect(await detectFramework(DIR, probe)).toBe("solidstart");
  });

  test("detects Next.js via dependency", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      dependencies: { next: "^14.0.0" },
    });
    expect(await detectFramework(DIR, probe)).toBe("nextjs");
  });

  test("detects Next.js via next.config.ts even without dep listed", async () => {
    const probe = new MockFilesystemProbe()
      .setPackageJson(DIR, { dependencies: {} })
      .setFile(DIR, "next.config.ts");
    expect(await detectFramework(DIR, probe)).toBe("nextjs");
  });

  test("detects Astro via dependency", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      dependencies: { astro: "^4.0.0" },
    });
    expect(await detectFramework(DIR, probe)).toBe("astro");
  });

  test("detects Vite via devDependency", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      devDependencies: { vite: "^5.0.0" },
    });
    expect(await detectFramework(DIR, probe)).toBe("vite");
  });

  test("detects bun project via engines.bun", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      engines: { bun: ">=1.0.0" },
      scripts: { build: "tsc" },
    });
    expect(await detectFramework(DIR, probe)).toBe("bun");
  });

  test("detects bun project via build script using bun", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      scripts: { build: "bun run src/build.ts" },
    });
    expect(await detectFramework(DIR, probe)).toBe("bun");
  });

  test("detects node project (no bun hint, has start script)", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, {
      scripts: { start: "node server.js" },
    });
    expect(await detectFramework(DIR, probe)).toBe("node");
  });

  test("detects static site (no package.json, has index.html)", async () => {
    const probe = new MockFilesystemProbe().setFile(DIR, "index.html", "<!doctype html>");
    expect(await detectFramework(DIR, probe)).toBe("static");
  });

  test("detects static site (package.json with no build script + index.html fallback)", async () => {
    const probe = new MockFilesystemProbe()
      .setPackageJson(DIR, { name: "static-site" })
      .setFile(DIR, "index.html", "<!doctype html>");
    expect(await detectFramework(DIR, probe)).toBe("static");
  });

  test("returns unknown when nothing is identifiable", async () => {
    const probe = new MockFilesystemProbe().setPackageJson(DIR, { name: "mystery" });
    expect(await detectFramework(DIR, probe)).toBe("unknown");
  });

  test("returns unknown when there is no package.json and no index.html", async () => {
    const probe = new MockFilesystemProbe();
    expect(await detectFramework(DIR, probe)).toBe("unknown");
  });

  test("dependency wins over config file when both present", async () => {
    const probe = new MockFilesystemProbe()
      .setPackageJson(DIR, { dependencies: { astro: "^4.0.0" } })
      .setFile(DIR, "vite.config.ts");
    // Astro projects often have vite under the hood; the dep wins
    expect(await detectFramework(DIR, probe)).toBe("astro");
  });
});
