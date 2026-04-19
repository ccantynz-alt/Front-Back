// ── BLK-024 — OpenSRS Reseller API Zod contracts ──────────────────────
// Zod schemas for every request / response shape that crosses the
// wire between Crontech and the OpenSRS Reseller API (Tucows). The
// OpenSRS wire format is XML, but the public TypeScript surface is
// plain objects — these schemas sit at that boundary so we can trust
// the rest of the code to consume typed, validated data.
//
// Rule of thumb (from CLAUDE.md §0.4.1 iron rules): Zod at every
// boundary. Raw strings from OpenSRS are parsed into a JS object by
// the client, then immediately validated here before we hand it back
// to callers.
//
// We intentionally keep the schemas PERMISSIVE on fields that OpenSRS
// adds over time (unknown keys passed through without crashing) but
// STRICT on the shapes we rely on (status, taken/available verdict,
// price amounts, expiry dates). If OpenSRS ever renames a load-bearing
// field, we prefer a loud parse failure over silent data corruption.

import { z } from "zod";

// ── Core primitives ───────────────────────────────────────────────────

/**
 * Every OpenSRS response envelope carries a protocol field, an action,
 * an `is_success` flag (0/1), and a response_code + response_text for
 * human-readable diagnostics. The `attributes` object holds the
 * action-specific payload.
 */
export const OpensrsEnvelopeSchema = z.object({
  protocol: z.string().optional(),
  action: z.string().optional(),
  object: z.string().optional(),
  is_success: z.union([z.literal("0"), z.literal("1"), z.boolean()]),
  response_code: z.union([z.string(), z.number()]).optional(),
  response_text: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export type OpensrsEnvelope = z.infer<typeof OpensrsEnvelopeSchema>;

/** Helper: `is_success` comes back as "1"/"0" OR a boolean depending on the parser. */
export function isOpensrsSuccess(env: OpensrsEnvelope): boolean {
  const v = env.is_success;
  return v === true || v === "1";
}

// ── LOOKUP (availability) ─────────────────────────────────────────────
// Attribute shape per OpenSRS reseller docs: { status: "available" |
// "taken" | "invalid" | "registered_other_registrar", domain: string }

export const OpensrsLookupAttributesSchema = z.object({
  status: z.enum([
    "available",
    "taken",
    "invalid",
    "registered_other_registrar",
    "unknown",
  ]),
  domain: z.string().optional(),
  reason: z.string().optional(),
  email_address: z.string().optional(),
});

export type OpensrsLookupAttributes = z.infer<typeof OpensrsLookupAttributesSchema>;

// ── WHOIS ──────────────────────────────────────────────────────────────
// OpenSRS returns a dictionary of WHOIS fields that vary per TLD. We
// expose the common ones explicitly and preserve the rest as passthrough
// for callers that need the raw registrant / admin / tech contact data.

export const OpensrsContactSchema = z
  .object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    org_name: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postal_code: z.string().optional(),
    phone: z.string().optional(),
    fax: z.string().optional(),
    email: z.string().optional(),
  })
  .passthrough();

export type OpensrsContact = z.infer<typeof OpensrsContactSchema>;

export const OpensrsWhoisAttributesSchema = z
  .object({
    domain: z.string().optional(),
    registry_expiredate: z.string().optional(),
    registry_createdate: z.string().optional(),
    registry_updatedate: z.string().optional(),
    owner: OpensrsContactSchema.optional(),
    admin: OpensrsContactSchema.optional(),
    tech: OpensrsContactSchema.optional(),
    billing: OpensrsContactSchema.optional(),
    nameservers: z.array(z.string()).optional(),
  })
  .passthrough();

export type OpensrsWhoisAttributes = z.infer<typeof OpensrsWhoisAttributesSchema>;

// ── GET_PRICE ──────────────────────────────────────────────────────────
// OpenSRS returns wholesale price in USD as a string (e.g. "8.99"). We
// parse it to a number, then callers apply markup separately.

export const OpensrsGetPriceAttributesSchema = z.object({
  price: z.union([z.string(), z.number()]),
  is_available: z.union([z.literal("0"), z.literal("1"), z.boolean()]).optional(),
  is_registry_premium: z.union([z.literal("0"), z.literal("1"), z.boolean()]).optional(),
  currency: z.string().optional(),
});

export type OpensrsGetPriceAttributes = z.infer<typeof OpensrsGetPriceAttributesSchema>;

// ── SW_REGISTER ────────────────────────────────────────────────────────
// Successful registration returns the OpenSRS "order id" (used for
// follow-up calls like status lookups and renewals) and the new expiry.

export const OpensrsRegisterAttributesSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    order_id: z.union([z.string(), z.number()]).optional(),
    registration_expiration_date: z.string().optional(),
    registration_text: z.string().optional(),
    admin_email: z.string().optional(),
    transfer_id: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type OpensrsRegisterAttributes = z.infer<typeof OpensrsRegisterAttributesSchema>;

// ── RENEW ──────────────────────────────────────────────────────────────

export const OpensrsRenewAttributesSchema = z
  .object({
    order_id: z.union([z.string(), z.number()]).optional(),
    admin_email: z.string().optional(),
    registration_expiration_date: z.string().optional(),
    auto_renew: z.union([z.literal("0"), z.literal("1"), z.boolean()]).optional(),
  })
  .passthrough();

export type OpensrsRenewAttributes = z.infer<typeof OpensrsRenewAttributesSchema>;

// ── PROCESS_TRANSFER / transfer initiation ────────────────────────────

export const OpensrsTransferAttributesSchema = z
  .object({
    order_id: z.union([z.string(), z.number()]).optional(),
    transfer_id: z.union([z.string(), z.number()]).optional(),
    queue_request_id: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type OpensrsTransferAttributes = z.infer<typeof OpensrsTransferAttributesSchema>;

// ── Public client input shapes ────────────────────────────────────────

/** The minimum contact block OpenSRS needs to register a domain. */
export const ContactInfoSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  orgName: z.string().optional(),
  address1: z.string().min(1),
  address2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().length(2, "Country must be an ISO-3166 two-letter code."),
  postalCode: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
});

export type ContactInfo = z.infer<typeof ContactInfoSchema>;

/** A single availability result bubbled up to callers. */
export const AvailabilityResultSchema = z.object({
  domain: z.string(),
  available: z.boolean(),
  status: OpensrsLookupAttributesSchema.shape.status,
  reason: z.string().optional(),
});

export type AvailabilityResult = z.infer<typeof AvailabilityResultSchema>;

/** Price quote after wholesale + markup has been applied. */
export const PriceQuoteSchema = z.object({
  domain: z.string(),
  years: z.number().int().positive(),
  wholesaleMicrodollars: z.number().int().nonnegative(),
  retailMicrodollars: z.number().int().nonnegative(),
  markupMicrodollars: z.number().int().nonnegative(),
  markupPercent: z.number().nonnegative(),
  currency: z.string(),
});

export type PriceQuote = z.infer<typeof PriceQuoteSchema>;
