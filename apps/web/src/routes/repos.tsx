import { Title } from "@solidjs/meta";
import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { trpc } from "../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  updated_at: string;
  pushed_at: string | null;
  owner: { login: string; avatar_url: string };
}

interface Branch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

interface Commit {
  sha: string;
  commit: { message: string; author: { name: string; date: string } | null };
  html_url: string;
  author: { login: string; avatar_url: string } | null;
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  user: { login: string; avatar_url: string };
  head: { ref: string };
  base: { ref: string };
}

interface Issue {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
  user: { login: string; avatar_url: string };
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  head_branch: string;
  head_sha: string;
}

type DetailTab = "commits" | "prs" | "issues" | "branches" | "ci";

// ── Language Colors ─────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f7df1e",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  "C++": "#f34b7d",
  C: "#555555",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00B4AB",
  PHP: "#4F5D95",
};

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ciColor(conclusion: string | null, status: string): string {
  if (status === "in_progress" || status === "queued") return "var(--color-warning)";
  if (conclusion === "success") return "var(--color-success)";
  if (conclusion === "failure") return "var(--color-danger)";
  if (conclusion === "cancelled") return "var(--color-text-muted)";
  return "var(--color-primary)";
}

function ciLabel(conclusion: string | null, status: string): string {
  if (status === "in_progress") return "Running";
  if (status === "queued") return "Queued";
  if (conclusion === "success") return "Passed";
  if (conclusion === "failure") return "Failed";
  if (conclusion === "cancelled") return "Cancelled";
  return status;
}

// ── Language Badge ──────────────────────────────────────────────────

function LanguageBadge(props: { language: string | null }): JSX.Element {
  return (
    <Show when={props.language}>
      {(lang) => (
        <span class="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          <span
            class="h-2.5 w-2.5 rounded-full"
            style={{ background: LANG_COLORS[lang()] ?? "var(--color-primary)" }}
          />
          {lang()}
        </span>
      )}
    </Show>
  );
}

// ── Visibility Badge ────────────────────────────────────────────────

function VisibilityBadge(props: { isPrivate: boolean }): JSX.Element {
  return (
    <span
      class="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
      style={{
        background: props.isPrivate ? "color-mix(in oklab, var(--color-warning) 8%, transparent)" : "color-mix(in oklab, var(--color-success) 8%, transparent)",
        color: props.isPrivate ? "var(--color-warning)" : "var(--color-success)",
      }}
    >
      {props.isPrivate ? "Private" : "Public"}
    </span>
  );
}

// ── Stat Pill ───────────────────────────────────────────────────────

function StatPill(props: { icon: string; value: number; label: string }): JSX.Element {
  return (
    <span class="inline-flex items-center gap-1 text-[11px]" title={props.label} style={{ color: "var(--color-text-secondary)" }}>
      <span class="text-[10px]">{props.icon}</span>
      {props.value.toLocaleString()}
    </span>
  );
}

// ── Repo Card ───────────────────────────────────────────────────────

function RepoCard(props: {
  repo: Repo;
  isSelected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="group flex w-full flex-col gap-2.5 rounded-2xl p-5 text-left transition-all duration-200"
      style={{
        background: props.isSelected ? "var(--color-bg-inset)" : "var(--color-bg-elevated)",
        border: props.isSelected ? "1px solid var(--color-primary-light)" : "1px solid var(--color-border)",
      }}
    >
      {/* Header row */}
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <img
            src={props.repo.owner.avatar_url}
            alt=""
            class="h-6 w-6 rounded-lg"
            loading="lazy"
          />
          <div class="flex min-w-0 flex-col">
            <div class="flex items-center gap-2">
              <span class="truncate text-sm font-semibold transition-colors" style={{ color: "var(--color-text)" }}>
                {props.repo.name}
              </span>
              <Show when={props.repo.fork}>
                <span class="text-[9px]" style={{ color: "var(--color-text-faint)" }}>fork</span>
              </Show>
              <Show when={props.repo.archived}>
                <span class="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}>archived</span>
              </Show>
            </div>
            <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>{props.repo.owner.login}</span>
          </div>
        </div>
        <VisibilityBadge isPrivate={props.repo.private} />
      </div>

      {/* Description */}
      <Show when={props.repo.description}>
        <p class="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{props.repo.description}</p>
      </Show>

      {/* Footer stats */}
      <div class="flex items-center gap-4">
        <LanguageBadge language={props.repo.language} />
        <StatPill icon="&#9733;" value={props.repo.stargazers_count} label="Stars" />
        <StatPill icon="&#9707;" value={props.repo.forks_count} label="Forks" />
        <StatPill icon="&#9679;" value={props.repo.open_issues_count} label="Open issues" />
        <span class="ml-auto text-[10px]" style={{ color: "var(--color-text-faint)" }}>
          {props.repo.pushed_at ? timeAgo(props.repo.pushed_at) : "never pushed"}
        </span>
      </div>
    </button>
  );
}

// ── Detail Tab Button ───────────────────────────────────────────────

function DetailTabButton(props: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-150"
      style={{
        background: props.isActive ? "var(--color-bg-subtle)" : "transparent",
        color: props.isActive ? "var(--color-text)" : "var(--color-text-secondary)",
      }}
    >
      {props.label}
      <Show when={props.count !== undefined}>
        <span class="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{
          background: props.isActive ? "var(--color-bg-inset)" : "var(--color-bg-muted)",
          color: props.isActive ? "var(--color-primary-light)" : "var(--color-text-faint)",
        }}>
          {props.count}
        </span>
      </Show>
    </button>
  );
}

// ── Commit Row ──────────────────────────────────────────────────────

function CommitRow(props: { commit: Commit }): JSX.Element {
  const message = (): string => {
    const full = props.commit.commit.message;
    const firstLine = full.split("\n")[0] ?? full;
    return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
  };

  return (
    <a
      href={props.commit.html_url}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
      style={{ border: "1px solid transparent" }}
    >
      <Show when={props.commit.author} fallback={
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px]" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}>?</div>
      }>
        {(author) => (
          <img src={author().avatar_url} alt="" class="h-7 w-7 shrink-0 rounded-lg" loading="lazy" />
        )}
      </Show>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="truncate text-xs font-medium" style={{ color: "var(--color-text)" }}>{message()}</span>
        <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
          {props.commit.author?.login ?? props.commit.commit.author?.name ?? "unknown"}
        </span>
      </div>
      <code class="shrink-0 rounded px-2 py-0.5 font-mono text-[10px]" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}>
        {props.commit.sha.slice(0, 7)}
      </code>
      <span class="shrink-0 text-[10px]" style={{ color: "var(--color-text-faint)" }}>
        {props.commit.commit.author?.date ? timeAgo(props.commit.commit.author.date) : ""}
      </span>
    </a>
  );
}

// ── PR Row ──────────────────────────────────────────────────────────

function PullRequestRow(props: { pr: PullRequest }): JSX.Element {
  const statusColor = (): string => {
    if (props.pr.merged_at) return "var(--color-primary)";
    if (props.pr.state === "open") return "var(--color-success)";
    return "var(--color-danger)";
  };
  const statusLabel = (): string => {
    if (props.pr.merged_at) return "Merged";
    if (props.pr.draft) return "Draft";
    return props.pr.state === "open" ? "Open" : "Closed";
  };

  return (
    <a
      href={props.pr.html_url}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
      style={{ border: "1px solid transparent" }}
    >
      <span
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
        style={{ background: `${statusColor()}20`, color: statusColor() }}
      >
        PR
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex items-center gap-2">
          <span class="truncate text-xs font-medium" style={{ color: "var(--color-text)" }}>{props.pr.title}</span>
          <span class="shrink-0 text-[10px]" style={{ color: "var(--color-text-faint)" }}>#{props.pr.number}</span>
        </div>
        <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
          {props.pr.head.ref} &rarr; {props.pr.base.ref} &middot; {props.pr.user.login}
        </span>
      </div>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
        style={{ background: `${statusColor()}15`, color: statusColor() }}
      >
        {statusLabel()}
      </span>
      <span class="shrink-0 text-[10px]" style={{ color: "var(--color-text-faint)" }}>{timeAgo(props.pr.updated_at)}</span>
    </a>
  );
}

// ── Issue Row ───────────────────────────────────────────────────────

function IssueRow(props: { issue: Issue }): JSX.Element {
  return (
    <a
      href={props.issue.html_url}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
      style={{ border: "1px solid transparent" }}
    >
      <span
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
        style={{
          background: props.issue.state === "open" ? "color-mix(in oklab, var(--color-success) 12%, transparent)" : "color-mix(in oklab, var(--color-text-muted) 12%, transparent)",
          color: props.issue.state === "open" ? "var(--color-success)" : "var(--color-text-muted)",
        }}
      >
        &#9679;
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-xs font-medium" style={{ color: "var(--color-text)" }}>{props.issue.title}</span>
          <span class="shrink-0 text-[10px]" style={{ color: "var(--color-text-faint)" }}>#{props.issue.number}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <For each={props.issue.labels.slice(0, 3)}>
            {(label) => (
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                style={{ background: `#${label.color}25`, color: `#${label.color}` }}
              >
                {label.name}
              </span>
            )}
          </For>
        </div>
      </div>
      <span class="shrink-0 text-[10px]" style={{ color: "var(--color-text-faint)" }}>{timeAgo(props.issue.updated_at)}</span>
    </a>
  );
}

// ── Branch Row ──────────────────────────────────────────────────────

function BranchRow(props: { branch: Branch; isDefault: boolean }): JSX.Element {
  return (
    <div class="flex items-center gap-3 rounded-xl px-4 py-3 transition-all" style={{ border: "1px solid transparent" }}>
      <span
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px]"
        style={{
          background: props.isDefault ? "color-mix(in oklab, var(--color-primary) 12%, transparent)" : "var(--color-bg-muted)",
          color: props.isDefault ? "var(--color-primary)" : "var(--color-text-secondary)",
        }}
      >
        &#9740;
      </span>
      <span class="flex-1 text-xs font-medium font-mono" style={{ color: "var(--color-text)" }}>{props.branch.name}</span>
      <Show when={props.isDefault}>
        <span class="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase" style={{ background: "color-mix(in oklab, var(--color-primary) 12%, transparent)", color: "var(--color-primary)" }}>default</span>
      </Show>
      <Show when={props.branch.protected}>
        <span class="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase" style={{ background: "var(--color-warning)", color: "var(--color-text)" }}>protected</span>
      </Show>
      <code class="rounded px-2 py-0.5 font-mono text-[10px]" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-faint)" }}>
        {props.branch.commit.sha.slice(0, 7)}
      </code>
    </div>
  );
}

// ── CI Row ───────────────────────────────────────────────────────────

function CIRunRow(props: { run: WorkflowRun }): JSX.Element {
  const color = (): string => ciColor(props.run.conclusion, props.run.status);

  return (
    <a
      href={props.run.html_url}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
      style={{ border: "1px solid transparent" }}
    >
      <span
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
        style={{ background: `${color()}20`, color: color() }}
      >
        CI
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="truncate text-xs font-medium" style={{ color: "var(--color-text)" }}>{props.run.name}</span>
        <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
          {props.run.head_branch} &middot; {props.run.head_sha.slice(0, 7)}
        </span>
      </div>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
        style={{ background: `${color()}15`, color: color() }}
      >
        {ciLabel(props.run.conclusion, props.run.status)}
      </span>
      <span class="shrink-0 text-[10px]" style={{ color: "var(--color-text-faint)" }}>{timeAgo(props.run.created_at)}</span>
    </a>
  );
}

// ── Empty State ─────────────────────────────────────────────────────

function EmptyState(props: { icon: string; title: string; subtitle: string }): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-3 py-16 text-center">
      <span class="text-3xl opacity-20">{props.icon}</span>
      <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>{props.title}</span>
      <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>{props.subtitle}</span>
    </div>
  );
}

// ── Main Repos Page ─────────────────────────────────────────────────

export default function ReposPage(): JSX.Element {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [hasToken, setHasToken] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [search, setSearch] = createSignal("");
  const [selectedRepo, setSelectedRepo] = createSignal<Repo | null>(null);
  const [activeTab, setActiveTab] = createSignal<DetailTab>("commits");

  // Detail data
  const [commits, setCommits] = createSignal<Commit[]>([]);
  const [prs, setPrs] = createSignal<PullRequest[]>([]);
  const [issues, setIssues] = createSignal<Issue[]>([]);
  const [branches, setBranches] = createSignal<Branch[]>([]);
  const [ciRuns, setCiRuns] = createSignal<WorkflowRun[]>([]);
  const [detailLoading, setDetailLoading] = createSignal(false);

  const filteredRepos = createMemo(() => {
    const q = search().toLowerCase();
    if (!q) return repos();
    return repos().filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.full_name.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false) ||
        (r.language?.toLowerCase().includes(q) ?? false),
    );
  });

  const repoStats = createMemo(() => {
    const all = repos();
    return {
      total: all.length,
      private: all.filter((r) => r.private).length,
      public: all.filter((r) => !r.private).length,
      stars: all.reduce((acc, r) => acc + r.stargazers_count, 0),
      languages: [...new Set(all.map((r) => r.language).filter(Boolean))].length,
    };
  });

  // Load repos on mount
  onMount(async () => {
    try {
      const status = await trpc.repos.status.query();
      setHasToken(status.configured);
      if (!status.configured) {
        setLoading(false);
        return;
      }
      const data = await trpc.repos.list.query({ per_page: 100 });
      setRepos(data as Repo[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  });

  const loadRepoDetail = async (repo: Repo): Promise<void> => {
    setSelectedRepo(repo);
    setDetailLoading(true);
    setActiveTab("commits");
    const owner = repo.owner.login;
    const name = repo.name;

    try {
      const [c, p, i, b, w] = await Promise.all([
        trpc.repos.commits.query({ owner, repo: name, per_page: 20 }),
        trpc.repos.pullRequests.query({ owner, repo: name, state: "all", per_page: 20 }),
        trpc.repos.issues.query({ owner, repo: name, state: "open", per_page: 20 }),
        trpc.repos.branches.query({ owner, repo: name, per_page: 30 }),
        trpc.repos.workflowRuns.query({ owner, repo: name, per_page: 10 }).catch(() => []),
      ]);
      setCommits(c as Commit[]);
      setPrs(p as PullRequest[]);
      setIssues(i as Issue[]);
      setBranches(b as Branch[]);
      setCiRuns(w as WorkflowRun[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repo details");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div class="flex h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Repositories - Crontech</Title>

      {/* ── Left Panel: Repo List ──────────────────────────────── */}
      <div
        class="flex w-96 shrink-0 flex-col"
        style={{ background: "var(--color-bg-elevated)", "border-right": "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div class="px-5 py-4" style={{ "border-bottom": "1px solid var(--color-border)" }}>
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "var(--color-bg-subtle)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </div>
            <div>
              <h1 class="text-base font-bold" style={{ color: "var(--color-text)" }}>Repositories</h1>
              <p class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
                {repoStats().total} repos &middot; {repoStats().stars} stars
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--color-border)" }}>
          <div class="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search repos..."
              class="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--color-text)" }}
            />
            <Show when={search()}>
              <button type="button" onClick={() => setSearch("")} style={{ color: "var(--color-text-faint)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </Show>
          </div>
        </div>

        {/* Stats Bar */}
        <Show when={repos().length > 0}>
          <div class="flex items-center gap-3 px-5 py-2.5" style={{ "border-bottom": "1px solid var(--color-border)" }}>
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }}>{repoStats().public} public</span>
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }}>{repoStats().private} private</span>
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }}>{repoStats().languages} languages</span>
          </div>
        </Show>

        {/* Repo List */}
        <div class="flex-1 overflow-y-auto px-3 py-3">
          <Show when={!loading()} fallback={
            <div class="flex flex-col items-center gap-3 py-16">
              <div class="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--color-border)", "border-top-color": "var(--color-primary)" }} />
              <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>Loading repositories...</span>
            </div>
          }>
            <Show when={hasToken()} fallback={
              <EmptyState
                icon="&#128273;"
                title="No GitHub token configured"
                subtitle="Go to Settings > AI Providers to add your GitHub PAT"
              />
            }>
              <Show when={!error()} fallback={
                <div class="rounded-xl p-4" style={{ border: "1px solid var(--color-danger)", background: "var(--color-bg-elevated)" }}>
                  <span class="text-xs" style={{ color: "var(--color-danger)" }}>{error()}</span>
                </div>
              }>
                <Show when={filteredRepos().length > 0} fallback={
                  <EmptyState icon="&#128269;" title="No repos found" subtitle={search() ? "Try a different search" : "No repositories available"} />
                }>
                  <div class="flex flex-col gap-2">
                    <For each={filteredRepos()}>
                      {(repo) => (
                        <RepoCard
                          repo={repo}
                          isSelected={selectedRepo()?.id === repo.id}
                          onClick={() => void loadRepoDetail(repo)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>
          </Show>
        </div>
      </div>

      {/* ── Right Panel: Repo Detail ──────────────────────────── */}
      <div class="flex flex-1 flex-col overflow-hidden">
        <Show when={selectedRepo()} fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-4">
            <div
              class="flex h-24 w-24 items-center justify-center rounded-3xl"
              style={{ background: "var(--color-bg-subtle)" }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </div>
            <h2 class="text-xl font-bold" style={{ color: "var(--color-text)" }}>Select a Repository</h2>
            <p class="max-w-sm text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Choose a repo from the list to view commits, pull requests, issues, branches, and CI status.
            </p>
          </div>
        }>
          {(repo) => (
            <>
              {/* Repo Header */}
              <div class="px-6 py-4" style={{ "border-bottom": "1px solid var(--color-border)", background: "var(--color-bg-elevated)" }}>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <img src={repo().owner.avatar_url} alt="" class="h-8 w-8 rounded-xl" />
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-base font-bold" style={{ color: "var(--color-text)" }}>{repo().name}</span>
                        <VisibilityBadge isPrivate={repo().private} />
                      </div>
                      <span class="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{repo().full_name}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <LanguageBadge language={repo().language} />
                    <div class="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      <StatPill icon="&#9733;" value={repo().stargazers_count} label="Stars" />
                      <StatPill icon="&#9707;" value={repo().forks_count} label="Forks" />
                    </div>
                    <a
                      href={repo().html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all"
                      style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                    >
                      Open on GitHub &rarr;
                    </a>
                  </div>
                </div>
                <Show when={repo().description}>
                  <p class="mt-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>{repo().description}</p>
                </Show>
              </div>

              {/* Detail Tabs */}
              <div class="flex items-center gap-1 px-6 py-2" style={{ "border-bottom": "1px solid var(--color-border)", background: "var(--color-bg-elevated)" }}>
                <DetailTabButton label="Commits" count={commits().length} isActive={activeTab() === "commits"} onClick={() => setActiveTab("commits")} />
                <DetailTabButton label="Pull Requests" count={prs().length} isActive={activeTab() === "prs"} onClick={() => setActiveTab("prs")} />
                <DetailTabButton label="Issues" count={issues().length} isActive={activeTab() === "issues"} onClick={() => setActiveTab("issues")} />
                <DetailTabButton label="Branches" count={branches().length} isActive={activeTab() === "branches"} onClick={() => setActiveTab("branches")} />
                <DetailTabButton label="CI/CD" count={ciRuns().length} isActive={activeTab() === "ci"} onClick={() => setActiveTab("ci")} />
              </div>

              {/* Detail Content */}
              <div class="flex-1 overflow-y-auto px-6 py-4">
                <Show when={!detailLoading()} fallback={
                  <div class="flex flex-col items-center gap-3 py-16">
                    <div class="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--color-border)", "border-top-color": "var(--color-primary)" }} />
                    <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>Loading...</span>
                  </div>
                }>
                  {/* Commits Tab */}
                  <Show when={activeTab() === "commits"}>
                    <Show when={commits().length > 0} fallback={
                      <EmptyState icon="&#128221;" title="No commits" subtitle="This repository has no commits yet" />
                    }>
                      <div class="flex flex-col">
                        <For each={commits()}>
                          {(commit) => <CommitRow commit={commit} />}
                        </For>
                      </div>
                    </Show>
                  </Show>

                  {/* PRs Tab */}
                  <Show when={activeTab() === "prs"}>
                    <Show when={prs().length > 0} fallback={
                      <EmptyState icon="&#128257;" title="No pull requests" subtitle="No pull requests found" />
                    }>
                      <div class="flex flex-col">
                        <For each={prs()}>
                          {(pr) => <PullRequestRow pr={pr} />}
                        </For>
                      </div>
                    </Show>
                  </Show>

                  {/* Issues Tab */}
                  <Show when={activeTab() === "issues"}>
                    <Show when={issues().length > 0} fallback={
                      <EmptyState icon="&#9679;" title="No open issues" subtitle="All clear — no open issues" />
                    }>
                      <div class="flex flex-col">
                        <For each={issues()}>
                          {(issue) => <IssueRow issue={issue} />}
                        </For>
                      </div>
                    </Show>
                  </Show>

                  {/* Branches Tab */}
                  <Show when={activeTab() === "branches"}>
                    <Show when={branches().length > 0} fallback={
                      <EmptyState icon="&#9740;" title="No branches" subtitle="This repository has no branches" />
                    }>
                      <div class="flex flex-col">
                        <For each={branches()}>
                          {(branch) => (
                            <BranchRow
                              branch={branch}
                              isDefault={branch.name === repo().default_branch}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>

                  {/* CI Tab */}
                  <Show when={activeTab() === "ci"}>
                    <Show when={ciRuns().length > 0} fallback={
                      <EmptyState icon="&#9889;" title="No CI runs" subtitle="No workflow runs found for this repository" />
                    }>
                      <div class="flex flex-col">
                        <For each={ciRuns()}>
                          {(run) => <CIRunRow run={run} />}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </Show>
              </div>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
