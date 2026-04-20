// ── BLK-029 — Celitech eSIM API client ────────────────────────────────
// Thin HTTP client for the Celitech API (REST over HTTPS with an OAuth
// client-credentials bearer token). Exposes a typed surface —
// `listPackages`, `getPackage`, `createPurchase`, `listPurchases`,
// `getPurchase`, `getInstallInfo` — so the tRPC router, admin CLIs, and
// tests never have to think about the raw wire format.
//
// Dependency-injected fetch (per CLAUDE.md §0.4.1 iron rules: Zod at the
// boundary, TS strict, no singletons in the request path). Tests pass a
// custom `fetchImpl` to swap the network layer entirely.
//
// Token caching: the access token is cached in memory inside the client
// instance until ~30s before its advertised expiry. A brand-new client
// fetches a fresh token lazily on first use.

import { z } from "zod";
import {
  CelitechPackagesResponseSchema,
  CelitechPurchaseListResponseSchema,
  CelitechPurchaseResponseSchema,
  CelitechPurchaseSchema,
  CelitechTokenResponseSchema,
  type CelitechInstallFields,
  type CelitechPackage,
  type CelitechPurchase,
  type EsimInstallInfo,
  type EsimPackageSummary,
} from "./celitech-types";

// ── Config ────────────────────────────────────────────────────────────

export interface CelitechConfig {
  /** API client id. `CELITECH_CLIENT_ID` in the environment. */
  clientId: string;
  /** API client secret. `CELITECH_CLIENT_SECRET` in the environment. */
  clientSecret: string;
  /** API base URL (no trailing slash). Defaults to the public v1 API. */
  baseUrl: string;
  /** OAuth token endpoint — defaults to the public production URL. */
  tokenUrl: string;
}

export interface CelitechClientDeps {
  fetchImpl?: typeof fetch;
  /** Override the current time — used so tests can control token expiry. */
  now?: () => number;
}

/** Construct config from the standard Celitech environment variables. */
export function configFromEnv(): CelitechConfig {
  const clientId = process.env["CELITECH_CLIENT_ID"] ?? "";
  const clientSecret = process.env["CELITECH_CLIENT_SECRET"] ?? "";
  const baseUrl =
    process.env["CELITECH_BASE_URL"] ?? "https://api.celitech.com/v1";
  const tokenUrl =
    process.env["CELITECH_TOKEN_URL"] ?? "https://api.celitech.com/oauth2/token";
  return {
    clientId,
    clientSecret,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    tokenUrl,
  };
}

// ── CelitechError ─────────────────────────────────────────────────────
// Thrown whenever the API returns a non-2xx response OR the HTTP layer
// fails. Callers (tRPC router) translate this into BAD_GATEWAY.

export class CelitechError extends Error {
  public readonly action: string;
  public readonly status: number | undefined;
  public readonly bodySnippet: string | undefined;

  constructor(
    message: string,
    action: string,
    status?: number,
    bodySnippet?: string,
  ) {
    super(message);
    this.name = "CelitechError";
    this.action = action;
    if (status !== undefined) this.status = status;
    if (bodySnippet !== undefined) this.bodySnippet = bodySnippet;
  }
}

// ── Markup helpers (shared between client + router) ───────────────────

/**
 * Apply the configured markup percentage to a wholesale cost. All money
 * is expressed in microdollars (1 USD = 1_000_000 µ$) so we never round
 * floating-point dollars mid-calculation. Matches the domain registrar's
 * helper signature so callers have one mental model across resellers.
 */
export function applyMarkup(
  wholesaleMicrodollars: number,
  markupPercent: number,
): { retailMicrodollars: number; markupMicrodollars: number } {
  const markup = Math.round(
    (wholesaleMicrodollars * markupPercent) / 100,
  );
  return {
    retailMicrodollars: wholesaleMicrodollars + markup,
    markupMicrodollars: markup,
  };
}

/** Parse a USD value ("8.50" or 8.5) into microdollars. */
export function dollarsToMicrodollars(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1_000_000);
}

export function markupPercentFromEnv(): number {
  const raw = process.env["ESIM_MARKUP_PERCENT"];
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 25;
  return parsed;
}

// ── Parsers & normalisers ─────────────────────────────────────────────

function parseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parseDataGb(value: string | number | null | undefined): {
  dataGb: number;
  isUnlimited: boolean;
} {
  if (value === null || value === undefined) return { dataGb: 0, isUnlimited: false };
  if (typeof value === "number") {
    return { dataGb: value >= 0 ? value : 0, isUnlimited: false };
  }
  const trimmed = value.trim();
  if (/unlimited/i.test(trimmed)) return { dataGb: 0, isUnlimited: true };
  const match = trimmed.match(/([0-9]+(?:\.[0-9]+)?)\s*(GB|MB|G|M)?/i);
  if (match?.[1]) {
    const raw = Number.parseFloat(match[1]);
    const unit = (match[2] ?? "GB").toUpperCase();
    if (!Number.isFinite(raw) || raw < 0) return { dataGb: 0, isUnlimited: false };
    if (unit === "MB" || unit === "M") return { dataGb: raw / 1024, isUnlimited: false };
    return { dataGb: raw, isUnlimited: false };
  }
  return { dataGb: 0, isUnlimited: false };
}

function inferRegionType(destination: string | null): "global" | "local" {
  if (!destination) return "global";
  if (destination.length === 2) return "local";
  const lower = destination.toLowerCase();
  if (
    lower === "global" ||
    lower === "worldwide" ||
    lower.startsWith("region")
  ) {
    return "global";
  }
  return "local";
}

function buildPackageTitle(pkg: CelitechPackage): string {
  if (pkg.name && pkg.name.length > 0) return pkg.name;
  const { dataGb, isUnlimited } = parseDataGb(pkg.data);
  const days = Math.round(parseNumber(pkg.day));
  const dataLabel = isUnlimited
    ? "Unlimited"
    : dataGb >= 1
      ? `${dataGb % 1 === 0 ? dataGb.toFixed(0) : dataGb.toFixed(1)} GB`
      : `${Math.round(dataGb * 1024)} MB`;
  const dest = pkg.destination ?? "Travel";
  return days > 0 ? `${dest} ${dataLabel} / ${days} days` : `${dest} ${dataLabel}`;
}

function toSummary(pkg: CelitechPackage): EsimPackageSummary {
  const { dataGb, isUnlimited } = parseDataGb(pkg.data);
  const destination = pkg.destination ?? null;
  const countryCode =
    destination && destination.length === 2 ? destination.toUpperCase() : null;
  return {
    id: pkg.id,
    title: buildPackageTitle(pkg),
    operatorTitle: destination ?? "Crontech eSIM",
    countryCode,
    dataGb,
    validityDays: Math.round(parseNumber(pkg.day)),
    priceUsd: parseNumber(pkg.priceUsd),
    isUnlimited,
    type: inferRegionType(destination),
  };
}

function normaliseInstallFields(
  source: CelitechInstallFields | CelitechPurchase,
): EsimInstallInfo | null {
  const fields: CelitechInstallFields = {
    iccid: source.iccid,
    qrCode: source.qrCode,
    qrCodeUrl: source.qrCodeUrl,
    lpaString: source.lpaString,
    lpa: source.lpa,
    matchingId: source.matchingId,
    smdpAddress: source.smdpAddress,
    activationCode: source.activationCode,
  };
  const hasAny =
    fields.iccid ||
    fields.qrCode ||
    fields.qrCodeUrl ||
    fields.lpaString ||
    fields.lpa ||
    fields.matchingId ||
    fields.smdpAddress ||
    fields.activationCode;
  if (!hasAny) return null;
  return {
    iccid: fields.iccid ?? null,
    lpaString: fields.lpaString ?? fields.lpa ?? fields.activationCode ?? null,
    qrCodeDataUrl: fields.qrCode ?? fields.qrCodeUrl ?? null,
    smdpAddress: fields.smdpAddress ?? null,
    matchingId: fields.matchingId ?? null,
  };
}

// ── Client ────────────────────────────────────────────────────────────

interface TokenState {
  token: string;
  /** Millisecond unix timestamp at which we must refresh. */
  refreshAt: number;
}

export class CelitechClient {
  private readonly config: CelitechConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private tokenState: TokenState | null = null;

  constructor(config: CelitechConfig, deps: CelitechClientDeps = {}) {
    this.config = config;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => Date.now());
  }

  // ── Token handling ────────────────────────────────────────────────

  /**
   * Return a valid bearer token, fetching a fresh one if the cached
   * token is missing or within 30 seconds of its advertised expiry.
   */
  async getAccessToken(): Promise<string> {
    const nowMs = this.now();
    if (this.tokenState && this.tokenState.refreshAt > nowMs) {
      return this.tokenState.token;
    }
    const res = await this.fetchImpl(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (!res.ok) {
      const snippet = await safeReadSnippet(res);
      throw new CelitechError(
        `eSIM provider token exchange failed with HTTP ${res.status}.`,
        "token",
        res.status,
        snippet,
      );
    }
    const json = await res.json();
    const parsed = CelitechTokenResponseSchema.parse(json);
    // Refresh 30s before advertised expiry to dodge clock skew.
    const ttlMs = Math.max(0, (parsed.expires_in - 30) * 1000);
    this.tokenState = {
      token: parsed.access_token,
      refreshAt: nowMs + ttlMs,
    };
    return parsed.access_token;
  }

  private async request(
    path: string,
    init: RequestInit & { action: string },
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (init.body !== undefined && headers["Content-Type"] === undefined) {
      headers["Content-Type"] = "application/json";
    }
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!res.ok) {
      const snippet = await safeReadSnippet(res);
      throw new CelitechError(
        `eSIM provider ${init.action} request failed with HTTP ${res.status}.`,
        init.action,
        res.status,
        snippet,
      );
    }
    return res.json();
  }

  // ── Typed wrappers ────────────────────────────────────────────────

  /**
   * List buyable packages. `filter.countryCode` narrows to a single
   * destination (ISO-3166 two-letter code), `filter.region` narrows to a
   * region group, and `filter.dataGb` is an advisory hint we pass through
   * when the upstream accepts it.
   */
  async listPackages(filter: {
    countryCode?: string;
    region?: string;
    dataGb?: number;
  } = {}): Promise<EsimPackageSummary[]> {
    const query = new URLSearchParams();
    if (filter.countryCode) query.set("destination", filter.countryCode);
    else if (filter.region) query.set("destination", filter.region);
    if (filter.dataGb !== undefined && filter.dataGb > 0) {
      query.set("dataGb", String(filter.dataGb));
    }
    const qs = query.toString();
    const path = `/packages${qs ? `?${qs}` : ""}`;
    const raw = await this.request(path, { method: "GET", action: "listPackages" });
    const parsed = CelitechPackagesResponseSchema.parse(raw);
    return parsed.packages.map(toSummary);
  }

  /**
   * Fetch a single package by id. The upstream does not expose a per-id
   * detail endpoint, so we scan the full list + pull the matching record.
   */
  async getPackage(id: string): Promise<EsimPackageSummary | null> {
    const all = await this.listPackages();
    return all.find((p) => p.id === id) ?? null;
  }

  /** Submit a purchase for a single copy of a package. */
  async createPurchase(input: {
    packageId: string;
    quantity?: number;
    networkBrand?: string;
  }): Promise<CelitechPurchase> {
    const body: {
      packageId: string;
      quantity: number;
      networkBrand?: string;
    } = {
      packageId: input.packageId,
      quantity: input.quantity ?? 1,
    };
    if (input.networkBrand !== undefined) body.networkBrand = input.networkBrand;
    const raw = await this.request("/purchases", {
      method: "POST",
      body: JSON.stringify(body),
      action: "createPurchase",
    });
    const parsed = CelitechPurchaseResponseSchema.parse(raw);
    return parsed.purchase;
  }

  /** List every purchase we've ever placed for this partner account. */
  async listPurchases(): Promise<CelitechPurchase[]> {
    const raw = await this.request("/purchases", {
      method: "GET",
      action: "listPurchases",
    });
    const parsed = CelitechPurchaseListResponseSchema.parse(raw);
    return parsed.purchases;
  }

  /** Fetch a single purchase by id. */
  async getPurchase(input: { id: string }): Promise<CelitechPurchase | null> {
    const raw = await this.request(
      `/purchases/${encodeURIComponent(input.id)}`,
      { method: "GET", action: "getPurchase" },
    );
    const envelope = z
      .object({ purchase: CelitechPurchaseSchema })
      .passthrough()
      .safeParse(raw);
    if (envelope.success) return envelope.data.purchase;
    const direct = CelitechPurchaseSchema.safeParse(raw);
    if (direct.success) return direct.data;
    return null;
  }

  /**
   * Fetch the install bundle (QR code + LPA activation string) for a
   * previously-placed purchase. We normalise to a single record since
   * every Crontech purchase buys exactly one eSIM for v1.
   */
  async getInstallInfo(purchaseId: string): Promise<EsimInstallInfo | null> {
    const purchase = await this.getPurchase({ id: purchaseId });
    if (!purchase) return null;
    if (purchase.esim) {
      const fromEsim = normaliseInstallFields(purchase.esim);
      if (fromEsim) return fromEsim;
    }
    return normaliseInstallFields(purchase);
  }
}

// ── Internals ─────────────────────────────────────────────────────────

async function safeReadSnippet(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}

