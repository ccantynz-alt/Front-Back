// ── AI Procedures ──────────────────────────────────────────────────
// tRPC procedures that expose the Crontech site builder agent and
// persist the generated PageLayout objects into the sites /
// site_versions tables. This is the wire that connects the AI core
// to the database and the eventual builder UI.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import { sites, siteVersions } from "@back-to-the-future/db";
import {
  generatePageLayout,
  PageLayoutSchema,
  readProviderEnv,
  type PageLayout,
} from "@back-to-the-future/ai-core";

// ── IDs ────────────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Provider Readiness ───────────────────────────────────────────────
// If no cloud API key is configured the agent cannot talk to a real
// model. Rather than 500-ing the whole procedure we fall back to a
// deterministic stub layout so the builder UI, DB schema and
// end-to-end wiring can all be exercised without burning tokens.

function hasCloudProvider(): boolean {
  const env = readProviderEnv();
  return env.cloud.apiKey.length > 0;
}

function stubLayout(prompt: string): PageLayout {
  // Parse through the schema so defaults are resolved and the value
  // is guaranteed to satisfy PageLayout at runtime AND compile time.
  return PageLayoutSchema.parse({
    title: "Preview Layout",
    description: `Stub layout for: ${prompt}`,
    components: [
      {
        component: "Stack",
        props: {
          direction: "vertical",
          gap: "lg",
          align: "center",
          justify: "start",
        },
        children: [
          {
            component: "Text",
            props: {
              content: "AI Site Builder Preview",
              variant: "h1",
              weight: "bold",
              align: "center",
            },
          },
          {
            component: "Text",
            props: {
              content: prompt,
              variant: "body",
              weight: "normal",
              align: "center",
            },
          },
          {
            component: "Text",
            props: {
              content:
                "Configure OPENAI_API_KEY to generate real AI layouts.",
              variant: "caption",
              weight: "normal",
              align: "center",
            },
          },
        ],
      },
    ],
  });
}

// ── Input Schemas ───────────────────────────────────────────────────────

const TierSchema = z.enum(["cloud", "edge", "client"]);

const GenerateInputSchema = z.object({
  prompt: z.string().min(3).max(4_000),
  tier: TierSchema.optional(),
});

const SlugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Slug must be lowercase alphanumeric with single hyphens.",
  );

const SaveInputSchema = z.object({
  name: z.string().min(1).max(200),
  slug: SlugSchema,
  description: z.string().max(2_000).optional(),
  prompt: z.string().max(4_000).optional(),
  layout: PageLayoutSchema,
});

const AddVersionInputSchema = z.object({
  siteId: z.string().min(1),
  prompt: z.string().max(4_000).optional(),
  layout: PageLayoutSchema,
  generatedBy: z.enum(["ai", "user", "mixed"]).default("ai"),
});

// ── Site Builder Router ────────────────────────────────────────────────

export const siteBuilderRouter = router({
  /**
   * Generate a PageLayout from a natural language prompt.
   * Falls back to a deterministic stub when no provider is
   * configured so the pipeline is testable without API keys.
   */
  generate: protectedProcedure
    .input(GenerateInputSchema)
    .mutation(async ({ input }) => {
      if (!hasCloudProvider()) {
        return {
          layout: stubLayout(input.prompt),
          source: "stub" as const,
        };
      }

      try {
        const layout = await generatePageLayout(input.prompt, {
          computeTier: input.tier ?? "cloud",
        });
        return { layout, source: "ai" as const };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? `Site builder failed: ${err.message}`
              : "Site builder failed.",
        });
      }
    }),

  /**
   * Persist a newly generated layout as a site with version 1.
   */
  save: protectedProcedure
    .input(SaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.slug, input.slug))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Slug "${input.slug}" is already taken.`,
        });
      }

      const now = new Date();
      const siteId = newId("site");
      const versionId = newId("sv");

      await ctx.db.insert(sites).values({
        id: siteId,
        userId: ctx.userId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert(siteVersions).values({
        id: versionId,
        siteId,
        version: 1,
        prompt: input.prompt ?? null,
        layout: JSON.stringify(input.layout),
        generatedBy: "ai",
        createdAt: now,
      });

      return { siteId, versionId, version: 1 };
    }),

  /**
   * Append a new version to an existing site. Version number is
   * computed server-side by taking max(version) + 1.
   */
  addVersion: protectedProcedure
    .input(AddVersionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const siteRows = await ctx.db
        .select()
        .from(sites)
        .where(eq(sites.id, input.siteId))
        .limit(1);
      const site = siteRows[0];
      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site not found.",
        });
      }
      if (site.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this site.",
        });
      }

      const maxRows = await ctx.db
        .select({ max: sql<number>`max(${siteVersions.version})` })
        .from(siteVersions)
        .where(eq(siteVersions.siteId, input.siteId));
      const currentMax = maxRows[0]?.max ?? 0;
      const nextVersion = currentMax + 1;

      const now = new Date();
      const versionId = newId("sv");

      await ctx.db.insert(siteVersions).values({
        id: versionId,
        siteId: input.siteId,
        version: nextVersion,
        prompt: input.prompt ?? null,
        layout: JSON.stringify(input.layout),
        generatedBy: input.generatedBy,
        createdAt: now,
      });

      await ctx.db
        .update(sites)
        .set({ updatedAt: now })
        .where(eq(sites.id, input.siteId));

      return { versionId, version: nextVersion };
    }),

  /**
   * List all sites owned by the current user, most recently updated
   * first.
   */
  listSites: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(sites)
      .where(eq(sites.userId, ctx.userId))
      .orderBy(desc(sites.updatedAt));
    return rows;
  }),

  /**
   * Fetch a single site + its latest version, with the layout parsed
   * back into a PageLayout. Ownership enforced.
   */
  getSite: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const siteRows = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.id), eq(sites.userId, ctx.userId)))
        .limit(1);
      const site = siteRows[0];
      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site not found.",
        });
      }

      const versionRows = await ctx.db
        .select()
        .from(siteVersions)
        .where(eq(siteVersions.siteId, site.id))
        .orderBy(desc(siteVersions.version))
        .limit(1);
      const latest = versionRows[0];

      let layout: PageLayout | null = null;
      if (latest) {
        const parsed = PageLayoutSchema.safeParse(JSON.parse(latest.layout));
        if (parsed.success) {
          layout = parsed.data;
        }
      }

      return { site, latestVersion: latest ?? null, layout };
    }),
});

// ── AI Router ─────────────────────────────────────────────────────────────
// Nested so future AI surface areas (rag, chat, embeddings) can live
// under the same `ai.*` namespace without polluting the root router.

export const aiRouter = router({
  siteBuilder: siteBuilderRouter,
});
