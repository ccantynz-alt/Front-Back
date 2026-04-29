/**
 * CrontechML — declarative call-flow language (TwiML-equivalent).
 *
 * Document grammar:
 *   { version: "1", verbs: Verb[] }
 *
 * Each verb describes one action the call-control runtime performs in
 * sequence. After the executor finishes a flow document, if the call is
 * still active and `flowUrl` is set, we POST the current call state to
 * the customer's webhook and they return the next document.
 */
import { z } from "zod";

export const SayVerb = z.object({
  verb: z.literal("say"),
  text: z.string().min(1),
  voice: z.enum(["male", "female", "neural"]).optional(),
  language: z.string().optional(),
});

export const PlayVerb = z.object({
  verb: z.literal("play"),
  audioUrl: z.string().url(),
  loop: z.number().int().min(1).max(10).optional(),
});

export const GatherVerb = z.object({
  verb: z.literal("gather"),
  numDigits: z.number().int().min(1).max(20).optional(),
  timeoutSec: z.number().int().min(1).max(60).optional(),
  finishOnKey: z.string().length(1).optional(),
  prompt: z.string().optional(),
});

export const RecordVerb = z.object({
  verb: z.literal("record"),
  maxLengthSec: z.number().int().min(1).max(3600).optional(),
  playBeep: z.boolean().optional(),
  transcribe: z.boolean().optional(),
});

export const DialVerb = z.object({
  verb: z.literal("dial"),
  to: z.string().min(3),
  callerId: z.string().optional(),
  timeoutSec: z.number().int().min(1).max(120).optional(),
  record: z.boolean().optional(),
});

export const RedirectVerb = z.object({
  verb: z.literal("redirect"),
  url: z.string().url(),
});

export const HangupVerb = z.object({
  verb: z.literal("hangup"),
});

export const PauseVerb = z.object({
  verb: z.literal("pause"),
  seconds: z.number().int().min(1).max(60),
});

export const EnqueueVerb = z.object({
  verb: z.literal("enqueue"),
  queueName: z.string().min(1),
  waitUrl: z.string().url().optional(),
});

export const ConnectAiAgentVerb = z.object({
  verb: z.literal("connect_ai_agent"),
  agentId: z.string().min(1),
  // Bidirectional audio stream endpoint at services/comms-intelligence
  streamUrl: z.string().url().optional(),
  systemPrompt: z.string().optional(),
});

export const Verb = z.discriminatedUnion("verb", [
  SayVerb,
  PlayVerb,
  GatherVerb,
  RecordVerb,
  DialVerb,
  RedirectVerb,
  HangupVerb,
  PauseVerb,
  EnqueueVerb,
  ConnectAiAgentVerb,
]);

export const CrontechMLDoc = z.object({
  version: z.literal("1"),
  verbs: z.array(Verb).min(1).max(50),
});

export type Verb = z.infer<typeof Verb>;
export type CrontechMLDoc = z.infer<typeof CrontechMLDoc>;

export type CallState =
  | "queued"
  | "dialing"
  | "ringing"
  | "answered"
  | "in-progress"
  | "completed"
  | "failed"
  | "busy"
  | "no-answer";

export interface CallEvent {
  ts: number;
  type: string;
  detail?: Record<string, unknown>;
}

export interface CallRecord {
  id: string;
  tenantId: string;
  from: string;
  to: string;
  direction: "inbound" | "outbound";
  state: CallState;
  flowUrl?: string;
  statusWebhook?: string;
  createdAt: number;
  updatedAt: number;
  recordingUrl?: string;
  transcriptionText?: string;
  events: CallEvent[];
  digits?: string;
}

export function parseCrontechML(input: unknown): CrontechMLDoc {
  return CrontechMLDoc.parse(input);
}
