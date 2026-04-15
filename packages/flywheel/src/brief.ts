import { desc, eq } from "drizzle-orm";
import { flywheelLessons, flywheelSessions, flywheelTurns, db } from "@back-to-the-future/db";

type Database = typeof db;

export interface BriefEntry {
  readonly sessionId: string;
  readonly startedAt: Date;
  readonly gitBranch: string | null;
  readonly firstUserMessage: string | null;
  readonly turnCount: number;
  readonly lastAssistantMessage: string | null;
}

/**
 * Return a compact brief of the most recent N sessions so the new
 * agent arrives with prior context instead of starting blind.
 *
 * Used by .claude/hooks/session-start.sh → printed before the agent's
 * first reply, so the doctrine's "zero scatter-gun" rule has teeth.
 */
export async function buildSessionBrief(
  database: Database,
  options: { limit?: number } = {},
): Promise<ReadonlyArray<BriefEntry>> {
  const limit = options.limit ?? 3;

  const sessions = await database
    .select({
      id: flywheelSessions.id,
      startedAt: flywheelSessions.startedAt,
      gitBranch: flywheelSessions.gitBranch,
      firstUserMessage: flywheelSessions.firstUserMessage,
      turnCount: flywheelSessions.turnCount,
    })
    .from(flywheelSessions)
    .orderBy(desc(flywheelSessions.startedAt))
    .limit(limit);

  const entries: BriefEntry[] = [];
  for (const s of sessions) {
    const last = await database
      .select({ content: flywheelTurns.content })
      .from(flywheelTurns)
      .where(eq(flywheelTurns.sessionId, s.id))
      .orderBy(desc(flywheelTurns.seq))
      .limit(1);

    const lastContent = last[0]?.content ?? null;
    entries.push({
      sessionId: s.id,
      startedAt: s.startedAt,
      gitBranch: s.gitBranch,
      firstUserMessage: s.firstUserMessage,
      turnCount: s.turnCount,
      lastAssistantMessage: lastContent ? lastContent.slice(0, 400) : null,
    });
  }

  return entries;
}

export interface LessonEntry {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly body: string;
  readonly confidence: number;
}

/**
 * Return the highest-confidence lessons so the new agent arrives with
 * doctrine-adjacent knowledge distilled from prior sessions.
 * Follow-on work wires a summarizer that populates `flywheel_lessons`;
 * until then this simply returns whatever has been seeded manually.
 */
export async function getTopLessons(
  database: Database,
  options: { limit?: number } = {},
): Promise<ReadonlyArray<LessonEntry>> {
  const limit = options.limit ?? 5;

  const rows = await database
    .select({
      id: flywheelLessons.id,
      category: flywheelLessons.category,
      title: flywheelLessons.title,
      body: flywheelLessons.body,
      confidence: flywheelLessons.confidence,
    })
    .from(flywheelLessons)
    .orderBy(desc(flywheelLessons.confidence), desc(flywheelLessons.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Render a brief as a human-readable string for the session-start hook.
 */
export function renderBrief(entries: ReadonlyArray<BriefEntry>): string {
  if (entries.length === 0) {
    return "[flywheel] No prior sessions ingested yet.";
  }
  const lines: string[] = ["[flywheel] Recent sessions on this repo:"];
  for (const e of entries) {
    const when = e.startedAt.toISOString().slice(0, 16).replace("T", " ");
    const branch = e.gitBranch ?? "?";
    const intent = (e.firstUserMessage ?? "(no user message)").replace(/\s+/g, " ").slice(0, 160);
    lines.push(`  • ${when} [${branch}] ${e.turnCount} turns — "${intent}"`);
  }
  return lines.join("\n");
}
