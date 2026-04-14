// ── Repos Procedures ──────────────────────────────────────────────────
// tRPC procedures for the GitHub repositories panel. Proxies GitHub
// API calls through the user's stored PAT so the frontend never
// touches the raw token.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import { userProviderKeys } from "@back-to-the-future/db";
import { GitHubClient } from "../../github/client";

// ── Key decryption (shared with chat.ts) ─────────────────────────────

function getEncryptionKey(): string {
  return process.env["SESSION_SECRET"] ?? "crontech-default-key-change-me";
}

function xorDecrypt(encoded: string, key: string): string {
  const buf = Buffer.from(encoded, "base64");
  const result: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index always valid
    result.push(buf[i]! ^ key.charCodeAt(i % key.length));
  }
  return String.fromCharCode(...result);
}

async function getGitHubClient(
  db: Parameters<typeof eq>[0] extends never ? never : typeof import("@back-to-the-future/db").db,
  userId: string,
): Promise<GitHubClient> {
  const rows = await db
    .select()
    .from(userProviderKeys)
    .where(
      and(
        eq(userProviderKeys.userId, userId),
        eq(userProviderKeys.provider, "github"),
        eq(userProviderKeys.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No GitHub token configured. Go to Settings > AI Providers to add your GitHub PAT.",
    });
  }

  const decrypted = xorDecrypt(row.encryptedKey, getEncryptionKey());

  // Update last used
  await db
    .update(userProviderKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(userProviderKeys.id, row.id));

  return new GitHubClient(decrypted);
}

// ── Input Schemas ──────────────────────────────────────────────────────

const RepoIdInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

// ── Router ─────────────────────────────────────────────────────────────

export const reposRouter = router({
  /** Check if GitHub token is configured and valid. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        prefix: userProviderKeys.keyPrefix,
        lastUsedAt: userProviderKeys.lastUsedAt,
      })
      .from(userProviderKeys)
      .where(
        and(
          eq(userProviderKeys.userId, ctx.userId),
          eq(userProviderKeys.provider, "github"),
          eq(userProviderKeys.isActive, true),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return { configured: false as const, prefix: null, lastUsedAt: null };
    }
    const row = rows[0];
    return {
      configured: true as const,
      prefix: row?.prefix ?? null,
      lastUsedAt: row?.lastUsedAt ?? null,
    };
  }),

  /** Get authenticated GitHub user profile. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const client = await getGitHubClient(ctx.db, ctx.userId);
    return client.getUser();
  }),

  /** List repositories for the authenticated user. */
  list: protectedProcedure
    .input(
      z.object({
        sort: z.enum(["updated", "pushed", "full_name"]).default("pushed"),
        per_page: z.number().int().min(1).max(100).default(30),
        page: z.number().int().min(1).default(1),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const client = await getGitHubClient(ctx.db, ctx.userId);
      return client.listRepos({
        sort: input?.sort ?? "pushed",
        per_page: input?.per_page ?? 30,
        page: input?.page ?? 1,
      });
    }),

  /** Get a single repository's details. */
  get: protectedProcedure
    .input(RepoIdInput)
    .query(async ({ ctx, input }) => {
      const client = await getGitHubClient(ctx.db, ctx.userId);
      return client.getRepo(input.owner, input.repo);
    }),

  /** List branches for a repository. */
  branches: protectedProcedure
    .input(RepoIdInput.extend({ per_page: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const client = await getGitHubClient(ctx.db, ctx.userId);
      return client.listBranches(input.owner, input.repo, {
        per_page: input.per_page,
      });
    }),

  /** List recent commits for a repository. */
  commits: protectedProcedure
    .input(
      RepoIdInput.extend({
        per_page: z.number().int().min(1).max(100).default(20),
        sha: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getGitHubClient(ctx.db, ctx.userId);
      const commitOpts: { per_page?: number; sha?: string } = {
        per_page: input.per_page,
      };
      if (input.sha !== undefined) commitOpts.sha = input.sha;
      return client.listCommits(input.owner, input.repo, commitOpts);
    }),

  /** List pull requests for a repository. */
  pullRequests: protectedProcedure
    .input(
      RepoIdInput.extend({
        state: z.enum(["open", "closed", "all"]).default("open"),
        per_page: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getGitHubClient(ctx.db, ctx.userId);
      return client.listPullRequests(input.owner, input.repo, {
        state: input.state,
        per_page: input.per_page,
      });
    }),

  /** List issues (excluding PRs) for a repository. */
  issues: protectedProcedure
    .input(
      RepoIdInput.extend({
        state: z.enum(["open", "closed", "all"]).default("open"),
        per_page: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getGitHubClient(ctx.db, ctx.userId);
      return client.listIssues(input.owner, input.repo, {
        state: input.state,
        per_page: input.per_page,
      });
    }),

  /** List recent CI workflow runs for a repository. */
  workflowRuns: protectedProcedure
    .input(RepoIdInput.extend({ per_page: z.number().int().min(1).max(30).default(10) }))
    .query(async ({ ctx, input }) => {
      const client = await getGitHubClient(ctx.db, ctx.userId);
      return client.listWorkflowRuns(input.owner, input.repo, {
        per_page: input.per_page,
      });
    }),

  /** Validate that the stored token works. */
  validateToken: protectedProcedure.mutation(async ({ ctx }) => {
    const client = await getGitHubClient(ctx.db, ctx.userId);
    return client.validateToken();
  }),
});
