// ── Claude Code transcript shape ─────────────────────────────────────
// We only parse the fields we actually need. JSONL records have
// additional fields we ignore (gitBranch, cwd, entrypoint, etc.).

export interface RawTurn {
  readonly uuid?: string;
  readonly parentUuid?: string | null;
  readonly sessionId?: string;
  readonly timestamp?: string; // ISO 8601
  readonly type?: string; // "user" | "assistant" | "system" | compact markers etc.
  readonly cwd?: string;
  readonly gitBranch?: string;
  readonly entrypoint?: string;
  readonly version?: string;
  readonly isSidechain?: boolean;
  readonly isMeta?: boolean;
  readonly isCompactSummary?: boolean;
  readonly subtype?: string;
  readonly message?: unknown;
  readonly attachment?: unknown;
  readonly compactMetadata?: unknown;
  readonly toolUseResult?: unknown;
}

// Role we persist. We collapse Claude's richer taxonomy (tool_use vs
// tool_result, system hook events, etc.) down to these buckets because
// retrieval-for-context does not need per-event granularity.
export type TurnRole =
  | "user"
  | "assistant"
  | "system"
  | "tool_use"
  | "tool_result";

export interface NormalizedTurn {
  readonly id: string;
  readonly seq: number;
  readonly role: TurnRole;
  readonly content: string;
  readonly toolName: string | null;
  readonly parentUuid: string | null;
  readonly timestamp: Date;
}

export interface NormalizedSession {
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
}
