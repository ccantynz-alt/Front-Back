#!/usr/bin/env bun
// CLI: bun run brief — prints the most recent sessions on this repo
// so a new Claude Code session arrives with prior context. Invoked
// from .claude/hooks/session-start.sh.

import "./resolve-db"; // MUST be first — sets DATABASE_URL before db loads
import { db } from "@back-to-the-future/db";
import { buildSessionBrief, renderBrief, getTopLessons } from "../brief";

async function main(): Promise<void> {
  const entries = await buildSessionBrief(db, { limit: 3 });
  console.log(renderBrief(entries));

  const lessons = await getTopLessons(db, { limit: 5 });
  if (lessons.length > 0) {
    console.log("[flywheel] Top lessons from prior sessions:");
    for (const l of lessons) {
      console.log(`  • [${l.category}] ${l.title} (conf ${l.confidence})`);
    }
  }
}

main().catch((err: unknown) => {
  // Briefing is best-effort — never block the session start.
  console.warn("[flywheel] Brief unavailable:", err instanceof Error ? err.message : String(err));
  process.exit(0);
});
