// BLK-018 Voice-2 — Voice dispatch: turn a natural-language transcript
// from the VoicePill component into a structured platform intent.
//
// Flow: WebSpeech STT (client) → /voice.dispatch → Anthropic generateObject →
// structured IntentSchema → client acts (navigate, search flywheel, run op).
//
// Every dispatch is logged to the theatre so operators can watch voice
// traffic live on /ops alongside deploys and ingests.

import { z } from "zod";
import { generateObject } from "ai";
import { TRPCError } from "@trpc/server";
import {
  getAnthropicModelFromEnv,
  hasAnthropicProvider,
} from "@back-to-the-future/ai-core";
import { startRun } from "@back-to-the-future/theatre";
import { router, protectedProcedure } from "../init";

// ── Intent schema ─────────────────────────────────────────────────
// Every voice command must resolve to one of these intents. If the
// model can't map it, it returns `{ kind: "unknown" }` and we surface
// that back to the user with the verbatim transcript.

const KNOWN_ROUTES = [
  "/",
  "/dashboard",
  "/ops",
  "/flywheel",
  "/builder",
  "/chat",
  "/deployments",
  "/projects",
  "/repos",
  "/settings",
  "/billing",
  "/support",
  "/admin",
] as const;

const IntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigate"),
    route: z.enum(KNOWN_ROUTES),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("search_memory"),
    query: z.string().min(1).max(300),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("search_ops"),
    filter: z.string().max(200),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("run_ingest"),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("ask"),
    question: z.string().min(1).max(1000),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("unknown"),
    reason: z.string().max(400),
  }),
]);

export type VoiceIntent = z.infer<typeof IntentSchema>;

const SYSTEM_PROMPT = `You are the voice dispatcher for Crontech — an AI-native full-stack developer platform. Your only job is to map a spoken transcript into exactly one structured intent.

Available intents:
- navigate: user wants to open a specific page in the app. Must pick a route from the allowed enum.
- search_memory: user wants to search past Claude Code sessions on the Flywheel memory page.
- search_ops: user wants to find a specific operation on the Ops page (e.g. "show me the last failed deploy").
- run_ingest: user wants to re-ingest Claude Code transcripts into the flywheel.
- ask: user is asking a question that needs an AI answer (not a platform action).
- unknown: transcript is empty, meaningless, or does not match any other intent.

Be strict. Prefer "unknown" with a clear reason over forcing an intent that doesn't fit. Always include a short "reason" field explaining why you chose this intent.

Available routes for navigate:
/ /dashboard /ops /flywheel /builder /chat /deployments /projects /repos /settings /billing /support /admin`;

export const voiceRouter = router({
  /**
   * Dispatch a transcript into a structured intent. Every call writes
   * a single theatre run (kind=voice) so ops can see voice traffic.
   * When no Anthropic key is configured, we return kind=unknown with
   * a helpful reason rather than failing — keeps the pipe testable.
   */
  dispatch: protectedProcedure
    .input(
      z.object({
        transcript: z.string().min(1).max(2_000),
        /** Where in the app the user was when they spoke. Helps
         * disambiguate "go back" vs "refresh" vs "search here". */
        context: z
          .object({
            route: z.string().max(200).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const run = await startRun(ctx.db, {
        kind: "voice",
        title: `Voice: "${input.transcript.slice(0, 60)}${input.transcript.length > 60 ? "…" : ""}"`,
        actorUserId: ctx.userId,
        actorLabel: "voice-pill",
        metadata: {
          contextRoute: input.context?.route ?? null,
          transcriptLength: input.transcript.length,
        },
      });

      try {
        if (!hasAnthropicProvider()) {
          const intent: VoiceIntent = {
            kind: "unknown",
            reason:
              "ANTHROPIC_API_KEY not configured — cannot classify transcript.",
          };
          await run.log(
            `no anthropic provider; echoing unknown intent`,
            "stderr",
          );
          await run.succeed();
          return { intent, transcript: input.transcript, source: "stub" as const };
        }

        const intent = await run.step(
          "classify transcript",
          async (step): Promise<VoiceIntent> => {
            await step.log(`transcript: ${input.transcript}`);
            const model = getAnthropicModelFromEnv();
            if (!model) {
              throw new Error("Anthropic model unavailable.");
            }

            const { object } = await generateObject({
              model,
              schema: IntentSchema,
              system: SYSTEM_PROMPT,
              prompt: [
                `Current route: ${input.context?.route ?? "(unknown)"}`,
                "",
                "Transcript:",
                input.transcript,
              ].join("\n"),
              temperature: 0.1,
            });

            await step.log(`→ ${object.kind}: ${object.reason}`);
            return object;
          },
        );

        await run.succeed();
        return { intent, transcript: input.transcript, source: "ai" as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await run.fail(message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Voice dispatch failed: ${message}`,
        });
      }
    }),
});
