// ── Import Project Procedures ──────────────────────────────────────────
// One-click competitor import: Vercel, Netlify, GitHub.
// Fetches projects, env vars, and domains from external platforms,
// then creates them locally in the Crontech DB. Tokens are NEVER stored.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import { router, protectedProcedure } from "../init";
import {
  projects,
  projectDomains,
  projectEnvVars,
} from "@back-to-the-future/db";

function encryptEnvValue(plaintext: string): string {
  const secret = process.env["SESSION_SECRET"] ?? "crontech-default-key-change-me";
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

// ── Zod Schemas ────────────────────────────────────────────────────────

const PlatformToken = z.object({
  token: z.string().min(1, "API token is required"),
});

const VercelImportInput = PlatformToken.extend({
  projectId: z.string().min(1, "Project ID is required"),
});

const NetlifyImportInput = PlatformToken.extend({
  siteId: z.string().min(1, "Site ID is required"),
});

const GithubImportInput = PlatformToken.extend({
  repoFullName: z.string().min(1, "Repository full name is required"),
});

// ── External API Response Schemas ──────────────────────────────────────

const VercelProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  framework: z.string().nullable().optional(),
});

const VercelEnvVarSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  target: z.array(z.string()).optional(),
});

const VercelDomainSchema = z.object({
  name: z.string(),
  verified: z.boolean().optional(),
});

const NetlifySiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  custom_domain: z.string().nullable().optional(),
  default_domain: z.string().optional(),
  published_deploy: z
    .object({
      framework: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const GithubRepoSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  name: z.string(),
  html_url: z.string(),
  homepage: z.string().nullable().optional(),
  default_branch: z.string().optional(),
  language: z.string().nullable().optional(),
  private: z.boolean().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function vercelFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.vercel.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid Vercel API token. Check your token and try again.",
      });
    }
    if (response.status === 429) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Vercel API rate limit exceeded. Please wait and try again.",
      });
    }
    const text = await response.text().catch(() => "Unknown error");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Vercel API error (${response.status}): ${text}`,
    });
  }

  return response.json() as Promise<T>;
}

async function netlifyFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid Netlify API token. Check your token and try again.",
      });
    }
    if (response.status === 429) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Netlify API rate limit exceeded. Please wait and try again.",
      });
    }
    const text = await response.text().catch(() => "Unknown error");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Netlify API error (${response.status}): ${text}`,
    });
  }

  return response.json() as Promise<T>;
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Crontech-Import/1.0",
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid GitHub Personal Access Token. Check your token and try again.",
      });
    }
    if (response.status === 429) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "GitHub API rate limit exceeded. Please wait and try again.",
      });
    }
    const text = await response.text().catch(() => "Unknown error");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub API error (${response.status}): ${text}`,
    });
  }

  return response.json() as Promise<T>;
}

const DB_FRAMEWORKS = [
  "solidstart", "nextjs", "remix", "astro", "hono", "static", "docker", "other",
] as const;
type DbFramework = (typeof DB_FRAMEWORKS)[number];

function mapFramework(raw: string | null | undefined): DbFramework | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (DB_FRAMEWORKS.includes(lower as DbFramework)) return lower as DbFramework;
  if (lower === "next") return "nextjs";
  if (lower === "solid") return "solidstart";
  return "other";
}

function mapVercelTarget(
  targets: string[] | undefined,
): "production" | "preview" | "development" {
  if (!targets || targets.length === 0) return "production";
  if (targets.includes("production")) return "production";
  if (targets.includes("preview")) return "preview";
  if (targets.includes("development")) return "development";
  return "production";
}

// ── Router ─────────────────────────────────────────────────────────────

export const importRouter = router({
  /** List Vercel projects for the given API token. */
  listVercelProjects: protectedProcedure
    .input(PlatformToken)
    .mutation(async ({ input }) => {
      const data = await vercelFetch<{ projects: unknown[] }>(
        "/v9/projects?limit=100",
        input.token,
      );

      const parsed = z.array(VercelProjectSchema).safeParse(data.projects);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse Vercel projects response.",
        });
      }

      return parsed.data.map((p) => ({
        id: p.id,
        name: p.name,
        framework: p.framework ?? null,
      }));
    }),

  /** List Netlify sites for the given API token. */
  listNetlifyProjects: protectedProcedure
    .input(PlatformToken)
    .mutation(async ({ input }) => {
      const data = await netlifyFetch<unknown[]>(
        "/sites?per_page=100",
        input.token,
      );

      const parsed = z.array(NetlifySiteSchema).safeParse(data);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse Netlify sites response.",
        });
      }

      return parsed.data.map((s) => ({
        id: s.id,
        name: s.name,
        framework: s.published_deploy?.framework ?? null,
      }));
    }),

  /** Import a project from Vercel: project + env vars + domains. */
  importFromVercel: protectedProcedure
    .input(VercelImportInput)
    .mutation(async ({ ctx, input }) => {
      const projectData = await vercelFetch<Record<string, unknown>>(
        `/v9/projects/${input.projectId}`,
        input.token,
      );

      const parsed = VercelProjectSchema.safeParse(projectData);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse Vercel project details.",
        });
      }
      const vercelProject = parsed.data;

      // Fetch env vars
      const envData = await vercelFetch<{ envs: unknown[] }>(
        `/v9/projects/${input.projectId}/env`,
        input.token,
      );
      const envParsed = z.array(VercelEnvVarSchema).safeParse(envData.envs);
      const envVars = envParsed.success ? envParsed.data : [];

      // Fetch domains
      const domainData = await vercelFetch<{ domains: unknown[] }>(
        `/v9/projects/${input.projectId}/domains`,
        input.token,
      );
      const domainParsed = z.array(VercelDomainSchema).safeParse(domainData.domains);
      const domains = domainParsed.success ? domainParsed.data : [];

      // Create project in Crontech DB
      const projectId = generateId();
      const now = new Date();

      await ctx.db.insert(projects).values({
        id: projectId,
        userId: ctx.userId,
        name: vercelProject.name,
        slug: slugify(vercelProject.name),
        description: `Imported from Vercel (${vercelProject.id})`,
        framework: mapFramework(vercelProject.framework),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const envInserts = envVars
        .filter(
          (e): e is typeof e & { value: string } =>
            e.value !== undefined && e.value !== "",
        )
        .map((e) => ({
          id: generateId(),
          projectId,
          key: e.key,
          encryptedValue: encryptEnvValue(e.value),
          environment: mapVercelTarget(e.target),
          createdAt: now,
          updatedAt: now,
        }));

      if (envInserts.length > 0) {
        await ctx.db.insert(projectEnvVars).values(envInserts);
      }

      // Insert domains
      const domainInserts = domains.map((d, i) => ({
        id: generateId(),
        projectId,
        domain: d.name,
        isPrimary: i === 0,
        dnsVerified: d.verified ?? false,
        createdAt: now,
      }));

      if (domainInserts.length > 0) {
        await ctx.db.insert(projectDomains).values(domainInserts);
      }

      return {
        projectId,
        name: vercelProject.name,
        envVarsImported: envInserts.length,
        domainsImported: domainInserts.length,
        framework: vercelProject.framework ?? null,
      };
    }),

  /** List GitHub repositories for the given Personal Access Token. */
  listGithubRepos: protectedProcedure
    .input(PlatformToken)
    .mutation(async ({ input }) => {
      const data = await githubFetch<unknown[]>(
        "/user/repos?sort=updated&per_page=100&type=all",
        input.token,
      );

      const parsed = z.array(GithubRepoSchema).safeParse(data);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse GitHub repositories response.",
        });
      }

      return parsed.data.map((r) => ({
        id: String(r.id),
        name: r.full_name,
        framework: null as string | null,
      }));
    }),

  /** Import a project from GitHub: creates a Crontech project linked to the repo. */
  importFromGithub: protectedProcedure
    .input(GithubImportInput)
    .mutation(async ({ ctx, input }) => {
      const repoData = await githubFetch<Record<string, unknown>>(
        `/repos/${input.repoFullName}`,
        input.token,
      );

      const parsed = GithubRepoSchema.safeParse(repoData);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse GitHub repository details.",
        });
      }
      const repo = parsed.data;

      const projectId = generateId();
      const now = new Date();

      // Derive a friendly project name from the repo name (not full_name)
      const projectName = repo.name;

      await ctx.db.insert(projects).values({
        id: projectId,
        userId: ctx.userId,
        name: projectName,
        slug: slugify(projectName),
        description: `Imported from GitHub (${repo.full_name})`,
        framework: mapFramework(repo.language),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // Add the GitHub Pages / homepage as a domain if present
      const domainInserts: Array<{
        id: string;
        projectId: string;
        domain: string;
        isPrimary: boolean;
        dnsVerified: boolean;
        createdAt: Date;
      }> = [];

      if (repo.homepage) {
        try {
          const url = new URL(repo.homepage);
          const hostname = url.hostname;
          if (hostname) {
            domainInserts.push({
              id: generateId(),
              projectId,
              domain: hostname,
              isPrimary: true,
              dnsVerified: false,
              createdAt: now,
            });
          }
        } catch {
          // homepage is not a valid URL — skip
        }
      }

      if (domainInserts.length > 0) {
        await ctx.db.insert(projectDomains).values(domainInserts);
      }

      return {
        projectId,
        name: projectName,
        envVarsImported: 0,
        domainsImported: domainInserts.length,
        framework: repo.language ?? null,
      };
    }),

  /** Import a project from Netlify: project + domains. */
  importFromNetlify: protectedProcedure
    .input(NetlifyImportInput)
    .mutation(async ({ ctx, input }) => {
      const siteData = await netlifyFetch<Record<string, unknown>>(
        `/sites/${input.siteId}`,
        input.token,
      );

      const parsed = NetlifySiteSchema.safeParse(siteData);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse Netlify site details.",
        });
      }
      const netlifySite = parsed.data;

      // Try to fetch env vars
      let envVars: Array<{
        key: string;
        values: Array<{ value: string; context: string }>;
      }> = [];
      try {
        const envData = await netlifyFetch<
          Array<{
            key: string;
            values: Array<{ value: string; context: string }>;
          }>
        >(`/accounts/me/env?site_id=${input.siteId}`, input.token);
        envVars = envData;
      } catch {
        // Env vars API may not be available for all plans
      }

      const projectId = generateId();
      const now = new Date();

      await ctx.db.insert(projects).values({
        id: projectId,
        userId: ctx.userId,
        name: netlifySite.name,
        slug: slugify(netlifySite.name),
        description: `Imported from Netlify (${netlifySite.id})`,
        framework: mapFramework(netlifySite.published_deploy?.framework),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // Insert env vars
      const envInserts: Array<{
        id: string;
        projectId: string;
        key: string;
        encryptedValue: string;
        environment: "production" | "preview" | "development";
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      for (const env of envVars) {
        for (const val of env.values) {
          if (val.value) {
            envInserts.push({
              id: generateId(),
              projectId,
              key: env.key,
              encryptedValue: encryptEnvValue(val.value),
              environment:
                val.context === "production"
                  ? "production"
                  : val.context === "deploy-preview"
                    ? "preview"
                    : val.context === "dev"
                      ? "development"
                      : "production",
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      if (envInserts.length > 0) {
        await ctx.db.insert(projectEnvVars).values(envInserts);
      }

      // Insert domains
      const domainInserts: Array<{
        id: string;
        projectId: string;
        domain: string;
        isPrimary: boolean;
        dnsVerified: boolean;
        createdAt: Date;
      }> = [];

      if (netlifySite.default_domain) {
        domainInserts.push({
          id: generateId(),
          projectId,
          domain: netlifySite.default_domain,
          isPrimary: true,
          dnsVerified: true,
          createdAt: now,
        });
      }

      if (netlifySite.custom_domain) {
        domainInserts.push({
          id: generateId(),
          projectId,
          domain: netlifySite.custom_domain,
          isPrimary: !netlifySite.default_domain,
          dnsVerified: true,
          createdAt: now,
        });
      }

      if (domainInserts.length > 0) {
        await ctx.db.insert(projectDomains).values(domainInserts);
      }

      return {
        projectId,
        name: netlifySite.name,
        envVarsImported: envInserts.length,
        domainsImported: domainInserts.length,
        framework: netlifySite.published_deploy?.framework ?? null,
      };
    }),
});
