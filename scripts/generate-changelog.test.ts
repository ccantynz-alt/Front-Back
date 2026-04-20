// ── generate-changelog tests ──────────────────────────────────────
// Mocks the Claude client. Never hits the network. Never touches the
// real filesystem (every call to `runGeneration` receives its inputs
// directly).

import { describe, expect, test } from "bun:test";
import {
  ChangelogSectionsSchema,
  buildDefaultClaudeClient,
  buildDevNotesPrompt,
  buildSocialPrompt,
  buildUserNotesPrompt,
  findLatestBoundary,
  generateSections,
  parseArgs,
  parseGitLog,
  prependEntry,
  renderMarkdownEntry,
  resolveFromRevision,
  runGeneration,
  seedChangelog,
  type ChangelogPayload,
  type ClaudeClient,
  type CommitRecord,
} from "./generate-changelog";

// ── Fixtures ──────────────────────────────────────────────────────

const SAMPLE_COMMITS: ReadonlyArray<CommitRecord> = [
  {
    sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    shortSha: "aaaaaaa",
    subject: "feat(web): add WebGPU canvas to dashboard",
    author: "Craig",
    date: "2026-04-19T08:00:00.000Z",
  },
  {
    sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    shortSha: "bbbbbbb",
    subject: "fix(auth): tighten passkey origin check",
    author: "Craig",
    date: "2026-04-19T09:00:00.000Z",
  },
  {
    sha: "ccccccccccccccccccccccccccccccccccccccccc",
    shortSha: "ccccccc",
    subject: "perf(api): cache tRPC procedure results at the edge",
    author: "Craig",
    date: "2026-04-19T10:00:00.000Z",
  },
];

function makeMockClient(responses: ReadonlyArray<string>): {
  client: ClaudeClient;
  prompts: string[];
} {
  const prompts: string[] = [];
  let i = 0;
  const client: ClaudeClient = {
    complete: async (prompt: string) => {
      prompts.push(prompt);
      const reply = responses[i] ?? "stubbed reply";
      i += 1;
      return reply;
    },
  };
  return { client, prompts };
}

// ── parseArgs ─────────────────────────────────────────────────────

describe("parseArgs", () => {
  test("defaults to no --from and dryRun=false", () => {
    expect(parseArgs([])).toEqual({ from: undefined, dryRun: false });
  });

  test("parses --dry-run", () => {
    expect(parseArgs(["--dry-run"])).toEqual({ from: undefined, dryRun: true });
  });

  test("parses --from=<date>", () => {
    expect(parseArgs(["--from=2026-04-01"])).toEqual({
      from: "2026-04-01",
      dryRun: false,
    });
  });

  test("parses --from=<sha> and --dry-run together", () => {
    expect(parseArgs(["--from=abc1234", "--dry-run"])).toEqual({
      from: "abc1234",
      dryRun: true,
    });
  });

  test("ignores empty --from value", () => {
    expect(parseArgs(["--from="]).from).toBeUndefined();
  });
});

// ── findLatestBoundary ────────────────────────────────────────────

describe("findLatestBoundary", () => {
  test("returns null when no marker present", () => {
    expect(findLatestBoundary("# nothing here")).toBeNull();
  });

  test("returns the only marker", () => {
    const text = "header\n<!-- changelog-boundary:2026-01-15 -->\nfooter";
    expect(findLatestBoundary(text)).toBe("2026-01-15");
  });

  test("returns the most recent of multiple markers", () => {
    const text = [
      "<!-- changelog-boundary:2026-04-19 -->",
      "<!-- changelog-boundary:2026-01-15 -->",
      "<!-- changelog-boundary:2026-03-01 -->",
    ].join("\n");
    expect(findLatestBoundary(text)).toBe("2026-04-19");
  });

  test("tolerates extra whitespace inside marker", () => {
    expect(findLatestBoundary("<!--  changelog-boundary:2026-04-19  -->")).toBe(
      "2026-04-19",
    );
  });
});

// ── seedChangelog ─────────────────────────────────────────────────

describe("seedChangelog", () => {
  test("includes a boundary marker for today and explanation", () => {
    const text = seedChangelog("2026-04-19");
    expect(text).toContain("<!-- changelog-boundary:2026-04-19 -->");
    expect(text).toContain("Crontech Changelog");
    expect(text).toContain("User notes");
    expect(text).toContain("Dev notes");
    expect(text).toContain("Social snippet");
  });
});

// ── resolveFromRevision ───────────────────────────────────────────

describe("resolveFromRevision", () => {
  test("returns root when neither arg nor boundary present", () => {
    expect(resolveFromRevision(undefined, null)).toEqual({ kind: "root", value: "" });
  });

  test("treats boundary as a since date", () => {
    expect(resolveFromRevision(undefined, "2026-04-01")).toEqual({
      kind: "since",
      value: "2026-04-01",
    });
  });

  test("recognises a sha", () => {
    expect(resolveFromRevision("abcdef1", null)).toEqual({
      kind: "sha",
      value: "abcdef1",
    });
  });

  test("CLI date arg overrides boundary", () => {
    expect(resolveFromRevision("2026-03-01", "2026-01-01")).toEqual({
      kind: "since",
      value: "2026-03-01",
    });
  });
});

// ── parseGitLog ───────────────────────────────────────────────────

describe("parseGitLog", () => {
  test("parses two unit-separated commit records", () => {
    const raw = [
      "abcdef0123456789abcdef0123456789abcdef01\x1fabcdef0\x1fCraig\x1f2026-04-19T08:00:00Z\x1ffeat: thing\x1e",
      "1234567890abcdef1234567890abcdef12345678\x1f1234567\x1fCraig\x1f2026-04-19T09:00:00Z\x1ffix: another\x1e",
    ].join("");
    const records = parseGitLog(raw);
    expect(records).toHaveLength(2);
    expect(records[0]?.subject).toBe("feat: thing");
    expect(records[1]?.shortSha).toBe("1234567");
  });

  test("returns empty array for empty input", () => {
    expect(parseGitLog("")).toEqual([]);
  });

  test("skips malformed records", () => {
    expect(parseGitLog("not\x1fenough\x1ffields\x1e")).toEqual([]);
  });
});

// ── Prompts ───────────────────────────────────────────────────────

describe("prompts", () => {
  test("user-notes prompt mentions polite tone and excludes refactors", () => {
    const p = buildUserNotesPrompt(SAMPLE_COMMITS, "2026-04-01");
    expect(p).toContain("Polite tone");
    expect(p).toContain("No competitor names");
    expect(p).toContain("Omit internal refactors");
    expect(p).toContain("3 commits from Crontech since 2026-04-01");
    expect(p).toContain("aaaaaaa feat(web): add WebGPU canvas to dashboard");
  });

  test("dev-notes prompt asks for breaking changes and migrations", () => {
    const p = buildDevNotesPrompt(SAMPLE_COMMITS, "2026-04-01");
    expect(p).toContain("breaking changes");
    expect(p).toContain("migration steps");
    expect(p).toContain("Plain engineering English");
  });

  test("social prompt enforces 280-char tweet rule", () => {
    const p = buildSocialPrompt(SAMPLE_COMMITS, "2026-04-01");
    expect(p).toContain("under 280 characters");
    expect(p).toContain("No marketing buzzwords");
  });
});

// ── ChangelogSectionsSchema ───────────────────────────────────────

describe("ChangelogSectionsSchema", () => {
  test("accepts well-formed sections", () => {
    const ok = ChangelogSectionsSchema.parse({
      userNotes: "- You can now publish from the dashboard.",
      devNotes: "Added /publish endpoint, updated tRPC router.",
      social: "Crontech ships dashboard publishing today.",
    });
    expect(ok.social.length).toBeLessThanOrEqual(280);
  });

  test("rejects social snippets longer than 280 chars", () => {
    const tooLong = "x".repeat(281);
    expect(() =>
      ChangelogSectionsSchema.parse({
        userNotes: "- ok ok ok ok ok ok ok ok ok ok",
        devNotes: "engineering notes here engineering notes here",
        social: tooLong,
      }),
    ).toThrow();
  });

  test("rejects empty user notes", () => {
    expect(() =>
      ChangelogSectionsSchema.parse({
        userNotes: "tiny",
        devNotes: "engineering notes here engineering notes here",
        social: "Crontech ships today.",
      }),
    ).toThrow();
  });
});

// ── generateSections (mocked Claude) ──────────────────────────────

describe("generateSections", () => {
  test("calls Claude three times in user/dev/social order and validates", async () => {
    const userOut = "- You can now use WebGPU canvases on every dashboard.";
    const devOut = "feat(web): wires WebGPU canvas component into the dashboard route.";
    const socialOut = "Crontech dashboards now render with WebGPU. Faster, smoother, free.";
    const { client, prompts } = makeMockClient([userOut, devOut, socialOut]);

    const sections = await generateSections(client, SAMPLE_COMMITS, "2026-04-01");

    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toContain("Polite tone");
    expect(prompts[1]).toContain("Plain engineering English");
    expect(prompts[2]).toContain("under 280 characters");
    expect(sections.userNotes).toBe(userOut);
    expect(sections.devNotes).toBe(devOut);
    expect(sections.social).toBe(socialOut);
  });

  test("rejects an over-length social reply", async () => {
    const { client } = makeMockClient([
      "- a real bullet of release notes here",
      "engineering notes engineering notes",
      "z".repeat(400),
    ]);
    await expect(
      generateSections(client, SAMPLE_COMMITS, "2026-04-01"),
    ).rejects.toThrow();
  });
});

// ── renderMarkdownEntry / prependEntry ────────────────────────────

describe("rendering", () => {
  const payload: ChangelogPayload = {
    date: "2026-04-19",
    fromBoundary: "2026-04-12",
    toSha: "abcdef0123456789",
    commitCount: 3,
    commits: SAMPLE_COMMITS,
    sections: {
      userNotes: "- You can now publish dashboards.",
      devNotes: "Added /publish endpoint.",
      social: "Crontech ships dashboard publishing.",
    },
  };

  test("renderMarkdownEntry includes headings and a fresh boundary", () => {
    const md = renderMarkdownEntry(payload);
    expect(md).toContain("## 2026-04-19");
    expect(md).toContain("### User notes");
    expect(md).toContain("### Dev notes");
    expect(md).toContain("### Social snippet");
    expect(md).toContain("<!-- changelog-boundary:2026-04-19 -->");
    expect(md).toContain("3 commits since 2026-04-12");
  });

  test("prependEntry inserts above the latest existing boundary", () => {
    const existing = [
      "# Crontech Changelog",
      "",
      "header text",
      "",
      "<!-- changelog-boundary:2026-04-12 -->",
      "",
    ].join("\n");
    const entry = renderMarkdownEntry(payload);
    const next = prependEntry(existing, entry);
    const idxNew = next.indexOf("<!-- changelog-boundary:2026-04-19 -->");
    const idxOld = next.indexOf("<!-- changelog-boundary:2026-04-12 -->");
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxOld).toBeGreaterThan(idxNew);
  });

  test("prependEntry appends when no boundary exists yet", () => {
    const entry = renderMarkdownEntry(payload);
    const next = prependEntry("# Empty changelog", entry);
    expect(next).toContain("# Empty changelog");
    expect(next).toContain("## 2026-04-19");
  });
});

// ── runGeneration ─────────────────────────────────────────────────

describe("runGeneration", () => {
  test("dry-run mode skips Claude and lists commits", async () => {
    const { client, prompts } = makeMockClient(["never", "called", "here"]);
    const result = await runGeneration({
      args: { from: undefined, dryRun: true },
      today: "2026-04-19",
      client,
      commits: SAMPLE_COMMITS,
      headSha: "deadbeef0000000",
      existingChangelog: seedChangelog("2026-04-12"),
    });
    expect(result.mode).toBe("dry-run");
    expect(prompts).toHaveLength(0);
    expect(result.markdown).toBeNull();
    expect(result.nextChangelog).toBeNull();
    const joined = result.logLines.join("\n");
    expect(joined).toContain("Found 3 commit(s)");
    expect(joined).toContain("Dry-run");
    expect(joined).toContain("aaaaaaa feat(web)");
  });

  test("no-key mode (client === null) behaves like dry-run", async () => {
    const result = await runGeneration({
      args: { from: undefined, dryRun: false },
      today: "2026-04-19",
      client: null,
      commits: SAMPLE_COMMITS,
      headSha: "deadbeef0000000",
      existingChangelog: null,
    });
    expect(result.mode).toBe("no-key");
    expect(result.markdown).toBeNull();
    expect(result.logLines.join("\n")).toContain("ANTHROPIC_API_KEY not set");
  });

  test("no commits → does nothing, doesn't call Claude", async () => {
    const { client, prompts } = makeMockClient(["x", "y", "z"]);
    const result = await runGeneration({
      args: { from: undefined, dryRun: false },
      today: "2026-04-19",
      client,
      commits: [],
      headSha: "deadbeef",
      existingChangelog: seedChangelog("2026-04-12"),
    });
    expect(result.mode).toBe("dry-run");
    expect(prompts).toHaveLength(0);
    expect(result.logLines.join("\n")).toContain("Nothing to do");
  });

  test("happy path writes a payload, markdown, and updated changelog", async () => {
    const { client, prompts } = makeMockClient([
      "- You can publish dashboards directly from the editor.\n- Passkey sign-in is now stricter about origin mismatches.",
      "feat(web): WebGPU canvas wired into dashboard.\nfix(auth): origin check on passkey login.\nperf(api): edge-cached tRPC results.",
      "Crontech ships dashboard publishing, stricter passkeys, and edge-cached tRPC.",
    ]);
    const result = await runGeneration({
      args: { from: undefined, dryRun: false },
      today: "2026-04-19",
      client,
      commits: SAMPLE_COMMITS,
      headSha: "abcdef0123456789",
      existingChangelog: seedChangelog("2026-04-12"),
    });
    expect(result.mode).toBe("wrote");
    expect(prompts).toHaveLength(3);
    expect(result.payload?.commitCount).toBe(3);
    expect(result.payload?.fromBoundary).toBe("2026-04-12");
    expect(result.markdown).toContain("<!-- changelog-boundary:2026-04-19 -->");
    expect(result.nextChangelog).toContain("<!-- changelog-boundary:2026-04-19 -->");
    expect(result.nextChangelog).toContain("<!-- changelog-boundary:2026-04-12 -->");
  });

  test("--from CLI arg overrides the boundary in the since label", async () => {
    const { client, prompts } = makeMockClient(["a", "b", "c"]);
    await runGeneration({
      args: { from: "2026-02-01", dryRun: true },
      today: "2026-04-19",
      client,
      commits: SAMPLE_COMMITS,
      headSha: "feedface",
      existingChangelog: seedChangelog("2026-04-12"),
    });
    expect(prompts).toHaveLength(0); // dry-run
  });
});

// ── buildDefaultClaudeClient ──────────────────────────────────────

describe("buildDefaultClaudeClient", () => {
  test("returns null when ANTHROPIC_API_KEY is missing", async () => {
    const prev = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try {
      const client = await buildDefaultClaudeClient();
      expect(client).toBeNull();
    } finally {
      if (prev !== undefined) process.env["ANTHROPIC_API_KEY"] = prev;
    }
  });

  test("returns null when ANTHROPIC_API_KEY is too short", async () => {
    const prev = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "x";
    try {
      const client = await buildDefaultClaudeClient();
      expect(client).toBeNull();
    } finally {
      if (prev !== undefined) {
        process.env["ANTHROPIC_API_KEY"] = prev;
      } else {
        delete process.env["ANTHROPIC_API_KEY"];
      }
    }
  });
});
