#!/usr/bin/env bun
/**
 * Import DNS Zone — CLI wrapper for BLK-023.
 *
 * Imports a Cloudflare zone's DNS records into Crontech's self-hosted
 * DNS store. Shares its import logic with the admin tRPC procedure
 * (`apps/api/src/trpc/procedures/dns-import.ts`) so the two entry
 * points always behave identically.
 *
 * Usage:
 *   bun run scripts/import-dns-zone.ts --token=CF_TOKEN --zone=crontech.ai
 *   bun run scripts/import-dns-zone.ts --token=CF_TOKEN --zone=crontech.ai --dry-run
 *   bun run scripts/import-dns-zone.ts --help
 *
 * Optional flags:
 *   --admin-email=EMAIL     Override the synthesised SOA admin email.
 *   --primary-ns=HOST       Override the primary NS advertised locally.
 *   --secondary-ns=HOST     Override the secondary NS advertised locally.
 *   --dry-run               Fetch + parse, but write nothing to the DB.
 *
 * Environment variables (used when the matching flag is absent):
 *   DNS_IMPORT_ADMIN_EMAIL, DNS_IMPORT_PRIMARY_NS, DNS_IMPORT_SECONDARY_NS
 *
 * Exit codes:
 *   0 — success (even if some records were skipped)
 *   1 — bad args, Cloudflare auth failure, or unrecoverable error
 */

import { importFromCloudflare } from "../apps/api/src/trpc/procedures/dns-import";

interface ParsedArgs {
  help: boolean;
  token: string | undefined;
  zone: string | undefined;
  adminEmail: string | undefined;
  primaryNs: string | undefined;
  secondaryNs: string | undefined;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = {
    help: false,
    token: undefined,
    zone: undefined,
    adminEmail: undefined,
    primaryNs: undefined,
    secondaryNs: undefined,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq === -1) continue;
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1);
    switch (key) {
      case "--token":
        out.token = value;
        break;
      case "--zone":
        out.zone = value;
        break;
      case "--admin-email":
        out.adminEmail = value;
        break;
      case "--primary-ns":
        out.primaryNs = value;
        break;
      case "--secondary-ns":
        out.secondaryNs = value;
        break;
      default:
        // Unknown flag — ignore rather than fail so we stay tolerant of
        // bun's own test runner flags when someone sources this file.
        break;
    }
  }

  return out;
}

function printHelp(): void {
  const lines = [
    "import-dns-zone — migrate a Cloudflare zone into Crontech DNS.",
    "",
    "Usage:",
    "  bun run scripts/import-dns-zone.ts --token=CF_TOKEN --zone=NAME [flags]",
    "",
    "Required:",
    "  --token=TOKEN         Cloudflare API token (Zone:Read, DNS:Read).",
    "  --zone=NAME           Zone name (e.g. crontech.ai).",
    "",
    "Optional:",
    "  --admin-email=EMAIL   Override synthesised SOA admin email.",
    "  --primary-ns=HOST     Override primary NS advertised locally.",
    "  --secondary-ns=HOST   Override secondary NS advertised locally.",
    "  --dry-run             Do not write to the DB; report what would happen.",
    "  --help, -h            Show this help and exit.",
    "",
    "Examples:",
    "  bun run scripts/import-dns-zone.ts --token=cf_abc --zone=crontech.ai",
    "  bun run scripts/import-dns-zone.ts --token=cf_abc --zone=gluecron.com --dry-run",
  ];
  for (const line of lines) {
    console.info(line);
  }
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  if (!args.token) {
    console.error("Missing required flag: --token=CF_TOKEN");
    console.error("Run with --help for usage.");
    return 1;
  }
  if (!args.zone) {
    console.error("Missing required flag: --zone=NAME");
    console.error("Run with --help for usage.");
    return 1;
  }

  console.info(
    `Importing zone "${args.zone}" from Cloudflare${args.dryRun ? " (dry-run)" : ""}...`,
  );

  try {
    const summary = await importFromCloudflare({
      apiToken: args.token,
      zoneName: args.zone,
      ...(args.adminEmail !== undefined ? { adminEmail: args.adminEmail } : {}),
      ...(args.primaryNs !== undefined ? { primaryNs: args.primaryNs } : {}),
      ...(args.secondaryNs !== undefined ? { secondaryNs: args.secondaryNs } : {}),
      dryRun: args.dryRun,
    });

    console.info("");
    console.info(`Zone id:   ${summary.zoneId}`);
    console.info(`Zone name: ${summary.zoneName}`);
    console.info(`Imported:  ${summary.imported}`);
    console.info(`Skipped:   ${summary.skipped}`);
    console.info(`Errors:    ${summary.errors.length}`);
    if (summary.errors.length > 0) {
      console.info("");
      console.info("Per-record errors:");
      for (const err of summary.errors) {
        const prefix = err.type && err.record ? `  [${err.type} ${err.record}]` : "  [?]";
        console.info(`${prefix} ${err.reason}`);
      }
    }
    if (summary.dryRun) {
      console.info("");
      console.info("Dry-run: no changes were written to the database.");
    }
    return 0;
  } catch (err) {
    console.error("");
    console.error("Import failed:");
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

// Only auto-run when invoked directly (not when imported by tests).
const isDirectRun =
  typeof Bun !== "undefined" &&
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  import.meta.path === process.argv[1];

if (isDirectRun) {
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
}
