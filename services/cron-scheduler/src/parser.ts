// ── Crontech Cron Scheduler — expression parser ──────────────────────
// Implements the standard 5-field cron expression grammar plus the
// canonical "@hourly" / "@daily" / "@weekly" / "@monthly" / "@yearly"
// shortcuts. Each field supports:
//   - * (any value)
//   - integer literals: 5
//   - ranges: 1-5
//   - lists: 1,3,5
//   - steps: */15 or 1-30/5
// Day-of-week accepts 0..7 with both 0 and 7 mapping to Sunday and the
// three-letter aliases (SUN..SAT). Month accepts 1..12 and the
// three-letter aliases (JAN..DEC).
//
// next-fire calculation walks forward minute-by-minute up to a sensible
// horizon (4 years) honoring the specified IANA timezone — including
// DST forward-jumps (skipped local minutes are silently advanced past)
// and DST fall-back (an ambiguous local time fires only once on the
// "first" UTC instant that the wall-clock matches).

const FIELD_BOUNDS = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dow: { min: 0, max: 6 },
} as const;

type FieldName = keyof typeof FIELD_BOUNDS;

const MONTH_ALIASES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const DOW_ALIASES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const SHORTCUTS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export interface ParsedCron {
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly doms: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly dows: ReadonlySet<number>;
  /** True if the expression had a non-`*` DOM AND a non-`*` DOW. */
  readonly domDowRestricted: boolean;
  readonly source: string;
}

export class CronParseError extends Error {
  constructor(
    public readonly expression: string,
    public readonly reason: string,
  ) {
    super(`Invalid cron expression "${expression}": ${reason}`);
    this.name = "CronParseError";
  }
}

export function parseCron(expression: string): ParsedCron {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    throw new CronParseError(expression, "expression is empty");
  }

  const expanded = trimmed.startsWith("@")
    ? expandShortcut(trimmed, expression)
    : trimmed;

  const fields = expanded.split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(
      expression,
      `expected 5 fields (min hour dom month dow), got ${fields.length}`,
    );
  }

  const [minF, hourF, domF, monthF, dowF] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];

  const months = parseField(monthF, "month", expression, MONTH_ALIASES);
  // DOW accepts 0..7 in expressions even though the canonical range is
  // 0..6 (both 0 and 7 mean Sunday). Pass an extended max so the
  // bounds-check passes, then remap 7 -> 0 before insertion.
  const dows = parseField(
    dowF,
    "dow",
    expression,
    DOW_ALIASES,
    (v) => (v === 7 ? 0 : v),
    { extendedMax: 7 },
  );

  return {
    minutes: parseField(minF, "minute", expression),
    hours: parseField(hourF, "hour", expression),
    doms: parseField(domF, "dom", expression),
    months,
    dows,
    domDowRestricted: domF !== "*" && dowF !== "*",
    source: expression,
  };
}

function expandShortcut(token: string, original: string): string {
  const expanded = SHORTCUTS[token.toLowerCase()];
  if (!expanded) {
    throw new CronParseError(original, `unknown shortcut "${token}"`);
  }
  return expanded;
}

function parseField(
  raw: string,
  name: FieldName,
  expression: string,
  aliases: Record<string, number> = {},
  remap: (v: number) => number = (v) => v,
  options: { extendedMax?: number } = {},
): Set<number> {
  const { min, max } = FIELD_BOUNDS[name];
  const parseMax = options.extendedMax ?? max;
  const result = new Set<number>();

  for (const part of raw.split(",")) {
    expandPart(
      part,
      name,
      expression,
      aliases,
      remap,
      min,
      parseMax,
      max,
      result,
    );
  }

  if (result.size === 0) {
    throw new CronParseError(expression, `field "${name}" produced no values`);
  }
  return result;
}

function expandPart(
  part: string,
  name: FieldName,
  expression: string,
  aliases: Record<string, number>,
  remap: (v: number) => number,
  min: number,
  parseMax: number,
  storeMax: number,
  out: Set<number>,
): void {
  let body = part;
  let step = 1;
  const slashIdx = part.indexOf("/");
  if (slashIdx !== -1) {
    body = part.slice(0, slashIdx);
    const stepStr = part.slice(slashIdx + 1);
    const parsedStep = Number.parseInt(stepStr, 10);
    if (!Number.isFinite(parsedStep) || parsedStep <= 0) {
      throw new CronParseError(
        expression,
        `field "${name}" step "${stepStr}" must be a positive integer`,
      );
    }
    step = parsedStep;
  }

  let rangeStart: number;
  let rangeEnd: number;
  if (body === "*" || body === "") {
    rangeStart = min;
    rangeEnd = parseMax;
  } else if (body.includes("-")) {
    const [a, b] = body.split("-", 2) as [string, string];
    rangeStart = resolveValue(a, name, expression, aliases);
    rangeEnd = resolveValue(b, name, expression, aliases);
  } else {
    rangeStart = resolveValue(body, name, expression, aliases);
    rangeEnd = slashIdx !== -1 ? parseMax : rangeStart;
  }

  if (rangeStart < min || rangeEnd > parseMax || rangeStart > rangeEnd) {
    throw new CronParseError(
      expression,
      `field "${name}" range ${rangeStart}-${rangeEnd} out of bounds [${min},${parseMax}]`,
    );
  }

  for (let v = rangeStart; v <= rangeEnd; v += step) {
    const remapped = remap(v);
    if (remapped < min || remapped > storeMax) {
      throw new CronParseError(
        expression,
        `field "${name}" produced out-of-range value ${remapped}`,
      );
    }
    out.add(remapped);
  }
}

function resolveValue(
  token: string,
  name: FieldName,
  expression: string,
  aliases: Record<string, number>,
): number {
  const upper = token.toUpperCase();
  if (upper in aliases) {
    return aliases[upper] as number;
  }
  const n = Number.parseInt(token, 10);
  if (!Number.isFinite(n) || String(n) !== token) {
    throw new CronParseError(
      expression,
      `field "${name}" value "${token}" is not a valid integer or alias`,
    );
  }
  return n;
}

// ── Next-fire computation ────────────────────────────────────────────

export interface NextFireOptions {
  /** IANA timezone, e.g. "UTC", "Australia/Sydney". Defaults to UTC. */
  timezone?: string;
  /** Anchor instant (ms epoch). The next fire-time is strictly AFTER this. */
  after: number;
  /** Maximum forward search (ms). Defaults to 4 years. */
  horizonMs?: number;
}

const DEFAULT_HORIZON_MS = 4 * 365 * 24 * 60 * 60 * 1000;

/**
 * Returns the epoch-millisecond timestamp of the next minute boundary
 * (in the job's timezone) that satisfies the cron expression and is
 * strictly greater than `after`. Returns null if no match within the
 * horizon (effectively "never").
 */
export function nextFire(
  cron: ParsedCron,
  options: NextFireOptions,
): number | null {
  const tz = options.timezone ?? "UTC";
  const horizonMs = options.horizonMs ?? DEFAULT_HORIZON_MS;
  const deadline = options.after + horizonMs;

  // Start at the next whole-minute boundary AFTER `after`, in UTC. We
  // walk minute-by-minute and check the wall-clock fields in `tz`.
  // Optimisation: when the date (month / dom / dow) does not match,
  // we can safely skip the rest of that wall-clock day in one jump
  // (24 * 60 = 1440 minute checks pruned per skipped day).
  let cursor = Math.floor(options.after / 60000) * 60000 + 60000;
  const ONE_MIN = 60_000;
  const ONE_DAY_MS = 24 * 60 * ONE_MIN;

  while (cursor <= deadline) {
    const parts = wallClockParts(cursor, tz);
    if (matchesCron(cron, parts)) {
      return cursor;
    }
    if (!dateMatches(cron, parts)) {
      cursor = jumpToNextDayStart(cursor, tz, ONE_DAY_MS);
      continue;
    }
    cursor += ONE_MIN;
  }
  return null;
}

function jumpToNextDayStart(
  cursor: number,
  tz: string,
  oneDayMs: number,
): number {
  // Goal: advance the cursor to the FIRST UTC instant whose local time
  // (in `tz`) has a calendar date strictly later than the current one.
  // We compute the seconds elapsed since local midnight and subtract
  // them from `cursor + oneDayMs`, so the cursor lands on (or just
  // before) the next local midnight. The main loop then walks forward
  // minute-by-minute from there. A small slack absorbs DST shifts.
  const parts = fullWallClockParts(cursor, tz);
  const elapsedSeconds =
    parts.hour * 3600 + parts.minute * 60 + parts.second;
  const target = cursor + oneDayMs - elapsedSeconds * 1000 + 2 * 3600 * 1000;
  return Math.floor(target / 60_000) * 60_000;
}

/** Convenience: compute the next N fire times after `after`. */
export function nextFires(
  cron: ParsedCron,
  options: NextFireOptions,
  count: number,
): number[] {
  const fires: number[] = [];
  let cursor = options.after;
  for (let i = 0; i < count; i++) {
    const opts: NextFireOptions = {
      after: cursor,
      ...(options.timezone !== undefined ? { timezone: options.timezone } : {}),
      ...(options.horizonMs !== undefined
        ? { horizonMs: options.horizonMs }
        : {}),
    };
    const next = nextFire(cron, opts);
    if (next === null) break;
    fires.push(next);
    cursor = next;
  }
  return fires;
}

interface WallClockParts {
  minute: number;
  hour: number;
  dom: number;
  month: number;
  dow: number;
}

interface FullWallClockParts extends WallClockParts {
  second: number;
}

const PART_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function wallClockParts(epochMs: number, tz: string): WallClockParts {
  return fullWallClockParts(epochMs, tz);
}

function fullWallClockParts(epochMs: number, tz: string): FullWallClockParts {
  let fmt = PART_FORMATTER_CACHE.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
      hour12: false,
    });
    PART_FORMATTER_CACHE.set(tz, fmt);
  }

  const parts = fmt.formatToParts(new Date(epochMs));
  let minute = 0;
  let hour = 0;
  let second = 0;
  let dom = 1;
  let month = 1;
  let dow = 0;

  for (const p of parts) {
    if (p.type === "minute") minute = Number.parseInt(p.value, 10);
    else if (p.type === "second") second = Number.parseInt(p.value, 10);
    else if (p.type === "hour") {
      const h = Number.parseInt(p.value, 10);
      hour = h === 24 ? 0 : h;
    } else if (p.type === "day") dom = Number.parseInt(p.value, 10);
    else if (p.type === "month") month = Number.parseInt(p.value, 10);
    else if (p.type === "weekday") dow = WEEKDAY_MAP[p.value] ?? 0;
  }

  return { minute, hour, second, dom, month, dow };
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function matchesCron(cron: ParsedCron, parts: WallClockParts): boolean {
  if (!cron.minutes.has(parts.minute)) return false;
  if (!cron.hours.has(parts.hour)) return false;
  return dateMatches(cron, parts);
}

function dateMatches(cron: ParsedCron, parts: WallClockParts): boolean {
  if (!cron.months.has(parts.month)) return false;
  // Vixie-cron semantics: when BOTH dom and dow are restricted, fire if
  // EITHER matches. When only one is restricted, that one alone gates.
  const domMatch = cron.doms.has(parts.dom);
  const dowMatch = cron.dows.has(parts.dow);
  if (cron.domDowRestricted) {
    return domMatch || dowMatch;
  }
  return domMatch && dowMatch;
}
