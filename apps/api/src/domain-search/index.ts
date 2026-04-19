// ── BLK-025 Domain Search: Orchestrator ─────────────────────────────
//
// High-level entry point that stitches together:
//   1. Parallel SOA-based availability checks across every requested TLD.
//   2. Optional AI-generated brandable alternatives.
//   3. Optional trademark-conflict pre-screen (Claude-powered).
//
// Results are cached in-process for 60 seconds because DNS delegations
// and trademark opinions change slowly. Cache keys include the full
// option bag so a request with `includeTrademark=false` never returns
// cached data that WAS scanned — we don't leak trademark info between
// shapes.

import {
  checkAvailability,
  normaliseLabel,
  DEFAULT_TLDS,
  type CheckAvailabilityOptions,
  type DomainResult,
  type SoaResolver,
} from "./availability";
import {
  generateBrandableAlternatives,
  type AiAlternative,
  type GenerateOptions as SuggestionsOptions,
} from "./ai-suggestions";
import {
  scanTrademarkConflicts,
  aboveRisk,
  type ScanOptions as TrademarkOptions,
  type TrademarkConflict,
  type TrademarkScanResult,
} from "./trademark";

export {
  DEFAULT_TLDS,
  normaliseLabel,
  normaliseTld,
  onlyAvailable,
  type DomainResult,
  type SoaResolver,
} from "./availability";
export {
  type AiAlternative,
  type AiSuggestionResult,
} from "./ai-suggestions";
export {
  type TrademarkConflict,
  type TrademarkScanResult,
  type TrademarkRisk,
} from "./trademark";

// ── Inputs / Outputs ────────────────────────────────────────────────

export interface DomainSearchInput {
  readonly query: string;
  readonly tlds?: ReadonlyArray<string>;
  readonly includeTrademark?: boolean;
  readonly includeAiSuggestions?: boolean;
}

export interface DomainSearchOutput {
  readonly query: string;
  readonly label: string | null;
  readonly available: DomainResult[];
  readonly taken: DomainResult[];
  readonly unknown: DomainResult[];
  readonly suggestions: AiAlternative[] | undefined;
  readonly suggestionsNote: string | undefined;
  readonly trademarkWarnings: TrademarkConflict[] | undefined;
  readonly trademarkNote: string | undefined;
  readonly cached: boolean;
}

// ── Dependency injection — tests may override any of these ──────────

export interface OrchestratorDeps {
  readonly resolver?: SoaResolver;
  readonly suggestionsOptions?: SuggestionsOptions;
  readonly trademarkOptions?: TrademarkOptions;
  readonly now?: () => number;
  readonly cacheTtlMs?: number;
}

// ── Cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  readonly value: DomainSearchOutput;
  readonly expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 60_000;

export class DomainSearchCache {
  private readonly store = new Map<string, CacheEntry>();
  constructor(private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS) {}

  get(key: string, now: number): DomainSearchOutput | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: DomainSearchOutput, now: number): void {
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// Module-level cache shared across requests in the same process.
const defaultCache = new DomainSearchCache();

export function __resetDefaultCacheForTests(): void {
  defaultCache.clear();
}

function buildCacheKey(input: DomainSearchInput, tlds: ReadonlyArray<string>): string {
  const parts = [
    `q=${input.query.trim().toLowerCase()}`,
    `tlds=${[...tlds].sort().join(",")}`,
    `tm=${input.includeTrademark === true ? "1" : "0"}`,
    `ai=${input.includeAiSuggestions === true ? "1" : "0"}`,
  ];
  return parts.join("|");
}

// ── Orchestrator ────────────────────────────────────────────────────

/**
 * Run the full domain search pipeline for a single query.
 * Never throws — downstream failures collapse into `unknown` results
 * or empty suggestion / warning arrays with a short note.
 */
export async function searchDomains(
  input: DomainSearchInput,
  deps: OrchestratorDeps = {},
  cache: DomainSearchCache = defaultCache,
): Promise<DomainSearchOutput> {
  const now = (deps.now ?? Date.now)();
  const label = normaliseLabel(input.query);

  const tlds = input.tlds && input.tlds.length > 0 ? [...input.tlds] : [...DEFAULT_TLDS];
  const key = buildCacheKey(input, tlds);

  if (label !== null) {
    const hit = cache.get(key, now);
    if (hit) return { ...hit, cached: true };
  }

  if (label === null) {
    const out: DomainSearchOutput = {
      query: input.query,
      label: null,
      available: [],
      taken: [],
      unknown: [],
      suggestions: undefined,
      suggestionsNote:
        "Search query must contain letters, digits, or hyphens (e.g. \"fable\" or \"my-app\").",
      trademarkWarnings: undefined,
      trademarkNote: undefined,
      cached: false,
    };
    return out;
  }

  const availabilityOpts: CheckAvailabilityOptions = { tlds };
  if (deps.resolver !== undefined) availabilityOpts.resolver = deps.resolver;

  const results = await checkAvailability(label, availabilityOpts);

  const available: DomainResult[] = [];
  const taken: DomainResult[] = [];
  const unknown: DomainResult[] = [];
  for (const r of results) {
    if (r.unknown) unknown.push(r);
    else if (r.available) available.push(r);
    else taken.push(r);
  }

  // Fire suggestions + trademark scan in parallel when requested.
  const wantSuggestions = input.includeAiSuggestions === true;
  const wantTrademark = input.includeTrademark === true;

  const [suggestionsRes, trademarkRes] = await Promise.all([
    wantSuggestions
      ? generateBrandableAlternatives(label, deps.suggestionsOptions ?? {})
      : Promise.resolve(undefined),
    wantTrademark
      ? scanTrademarkConflicts(label, deps.trademarkOptions ?? {})
      : Promise.resolve(undefined as TrademarkScanResult | undefined),
  ]);

  const out: DomainSearchOutput = {
    query: input.query,
    label,
    available,
    taken,
    unknown,
    suggestions: suggestionsRes?.alternatives,
    suggestionsNote: suggestionsRes?.note,
    // UI consumes "warnings" — medium + high risk only. Low risk is noise.
    trademarkWarnings: trademarkRes ? aboveRisk(trademarkRes.conflicts, "medium") : undefined,
    trademarkNote: trademarkRes?.note,
    cached: false,
  };

  cache.set(key, out, now);
  return out;
}
