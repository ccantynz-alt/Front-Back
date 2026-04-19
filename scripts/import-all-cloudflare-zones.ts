#!/usr/bin/env bun
// ── Batch importer — migrate every Cloudflare zone into our DNS ──────
//
// Usage:
//   bun run scripts/import-all-cloudflare-zones.ts --token=<CF_API_TOKEN> [--dry-run]
//
// Lists every zone on the Cloudflare account the token has access to,
// then calls the existing import-dns-zone.ts logic per zone. No manual
// zone names required.
//
// Env fallbacks: CF_API_TOKEN
// Flags:
//   --token=<val>    Cloudflare API token (or use CF_API_TOKEN env var)
//   --dry-run        list what would be imported, don't actually write
//   --admin-email=   default admin email for SOA on newly-created zones
//   --primary-ns=    default primary NS (default: ns1.crontech.ai)
//   --secondary-ns=  default secondary NS (default: ns2.crontech.ai)
//   --filter=<sub>   only import zones whose name contains <sub>

import { z } from "zod";

interface Args {
  token: string;
  dryRun: boolean;
  adminEmail: string;
  primaryNs: string;
  secondaryNs: string;
  filter: string | null;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const prefix = `--${flag}=`;
    const found = argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  };
  const has = (flag: string): boolean => argv.includes(`--${flag}`);

  const token = get("token") ?? process.env["CF_API_TOKEN"];
  if (!token) {
    console.error(
      "ERROR: Cloudflare API token missing. Pass --token=<val> or set CF_API_TOKEN env var.",
    );
    console.error(
      "Get one at: https://dash.cloudflare.com/profile/api-tokens (see docs/SELF_HOSTED_CUTOVER.md)",
    );
    process.exit(1);
  }

  return {
    token,
    dryRun: has("dry-run"),
    adminEmail: get("admin-email") ?? "admin@crontech.ai",
    primaryNs: get("primary-ns") ?? "ns1.crontech.ai",
    secondaryNs: get("secondary-ns") ?? "ns2.crontech.ai",
    filter: get("filter"),
  };
}

// ── Cloudflare API wire schemas ────────────────────────────────────

const CfZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  paused: z.boolean().optional(),
  type: z.string().optional(),
  name_servers: z.array(z.string()).optional(),
});

const CfListZonesResponseSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.unknown()).optional(),
  result: z.array(CfZoneSchema),
  result_info: z
    .object({
      page: z.number(),
      per_page: z.number(),
      total_pages: z.number(),
      count: z.number(),
      total_count: z.number(),
    })
    .optional(),
});

async function listAllCloudflareZones(token: string): Promise<
  Array<z.infer<typeof CfZoneSchema>>
> {
  const all: Array<z.infer<typeof CfZoneSchema>> = [];
  let page = 1;
  const perPage = 50;

  for (;;) {
    const url = `https://api.cloudflare.com/client/v4/zones?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Cloudflare API ${res.status} ${res.statusText} while listing zones. ` +
          `Check your token has Zone:Read scope.`,
      );
    }
    const raw = await res.json();
    const parsed = CfListZonesResponseSchema.parse(raw);
    if (!parsed.success) {
      throw new Error(
        `Cloudflare API returned success=false: ${JSON.stringify(parsed.errors)}`,
      );
    }

    all.push(...parsed.result);

    const totalPages = parsed.result_info?.total_pages ?? 1;
    if (page >= totalPages) break;
    page += 1;
  }

  return all;
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("══════════════════════════════════════════════════");
  console.log("  Cloudflare → Crontech DNS batch import");
  console.log("══════════════════════════════════════════════════");
  console.log("");

  console.log("Listing all zones on your Cloudflare account...");
  let zones = await listAllCloudflareZones(args.token);

  if (args.filter) {
    zones = zones.filter((z) => z.name.includes(args.filter as string));
  }

  if (zones.length === 0) {
    console.log("No zones found. Nothing to import.");
    process.exit(0);
  }

  console.log(`Found ${zones.length} zone(s):`);
  for (const z of zones) {
    const flag = z.status === "active" ? "✓" : "•";
    const pausedTag = z.paused ? " [paused]" : "";
    console.log(`  ${flag} ${z.name.padEnd(32)} status=${z.status}${pausedTag}`);
  }
  console.log("");

  if (args.dryRun) {
    console.log("(--dry-run) Skipping actual import. Re-run without --dry-run to migrate.");
    process.exit(0);
  }

  // Import each zone via the single-zone importer, sequentially to keep logs clean
  const importerPath = new URL(
    "./import-dns-zone.ts",
    import.meta.url,
  ).pathname;

  const results: Array<{ zone: string; ok: boolean; error?: string }> = [];

  for (const z of zones) {
    console.log("──────────────────────────────────────────────────");
    console.log(`Importing ${z.name}...`);
    try {
      const proc = Bun.spawn(
        [
          "bun",
          "run",
          importerPath,
          `--token=${args.token}`,
          `--zone=${z.name}`,
          `--admin-email=${args.adminEmail}`,
          `--primary-ns=${args.primaryNs}`,
          `--secondary-ns=${args.secondaryNs}`,
        ],
        {
          stdout: "inherit",
          stderr: "inherit",
        },
      );
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        results.push({ zone: z.name, ok: true });
      } else {
        results.push({
          zone: z.name,
          ok: false,
          error: `import-dns-zone.ts exited with code ${exitCode}`,
        });
      }
    } catch (err) {
      results.push({
        zone: z.name,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("══════════════════════════════════════════════════");
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`  ${ok.length} / ${results.length} zones imported successfully`);
  if (failed.length > 0) {
    console.log(`  ${failed.length} zone(s) failed:`);
    for (const f of failed) {
      console.log(`    ✗ ${f.zone} — ${f.error}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("Next steps:");
  console.log(
    "  1. At your domain registrar, change nameservers for each imported zone to:",
  );
  console.log(`     ${args.primaryNs}`);
  console.log(`     ${args.secondaryNs}`);
  console.log("  2. Wait for propagation (1–48 h).");
  console.log("  3. Verify with: dig NS <zone>");
  console.log("");
}

main().catch((err) => {
  console.error("FATAL:", (err as Error).message);
  process.exit(1);
});
