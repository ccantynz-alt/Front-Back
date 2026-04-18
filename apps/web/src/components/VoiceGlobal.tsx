// BLK-018 Voice-3 — Global voice dispatcher.
//
// Wraps <VoicePill> in the app shell. When the pill delivers a
// transcript, we call trpc.voice.dispatch and act on the returned
// intent: navigate to a route, open /flywheel with a prefilled query,
// jump to /ops, fire the ingest mutation, toast an answer or the
// "unknown" reason.
//
// Guest users see nothing — voice is an authenticated feature so the
// server's protectedProcedure gate holds.

import { Show, type JSX } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { VoicePill } from "./VoicePill";
import { showToast } from "./Toast";
import { trpc } from "../lib/trpc";
import { useAuth } from "../stores";

interface NavigateIntent {
  kind: "navigate";
  route: string;
  reason: string;
}
interface SearchMemoryIntent {
  kind: "search_memory";
  query: string;
  reason: string;
}
interface SearchOpsIntent {
  kind: "search_ops";
  filter: string;
  reason: string;
}
interface RunIngestIntent {
  kind: "run_ingest";
  reason: string;
}
interface AskIntent {
  kind: "ask";
  question: string;
  reason: string;
}
interface UnknownIntent {
  kind: "unknown";
  reason: string;
}
type VoiceIntent =
  | NavigateIntent
  | SearchMemoryIntent
  | SearchOpsIntent
  | RunIngestIntent
  | AskIntent
  | UnknownIntent;

export function VoiceGlobal(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleTranscript(transcript: string): Promise<void> {
    showToast(`Heard: "${transcript}"`, "info", 2500);
    try {
      const result = (await trpc.voice.dispatch.mutate({
        transcript,
        context: { route: location.pathname },
      })) as { intent: VoiceIntent; source: "ai" | "stub" };

      const intent = result.intent;
      switch (intent.kind) {
        case "navigate": {
          showToast(`Navigating to ${intent.route}`, "success", 2000);
          navigate(intent.route);
          return;
        }
        case "search_memory": {
          showToast(`Searching memory: ${intent.query}`, "success", 2000);
          const qs = new URLSearchParams({ q: intent.query });
          navigate(`/flywheel?${qs.toString()}`);
          return;
        }
        case "search_ops": {
          showToast(`Filtering ops: ${intent.filter}`, "success", 2000);
          const qs = new URLSearchParams({ filter: intent.filter });
          navigate(`/ops?${qs.toString()}`);
          return;
        }
        case "run_ingest": {
          showToast(
            "Run `bun run --filter=@back-to-the-future/flywheel ingest` — shell-only for now.",
            "info",
            4500,
          );
          return;
        }
        case "ask": {
          showToast(`Q: ${intent.question}`, "info", 5000);
          return;
        }
        case "unknown":
        default: {
          showToast(`Didn't catch that: ${intent.reason}`, "warning", 4500);
          return;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Voice dispatch failed: ${message}`, "error", 4000);
    }
  }

  return (
    <Show when={auth.isAuthenticated()}>
      <VoicePill onTranscript={handleTranscript} />
    </Show>
  );
}
