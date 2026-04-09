import { Title } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";

// ── Mock Data ────────────────────────────────────────────────────────

const TABLES = [
  { name: "users", rows: 12847, size: "48.2 MB", icon: "&#128101;" },
  { name: "projects", rows: 3291, size: "124.8 MB", icon: "&#128193;" },
  { name: "deployments", rows: 28430, size: "89.3 MB", icon: "&#128640;" },
  { name: "ai_sessions", rows: 94021, size: "312.6 MB", icon: "&#129302;" },
  { name: "templates", rows: 856, size: "15.4 MB", icon: "&#128196;" },
  { name: "api_keys", rows: 4283, size: "2.1 MB", icon: "&#128273;" },
  { name: "audit_logs", rows: 1482003, size: "2.4 GB", icon: "&#128203;" },
  { name: "embeddings", rows: 523847, size: "8.7 GB", icon: "&#129520;" },
];

const MOCK_QUERY_RESULT = {
  columns: ["id", "email", "display_name", "plan", "created_at", "last_login"],
  rows: [
    ["usr_01", "elena@acme.dev", "Elena Vasquez", "enterprise", "2025-11-03", "2026-04-08"],
    ["usr_02", "marcus@streamline.io", "Marcus Chen", "pro", "2025-12-14", "2026-04-07"],
    ["usr_03", "sarah.kim@buildfast.co", "Sarah Kim", "pro", "2026-01-08", "2026-04-08"],
    ["usr_04", "raj@devstack.com", "Raj Patel", "free", "2026-02-19", "2026-04-05"],
    ["usr_05", "anya.novak@cloudship.dev", "Anya Novak", "enterprise", "2026-01-22", "2026-04-08"],
  ],
};

const SCHEMA_COLUMNS = [
  { name: "id", type: "TEXT", nullable: false, primary: true },
  { name: "email", type: "TEXT", nullable: false, primary: false },
  { name: "display_name", type: "TEXT", nullable: true, primary: false },
  { name: "plan", type: "TEXT", nullable: false, primary: false },
  { name: "password_hash", type: "TEXT", nullable: true, primary: false },
  { name: "role", type: "TEXT", nullable: false, primary: false },
  { name: "created_at", type: "TIMESTAMP", nullable: false, primary: false },
  { name: "updated_at", type: "TIMESTAMP", nullable: false, primary: false },
  { name: "last_login", type: "TIMESTAMP", nullable: true, primary: false },
];

const SAMPLE_QUERIES = [
  "SELECT * FROM users WHERE plan = 'enterprise' ORDER BY created_at DESC LIMIT 10;",
  "SELECT COUNT(*) as total, plan FROM users GROUP BY plan;",
  "SELECT d.id, p.name, d.status, d.created_at FROM deployments d JOIN projects p ON d.project_id = p.id ORDER BY d.created_at DESC LIMIT 20;",
  "SELECT model, AVG(tokens_used) as avg_tokens, COUNT(*) as sessions FROM ai_sessions GROUP BY model ORDER BY sessions DESC;",
];

// ── Database Explorer Page ───────────────────────────────────────────

export default function DatabasePage(): JSX.Element {
  const [selectedTable, setSelectedTable] = createSignal("users");
  const [query, setQuery] = createSignal("SELECT * FROM users ORDER BY created_at DESC LIMIT 10;");
  const [showResults, setShowResults] = createSignal(true);
  const [showSchema, setShowSchema] = createSignal(false);
  const [isRunning, setIsRunning] = createSignal(false);
  const [executionTime, setExecutionTime] = createSignal("12ms");
  const [rowsAffected, setRowsAffected] = createSignal(5);

  const handleRunQuery = (): void => {
    setIsRunning(true);
    setShowResults(false);
    setTimeout(() => {
      setIsRunning(false);
      setShowResults(true);
      setExecutionTime(`${Math.floor(Math.random() * 30 + 5)}ms`);
      setRowsAffected(MOCK_QUERY_RESULT.rows.length);
    }, 400);
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleRunQuery();
    }
  };

  return (
    <div class="flex h-screen bg-[#060606]">
      <Title>Database Explorer - Crontech</Title>

      {/* Sidebar - Table List */}
      <div
        class="flex w-64 shrink-0 flex-col border-r border-white/[0.06]"
        style={{ background: "linear-gradient(180deg, rgba(12,12,12,1) 0%, rgba(8,8,8,1) 100%)" }}
      >
        {/* Sidebar Header */}
        <div class="border-b border-white/[0.06] px-4 py-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "linear-gradient(135deg, #10b98130, #10b98160)" }}>
              <span class="text-sm" style={{ color: "#10b981" }}>&#128450;</span>
            </div>
            <div>
              <h2 class="text-sm font-semibold text-white">Database Explorer</h2>
              <p class="text-[10px] text-gray-600">Turso Edge SQLite</p>
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div class="border-b border-white/[0.06] px-4 py-3">
          <div class="flex items-center gap-2">
            <div class="h-2 w-2 rounded-full bg-emerald-400" style={{ "box-shadow": "0 0 6px #10b98180" }} />
            <span class="text-[11px] font-medium text-emerald-400">Connected</span>
            <span class="ml-auto text-[10px] text-gray-600">us-east-1</span>
          </div>
        </div>

        {/* Tables Section */}
        <div class="px-3 pt-3 pb-2">
          <span class="px-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Tables</span>
        </div>
        <div class="flex-1 overflow-y-auto px-2">
          <For each={TABLES}>
            {(table) => (
              <button
                type="button"
                onClick={() => {
                  setSelectedTable(table.name);
                  setQuery(`SELECT * FROM ${table.name} ORDER BY created_at DESC LIMIT 10;`);
                }}
                class={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                  selectedTable() === table.name
                    ? "border border-white/[0.08] bg-white/[0.06] text-white"
                    : "border border-transparent text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
                }`}
              >
                <span class="text-sm" innerHTML={table.icon} />
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="text-xs font-medium">{table.name}</span>
                  <span class="text-[10px] text-gray-600">{table.rows.toLocaleString()} rows</span>
                </div>
                <span class="text-[10px] text-gray-700">{table.size}</span>
              </button>
            )}
          </For>
        </div>

        {/* Sidebar Footer */}
        <div class="border-t border-white/[0.06] px-4 py-3">
          <div class="flex items-center justify-between text-[10px] text-gray-600">
            <span>{TABLES.length} tables</span>
            <span>11.7 GB total</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div class="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div class="flex items-center justify-between border-b border-white/[0.06] bg-[#0a0a0a] px-5 py-3">
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRunQuery}
              disabled={isRunning()}
              class="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:shadow-emerald-500/40 hover:brightness-110 disabled:opacity-50"
            >
              <Show when={!isRunning()} fallback={<span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}>
                <span>&#9654;</span>
              </Show>
              Run Query
            </button>
            <span class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[10px] font-mono text-gray-500">
              {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter
            </span>
          </div>
          <div class="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowSchema(!showSchema())}
              class={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                showSchema()
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                  : "border-white/[0.06] bg-white/[0.03] text-gray-400 hover:text-white"
              }`}
            >
              Schema
            </button>
            <Show when={showResults()}>
              <div class="flex items-center gap-3 text-[11px]">
                <span class="text-gray-500">{rowsAffected()} rows</span>
                <span class="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">{executionTime()}</span>
              </div>
            </Show>
          </div>
        </div>

        {/* Query Editor + Schema Panel */}
        <div class="flex flex-1 overflow-hidden">
          <div class={`flex flex-1 flex-col overflow-hidden ${showSchema() ? "" : ""}`}>
            {/* Query Editor */}
            <div class="border-b border-white/[0.06] bg-[#0c0c0c]">
              <div class="flex items-center justify-between border-b border-white/[0.04] px-4 py-2">
                <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Query Editor</span>
                <div class="flex items-center gap-2">
                  {/* Quick Query Buttons */}
                  <For each={SAMPLE_QUERIES.slice(0, 3)}>
                    {(sq, i) => (
                      <button
                        type="button"
                        onClick={() => setQuery(sq)}
                        class="rounded border border-white/[0.04] bg-white/[0.02] px-2 py-0.5 text-[10px] text-gray-600 transition-all hover:border-white/[0.1] hover:text-gray-400"
                      >
                        Query {i() + 1}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <textarea
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                spellcheck={false}
                class="w-full resize-none bg-transparent px-5 py-4 font-mono text-sm text-gray-200 outline-none placeholder-gray-700"
                style={{ "min-height": "140px", "line-height": "1.7" }}
                placeholder="Write your SQL query here..."
              />
            </div>

            {/* Results Table */}
            <div class="flex-1 overflow-auto bg-[#080808]">
              <Show
                when={showResults()}
                fallback={
                  <div class="flex h-full flex-col items-center justify-center gap-3">
                    <Show
                      when={!isRunning()}
                      fallback={
                        <div class="flex flex-col items-center gap-3">
                          <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
                          <span class="text-xs text-gray-500">Executing query...</span>
                        </div>
                      }
                    >
                      <span class="text-3xl text-gray-800">&#128450;</span>
                      <span class="text-sm text-gray-600">Run a query to see results</span>
                    </Show>
                  </div>
                }
              >
                <div class="min-w-full">
                  {/* Table Header */}
                  <div class="sticky top-0 z-10 flex border-b border-white/[0.08] bg-[#0a0a0a]">
                    <div class="w-12 shrink-0 border-r border-white/[0.04] px-3 py-2.5 text-[10px] font-semibold text-gray-600">#</div>
                    <For each={MOCK_QUERY_RESULT.columns}>
                      {(col) => (
                        <div class="min-w-[140px] flex-1 border-r border-white/[0.04] px-4 py-2.5">
                          <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{col}</span>
                        </div>
                      )}
                    </For>
                  </div>
                  {/* Table Body */}
                  <For each={MOCK_QUERY_RESULT.rows}>
                    {(row, rowIdx) => (
                      <div class="flex border-b border-white/[0.03] transition-colors duration-100 hover:bg-white/[0.02]">
                        <div class="w-12 shrink-0 border-r border-white/[0.04] px-3 py-2.5 text-[11px] font-mono text-gray-700">{rowIdx() + 1}</div>
                        <For each={row}>
                          {(cell) => (
                            <div class="min-w-[140px] flex-1 border-r border-white/[0.04] px-4 py-2.5">
                              <span class="font-mono text-xs text-gray-300">{cell}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>

          {/* Schema Panel */}
          <Show when={showSchema()}>
            <div class="w-72 shrink-0 overflow-y-auto border-l border-white/[0.06] bg-[#0a0a0a]">
              <div class="border-b border-white/[0.06] px-4 py-3">
                <h3 class="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Schema: {selectedTable()}
                </h3>
              </div>
              <div class="p-3">
                <For each={SCHEMA_COLUMNS}>
                  {(col) => (
                    <div class="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
                      <div class="flex items-center gap-2 flex-1 min-w-0">
                        <Show when={col.primary}>
                          <span class="text-[10px] text-amber-500" title="Primary Key">&#128273;</span>
                        </Show>
                        <span class="text-xs font-medium text-gray-300 truncate">{col.name}</span>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span class="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-gray-500">{col.type}</span>
                        <Show when={!col.nullable}>
                          <span class="text-[9px] text-orange-500/70" title="NOT NULL">NN</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>

                {/* Indexes Section */}
                <div class="mt-4 border-t border-white/[0.04] pt-3">
                  <span class="px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Indexes</span>
                  <div class="mt-2 flex flex-col gap-1">
                    <div class="flex items-center gap-2 rounded-lg px-3 py-2">
                      <span class="text-[10px] text-blue-400">&#9679;</span>
                      <span class="text-[11px] text-gray-400">idx_users_email</span>
                      <span class="ml-auto rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-400">UNIQUE</span>
                    </div>
                    <div class="flex items-center gap-2 rounded-lg px-3 py-2">
                      <span class="text-[10px] text-emerald-400">&#9679;</span>
                      <span class="text-[11px] text-gray-400">idx_users_plan</span>
                      <span class="ml-auto rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400">BTREE</span>
                    </div>
                    <div class="flex items-center gap-2 rounded-lg px-3 py-2">
                      <span class="text-[10px] text-violet-400">&#9679;</span>
                      <span class="text-[11px] text-gray-400">idx_users_created</span>
                      <span class="ml-auto rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-400">BTREE</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
