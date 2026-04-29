# @back-to-the-future/verify

Multi-channel verification service for Crontech (BLK-033). Replaces the legacy
Twilio Verify dependency with a Bun-native, AI-aware OTP / TOTP / magic-link
engine that runs on every Crontech tier (client → edge → cloud).

## Capabilities

- **Channels:** `sms`, `voice`, `email`, `push`, `totp`, `magic_link`
- **OTP codes:** 4-10 digit numeric, configurable per request, default 6
- **TOTP:** RFC 6238 compliant (SHA-1, 30s step, ±1 step tolerance), base32
  secrets, `otpauth://` URI generation, 8 single-use backup codes per setup
- **Magic links:** 32-byte cryptographically random URL-safe tokens, single-use,
  TTL-bounded, returned as a fully-qualified URL
- **Anti-abuse:** per-identifier + per-tenant rate limits, HMAC-SHA-256 code
  storage (never plaintext), constant-time hex comparison, attempt counter
  with lockout, optional fraud scorer pluggable from
  `services/comms-intelligence`
- **Audit log:** every action is recorded with hashed identifier — plaintext
  identifiers and codes are never written to the audit sink

## REST API

All endpoints (except `/health`) require `Authorization: Bearer $VERIFY_TOKEN`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `POST` | `/v1/verifications` | Create OTP, dispatch via channel, return `{ verificationId, status, expiresAt }` |
| `POST` | `/v1/verifications/:id/check` | Check submitted code, return `{ status, attemptsRemaining }` |
| `POST` | `/v1/verifications/:id/resend` | Issue a fresh code (rate-limited) |
| `POST` | `/v1/totp/secrets` | Provision a TOTP secret + 8 backup codes; returns base32 secret + `otpauth://` URI |
| `POST` | `/v1/magic-links` | Create a single-use magic link with token + redirect URL |
| `GET`  | `/v1/magic-links/:linkId?token=…` | Consume a magic link (one-shot) |

The OTP code is **never** returned to the caller — it is dispatched to the
identifier through the chosen channel only.

## TOTP Setup Flow

1. Client calls `POST /v1/totp/secrets` with `{ tenantId, identifier }`
2. Server returns `{ secret, qrCodeUrl, backupCodes }`
3. Client displays the QR code (`otpauth://`) for the user's authenticator app
4. Client stores the backup codes for the user (offline)
5. Future logins: the user presents a TOTP code, which the service validates
   against the stored secret with ±1 step tolerance, or against unused backup
   codes (single-use)

## Magic-Link Flow

1. Client calls `POST /v1/magic-links` with `{ tenantId, identifier, redirectUrl }`
2. Server returns `{ linkId, url, expiresAt }` — the URL is delivered to the
   user via email (or any channel)
3. The user clicks the URL, which calls `GET /v1/magic-links/:linkId?token=…`
4. The service validates the token (constant-time), marks the link consumed,
   and responds with the original `redirectUrl`
5. Subsequent attempts return `already_consumed`

## Anti-Abuse Model

| Layer | Default |
|---|---|
| Per-identifier rate limit | 5 attempts / 15 min |
| Per-tenant rate limit | 1000 attempts / 1 min |
| Failed-attempt lockout | 5 wrong codes → `locked` |
| Code storage | HMAC-SHA-256 hash (never plaintext) |
| Code comparison | Constant-time hex compare |
| Magic-link token | 32-byte random, base64url, single-use |
| Fraud gate | `FraudScorer` plugin — `services/comms-intelligence` integration |

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `VERIFY_TOKEN` | yes | Bearer token for all `/v1/*` routes |
| `VERIFY_HASH_SECRET` | recommended | Secret used for HMAC code + identifier hashing (defaults to `VERIFY_TOKEN`) |
| `VERIFY_BASE_URL` | optional | Public base URL for magic-link emission (default `http://localhost:8788`) |
| `VERIFY_ISSUER` | optional | TOTP issuer label (default `Crontech`) |
| `PORT` | optional | Port to listen on (default 8788) |
| `SMS_ENDPOINT` | optional | URL of the SMS service for live dispatch |
| `VOICE_ENDPOINT` | optional | URL of the Voice service for live dispatch |
| `EMAIL_ENDPOINT` | optional | URL of the Email-send service for live dispatch |

When dispatcher endpoints are unset, dispatchers run in mock mode and return
synthetic provider message IDs — perfect for local development and CI.

## Running

```sh
bun install
bun run check           # tsc strict typecheck
bun test                # all tests
bun run start           # boot the server
```

## Doctrine

This service is part of Crontech (BLK-033 — Twilio Annihilation). It is the
**only** authority for verification flows in the platform. No other service
generates OTPs or magic links. All callers route through this API.
