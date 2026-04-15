import { sanitize } from "./redact";
import type { NormalizedSession, NormalizedTurn, RawTurn, TurnRole } from "./types";

// ── JSONL parsing ────────────────────────────────────────────────────
// Claude Code writes one JSON object per line. We tolerate malformed
// lines (partial writes, corrupt entries) rather than throwing — an
// agent's memory should be resilient to dirty data.

export function parseJsonlLines(raw: string): ReadonlyArray<RawTurn> {
  const out: RawTurn[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        out.push(parsed as RawTurn);
      }
    } catch {
      // Skip malformed line silently — log if ever useful.
    }
  }
  return out;
}

function extractText(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message !== "object") return "";

  // Claude Code messages usually have { role, content } where content
  // is either a string or an array of { type: "text" | "tool_use" |
  // "tool_result", text?, name?, content? } parts.
  const m = message as Record<string, unknown>;
  const content = m["content"];

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part === "string") {
        parts.push(part);
        continue;
      }
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        const text = p["text"];
        if (typeof text === "string") {
          parts.push(text);
          continue;
        }
        const inner = p["content"];
        if (typeof inner === "string") {
          parts.push(inner);
          continue;
        }
        if (Array.isArray(inner)) {
          for (const seg of inner) {
            if (seg && typeof seg === "object") {
              const segText = (seg as Record<string, unknown>)["text"];
              if (typeof segText === "string") parts.push(segText);
            }
          }
        }
      }
    }
    return parts.join("\n");
  }
  return "";
}

function extractToolName(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;
  const content = m["content"];
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (p["type"] === "tool_use" && typeof p["name"] === "string") {
          return p["name"];
        }
      }
    }
  }
  return null;
}

function classifyRole(raw: RawTurn): TurnRole | null {
  const t = raw.type;
  if (t === "user") {
    // Claude Code marks tool_result messages as user-role too; detect.
    const m = raw.message as Record<string, unknown> | undefined;
    if (m && Array.isArray(m["content"])) {
      const hasToolResult = (m["content"] as unknown[]).some(
        (p) =>
          p !== null &&
          typeof p === "object" &&
          (p as Record<string, unknown>)["type"] === "tool_result",
      );
      if (hasToolResult) return "tool_result";
    }
    return "user";
  }
  if (t === "assistant") {
    const m = raw.message as Record<string, unknown> | undefined;
    if (m && Array.isArray(m["content"])) {
      const hasToolUse = (m["content"] as unknown[]).some(
        (p) =>
          p !== null &&
          typeof p === "object" &&
          (p as Record<string, unknown>)["type"] === "tool_use",
      );
      if (hasToolUse) return "tool_use";
    }
    return "assistant";
  }
  if (t === "system") return "system";
  // Compact boundaries, meta events etc. — skip.
  return null;
}

function parseTimestamp(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

/**
 * Normalize a JSONL transcript into one session + N turns.
 * Returns `null` for empty/unusable transcripts.
 */
export function normalizeTranscript(
  raws: ReadonlyArray<RawTurn>,
): { session: NormalizedSession; turns: ReadonlyArray<NormalizedTurn> } | null {
  if (raws.length === 0) return null;

  let sessionId: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let entrypoint: string | null = null;
  let version: string | null = null;
  let firstUserMessage: string | null = null;
  let startedAt: Date | null = null;
  let endedAt: Date | null = null;
  let compactCount = 0;

  const turns: NormalizedTurn[] = [];
  let seq = 0;

  for (const raw of raws) {
    if (!sessionId && typeof raw.sessionId === "string") sessionId = raw.sessionId;
    if (!cwd && typeof raw.cwd === "string") cwd = raw.cwd;
    if (!gitBranch && typeof raw.gitBranch === "string") gitBranch = raw.gitBranch;
    if (!entrypoint && typeof raw.entrypoint === "string") entrypoint = raw.entrypoint;
    if (!version && typeof raw.version === "string") version = raw.version;
    if (raw.subtype === "compact_boundary" || raw.isCompactSummary === true) {
      compactCount += 1;
    }

    const ts = parseTimestamp(raw.timestamp, startedAt ?? new Date(0));
    if (!startedAt || ts < startedAt) startedAt = ts;
    if (!endedAt || ts > endedAt) endedAt = ts;

    const role = classifyRole(raw);
    if (!role) continue;

    const uuid = typeof raw.uuid === "string" ? raw.uuid : null;
    if (!uuid) continue;

    const text = extractText(raw.message);
    if (!text.trim()) continue;

    const content = sanitize(text);
    const toolName = extractToolName(raw.message);

    if (role === "user" && !firstUserMessage) {
      firstUserMessage = content.slice(0, 500);
    }

    turns.push({
      id: uuid,
      seq,
      role,
      content,
      toolName,
      parentUuid: typeof raw.parentUuid === "string" ? raw.parentUuid : null,
      timestamp: ts,
    });
    seq += 1;
  }

  if (!sessionId || !startedAt) return null;

  return {
    session: {
      id: sessionId,
      cwd,
      gitBranch,
      entrypoint,
      version,
      firstUserMessage,
      turnCount: turns.length,
      compactCount,
      startedAt,
      endedAt,
    },
    turns,
  };
}
