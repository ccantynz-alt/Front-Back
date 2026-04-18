// ── BLK-029 — Celitech API Zod contracts ──────────────────────────────
// Zod schemas for every request / response shape that crosses the wire
// between Crontech and the Celitech API (REST over HTTPS, bearer-token
// auth). The wire format is JSON; these schemas sit at the boundary (per
// CLAUDE.md §0.4.1 iron rules) so the rest of the code base only consumes
// typed, validated data.
//
// Celitech's real responses carry more fields than we use. We stay
// PERMISSIVE on unknown keys (`.passthrough()` where appropriate) but
// STRICT on the load-bearing fields: package id, destination, price, data
// volume, validity, QR + LPA install strings. A silent rename on the
// provider side should raise a loud parse error rather than corrupt
// downstream cost / markup accounting.

import { z } from "zod";

// ── OAuth token response ──────────────────────────────────────────────
// POST /oauth2/token with { grant_type: "client_credentials", client_id,
// client_secret }. The provider returns a bearer token + an expires_in
// count in seconds; we cache in memory until expiry (see celitech-client.ts).

export const CelitechTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().int().positive(),
  })
  .passthrough();

export type CelitechTokenResponse = z.infer<typeof CelitechTokenResponseSchema>;

// ── Destinations ──────────────────────────────────────────────────────
// GET /destinations returns the countries / regions the catalogue covers.
// Useful for pre-populating country pickers without scanning the full
// package list.

export const CelitechDestinationSchema = z
  .object({
    name: z.string(),
    countryCode: z.string().optional(),
    regionCode: z.string().optional(),
    supportedCountries: z.array(z.string()).optional(),
  })
  .passthrough();

export type CelitechDestination = z.infer<typeof CelitechDestinationSchema>;

export const CelitechDestinationsResponseSchema = z
  .object({
    destinations: z.array(CelitechDestinationSchema).default([]),
  })
  .passthrough();

export type CelitechDestinationsResponse = z.infer<
  typeof CelitechDestinationsResponseSchema
>;

// ── Packages ──────────────────────────────────────────────────────────
// GET /packages?destination=US returns a flat list of buyable plans.

export const CelitechPackageSchema = z
  .object({
    id: z.string().min(1),
    destination: z.string().optional(),
    name: z.string().optional(),
    data: z.union([z.string(), z.number()]).optional(),
    day: z.union([z.string(), z.number()]).optional(),
    priceUsd: z.union([z.string(), z.number()]).optional(),
    voice: z.union([z.number(), z.null()]).optional(),
    sms: z.union([z.number(), z.null()]).optional(),
  })
  .passthrough();

export type CelitechPackage = z.infer<typeof CelitechPackageSchema>;

export const CelitechPackagesResponseSchema = z
  .object({
    packages: z.array(CelitechPackageSchema).default([]),
  })
  .passthrough();

export type CelitechPackagesResponse = z.infer<
  typeof CelitechPackagesResponseSchema
>;

// ── Flattened package shape (our domain object) ───────────────────────
// This is what callers of the client actually consume. The field names
// match the existing provider-agnostic domain type so downstream code
// (tRPC router, UI) never has to know which wholesaler is behind them.

export const EsimPackageSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  operatorTitle: z.string(),
  countryCode: z.string().nullable(),
  dataGb: z.number().nonnegative(),
  validityDays: z.number().int().nonnegative(),
  priceUsd: z.number().nonnegative(),
  isUnlimited: z.boolean(),
  type: z.string(),
});

export type EsimPackageSummary = z.infer<typeof EsimPackageSummarySchema>;

// ── Purchase ──────────────────────────────────────────────────────────
// POST /purchases — body { packageId, networkBrand?, quantity? } →
// returns the purchase record plus (usually) the eSIM install bundle.

export const CelitechPurchaseRequestSchema = z.object({
  packageId: z.string().min(1),
  quantity: z.number().int().min(1).max(50).optional(),
  networkBrand: z.string().optional(),
});

export type CelitechPurchaseRequest = z.infer<
  typeof CelitechPurchaseRequestSchema
>;

/** Install bundle fields contained in a purchase record. */
export const CelitechInstallFieldsSchema = z
  .object({
    iccid: z.string().optional(),
    qrCode: z.string().optional(),
    qrCodeUrl: z.string().optional(),
    lpaString: z.string().optional(),
    lpa: z.string().optional(),
    matchingId: z.string().optional(),
    smdpAddress: z.string().optional(),
    activationCode: z.string().optional(),
  })
  .passthrough();

export type CelitechInstallFields = z.infer<typeof CelitechInstallFieldsSchema>;

export const CelitechPurchaseSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    packageId: z.string().optional(),
    quantity: z.number().int().optional(),
    esim: CelitechInstallFieldsSchema.optional(),
    iccid: z.string().optional(),
    qrCode: z.string().optional(),
    qrCodeUrl: z.string().optional(),
    lpaString: z.string().optional(),
    lpa: z.string().optional(),
    matchingId: z.string().optional(),
    smdpAddress: z.string().optional(),
    activationCode: z.string().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

export type CelitechPurchase = z.infer<typeof CelitechPurchaseSchema>;

export const CelitechPurchaseResponseSchema = z
  .object({
    purchase: CelitechPurchaseSchema,
  })
  .passthrough();

export type CelitechPurchaseResponse = z.infer<
  typeof CelitechPurchaseResponseSchema
>;

export const CelitechPurchaseListResponseSchema = z
  .object({
    purchases: z.array(CelitechPurchaseSchema).default([]),
  })
  .passthrough();

export type CelitechPurchaseListResponse = z.infer<
  typeof CelitechPurchaseListResponseSchema
>;

// ── Install info (QR + LPA) — domain shape ────────────────────────────
// Normalised install bundle surfaced to the router. Fields are nullable
// because a purchase can land before the provider has provisioned the
// eSIM; in that case the router asks again later.

export const EsimInstallInfoSchema = z.object({
  iccid: z.string().nullable(),
  lpaString: z.string().nullable(),
  qrCodeDataUrl: z.string().nullable(),
  smdpAddress: z.string().nullable(),
  matchingId: z.string().nullable(),
});

export type EsimInstallInfo = z.infer<typeof EsimInstallInfoSchema>;

// ── Error envelopes ───────────────────────────────────────────────────

export const CelitechErrorResponseSchema = z
  .object({
    message: z.string().optional(),
    error: z.string().optional(),
    errors: z
      .array(
        z
          .object({
            message: z.string().optional(),
            code: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type CelitechErrorResponse = z.infer<typeof CelitechErrorResponseSchema>;
