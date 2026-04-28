/**
 * Classification of SMTP responses.
 * 2xx → success/delivered
 * 4xx → soft failure → retry with exponential backoff
 * 5xx → hard failure → permanent bounce, add to suppression
 */
export type Classification = "delivered" | "retry" | "hard-bounce";

export function classifySmtpCode(code: number): Classification {
  if (code >= 200 && code < 300) return "delivered";
  if (code >= 400 && code < 500) return "retry";
  return "hard-bounce";
}

export interface RetrySchedule {
  delayMs: number;
  give_up: boolean;
}

/** Exponential backoff: 1m, 5m, 30m, 2h, 12h, then give up. */
export const DEFAULT_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
];

export function nextDelay(
  attempts: number,
  schedule: number[] = DEFAULT_BACKOFF_MS,
): RetrySchedule {
  if (attempts >= schedule.length) return { delayMs: 0, give_up: true };
  const delay = schedule[attempts];
  if (delay === undefined) return { delayMs: 0, give_up: true };
  return { delayMs: delay, give_up: false };
}
