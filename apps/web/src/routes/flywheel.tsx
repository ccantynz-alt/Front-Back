// BLK-017 Flywheel-4 — Memory search over every Claude Code session
// we've ever ingested from ~/.claude/projects/-home-user-Crontech/*.jsonl.
//
// Left column: recent sessions, newest first. Click to pull full transcript.
// Right column: search bar + hit list with snippet context around the match.
//
// No theater. No mock data. If the memory is empty, the page says so.

import {
  createResource,
  createSignal,
  For,
  Show,
} from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { trpc } from "../lib/trpc";

interface SessionRow {
  id: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
  gitBranch: string | null;
  firstUserMessage: string | null;
  turnCount: number;
  compactCount: number;
}

interface SearchHit {
  sessionId: string;
  startedAt: string | Date;
  gitBranch: string | null;
  firstUserMessage: string | null;
  turnId: string;
  turnSeq: number;
  turnRole: string;
  turnTimestamp: string | Date;
  snippet: string;
}

interface SessionDetail {
  id: string;
  cwd: string | null;
  gitBranch: string | null;
  entrypoint: string | null;
  version: string | null;
  firstUserMessage: string | null;
  turnCount: number;
  compactCount: number;
  startedAt: string | Date;
  endedAt: string | Date | null;
  summary: string | null;
  turns: ReadonlyArray<{
    id: string;
    seq: number;
    role: string;
    content: string;
    toolName: string | null;
    timestamp: string | Date;
  }>;
}

function formatWhen(d: string | Date): string {
  const iso = new Date(d).toISOString();
  return iso.slice(0, 16).replace("T", " ");
}

function roleColor(role: string): string {
  if (role === "user") return "#60a5fa";
  if (role === "assistant") return "#34d399";
  if (role === "tool") return "#fbbf24";
  return "#a1a1aa";
}

export default function FlywheelPage(): JSX.Element {
  const [query, setQuery] = createSignal("");
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null);

  const [sessions] = createResource(async () => {
    try {
      const out = await trpc.flywheel.recentSessions.query({ limit: 50 });
      return out as ReadonlyArray<SessionRow>;
    } catch (err) {
      console.error("[flywheel] recentSessions failed", err);
      return [] as ReadonlyArray<SessionRow>;
    }
  });

  const [hits] = createResource(query, async (q) => {
    if (q.trim().length < 2) return [] as ReadonlyArray<SearchHit>;
    try {
      const out = await trpc.flywheel.searchMemory.query({ query: q, limit: 40 });
      return out as ReadonlyArray<SearchHit>;
    } catch (err) {
      console.error("[flywheel] searchMemory failed", err);
      return [] as ReadonlyArray<SearchHit>;
    }
  });

  const [sessionDetail] = createResource(selectedSessionId, async (id) => {
    if (!id) return null;
    try {
      const out = await trpc.flywheel.getSession.query({ sessionId: id, turnLimit: 200 });
      return out as SessionDetail;
    } catch (err) {
      console.error("[flywheel] getSession failed", err);
      return null;
    }
  });

  return (
    <div style={{ "min-height": "100vh", background: "#0a0a0b", color: "#e4e4e7" }}>
      <SEOHead
        title="Flywheel Memory"
        description="Searchable memory across every Claude Code session on Crontech. Turn transcripts into institutional knowledge."
        path="/flywheel"
      />

      <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
        <h1 style={{ "font-size": "2rem", "font-weight": "700", margin: "0 0 0.25rem" }}>
          Flywheel Memory
        </h1>
        <p style={{ color: "#71717a", margin: "0 0 2rem", "font-size": "0.9rem" }}>
          Full-text search over every Claude Code session ingested from this repo.
          Every transcript becomes institutional memory the next agent can act on.
        </p>

        <div
          style={{
            display: "grid",
            "grid-template-columns": "320px 1fr",
            gap: "1.5rem",
          }}
        >
          {/* Left column: recent sessions */}
          <div
            style={{
              background: "#0f0f11",
              border: "1px solid #27272a",
              "border-radius": "8px",
              overflow: "hidden",
              "max-height": "80vh",
              "overflow-y": "auto",
            }}
          >
            <div
              style={{
                padding: "0.75rem 1rem",
                "border-bottom": "1px solid #27272a",
                "font-size": "0.75rem",
                "text-transform": "uppercase",
                "letter-spacing": "0.08em",
                color: "#a1a1aa",
                position: "sticky",
                top: "0",
                background: "#0f0f11",
                "z-index": 1,
              }}
            >
              Recent sessions
            </div>
            <Show
              when={(sessions()?.length ?? 0) > 0}
              fallback={
                <div
                  style={{
                    padding: "2rem 1rem",
                    color: "#71717a",
                    "font-size": "0.9rem",
                  }}
                >
                  No sessions ingested yet. Run{" "}
                  <code style={{ color: "#e4e4e7" }}>
                    bun run --filter=@back-to-the-future/flywheel ingest
                  </code>{" "}
                  to populate the memory.
                </div>
              }
            >
              <For each={sessions()}>
                {(s) => (
                  <button
                    type="button"
                    onClick={() => setSelectedSessionId(s.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      "text-align": "left",
                      padding: "0.75rem 1rem",
                      background:
                        selectedSessionId() === s.id ? "#18181b" : "transparent",
                      border: "none",
                      "border-bottom": "1px solid #27272a",
                      color: "#e4e4e7",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        "justify-content": "space-between",
                        "align-items": "center",
                      }}
                    >
                      <span style={{ "font-size": "0.72rem", color: "#71717a" }}>
                        {formatWhen(s.startedAt)}
                      </span>
                      <span
                        style={{ "font-size": "0.72rem", color: "#52525b" }}
                      >
                        {s.turnCount} turns
                      </span>
                    </div>
                    <div
                      style={{
                        "font-size": "0.85rem",
                        margin: "0.25rem 0",
                        "line-height": "1.35",
                        display: "-webkit-box",
                        "-webkit-line-clamp": "2",
                        "-webkit-box-orient": "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {s.firstUserMessage ?? "(no user message)"}
                    </div>
                    <div
                      style={{
                        "font-size": "0.7rem",
                        color: "#52525b",
                      }}
                    >
                      {s.gitBranch ?? "—"}
                      {s.compactCount > 0 ? ` · ${s.compactCount} compact` : ""}
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </div>

          {/* Right column: search + detail */}
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "1rem",
            }}
          >
            <div
              style={{
                background: "#0f0f11",
                border: "1px solid #27272a",
                "border-radius": "8px",
                padding: "1rem",
              }}
            >
              <input
                type="text"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                placeholder="Search every past session… (min 2 chars)"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  background: "#18181b",
                  border: "1px solid #3f3f46",
                  "border-radius": "6px",
                  color: "#e4e4e7",
                  "font-size": "0.95rem",
                  outline: "none",
                }}
              />
              <Show when={query().trim().length >= 2}>
                <div
                  style={{
                    "margin-top": "0.75rem",
                    "font-size": "0.75rem",
                    color: "#a1a1aa",
                  }}
                >
                  {hits.loading
                    ? "Searching…"
                    : `${hits()?.length ?? 0} hit(s)`}
                </div>
                <div
                  style={{
                    "margin-top": "0.5rem",
                    "max-height": "40vh",
                    "overflow-y": "auto",
                  }}
                >
                  <For each={hits()}>
                    {(hit) => (
                      <button
                        type="button"
                        onClick={() => setSelectedSessionId(hit.sessionId)}
                        style={{
                          display: "block",
                          width: "100%",
                          "text-align": "left",
                          padding: "0.65rem 0.8rem",
                          background: "transparent",
                          border: "1px solid #27272a",
                          "border-radius": "6px",
                          color: "#e4e4e7",
                          cursor: "pointer",
                          "margin-bottom": "0.4rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            "justify-content": "space-between",
                            "font-size": "0.7rem",
                            color: "#71717a",
                          }}
                        >
                          <span>
                            <span style={{ color: roleColor(hit.turnRole) }}>
                              {hit.turnRole}
                            </span>
                            {" · "}
                            {hit.gitBranch ?? "—"}
                            {" · seq "}
                            {hit.turnSeq}
                          </span>
                          <span>{formatWhen(hit.turnTimestamp)}</span>
                        </div>
                        <div
                          style={{
                            "font-size": "0.85rem",
                            "line-height": "1.4",
                            "margin-top": "0.25rem",
                            color: "#d4d4d8",
                            "white-space": "pre-wrap",
                            "word-break": "break-word",
                          }}
                        >
                          {hit.snippet}
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <div
              style={{
                background: "#0f0f11",
                border: "1px solid #27272a",
                "border-radius": "8px",
                "min-height": "400px",
              }}
            >
              <Show
                when={selectedSessionId()}
                fallback={
                  <div
                    style={{
                      padding: "4rem 2rem",
                      color: "#71717a",
                      "text-align": "center",
                    }}
                  >
                    Select a session on the left — or a search hit above — to
                    see the full transcript.
                  </div>
                }
              >
                <Show
                  when={sessionDetail()}
                  fallback={
                    <div style={{ padding: "2rem", color: "#71717a" }}>
                      {sessionDetail.loading
                        ? "Loading transcript…"
                        : "Transcript not found."}
                    </div>
                  }
                >
                  {(detail) => (
                    <>
                      <div
                        style={{
                          padding: "1rem",
                          "border-bottom": "1px solid #27272a",
                        }}
                      >
                        <div
                          style={{ "font-size": "0.72rem", color: "#71717a" }}
                        >
                          {formatWhen(detail().startedAt)}
                          {" · "}
                          {detail().gitBranch ?? "—"}
                          {" · "}
                          {detail().turnCount} turns
                          {detail().compactCount > 0
                            ? ` · ${detail().compactCount} compact`
                            : ""}
                        </div>
                        <div
                          style={{
                            "font-size": "0.95rem",
                            "font-weight": "500",
                            margin: "0.25rem 0",
                          }}
                        >
                          {detail().firstUserMessage ?? "(no user message)"}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "1rem",
                          "font-family":
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          "font-size": "0.8rem",
                          "line-height": "1.55",
                          "max-height": "60vh",
                          "overflow-y": "auto",
                          color: "#d4d4d8",
                        }}
                      >
                        <For each={detail().turns}>
                          {(turn) => (
                            <div
                              style={{
                                "margin-bottom": "0.75rem",
                                "border-left": `2px solid ${roleColor(turn.role)}`,
                                "padding-left": "0.75rem",
                              }}
                            >
                              <div
                                style={{
                                  "font-size": "0.7rem",
                                  color: roleColor(turn.role),
                                  "text-transform": "uppercase",
                                  "letter-spacing": "0.06em",
                                }}
                              >
                                {turn.role}
                                {turn.toolName ? ` · ${turn.toolName}` : ""}
                                {" · seq "}
                                {turn.seq}
                              </div>
                              <div
                                style={{
                                  "white-space": "pre-wrap",
                                  "word-break": "break-word",
                                  "margin-top": "0.2rem",
                                }}
                              >
                                {turn.content}
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </>
                  )}
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
