# Crontech Launch Checklist

One-page go-live sequence for Crontech. Work top to bottom. Do not skip steps. Stripe will not clear the account for production unless all of §1 and §2 are complete.

---

## 1. AlecRae (transactional email) — required before Stripe

AlecRae sends email verification, password reset, welcome, subscription receipts, deploy notifications, and every other outbound mail. Without it, nobody can verify an email and therefore nobody can pay.

Prerequisites — AlecRae itself needs to be deployed (see AlecRae's onboarding note for its `DATABASE_URL`, `REDIS_URL`, `api.alecrae.com` DNS, Stripe / Anthropic / OpenAI / Google OAuth / Microsoft OAuth keys).

1. Log in to the AlecRae dashboard.
2. Run the AlecRae seed scripts (from AlecRae's onboarding note):
    - `bun run db:migrate`
    - `bun run scripts/seed.ts` — **save the API key it prints, and the account id**
    - `ACCOUNT_ID=<crontech-account-id> bun run scripts/seed-crontech-templates.ts`
3. Register the Crontech sender domain on AlecRae:
    - `POST https://api.alecrae.com/v1/domains` body `{ "domain": "mail.crontech.ai" }`
    - Copy the DKIM / SPF / DMARC records from the response into Cloudflare DNS for `crontech.ai`.
    - `POST https://api.alecrae.com/v1/domains/<id>/verify` until every record goes green.
4. Generate a 32-character webhook secret (any long random string): `openssl rand -hex 16`.
5. Register the Crontech inbound webhook on AlecRae:
    - `POST https://api.alecrae.com/v1/webhooks` body `{ "url": "https://crontech.ai/api/alecrae/webhook", "events": ["delivered","bounced","complained","opened","clicked"], "secret": "<the secret from step 4>" }`
6. Confirm the 10 Crontech templates seeded (IDs must match exactly):
    - `crontech.verify-email`
    - `crontech.welcome`
    - `crontech.password-reset`
    - `crontech.magic-link`
    - `crontech.waitlist-confirm`
    - `crontech.subscription-created`
    - `crontech.payment-failed`
    - `crontech.deploy-success`
    - `crontech.deploy-failure`
    - `crontech.custom-domain-verified`
7. In Vercel → Crontech project → Environment Variables (Production), set **exactly these names**:
    - `ALECRAE_BASE_URL` = `https://api.alecrae.com/v1` (must include `/v1`)
    - `ALECRAE_API_KEY` = the key from step 2 (seed.ts output)
    - `ALECRAE_FROM_ADDRESS` = `Crontech <noreply@mail.crontech.ai>`
    - `ALECRAE_WEBHOOK_SECRET` = the secret from step 4

> **Note:** Legacy env names `ALECRAE_API_URL` and `EMAIL_FROM` still work with a deprecation warning in logs — but use the new names to avoid the warning and match AlecRae's onboarding note.

8. Test send from AlecRae (from its dashboard or CLI):
    - `POST https://api.alecrae.com/v1/send` body `{ "from": "noreply@mail.crontech.ai", "to": "<your test email>", "template_id": "crontech.verify-email", "variables": { "firstName": "Craig", "verifyUrl": "https://crontech.ai/verify/test123" }, "message_id": "launch-test-001" }`
    - Expected response: `{ "id": "...", "status": "queued" }`
    - Confirm email arrives in inbox (not spam) within 60s.
    - Confirm webhook fires — the Crontech API logs should contain `[alecrae-webhook] event=delivered message_id=launch-test-001`.
    - Retry the same POST with the same `message_id` and confirm no duplicate email lands (idempotency proof).

## 2. Stripe (payments)

1. Create a Stripe account (or switch to live mode on the existing one).
2. In the Stripe dashboard → Products, create two products:
    - **Crontech Pro** — monthly recurring — price $29 USD
    - **Crontech Enterprise** — monthly recurring — price $99 USD (or your chosen anchor)
3. Copy each product's Price ID (they look like `price_1AbCdEf…`, 30 characters, no underscores after `price_`).
4. In Vercel → Crontech project → Environment Variables (Production), set:
    - `STRIPE_SECRET_KEY` = your **live** secret key (`sk_live_…`)
    - `STRIPE_PUBLISHABLE_KEY` = your **live** publishable key (`pk_live_…`)
    - `STRIPE_PRICE_PRO_MONTHLY` = the Pro Price ID from step 3
    - `STRIPE_PRICE_ENTERPRISE_MONTHLY` = the Enterprise Price ID from step 3
5. Create a Stripe webhook endpoint at `https://api.crontech.ai/api/stripe/webhook`. Subscribe to at minimum: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
6. Copy the webhook signing secret (`whsec_…`) and set `STRIPE_WEBHOOK_SECRET` in Vercel prod env.
7. **Last step — flip the kill switch**: set `STRIPE_ENABLED=true` in Vercel prod env.
8. Redeploy Crontech so the new env is picked up.

Do the same exercise in a separate Vercel environment (Preview or Staging) with Stripe **test** keys and test price IDs before touching prod.

## 3. Verify end-to-end before announcing

Use a clean incognito window with a fresh throwaway email address. Walk the full funnel:

1. Open `https://crontech.ai` → click **Start building** → land on `/register`.
2. Sign up with email + password (or Google OAuth).
3. Check inbox — should receive a Crontech verification email via AlecRae within 60s.
4. Click the verify link → land on `/dashboard?verified=1` with the welcome email already in your inbox.
5. Click **Upgrade** or navigate to `/pricing` → click the **Pro** plan CTA.
6. Complete Stripe checkout using a real card (or `4242 4242 4242 4242` if you're in test mode).
7. Confirm Stripe dashboard shows the new subscription.
8. Confirm Crontech admin page (`/admin`) shows the new user with an active subscription.
9. Confirm you received the `crontech.subscription-created` email.
10. Create a project from the dashboard — confirm you can reach `projects.create` and the project row appears.

If any step fails, do not launch. Check the troubleshooting section below.

## 4. Dogfood dependencies (other products you'll need warm)

Crontech is the first to go live, but it dogfoods three siblings. Each must be at least reachable before launch so the cross-product admin widget and customer cross-sell card don't show "unreachable":

- `https://alecrae.com/api/platform-status` (sends Crontech's email — hard dependency)
- `https://gluecron.com/api/platform-status` (git hosting — eventual dependency)
- `https://gatetest.io/api/platform-status` (CI gate — already running on Crontech's pushes)

## 5. Troubleshooting

- **Verification email never arrives** — check `ALECRAE_API_KEY` and `ALECRAE_BASE_URL` are set in Vercel prod. Check the `[EMAIL]` logs — a deprecation warning means legacy env name is still set and should be renamed. Check AlecRae logs for the `message_id`, check DKIM/SPF/DMARC are green.
- **`[EMAIL] AlecRae failed: HTTP 404`** — your `ALECRAE_BASE_URL` is missing the `/v1` suffix. Should be `https://api.alecrae.com/v1`, not just `https://api.alecrae.com`.
- **Webhook arriving but logs say `invalid_signature`** — `ALECRAE_WEBHOOK_SECRET` in Vercel doesn't match the one registered with AlecRae's `POST /v1/webhooks` endpoint.
- **Webhook arriving but logs say `ALECRAE_WEBHOOK_SECRET not set — signature verification SKIPPED`** — you forgot to set the Vercel env var; anybody can post fake events right now.
- **"Billing is not yet operational"** on `/pricing` → `STRIPE_ENABLED` is still `false` in Vercel.
- **PRECONDITION_FAILED: Stripe price "..." is not configured** → `STRIPE_PRICE_PRO_MONTHLY` or `STRIPE_PRICE_ENTERPRISE_MONTHLY` is empty or still a placeholder. Paste real Stripe price IDs.
- **PRECONDITION_FAILED on checkout for your user** → you haven't verified your email. Check inbox, click verify link, retry.
- **Stripe checkout loads but card is rejected** → you're using test keys in prod (or vice versa).
- **Webhook signature invalid (Stripe)** → `STRIPE_WEBHOOK_SECRET` in Vercel doesn't match the secret shown in the Stripe dashboard for that specific webhook endpoint.
- **User signed up but isn't in the admin user list** → Turso DB connection env vars (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`) are misconfigured.

## 6. After launch — within 24h

- Open the admin `/admin` page. Watch signup funnel for one full day.
- Check AlecRae bounce rate < 2% and complaint rate < 0.1%. If either is high, pause and investigate before sending more.
- Check Stripe for failed payments. `payment_failed` emails should be going out automatically via the `crontech.payment-failed` template.
- Spot-check that the GateTest CI gate is still green on new Crontech commits.

---

Last updated: 2026-04-22.
