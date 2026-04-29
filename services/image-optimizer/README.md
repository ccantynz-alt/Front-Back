# @back-to-the-future/image-optimizer

On-demand image transformation service with content-addressable edge caching.

Crontech's image pipeline is faster than Vercel's because every transform is content-addressed and stored at the edge — a cache hit costs zero CPU, the source is never re-fetched, and the bytes ship from the closest PoP.

## Endpoint

```
GET /transform?src=<url>&w=&h=&q=&fmt=&fit=&blur=&dpr=
```

### Query parameters

| Param  | Type    | Range / Values                                       | Default | Notes |
|--------|---------|------------------------------------------------------|---------|-------|
| `src`  | URL     | absolute http(s)                                     | —       | Required. Must be on the tenant's allowlist. |
| `w`    | int     | 1..8000                                              | —       | Pre-DPR. |
| `h`    | int     | 1..8000                                              | —       | Pre-DPR. |
| `q`    | int     | 1..100                                               | 80      | Encoder quality. |
| `fmt`  | enum    | `webp`, `avif`, `jpeg`, `png`                        | (auto)  | If absent, negotiated from `Accept`. |
| `fit`  | enum    | `cover`, `contain`, `fill`, `inside`, `outside`      | `cover` | Sharp resize fit mode. |
| `blur` | float   | 0..100                                               | 0       | Gaussian blur sigma. |
| `dpr`  | float   | 1..4                                                 | 1       | Multiplies `w`/`h`; result is clamped to 8000×8000. |

### Headers

- `Accept` — drives format negotiation (see below).
- `X-Tenant-Id` — selects the per-tenant allowlist; falls back to the configured `defaultTenant`.

### Response headers

- `Content-Type` — final output mime (`image/avif`, etc.).
- `X-Cache` — `HIT` or `MISS`.
- `X-Cache-Key` — hex sha256, useful for purge tooling.
- `Cache-Control: public, max-age=31536000, immutable` — outputs are content-addressed, so they're forever-cacheable.

## Format negotiation

Resolution order:

1. Explicit `?fmt=` wins.
2. Otherwise the first match in the client's `Accept` header from this preference list: **AVIF → WebP → JPEG → PNG**.
3. A wildcard `*/*` or `image/*` is treated as "use the best modern format" → AVIF.
4. If `Accept` gives nothing, fall back to the source's content-type when it's a supported output format.
5. Final fallback: WebP.

## Cache key derivation

```
key = sha256(canonical(params) + "|" + sourceETag + "|" + outputFormat)
```

Where `canonical(params)` is a stable JSON encoding of the validated query params (sorted keys, absent optionals omitted). The cache key includes:

- The canonicalised transform params (so `?w=200&h=100` and `?h=100&w=200` collide on purpose).
- The **source's ETag**, so when an upstream image changes, its key changes — no stale bytes. If the source omits an ETag, we substitute a sha256 of the source bytes.
- The chosen output format, so an AVIF and a WebP version of the same source live under separate keys.

## Allowlist (SSRF prevention)

We **never** proxy arbitrary URLs. Each tenant declares an explicit list of host patterns:

```jsonc
{
  "tenants": {
    "acme":     ["cdn.acme.com", "*.acme-static.com"],
    "widgetco": ["images.widgetco.io:443"]
  },
  "defaultTenant": "acme"
}
```

Patterns:

- `example.com` — exact host match.
- `*.example.com` — any subdomain (`a.example.com`, `a.b.example.com`); does **not** match the apex.
- `host:port` — exact host AND port.

Requests that don't carry `X-Tenant-Id` use `defaultTenant`. If neither is set, the request is rejected with `403 SOURCE_NOT_ALLOWED`.

## DPR

`?dpr=2` doubles the requested `w`/`h` server-side, then clamps to the 8000×8000 hard cap. The DPR value is part of the cache key, so retina and 1× variants are stored separately.

## Environment variables

| Var                          | Description                                                                  | Default       |
|------------------------------|------------------------------------------------------------------------------|---------------|
| `IMAGE_OPT_PORT`             | Listen port.                                                                 | `3055`        |
| `IMAGE_OPT_ALLOWLIST`        | JSON: `{"tenants":{…},"defaultTenant":…}`. See above.                        | `{"tenants":{}}` |
| `IMAGE_OPT_STORAGE_URL`      | Base URL of the object-storage HTTP service. Omit to use in-process memory.  | (memory)      |
| `IMAGE_OPT_STORAGE_AUTH`     | Value for the `Authorization` header on storage requests.                    | (none)        |
| `IMAGE_OPT_MAX_SOURCE_BYTES` | Hard cap on source-image size.                                               | `26214400`    |

## Running

```sh
bun install
bun run --filter @back-to-the-future/image-optimizer test
bun run --filter @back-to-the-future/image-optimizer check
bun run --filter @back-to-the-future/image-optimizer dev
```

## Notes on `sharp`

Image transforms use `sharp` (libvips) when the runtime can load it. The package does **not** declare `sharp` as a hard dependency because the test sandbox and some Cloudflare Worker variants don't ship libvips. When `sharp` is not loadable the service falls back to a passthrough transformer, which is safe only for cache-warm requests where every byte already matches the requested format. In production we always run with `sharp` available.

Tests inject a stub transformer (`CountingTransformer` / `StubTransformer`) so the suite never depends on libvips being installed — see `test/pipeline.test.ts` and `test/server.test.ts`.

## Errors

| Code                  | HTTP | Cause                                           |
|-----------------------|------|-------------------------------------------------|
| `INVALID_PARAMS`      | 400  | Query param failed validation.                  |
| `SOURCE_NOT_ALLOWED`  | 403  | Host not on the tenant allowlist.               |
| `SOURCE_NOT_FOUND`    | 404 / 502 | Source returned 404 or fetch failed.       |
| `SOURCE_NOT_IMAGE`    | 415  | Source `Content-Type` is not `image/*`.         |
| `SOURCE_TOO_LARGE`    | 413  | Source exceeded `IMAGE_OPT_MAX_SOURCE_BYTES`.   |
| `TRANSFORM_FAILED`    | 500  | sharp threw on the input.                       |
| `STORAGE_ERROR`       | 502  | The object-storage backend errored.             |
