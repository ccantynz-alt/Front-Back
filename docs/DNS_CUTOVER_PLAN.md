# Phase C — DNS Cutover Plan

Cut `crontech.ai` from Hetzner (`204.168.251.243`) to Cloudflare Pages (`crontech-web`) + Cloudflare Worker (`crontech-api`).

**Time:** ~15 min of dashboard work. 5 min–48h DNS propagation (most users resolve within 1h if TTLs were lowered beforehand).

---

## 1. Pre-flight Checklist

Do NOT touch DNS until every box below is green.

- [ ] **Pages `crontech-web` has deployed `main` at least once.** Confirm at `dashboard.cloudflare.com` → Pages → `crontech-web` → Deployments.
- [ ] **Worker `crontech-api` has all 12 production secrets set.** Confirm with:
  ```bash
  cd apps/api && wrangler secret list --env production
  ```
  Or check the `set-worker-secrets.yml` workflow ran green on latest `main`.
- [ ] **Worker responds** (replace `<cf-subdomain>` with your workers.dev subdomain):
  ```bash
  curl https://crontech-api-production.<cf-subdomain>.workers.dev/api/version
  ```
  Expect `200` with version JSON.
- [ ] **Pages build responds:**
  ```bash
  curl -I https://crontech-web.pages.dev
  ```
  Expect `200`.
- [ ] **SSL/TLS mode = Full (strict).** Dashboard → `crontech.ai` → SSL/TLS → Overview. NOT Flexible. NOT Full. **Full (strict)** only.
- [ ] **Zone ID for `crontech.ai` copied.** Dashboard → `crontech.ai` → Overview → right sidebar.

---

## 2. DNS Records — Add in Cloudflare DNS Tab

Dashboard → `crontech.ai` → DNS → Records → **Add record** (one per row).

| Type  | Name            | Target                                                       | Proxy   | TTL   |
| ----- | --------------- | ------------------------------------------------------------ | ------- | ----- |
| CNAME | `@` (apex)      | `crontech-web.pages.dev`                                     | Proxied | Auto  |
| CNAME | `www`           | `crontech-web.pages.dev`                                     | Proxied | Auto  |
| CNAME | `api`           | `crontech-api-production.<cf-subdomain>.workers.dev`         | Proxied | Auto  |

> Cloudflare flattens CNAME at apex automatically. Orange cloud = ON for all three.

**Paste-ready BIND-style format** (for reference; input into the Cloudflare UI):

```
crontech.ai.        1  IN  CNAME  crontech-web.pages.dev.
www.crontech.ai.    1  IN  CNAME  crontech-web.pages.dev.
api.crontech.ai.    1  IN  CNAME  crontech-api-production.<cf-subdomain>.workers.dev.
```

### Then wire up custom domains inside Pages + Workers

**Pages:**
`dashboard.cloudflare.com` → Pages → `crontech-web` → Custom domains → **Set up a custom domain** → add `crontech.ai`, then repeat for `www.crontech.ai`.
(Cloudflare auto-provisions the SSL cert. Wait for status = Active.)

**Workers:**
`dashboard.cloudflare.com` → Workers & Pages → `crontech-api` → Settings → Triggers → Custom Domains → **Add Custom Domain** → `api.crontech.ai`.

---

## 3. Registrar — Flip the Nameservers

**This is the step that actually makes DNS go live.** Until the registrar points at Cloudflare, everything above is dormant.

Cloudflare assigns two NS values per zone — find them at `dashboard.cloudflare.com` → `crontech.ai` → Overview → right sidebar. They look like:

```
caleb.ns.cloudflare.com
zara.ns.cloudflare.com
```

(Your exact names will differ.)

### Per-registrar steps

**Porkbun**
1. Log in → Domain Management → `crontech.ai` → NS column → **Details**.
2. Replace existing NS with the two Cloudflare NS records.
3. Save. Propagation kicks off immediately.

**Namecheap**
1. Dashboard → Domain List → `crontech.ai` → **Manage**.
2. Nameservers → select **Custom DNS** → paste both Cloudflare NS.
3. Click the green checkmark to save.

**GoDaddy**
1. My Products → `crontech.ai` → **DNS** → Nameservers → **Change**.
2. Choose **I'll use my own nameservers** → paste both Cloudflare NS.
3. Save. GoDaddy propagates within 1h typically.

**OVH**
1. Web Cloud → Domains → `crontech.ai` → **DNS servers** tab.
2. Click **Modify DNS servers** → choose custom → paste both Cloudflare NS.
3. Next → Confirm.

**Cloudflare Registrar**
1. If `crontech.ai` is already on Cloudflare Registrar, NS are already Cloudflare — skip this section entirely.
2. Confirm at Domain Registration → `crontech.ai` → Nameservers = `*.ns.cloudflare.com`.
3. Done.

---

## 4. Post-Cutover Verification

Run these within 5–60 minutes of flipping NS.

```bash
curl -I https://crontech.ai
```
Expect `200` + headers `server: cloudflare` and `cf-ray: ...`.

```bash
curl -I https://api.crontech.ai/api/version
```
Expect `200` + JSON body.

```bash
dig crontech.ai @1.1.1.1 +short
```
Expect Cloudflare anycast IPs (e.g., `104.x.x.x` / `172.67.x.x`). **NOT** `204.168.251.243`.

**Browser smoke test (incognito):**
- Open `https://crontech.ai` — new Crontech branding, not BTF.
- Open `https://www.crontech.ai` — same.
- Create account → sign in → land on dashboard. End-to-end login must work.

---

## 5. Rollback Plan

If anything breaks, you need <15 min back to Hetzner.

**Before you cut:**
- Screenshot the current Hetzner DNS zone (every record). Save to `~/Desktop/hetzner-dns-backup-$(date +%F).png`.
- Note the old registrar nameservers (copy to a notes file).

**To roll back (fast path — stay on Cloudflare NS):**
1. Cloudflare DNS → delete the three CNAMEs above.
2. Add a single `A` record: `@ → 204.168.251.243`, **Proxy OFF** (grey cloud).
3. Add `A` for `www → 204.168.251.243`, Proxy OFF.
4. Propagation: 5–60 min (low TTL because Cloudflare).

**To roll back (nuclear — leave Cloudflare entirely):**
1. Registrar → restore previous nameservers.
2. Propagation: 1–48h depending on TTL at registrar.

**Do NOT power down Hetzner for at least 24h after cutover.** Warm standby. Hetzner shutdown is Phase E, not Phase C.

---

## 6. Email & Secondary Records — DO NOT FORGET

Nameserver flip replaces the **entire zone**. Anything not migrated into Cloudflare DNS goes dark the moment NS propagate.

**Before flipping NS**, export the Hetzner zone and audit for:

### MX records (email)
If `crontech.ai` receives mail (e.g., `hello@crontech.ai`, Google Workspace, Microsoft 365, Fastmail), copy every `MX` record into Cloudflare DNS. Example Google Workspace:

```
@   MX  1   smtp.google.com.
```

### TXT records
Scan the old zone for all of these:

| TXT name                                  | Purpose                                  |
| ----------------------------------------- | ---------------------------------------- |
| `@` starting with `v=spf1`                | SPF (email sender policy)                |
| `_dmarc`                                  | DMARC policy                             |
| `*._domainkey` (e.g. `google._domainkey`) | DKIM public keys                         |
| `@` containing `google-site-verification` | Google Search Console / Workspace verify |
| `@` containing `MS=`                      | Microsoft 365 domain verification        |
| `@` containing `stripe-verify`            | Stripe domain verification               |
| `@` containing `sentry-`                  | Sentry verification                      |
| Any `*._acme-challenge`                   | Let's Encrypt DNS-01 (safe to drop if not in active use) |

**Rule: if Hetzner has it and you don't know what it does, migrate it anyway.** Deleting is cheap; a missing verify TXT can lock you out of Stripe/Google for hours.

---

## 7. Time Estimate

| Task                                  | Time         |
| ------------------------------------- | ------------ |
| Pre-flight checks                     | 5 min        |
| Add DNS records in Cloudflare         | 3 min        |
| Wire Pages + Workers custom domains   | 3 min        |
| Audit + migrate MX/TXT from Hetzner   | 5–10 min     |
| Flip NS at registrar                  | 2 min        |
| **Active work total**                 | **~15–20 min** |
| DNS propagation (most users)          | 5 min – 1h   |
| DNS propagation (worst case TTL=48h)  | up to 48h    |

If you haven't lowered TTLs on the old Hetzner zone to ~300s a day ahead, assume worst case. If TTLs were already low, assume <1h for 95% of resolvers.

---

**Ship it.**
