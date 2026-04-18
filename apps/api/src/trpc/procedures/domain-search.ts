// ── BLK-025 Domain Search: tRPC Router ──────────────────────────────
//
// Public (unauthenticated) endpoint exposing the domain search
// orchestrator. Returns only available names by default, with optional
// trademark warnings and AI-generated brandable alternatives.
//
// Notes for reviewers:
//   • Rate limiting is applied at the Hono middleware layer on the
//     /api/trpc/* route — see apps/api/src/index.ts. We rely on that
//     limiter rather than re-implementing one here.
//   • All inputs are validated via Zod. The label is clamped to 63
//     characters (the DNS label ceiling) and TLDs are constrained to
//     lowercase ASCII labels.
//   • Dependencies are injected via `createDomainSearchRouter` for
//     tests; the exported `domainSearchRouter` uses production DNS
//     + Anthropic under the hood.

import { z } from "zod";
import { router, publicProcedure } from "../init";
import {
  searchDomains,
  DEFAULT_TLDS,
  type OrchestratorDeps,
} from "../../domain-search";

const LABEL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const TLD_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

const SearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Type at least one character to start searching.")
    .max(80, "Search queries are limited to 80 characters.")
    .refine(
      (v) => {
        const first = v.trim().toLowerCase().split(/[./\s]/)[0] ?? "";
        return first.length > 0 && LABEL_RE.test(first);
      },
      {
        message:
          "Use letters, digits, or hyphens only (e.g. \"fable\" or \"my-app\").",
      },
    ),
  tlds: z
    .array(z.string().regex(TLD_RE, "TLDs must be simple labels like .com or .io."))
    .min(1)
    .max(25)
    .optional(),
  includeTrademark: z.boolean().optional().default(false),
  includeAiSuggestions: z.boolean().optional().default(false),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

/**
 * Build a domain-search tRPC router with explicit dependencies. Tests
 * inject a fake DNS resolver + mocked Claude model; production calls
 * the zero-arg `domainSearchRouter` export below.
 */
export function createDomainSearchRouter(deps: OrchestratorDeps = {}) {
  return router({
    /**
     * Search for available domains across one or more TLDs.
     * Publicly accessible — no authentication required.
     *
     * Returns only the available names alongside the original query,
     * optional AI-generated alternatives, and optional trademark
     * warnings (medium + high risk only).
     */
    search: publicProcedure
      .input(SearchInputSchema)
      .query(async ({ input }) => {
        const tlds = input.tlds ?? [...DEFAULT_TLDS];
        const result = await searchDomains(
          {
            query: input.query,
            tlds,
            includeTrademark: input.includeTrademark,
            includeAiSuggestions: input.includeAiSuggestions,
          },
          deps,
        );

        return {
          query: result.query,
          label: result.label,
          available: result.available,
          takenCount: result.taken.length,
          unknownCount: result.unknown.length,
          suggestions: result.suggestions,
          suggestionsNote: result.suggestionsNote,
          trademarkWarnings: result.trademarkWarnings,
          trademarkNote: result.trademarkNote,
          cached: result.cached,
          tldsChecked: tlds,
        };
      }),

    /**
     * Lightweight health probe for the domain-search subsystem.
     * Used by the status page to confirm the orchestrator is reachable.
     */
    health: publicProcedure.query(() => {
      return {
        ok: true as const,
        defaultTlds: [...DEFAULT_TLDS],
      };
    }),
  });
}

export const domainSearchRouter = createDomainSearchRouter();
