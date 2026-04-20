# Stripe Setup Checklist

> For Craig to work through at the PC. Every step is self-contained.
> Our code is already written — BLK-010 shipped the billing plumbing
> and the Stripe usage-reporter. This checklist gets the Stripe side
> configured to match.

---

## Prerequisites (5 min)

- [ ] You have a Stripe account at https://dashboard.stripe.com/
- [ ] You're in **Test mode** to start (top-right toggle). We promote to Live mode at the end.
- [ ] `STRIPE_ENABLED=true` will be set in production env (already added to `.env.example`; just need the real secrets).

---

## Step 1 — Create Products + Prices (~10 min)

Stripe Dashboard → **Products** → **Add product** for each plan.

### Free (no product needed — handled in code)

### Personal — $9/mo
- [ ] Product name: `Crontech Personal`
- [ ] Description: `For individual builders shipping one or two projects.`
- [ ] Pricing: **Recurring**, **$9.00 USD / month**
- [ ] Copy the price ID (starts with `price_...`) → save as `STRIPE_PRICE_PERSONAL_MONTHLY`
- [ ] Add a second price: **$90.00 USD / year** (save 17%) → `STRIPE_PRICE_PERSONAL_YEARLY`

### Pro — $19/mo
- [ ] Product name: `Crontech Pro`
- [ ] Description: `For teams and agencies running production workloads.`
- [ ] Prices: **$19/mo** + **$190/yr** → save as `STRIPE_PRICE_PRO_MONTHLY` + `_YEARLY`

### Team — $12/user/mo
- [ ] Product name: `Crontech Team`
- [ ] Description: `Shared workspaces, admin console, SSO, audit logs.`
- [ ] Pricing: **Recurring**, **$12/user/month**, **per-seat metering**
- [ ] Price ID → `STRIPE_PRICE_TEAM_MONTHLY`

### Enterprise (no Stripe price — it's a "contact us" tier)

### Metered usage (for overage billing)
- [ ] Product: `Crontech Usage — Build Minutes` → price per minute (recurring, metered). Copy price ID → `STRIPE_USAGE_PRICE_BUILD_MIN`
- [ ] Product: `Crontech Usage — Edge Requests` → price per 1M requests (recurring, metered). → `STRIPE_USAGE_PRICE_EDGE_REQ`
- [ ] Product: `Crontech Usage — AI Tokens` → price per 1K tokens (recurring, metered). → `STRIPE_USAGE_PRICE_AI_TOKENS`

Decide your per-unit prices before creating these — they're hard to change later.

---

## Step 2 — API Keys (~2 min)

Stripe Dashboard → **Developers** → **API keys**.

- [ ] Copy the **Secret key** (`sk_test_...` in test mode). Save as `STRIPE_SECRET_KEY`.
- [ ] Copy the **Publishable key** (`pk_test_...`). Save as `STRIPE_PUBLISHABLE_KEY`.
- [ ] Optional: create a restricted key with only the scopes we need. More secure long-term, but skip for today.

---

## Step 3 — Webhook endpoint (~5 min)

Our API already has a webhook receiver at `POST /api/webhooks/stripe`.

Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**.

- [ ] Endpoint URL: `https://api.crontech.ai/api/webhooks/stripe`  (use the tunnelled URL `https://<ngrok-id>.ngrok.io/api/webhooks/stripe` if you're testing locally first)
- [ ] Events to listen for (click **Select events** → choose these):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.updated`
- [ ] After creating, copy the **Signing secret** (`whsec_...`). Save as `STRIPE_WEBHOOK_SECRET`.

---

## Step 4 — Stripe Customer Portal (~2 min)

Stripe Dashboard → **Settings** → **Billing** → **Customer portal**.

- [ ] Enable the portal
- [ ] **Features** → turn on:
  - Payment methods — update
  - Invoices — view + download
  - Subscriptions — cancel (with optional 30-day retention window)
  - Subscriptions — upgrade / downgrade (allow switching between the products you created above)
- [ ] **Cancellation** → choose "cancel at period end" (keeps revenue through the month)
- [ ] **Business information** → set your company name + support email + business URL

---

## Step 5 — Tax (optional but recommended)

- [ ] **Settings** → **Tax** → enable **Stripe Tax**
- [ ] Confirm your business address (for NZ GST, Stripe handles it automatically)
- [ ] On each product price, flag **Include tax in price: No** (we charge $9 + tax, not $9 inclusive)

---

## Step 6 — Populate env vars on the production box

On the Vultr Bare Metal box (once BLK-028 cutover is done, or on the current VPS until then):

```bash
sudo tee -a /opt/crontech/.env > /dev/null << 'EOF'
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_PERSONAL_MONTHLY=price_xxx
STRIPE_PRICE_PERSONAL_YEARLY=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_YEARLY=price_xxx
STRIPE_PRICE_TEAM_MONTHLY=price_xxx
STRIPE_USAGE_PRICE_BUILD_MIN=price_xxx
STRIPE_USAGE_PRICE_EDGE_REQ=price_xxx
STRIPE_USAGE_PRICE_AI_TOKENS=price_xxx
EOF

sudo systemctl restart crontech-api
```

---

## Step 7 — Test end-to-end in test mode (~10 min)

- [ ] Sign up on crontech.ai with a fresh email
- [ ] Go to `/billing` — should show the Stripe-enabled checkout (not the waitlist fallback)
- [ ] Click "Upgrade to Pro"
- [ ] Use Stripe test card **`4242 4242 4242 4242`**, any future expiry, any CVC, any ZIP
- [ ] Complete checkout → you're redirected back to `/billing?status=success`
- [ ] Verify: Stripe dashboard shows the new customer + subscription
- [ ] Verify: Crontech DB has a row in `subscriptions` (check `/admin` tiles)
- [ ] Click "Manage billing" → portal opens; update card; cancel subscription; re-subscribe
- [ ] Confirm webhook deliveries in Stripe dashboard (all green, no 4xx/5xx)

---

## Step 8 — Promote to Live mode

Only after all test-mode flows pass.

- [ ] Stripe dashboard → toggle from **Test mode** to **Live mode** (top right)
- [ ] Repeat Step 1 (create products) — test and live have separate products/prices
- [ ] Repeat Step 2 (API keys) — copy `sk_live_...` and `pk_live_...`
- [ ] Repeat Step 3 (webhook endpoint) — create a new webhook, new signing secret
- [ ] Swap `STRIPE_*` env vars on the production box from `_test_` values to `_live_` values
- [ ] Restart `crontech-api`
- [ ] Do ONE real card transaction (your own card, upgrade yourself to Pro for $19) → verify end-to-end
- [ ] Refund yourself via Stripe dashboard if you want

---

## Step 9 — Enable the checkout UI on the landing page

Our `/billing` route already flips between "waitlist" and "real checkout" based on `STRIPE_ENABLED=true`. Once env is set + service restarted, the page becomes live automatically.

Nothing to deploy — it's a runtime flag.

---

## Troubleshooting

- **Webhook signature verification fails**: you copied the wrong signing secret. In Stripe dashboard → webhooks → your endpoint → "Signing secret" → click reveal → copy into `STRIPE_WEBHOOK_SECRET`. Restart API.
- **Prices not showing in UI**: missing `STRIPE_PRICE_*` env vars. The UI only shows plans whose price IDs are present.
- **Checkout redirects to error page**: the Stripe customer email doesn't match a Crontech user. Make sure you signed up with the same email you used for Stripe checkout.
- **Usage reports not pushed to Stripe**: the usage-reporter runs on a schedule (BLK-010). Check `/admin` — Claude spend tile shows if it's running. Manual trigger: `bun run scripts/report-usage.ts` on the server.

---

## Handy reference

- Crontech billing code: `apps/api/src/stripe/*`, `apps/api/src/billing/*`, `apps/api/src/trpc/procedures/billing.ts`
- Frontend: `apps/web/src/routes/billing.tsx` (auto-switches on `STRIPE_ENABLED`)
- Usage-reporter: `apps/api/src/billing/usage-reporter.ts` (shipped in BLK-010)
- Tests: `apps/api/src/stripe/*.test.ts` + `apps/api/src/billing/*.test.ts`
