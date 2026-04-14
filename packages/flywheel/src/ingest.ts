import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { eq } from "drizzle-orm";
import { flywheelSessions, flywheelTurns, db } from "@back-to-the-future/db";
import { startRun } from "@back-to-the-future/theatre";
import { normalizeTranscript, parseJsonlLines } from "./parse";
import type { NormalizedSession, NormalizedTurn, RawTurn } from "./types";

type Database = typeof db;

export interface IngestResult {
  readonly scanned: number;
  readonly ingested: number;
  readonly skipped: number;
  readonly turnsInserted: number;
  readonly errors: ReadonlyArray<{ file: string; message: string }>;
}

export interface IngestOptions {
  /** Directory to scan (defaults to ~/.claude/projects/-home-user-Crontech). */
  readonly transcriptDir?: string;
  /** If true, re-ingest sessions even if already present (rewrites turns). */
  readonly force?: boolean;
}

/**
 * Default transcript directory. Claude Code encodes the project cwd
 * by replacing "/" with "-" — so /home/user/Crontech becomes
 * "-home-user-Crontech".
 */
export function defaultTranscriptDir(): string {
  return join(homedir(), ".claude", "projects", "-home-user-Crontech");
}

/**
 * Ingest every .jsonl transcript found in `transcriptDir` into the
 * flywheel tables. Idempotent by default — sessions already present
 * are skipped unless `force` is set.
 *
 * A single Claude Code session may span MULTIPLE .jsonl files (pre-
 * and post-compact). So we first group every raw turn by its internal
 * sessionId, then normalize once per group, then insert.
 */
export async function ingestTranscripts(
  database: Database,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const dir = options.transcriptDir ?? defaultTranscriptDir();
  const force = options.force ?? false;

  // Open a theatre run so operators can watch this ingest live on /ops.
  const run = await startRun(database, {
    kind: "ingest",
    title: "Flywheel transcript ingest",
    actorLabel: "flywheel-cli",
    metadata: { dir, force },
  });

  try {
    const result = await run.step("scan transcripts", async (step) => {
      try {
        const entries = await readdir(dir);
        const files = entries
          .filter((f) => f.endsWith(".jsonl"))
          .map((f) => join(dir, f));
        await step.log(`found ${files.length} .jsonl file(s) in ${dir}`);
        return files;
      } catch (err) {
        await step.log(`readdir failed: ${errorMessage(err)}`, "stderr");
        throw err;
      }
    });

    const errors: Array<{ file: string; message: string }> = [];

    const bySession = await run.step("read + group by session", async (step) => {
      const map = new Map<string, Map<string, RawTurn>>();
      for (const file of result) {
        try {
          const raw = await readFile(file, "utf8");
          const lines = parseJsonlLines(raw);
          for (const r of lines) {
            const sid = typeof r.sessionId === "string" ? r.sessionId : null;
            const uid = typeof r.uuid === "string" ? r.uuid : null;
            if (!sid || !uid) continue;
            let group = map.get(sid);
            if (!group) {
              group = new Map<string, RawTurn>();
              map.set(sid, group);
            }
            if (!group.has(uid)) group.set(uid, r);
          }
        } catch (err) {
          errors.push({ file, message: errorMessage(err) });
          await step.log(`  ! ${file}: ${errorMessage(err)}`, "stderr");
        }
      }
      await step.log(`grouped ${map.size} unique session(s)`);
      return map;
    });

    const outcome = await run.step("normalize + insert", async (step) => {
      let ingested = 0;
      let skipped = 0;
      let turnsInserted = 0;

      for (const [sessionId, turnsMap] of bySession) {
        try {
          const sortedRaws = Array.from(turnsMap.values()).sort((a, b) => {
            const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return at - bt;
          });
          const normalized = normalizeTranscript(sortedRaws);
          if (!normalized) {
            skipped += 1;
            continue;
          }

          const existing = await database
            .select({ id: flywheelSessions.id })
            .from(flywheelSessions)
            .where(eq(flywheelSessions.id, normalized.session.id))
            .limit(1);

          if (existing.length > 0 && !force) {
            skipped += 1;
            continue;
          }

          if (existing.length > 0 && force) {
            await database
              .delete(flywheelSessions)
              .where(eq(flywheelSessions.id, normalized.session.id));
          }

          await insertSession(database, normalized.session);
          if (normalized.turns.length > 0) {
            await insertTurns(database, normalized.session.id, normalized.turns);
            turnsInserted += normalized.turns.length;
          }
          ingested += 1;
          await step.log(
            `  ✓ ${sessionId.slice(0, 8)}… ${normalized.turns.length} turns`,
          );
        } catch (err) {
          errors.push({ file: `session:${sessionId}`, message: errorMessage(err) });
          await step.log(`  ! ${sessionId}: ${errorMessage(err)}`, "stderr");
        }
      }

      await step.log(
        `done: ingested=${ingested} skipped=${skipped} turns=${turnsInserted}`,
      );
      return { ingested, skipped, turnsInserted };
    });

    await run.succeed();

    return {
      scanned: result.length,
      ingested: outcome.ingested,
      skipped: outcome.skipped,
      turnsInserted: outcome.turnsInserted,
      errors,
    };
  } catch (err) {
    await run.fail(err instanceof Error ? err : String(err));
    return {
      scanned: 0,
      ingested: 0,
      skipped: 0,
      turnsInserted: 0,
      errors: [{ file: dir, message: errorMessage(err) }],
    };
  }
}

async function insertSession(
  database: Database,
  session: NormalizedSession,
): Promise<void> {
  await database.insert(flywheelSessions).values({
    id: session.id,
    cwd: session.cwd,
    gitBranch: session.gitBranch,
    entrypoint: session.entrypoint,
    version: session.version,
    firstUserMessage: session.firstUserMessage,
    turnCount: session.turnCount,
    compactCount: session.compactCount,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    ingestedAt: new Date(),
  });
}

async function insertTurns(
  database: Database,
  sessionId: string,
  turns: ReadonlyArray<NormalizedTurn>,
): Promise<void> {
  const CHUNK = 50;
  for (let i = 0; i < turns.length; i += CHUNK) {
    const slice = turns.slice(i, i + CHUNK);
    await database.insert(flywheelTurns).values(
      slice.map((t) => ({
        id: t.id,
        sessionId,
        seq: t.seq,
        role: t.role,
        content: t.content,
        toolName: t.toolName,
        parentUuid: t.parentUuid,
        timestamp: t.timestamp,
      })),
    );
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
