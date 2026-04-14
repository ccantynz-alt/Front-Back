import { and, desc, eq, like, or } from "drizzle-orm";
import { flywheelSessions, flywheelTurns, db } from "@back-to-the-future/db";

type Database = typeof db;

export interface SearchHit {
  readonly sessionId: string;
  readonly startedAt: Date;
  readonly gitBranch: string | null;
  readonly firstUserMessage: string | null;
  readonly turnId: string;
  readonly turnSeq: number;
  readonly turnRole: string;
  readonly turnTimestamp: Date;
  readonly snippet: string;
}

/**
 * Full-text-ish search over flywheel turns. SQLite LIKE for now; upgrade
 * to FTS5 (or Qdrant embeddings) once we have a working Sentinel loop
 * proving the flywheel is actually driving decisions.
 */
export async function searchMemory(
  database: Database,
  query: string,
  options: { limit?: number } = {},
): Promise<ReadonlyArray<SearchHit>> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const limit = options.limit ?? 25;
  const needle = `%${trimmed.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const rows = await database
    .select({
      sessionId: flywheelSessions.id,
      startedAt: flywheelSessions.startedAt,
      gitBranch: flywheelSessions.gitBranch,
      firstUserMessage: flywheelSessions.firstUserMessage,
      turnId: flywheelTurns.id,
      turnSeq: flywheelTurns.seq,
      turnRole: flywheelTurns.role,
      turnTimestamp: flywheelTurns.timestamp,
      content: flywheelTurns.content,
    })
    .from(flywheelTurns)
    .innerJoin(flywheelSessions, eq(flywheelSessions.id, flywheelTurns.sessionId))
    .where(
      or(
        like(flywheelTurns.content, needle),
        like(flywheelSessions.firstUserMessage, needle),
      ),
    )
    .orderBy(desc(flywheelTurns.timestamp))
    .limit(limit);

  return rows.map((r) => ({
    sessionId: r.sessionId,
    startedAt: r.startedAt,
    gitBranch: r.gitBranch,
    firstUserMessage: r.firstUserMessage,
    turnId: r.turnId,
    turnSeq: r.turnSeq,
    turnRole: r.turnRole,
    turnTimestamp: r.turnTimestamp,
    snippet: extractSnippet(r.content, trimmed),
  }));
}

function extractSnippet(content: string, needle: string): string {
  const lower = content.toLowerCase();
  const at = lower.indexOf(needle.toLowerCase());
  if (at < 0) return content.slice(0, 240);
  const start = Math.max(0, at - 80);
  const end = Math.min(content.length, at + needle.length + 160);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return prefix + content.slice(start, end) + suffix;
}

export interface SessionDetail {
  readonly id: string;
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly entrypoint: string | null;
  readonly version: string | null;
  readonly firstUserMessage: string | null;
  readonly turnCount: number;
  readonly compactCount: number;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly summary: string | null;
  readonly turns: ReadonlyArray<{
    readonly id: string;
    readonly seq: number;
    readonly role: string;
    readonly content: string;
    readonly toolName: string | null;
    readonly timestamp: Date;
  }>;
}

export async function getSession(
  database: Database,
  sessionId: string,
  options: { turnLimit?: number } = {},
): Promise<SessionDetail | null> {
  const turnLimit = options.turnLimit ?? 200;
  const rows = await database
    .select()
    .from(flywheelSessions)
    .where(eq(flywheelSessions.id, sessionId))
    .limit(1);
  const s = rows[0];
  if (!s) return null;

  const turns = await database
    .select({
      id: flywheelTurns.id,
      seq: flywheelTurns.seq,
      role: flywheelTurns.role,
      content: flywheelTurns.content,
      toolName: flywheelTurns.toolName,
      timestamp: flywheelTurns.timestamp,
    })
    .from(flywheelTurns)
    .where(eq(flywheelTurns.sessionId, sessionId))
    .orderBy(flywheelTurns.seq)
    .limit(turnLimit);

  return {
    id: s.id,
    cwd: s.cwd,
    gitBranch: s.gitBranch,
    entrypoint: s.entrypoint,
    version: s.version,
    firstUserMessage: s.firstUserMessage,
    turnCount: s.turnCount,
    compactCount: s.compactCount,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    summary: s.summary,
    turns,
  };
}

export async function listRecentSessions(
  database: Database,
  options: { limit?: number; gitBranch?: string } = {},
): Promise<ReadonlyArray<{
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  gitBranch: string | null;
  firstUserMessage: string | null;
  turnCount: number;
  compactCount: number;
}>> {
  const limit = options.limit ?? 25;
  const conditions = options.gitBranch
    ? eq(flywheelSessions.gitBranch, options.gitBranch)
    : undefined;

  const rows = await database
    .select({
      id: flywheelSessions.id,
      startedAt: flywheelSessions.startedAt,
      endedAt: flywheelSessions.endedAt,
      gitBranch: flywheelSessions.gitBranch,
      firstUserMessage: flywheelSessions.firstUserMessage,
      turnCount: flywheelSessions.turnCount,
      compactCount: flywheelSessions.compactCount,
    })
    .from(flywheelSessions)
    .where(conditions ? and(conditions) : undefined)
    .orderBy(desc(flywheelSessions.startedAt))
    .limit(limit);
  return rows;
}
