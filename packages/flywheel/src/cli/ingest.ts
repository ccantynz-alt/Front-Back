#!/usr/bin/env bun
// CLI: bun run ingest — scans ~/.claude/projects/-home-user-Crontech
// and upserts every transcript into the flywheel tables.

import "./resolve-db"; // MUST be first — sets DATABASE_URL before db loads
import { db } from "@back-to-the-future/db";
import { ingestTranscripts, defaultTranscriptDir } from "../ingest";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const dir = defaultTranscriptDir();
  console.log(`[flywheel:ingest] Scanning ${dir} (force=${force ? "yes" : "no"})`);

  const result = await ingestTranscripts(db, { force });

  console.log(
    `[flywheel:ingest] Scanned ${result.scanned} transcripts — ` +
      `ingested ${result.ingested}, skipped ${result.skipped}, ` +
      `inserted ${result.turnsInserted} turns.`,
  );

  if (result.errors.length > 0) {
    console.warn(`[flywheel:ingest] ${result.errors.length} error(s):`);
    for (const e of result.errors) {
      console.warn(`  • ${e.file}: ${e.message}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error("[flywheel:ingest] Failed:", err);
  process.exit(1);
});
