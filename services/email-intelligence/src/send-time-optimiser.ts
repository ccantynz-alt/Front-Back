// ── Send-Time Optimiser (module 3 of 4) ───────────────────────────────
// Aggregates open behaviour by hour-of-day + day-of-week, computes a
// weighted preference, returns the top N send-time candidates in the
// next 7 days with predicted open probability.

import { z } from "zod";

export const recipientHistoryEntrySchema = z.object({
  /** ISO-8601 timestamp the email was sent. */
  sentAt: z.string(),
  /** Whether the recipient opened the email. */
  opened: z.boolean(),
});

export const sendTimeInputSchema = z.object({
  recipientHistory: z.array(recipientHistoryEntrySchema),
  /** IANA timezone (e.g. "America/New_York"). Default: UTC. */
  recipientTimezone: z.string().optional(),
  /** ISO-8601 "now" override for tests. */
  nowIso: z.string().optional(),
});

export type SendTimeInput = z.infer<typeof sendTimeInputSchema>;

export interface SendTimeCandidate {
  /** ISO-8601 send time (in UTC). */
  sendAt: string;
  /** Hour-of-day in recipient's local timezone (0..23). */
  localHour: number;
  /** Day-of-week in recipient's local timezone (0=Sun..6=Sat). */
  localDayOfWeek: number;
  /** Predicted open probability (0..1). */
  predictedOpenProbability: number;
  /** Number of historical observations supporting this slot. */
  observationCount: number;
}

const DEFAULT_BASELINE_OPEN_RATE = 0.21;
const SMOOTHING_PRIOR = 4; // dirichlet-style smoothing on each cell

interface CellStats {
  sent: number;
  opened: number;
}

interface AggregatedHistory {
  /** Cell key = `dow*24+hour`. */
  cells: Map<number, CellStats>;
  totalSent: number;
  totalOpened: number;
}

/**
 * Convert a UTC moment to (dow, hour) in the recipient's local timezone.
 * Pure JS — no third-party tz lib. Uses Intl.DateTimeFormat with the
 * appropriate timezone, falls back to UTC when the zone is invalid.
 */
function localParts(
  utcMs: number,
  timezone: string | undefined,
): { dow: number; hour: number } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone ?? "UTC",
      hour: "numeric",
      hour12: false,
      weekday: "short",
    });
    const parts = fmt.formatToParts(new Date(utcMs));
    let hour = 0;
    let dow = 0;
    for (const p of parts) {
      if (p.type === "hour") {
        // Intl returns "24" instead of "0" in some locales/zones; normalise.
        const h = Number.parseInt(p.value, 10);
        hour = Number.isNaN(h) ? 0 : h % 24;
      } else if (p.type === "weekday") {
        switch (p.value) {
          case "Sun":
            dow = 0;
            break;
          case "Mon":
            dow = 1;
            break;
          case "Tue":
            dow = 2;
            break;
          case "Wed":
            dow = 3;
            break;
          case "Thu":
            dow = 4;
            break;
          case "Fri":
            dow = 5;
            break;
          case "Sat":
            dow = 6;
            break;
          default:
            dow = 0;
        }
      }
    }
    return { dow, hour };
  } catch {
    const d = new Date(utcMs);
    return { dow: d.getUTCDay(), hour: d.getUTCHours() };
  }
}

function cellKey(dow: number, hour: number): number {
  return dow * 24 + hour;
}

/** Aggregate sent/opened counts by (dow, hour) cell. Pure & exported for tests. */
export function aggregateHistory(
  history: SendTimeInput["recipientHistory"],
  timezone: string | undefined,
): AggregatedHistory {
  const cells = new Map<number, CellStats>();
  let totalSent = 0;
  let totalOpened = 0;
  for (const entry of history) {
    const t = Date.parse(entry.sentAt);
    if (Number.isNaN(t)) {
      continue;
    }
    const { dow, hour } = localParts(t, timezone);
    const k = cellKey(dow, hour);
    const stat = cells.get(k) ?? { sent: 0, opened: 0 };
    stat.sent += 1;
    if (entry.opened) {
      stat.opened += 1;
    }
    cells.set(k, stat);
    totalSent += 1;
    if (entry.opened) {
      totalOpened += 1;
    }
  }
  return { cells, totalSent, totalOpened };
}

/** Smoothed open-rate for a cell using a beta-binomial prior. */
function smoothedRate(
  stat: CellStats | undefined,
  baseline: number,
): number {
  const sent = (stat?.sent ?? 0) + SMOOTHING_PRIOR;
  const opened = (stat?.opened ?? 0) + SMOOTHING_PRIOR * baseline;
  return opened / sent;
}

/**
 * Find the next UTC instant in the future at which the recipient's local
 * (dow, hour) matches the target pair.
 */
function nextInstantFor(
  nowMs: number,
  targetDow: number,
  targetHour: number,
  timezone: string | undefined,
): number {
  // Step minute by minute in 30-minute increments up to 8 days. Cheap;
  // rarely hits more than ~336 iterations.
  const stepMs = 30 * 60 * 1000;
  const limit = 8 * 24 * 60 * 60 * 1000;
  for (let dt = stepMs; dt <= limit; dt += stepMs) {
    const candidate = nowMs + dt;
    const parts = localParts(candidate, timezone);
    if (parts.dow === targetDow && parts.hour === targetHour) {
      // Snap to the start of that local hour.
      const snap = candidate - (candidate % (60 * 60 * 1000));
      return snap;
    }
  }
  return nowMs + 24 * 60 * 60 * 1000;
}

export interface OptimiseSendTimeOptions {
  /** Number of candidates to return. Defaults to 3. */
  topN?: number;
  /** Override baseline open rate for cold-start. */
  baselineOpenRate?: number;
}

export function optimiseSendTime(
  input: SendTimeInput,
  opts: OptimiseSendTimeOptions = {},
): { candidates: SendTimeCandidate[] } {
  const tz = input.recipientTimezone;
  const aggregated = aggregateHistory(input.recipientHistory, tz);
  const baseline =
    opts.baselineOpenRate ??
    (aggregated.totalSent > 0
      ? aggregated.totalOpened / aggregated.totalSent
      : DEFAULT_BASELINE_OPEN_RATE);

  // Score every cell, even unobserved ones (they fall back to baseline).
  const scored: Array<{
    dow: number;
    hour: number;
    rate: number;
    obs: number;
  }> = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const stat = aggregated.cells.get(cellKey(dow, hour));
      const rate = smoothedRate(stat, baseline);
      scored.push({ dow, hour, rate, obs: stat?.sent ?? 0 });
    }
  }
  // Stable sort: higher rate, then more observations, then earlier dow/hour.
  scored.sort((a, b) => {
    if (b.rate !== a.rate) {
      return b.rate - a.rate;
    }
    if (b.obs !== a.obs) {
      return b.obs - a.obs;
    }
    if (a.dow !== b.dow) {
      return a.dow - b.dow;
    }
    return a.hour - b.hour;
  });

  const nowMs = input.nowIso ? Date.parse(input.nowIso) : Date.now();
  const topN = Math.max(1, opts.topN ?? 3);
  const candidates: SendTimeCandidate[] = [];
  const seen = new Set<number>();
  for (const cell of scored) {
    if (candidates.length >= topN) {
      break;
    }
    const key = cellKey(cell.dow, cell.hour);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const sendMs = nextInstantFor(nowMs, cell.dow, cell.hour, tz);
    candidates.push({
      sendAt: new Date(sendMs).toISOString(),
      localHour: cell.hour,
      localDayOfWeek: cell.dow,
      predictedOpenProbability: Number(cell.rate.toFixed(4)),
      observationCount: cell.obs,
    });
  }

  // Order final candidates chronologically — caller likely picks the
  // earliest acceptable slot.
  candidates.sort((a, b) => Date.parse(a.sendAt) - Date.parse(b.sendAt));
  return { candidates };
}
