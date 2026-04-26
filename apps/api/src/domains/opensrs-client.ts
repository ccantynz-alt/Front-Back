// ── BLK-024 — OpenSRS Reseller API client ─────────────────────────────
// Thin HTTP client for the Tucows OpenSRS Reseller API (XML-over-HTTPS
// with an MD5 signature header for auth). Exposes a small, typed surface
// — `lookup`, `whois`, `register`, `renew`, `transfer`, `getPrice` —
// so callers (the tRPC router, admin CLIs, etc.) never have to think
// about the XML wire format.
//
// The client is dependency-injected: pass a custom `fetch` (or `now`)
// for tests. In production we default to the platform `fetch` and the
// creds live in `OPENSRS_USER` / `OPENSRS_KEY` / `OPENSRS_HOST`.
//
// Signature algorithm (per OpenSRS docs):
//     md5( md5(body + key) + key )
// The signature is sent in the `X-Signature` header alongside the
// `X-Username` header; the body is the raw XML document.
//
// Iron rules honoured (CLAUDE.md §0.4.1):
//   • Zod at the boundary — every response is parsed before it leaves
//     this module.
//   • TS strict — no `any`, no `@ts-ignore`, no silenced errors.
//   • Dependency-injected fetch so tests never hit the network.
//   • Polite error text — tone rules apply to runtime messages the UI
//     might surface.

import { createHash } from "node:crypto";
import {
  OpensrsEnvelopeSchema,
  OpensrsLookupAttributesSchema,
  OpensrsWhoisAttributesSchema,
  OpensrsGetPriceAttributesSchema,
  OpensrsRegisterAttributesSchema,
  OpensrsRenewAttributesSchema,
  OpensrsTransferAttributesSchema,
  isOpensrsSuccess,
  type OpensrsEnvelope,
  type OpensrsLookupAttributes,
  type OpensrsWhoisAttributes,
  type OpensrsGetPriceAttributes,
  type OpensrsRegisterAttributes,
  type OpensrsRenewAttributes,
  type OpensrsTransferAttributes,
  type ContactInfo,
} from "./opensrs-types";

// ── Config ────────────────────────────────────────────────────────────

export interface OpensrsConfig {
  /** Reseller username. `OPENSRS_USER` in the environment. */
  user: string;
  /** Reseller private key. `OPENSRS_KEY` in the environment. */
  key: string;
  /** API endpoint. Defaults to the Tucows test host. */
  host: string;
}

export interface OpensrsClientDeps {
  fetchImpl?: typeof fetch;
  /** Override the current time — used so tests can get deterministic output. */
  now?: () => number;
}

/** Construct config from the standard environment variables. */
export function configFromEnv(): OpensrsConfig {
  const user = process.env["OPENSRS_USER"] ?? "";
  const key = process.env["OPENSRS_KEY"] ?? "";
  const host =
    process.env["OPENSRS_HOST"] ?? "https://rr-n1-tomweb.opensrs.net:55443";
  return { user, key, host };
}

// ── OpensrsError ──────────────────────────────────────────────────────
// Thrown whenever the API returns a non-success envelope OR the HTTP
// layer fails. Callers can inspect `code` to distinguish operational
// failures (e.g. duplicate registration) from infrastructure failures.

export class OpensrsError extends Error {
  public readonly code: string | number | undefined;
  public readonly action: string;
  public readonly envelope: OpensrsEnvelope | undefined;

  constructor(
    message: string,
    action: string,
    code?: string | number,
    envelope?: OpensrsEnvelope,
  ) {
    super(message);
    this.name = "OpensrsError";
    this.action = action;
    if (code !== undefined) this.code = code;
    if (envelope !== undefined) this.envelope = envelope;
  }
}

// ── XML helpers ───────────────────────────────────────────────────────
// Hand-rolled encoder / decoder for the subset of XML OpenSRS uses. We
// don't reach for a full DOM parser because the wire format is a tiny
// opaque-key-value tree and we want zero runtime dependencies.

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type OpensrsValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | OpensrsValue[]
  | { [key: string]: OpensrsValue };

/**
 * Encode a plain JS value as OpenSRS <dt_assoc>/<dt_array>/<item>
 * elements. OpenSRS uses a specific document dialect:
 *   <dt_assoc>  → object  (each child is <item key="name">VALUE</item>)
 *   <dt_array>  → array   (each child is <item key="index">VALUE</item>)
 *   scalar      → raw text content of <item>
 */
function encodeValue(value: OpensrsValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return xmlEscape(value);
  if (typeof value === "number") return xmlEscape(String(value));
  if (typeof value === "boolean") return xmlEscape(value ? "1" : "0");
  if (Array.isArray(value)) {
    const items = value
      .map(
        (v, i) =>
          `<item key="${i}">${encodeValueWrapper(v)}</item>`,
      )
      .join("");
    return `<dt_array>${items}</dt_array>`;
  }
  // object
  const items = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .map(
      ([k, v]) =>
        `<item key="${xmlEscape(k)}">${encodeValueWrapper(v)}</item>`,
    )
    .join("");
  return `<dt_assoc>${items}</dt_assoc>`;
}

/**
 * Scalars live as text directly inside the <item> element; nested
 * assoc/array values live as children. This wrapper handles both.
 */
function encodeValueWrapper(value: OpensrsValue): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return encodeValue(value);
  }
  return encodeValue(value);
}

/**
 * Build the full OpenSRS XML envelope for a given action + attributes.
 * The shape is documented in the OpenSRS reseller API reference —
 * briefly, it's an <OPS_envelope> wrapping a <body> that contains a
 * single <data_block> with the usual assoc tree.
 */
export function buildRequestBody(
  action: string,
  object: string,
  attributes: Record<string, OpensrsValue>,
  extras: Record<string, OpensrsValue> = {},
): string {
  const payload: Record<string, OpensrsValue> = {
    protocol: "XCP",
    action,
    object,
    attributes,
    ...extras,
  };
  const inner = encodeValue(payload);
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE OPS_envelope SYSTEM "ops.dtd">',
    "<OPS_envelope>",
    "<header><version>0.9</version></header>",
    `<body><data_block>${inner}</data_block></body>`,
    "</OPS_envelope>",
  ].join("");
}

/**
 * Decode the OpenSRS response XML back into a plain JS object. We walk
 * the document with a tiny tag tokenizer — enough to cover <dt_assoc>,
 * <dt_array>, and <item key="..."> nodes with either text or nested
 * children. This intentionally does NOT try to be a general XML parser.
 */
export function parseResponseBody(xml: string): unknown {
  // Strip the declaration + doctype + envelope wrappers, leave the
  // inner <data_block> payload. We then walk tokens.
  const dataBlockMatch = xml.match(/<data_block>([\s\S]*?)<\/data_block>/);
  if (!dataBlockMatch) {
    throw new OpensrsError(
      "OpenSRS response was missing the data_block payload.",
      "parse",
    );
  }
  const body = dataBlockMatch[1] ?? "";
  const { value } = parseNode(body, 0);
  return value;
}

interface ParseResult {
  value: unknown;
  end: number;
}

function parseNode(src: string, start: number): ParseResult {
  // Skip whitespace + comments
  let i = start;
  while (i < src.length && /\s/.test(src[i] ?? "")) i++;

  if (src.startsWith("<dt_assoc>", i)) {
    return parseAssoc(src, i + "<dt_assoc>".length);
  }
  if (src.startsWith("<dt_array>", i)) {
    return parseArray(src, i + "<dt_array>".length);
  }
  // Scalar — nothing else wraps a value.
  return { value: "", end: i };
}

function parseAssoc(src: string, start: number): ParseResult {
  const out: Record<string, unknown> = {};
  let i = start;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i] ?? "")) i++;
    if (src.startsWith("</dt_assoc>", i)) {
      return { value: out, end: i + "</dt_assoc>".length };
    }
    if (!src.startsWith("<item", i)) {
      // Unknown element — advance one char so we don't loop forever.
      i += 1;
      continue;
    }
    const tagEnd = src.indexOf(">", i);
    if (tagEnd === -1) break;
    const tag = src.slice(i, tagEnd + 1);
    const keyMatch = tag.match(/key="([^"]*)"/);
    const key = keyMatch ? xmlUnescape(keyMatch[1] ?? "") : "";
    const contentStart = tagEnd + 1;
    const closeIdx = findMatchingClose(src, "<item", "</item>", contentStart);
    if (closeIdx === -1) break;
    const inner = src.slice(contentStart, closeIdx);
    out[key] = parseItemContent(inner);
    i = closeIdx + "</item>".length;
  }
  return { value: out, end: i };
}

function parseArray(src: string, start: number): ParseResult {
  const out: unknown[] = [];
  let i = start;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i] ?? "")) i++;
    if (src.startsWith("</dt_array>", i)) {
      return { value: out, end: i + "</dt_array>".length };
    }
    if (!src.startsWith("<item", i)) {
      i += 1;
      continue;
    }
    const tagEnd = src.indexOf(">", i);
    if (tagEnd === -1) break;
    const contentStart = tagEnd + 1;
    const closeIdx = findMatchingClose(src, "<item", "</item>", contentStart);
    if (closeIdx === -1) break;
    const inner = src.slice(contentStart, closeIdx);
    out.push(parseItemContent(inner));
    i = closeIdx + "</item>".length;
  }
  return { value: out, end: i };
}

/**
 * An <item> may contain either a scalar (plain text) or one nested
 * <dt_assoc>/<dt_array>. We detect which and dispatch.
 */
function parseItemContent(inner: string): unknown {
  const trimmed = inner.trim();
  if (trimmed.startsWith("<dt_assoc>")) {
    return parseAssoc(trimmed, "<dt_assoc>".length).value;
  }
  if (trimmed.startsWith("<dt_array>")) {
    return parseArray(trimmed, "<dt_array>".length).value;
  }
  return xmlUnescape(trimmed);
}

function findMatchingClose(
  src: string,
  openTagPrefix: string,
  closeTag: string,
  from: number,
): number {
  let depth = 1;
  let i = from;
  while (i < src.length) {
    const nextOpen = src.indexOf(openTagPrefix, i);
    const nextClose = src.indexOf(closeTag, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Only count it as an open if it's a real tag boundary
      const ch = src[nextOpen + openTagPrefix.length];
      if (ch === " " || ch === ">" || ch === "\t" || ch === "\n") {
        depth += 1;
      }
      i = nextOpen + openTagPrefix.length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose;
    i = nextClose + closeTag.length;
  }
  return -1;
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// ── Signature ─────────────────────────────────────────────────────────

export function signRequest(body: string, key: string): string {
  const inner = createHash("md5").update(body + key).digest("hex");
  return createHash("md5").update(inner + key).digest("hex");
}

// ── Core transport ────────────────────────────────────────────────────

export class OpensrsClient {
  private readonly config: OpensrsConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpensrsConfig, deps: OpensrsClientDeps = {}) {
    this.config = config;
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  /**
   * Issue a single raw OpenSRS call. Callers typically prefer the
   * typed wrappers (`lookup`, `register`, …) below.
   */
  async call(
    action: string,
    object: string,
    attributes: Record<string, OpensrsValue>,
    extras: Record<string, OpensrsValue> = {},
  ): Promise<OpensrsEnvelope> {
    const body = buildRequestBody(action, object, attributes, extras);
    const signature = signRequest(body, this.config.key);
    const res = await this.fetchImpl(this.config.host, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-Username": this.config.user,
        "X-Signature": signature,
        "Content-Length": String(Buffer.byteLength(body, "utf8")),
      },
      body,
    });

    if (!res.ok) {
      throw new OpensrsError(
        `OpenSRS request for ${action} failed with HTTP ${res.status}.`,
        action,
        res.status,
      );
    }
    const text = await res.text();
    const parsed = parseResponseBody(text);
    const envelope = OpensrsEnvelopeSchema.parse(parsed);
    if (!isOpensrsSuccess(envelope)) {
      throw new OpensrsError(
        envelope.response_text ??
          `OpenSRS returned an unsuccessful response for ${action}.`,
        action,
        envelope.response_code,
        envelope,
      );
    }
    return envelope;
  }

  // ── Typed wrappers ──────────────────────────────────────────────────

  /** Check whether a single domain is available for registration. */
  async lookup(domain: string): Promise<OpensrsLookupAttributes> {
    const env = await this.call("LOOKUP", "DOMAIN", { domain });
    return OpensrsLookupAttributesSchema.parse(env.attributes ?? {});
  }

  /** Fetch WHOIS data for a domain in the reseller's account. */
  async whois(domain: string): Promise<OpensrsWhoisAttributes> {
    const env = await this.call("GET", "DOMAIN", {
      domain,
      type: "all_info",
    });
    return OpensrsWhoisAttributesSchema.parse(env.attributes ?? {});
  }

  /** Get the wholesale price for a single domain + period. */
  async getPrice(
    domain: string,
    years: number,
  ): Promise<OpensrsGetPriceAttributes> {
    const env = await this.call("GET_PRICE", "DOMAIN", {
      domain,
      period: years,
    });
    return OpensrsGetPriceAttributesSchema.parse(env.attributes ?? {});
  }

  /**
   * Register a new domain for the reseller. `contact` is copied into
   * all four WHOIS contact slots (owner/admin/tech/billing) — callers
   * that need separate contacts should use `registerWithContacts`.
   */
  async register(input: {
    domain: string;
    years: number;
    contact: ContactInfo;
    nameservers?: string[];
    customerHandle?: string;
  }): Promise<OpensrsRegisterAttributes> {
    const { domain, years, contact, nameservers, customerHandle } = input;
    const c = contactToOpensrs(contact);
    const attributes: Record<string, OpensrsValue> = {
      domain,
      period: years,
      reg_type: "new",
      contact_set: { owner: c, admin: c, billing: c, tech: c },
      custom_nameservers: nameservers && nameservers.length > 0 ? 1 : 0,
      reg_username: customerHandle ?? "",
      reg_password: randomPassword(),
      handle: "process",
    };
    if (nameservers && nameservers.length > 0) {
      attributes["nameserver_list"] = nameservers.map((n, i) => ({
        sortorder: i + 1,
        name: n,
      }));
    }
    const env = await this.call("SW_REGISTER", "DOMAIN", attributes);
    return OpensrsRegisterAttributesSchema.parse(env.attributes ?? {});
  }

  /** Renew an existing domain for N years. */
  async renew(input: {
    domain: string;
    years: number;
    currentExpiration?: string;
    autoRenew?: boolean;
  }): Promise<OpensrsRenewAttributes> {
    const { domain, years, currentExpiration, autoRenew } = input;
    const attributes: Record<string, OpensrsValue> = {
      domain,
      period: years,
      handle: "process",
      auto_renew: autoRenew ? 1 : 0,
    };
    if (currentExpiration) {
      attributes["currentexpirationyear"] = currentExpiration;
    }
    const env = await this.call("RENEW", "DOMAIN", attributes);
    return OpensrsRenewAttributesSchema.parse(env.attributes ?? {});
  }

  /** Kick off a transfer-in for a domain held at another registrar. */
  async transfer(input: {
    domain: string;
    authCode: string;
    contact: ContactInfo;
  }): Promise<OpensrsTransferAttributes> {
    const c = contactToOpensrs(input.contact);
    const env = await this.call("SW_REGISTER", "DOMAIN", {
      domain: input.domain,
      reg_type: "transfer",
      domain_auth_info: input.authCode,
      period: 1,
      contact_set: { owner: c, admin: c, billing: c, tech: c },
      handle: "process",
    });
    return OpensrsTransferAttributesSchema.parse(env.attributes ?? {});
  }
}

// ── Helpers used by the typed wrappers ────────────────────────────────

function contactToOpensrs(c: ContactInfo): Record<string, OpensrsValue> {
  const out: Record<string, OpensrsValue> = {
    first_name: c.firstName,
    last_name: c.lastName,
    address1: c.address1,
    city: c.city,
    state: c.state,
    country: c.country,
    postal_code: c.postalCode,
    phone: c.phone,
    email: c.email,
  };
  if (c.orgName !== undefined) out["org_name"] = c.orgName;
  if (c.address2 !== undefined) out["address2"] = c.address2;
  return out;
}

/** Non-cryptographic password stand-in for the reg_password slot. */
function randomPassword(): string {
  const chars =
    "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 16; i++) {
    const idx = crypto.getRandomValues(new Uint32Array(1))[0]! % chars.length;
    out += chars[idx];
  }
  return out;
}

// ── Markup helper (shared between client + router) ────────────────────

/**
 * Apply the configured markup percentage to a wholesale cost. Expressed
 * in microdollars (1 USD = 1_000_000 µ$) so we never have to round
 * floating-point dollars mid-calculation.
 */
export function applyMarkup(
  wholesaleMicrodollars: number,
  markupPercent: number,
): { retailMicrodollars: number; markupMicrodollars: number } {
  const markup = Math.round((wholesaleMicrodollars * markupPercent) / 100);
  return {
    retailMicrodollars: wholesaleMicrodollars + markup,
    markupMicrodollars: markup,
  };
}

/** Parse an OpenSRS dollar string ("8.99") into microdollars. */
export function dollarsToMicrodollars(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1_000_000);
}

export function markupPercentFromEnv(): number {
  const raw = process.env["DOMAIN_MARKUP_PERCENT"];
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 20;
  return parsed;
}
