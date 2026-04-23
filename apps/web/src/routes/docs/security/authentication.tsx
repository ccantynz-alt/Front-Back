// ── /docs/security/authentication ────────────────────────────────────
//
// The three auth providers shipped on Crontech today, grounded in:
//   • apps/api/src/auth/webauthn.ts — passkeys via @simplewebauthn
//   • apps/api/src/auth/google-oauth.ts — OAuth 2.0 authorization code
//   • apps/api/src/auth/password.ts — argon2id via hash-wasm
//   • apps/api/src/auth/session.ts — 30-day opaque Bearer tokens
//   • apps/api/src/auth/middleware.ts — authMiddleware + context
// Honest about the in-memory rate limiter being per-process today.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function AuthenticationArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Authentication"
        description="How Crontech authenticates users today: passkeys via WebAuthn, Google OAuth 2.0, and email + password with argon2id. All three land on a unified session layer with 30-day opaque Bearer tokens."
        path="/docs/security/authentication"
      />

      <DocsArticle
        eyebrow="Security & Auth"
        title="Authentication"
        subtitle="Crontech supports three auth methods and unifies them behind a single session abstraction. This article maps each provider to its implementation file and describes the end-to-end flow."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Audit and compliance",
          href: "/docs/security/audit-and-compliance",
          description:
            "Every auth event is logged. The next article covers the hash-chained audit trail and the compliance posture that depends on it.",
        }}
      >
        <p>
          All three auth paths land on the same session layer
          (implemented in <code>apps/api/src/auth/session.ts</code>):
          a successful authentication creates a new row in the{" "}
          <code>sessions</code> table with a cryptographically random
          64-character token and a 30-day expiry. The client sends
          that token as a <code>Bearer</code> Authorization header on
          every subsequent request. The{" "}
          <code>authMiddleware</code> in{" "}
          <code>apps/api/src/auth/middleware.ts</code> validates it
          against the database and sets <code>userId</code> on the
          Hono context.
        </p>

        <Callout tone="info">
          Tokens are opaque — they are not JWTs and they carry no
          claims. The server is the single source of truth. Revoking
          a session is one row deletion.
        </Callout>

        <h2>Passkey / WebAuthn</h2>

        <p>
          Implemented in <code>apps/api/src/auth/webauthn.ts</code>{" "}
          on top of{" "}
          <code>@simplewebauthn/server</code>. The registration and
          login ceremonies are each two tRPC procedures:
        </p>

        <KeyList
          items={[
            {
              term: "generateRegistrationOpts",
              description:
                "Returns the PublicKeyCredentialCreationOptionsJSON the browser passes to navigator.credentials.create(). The server reads WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN from env and picks platform authenticators with residentKey: preferred so the credential lives in iCloud Keychain or Google Password Manager.",
            },
            {
              term: "verifyRegistration",
              description:
                "Validates the RegistrationResponseJSON against the challenge the client was given. On success, the credentialId, public key, counter, and transports are persisted.",
            },
            {
              term: "generateAuthenticationOpts",
              description:
                "Returns the PublicKeyCredentialRequestOptionsJSON for navigator.credentials.get(). Optionally pre-filtered by allowCredentials if the user is known.",
            },
            {
              term: "verifyAuthentication",
              description:
                "Validates the AuthenticationResponseJSON against the stored credential. On success, a new session is created and the Bearer token is returned.",
            },
          ]}
        />

        <Callout tone="note">
          The relying party id defaults to <code>localhost</code>{" "}
          when <code>WEBAUTHN_RP_ID</code> is unset, which is correct
          for local dev but wrong for every other environment. Always
          set <code>WEBAUTHN_RP_ID</code> and{" "}
          <code>WEBAUTHN_ORIGIN</code> in project env vars before
          deploying.
        </Callout>

        <h2>Google OAuth 2.0</h2>

        <p>
          Implemented in{" "}
          <code>apps/api/src/auth/google-oauth.ts</code>. The full
          authorization-code flow is wired end-to-end:
        </p>

        <KeyList
          items={[
            {
              term: "Start the flow",
              description:
                "The /api/auth/google/login route redirects the user to the Google consent screen with a CSRF-defeating state token. The token is stored in-memory with a 10-minute TTL.",
            },
            {
              term: "Handle the callback",
              description:
                "/api/auth/google/callback exchanges the authorization code for tokens, fetches the user's profile, upserts the row in the users table, and creates a session. The state token is verified and consumed before any of that runs.",
            },
            {
              term: "Configure it",
              description:
                "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the project's env vars. The redirect URI defaults to <API_BASE_URL>/api/auth/google/callback — register that exact URL in the Google Cloud Console.",
            },
          ]}
        />

        <h2>Email + password</h2>

        <p>
          Implemented in <code>apps/api/src/auth/password.ts</code>.
          Two tRPC procedures — <code>auth.registerWithPassword</code>{" "}
          and <code>auth.loginWithPassword</code> — wrap an argon2id
          hash via <code>hash-wasm</code>. The library was chosen
          because it runs identically on Bun and Cloudflare Workers;
          the deploy target per BLK-020 is Workers.
        </p>

        <KeyList
          items={[
            {
              term: "Password complexity",
              description:
                "Minimum 8 characters, at least one number, at least one special character. Validation lives in passwordSchema and is enforced on every registration.",
            },
            {
              term: "Hash parameters",
              description:
                "argon2id with 64 MB memory, 3 iterations, parallelism 1, 32-byte output. The encoded string ($argon2id$v=19$m=65536,t=3,p=1$...) carries its own parameters so they never need to be stored separately.",
            },
            {
              term: "Rate limiting",
              description:
                "5 failed logins per email in a 15-minute window triggers a 15-minute lockout. The limiter is in-memory per-process today, which is correct for the single-Bun-server deployment shape. Multi-region rate limiting is planned.",
            },
            {
              term: "Cross-provider conflicts",
              description:
                "If a user tries to register with a password on an email already linked to Google OAuth, the server returns a CONFLICT with a clear message pointing them at the Google sign-in flow. Same in reverse.",
            },
          ]}
        />

        <h2>Sessions and sign-out</h2>

        <p>
          Every successful authentication calls{" "}
          <code>createSession(userId, db)</code> and returns the
          token. The token is 32 bytes of random data (via{" "}
          <code>crypto.getRandomValues</code>) encoded as 64 hex
          characters. It is not reversible, not derived from the
          userId, and not guessable.
        </p>

        <KeyList
          items={[
            {
              term: "validateSession(token, db)",
              description:
                "Used by authMiddleware. Looks up the token, checks that expiresAt is in the future, returns the userId or null. The lookup is a single indexed query.",
            },
            {
              term: "deleteSession(token, db)",
              description:
                "Used by the sign-out procedure. Deletes the row and invalidates the token immediately. No client-side-only sign-out — revocation is server-authoritative.",
            },
            {
              term: "30-day expiry",
              description:
                "Sessions expire after 30 days. There is no silent refresh — once a session expires, the user signs in again. Short-lived refresh tokens are under review for the next auth iteration.",
            },
          ]}
        />

        <Callout tone="warn">
          The Bearer token is the keys to the kingdom. Store it in
          an HttpOnly, Secure, SameSite=Strict cookie or in a
          platform-appropriate secure storage. Never log it, never
          ship it to an analytics tool, never embed it in a URL.
        </Callout>
      </DocsArticle>
    </>
  );
}
