# Runbook: add gluecron.com DNS records via Cloudflare API

One-shot script to create/update the apex and `www` A records for `gluecron.com`
pointing at the bare-metal IP. Idempotent, no destructive deletes.

## 1. Get a Cloudflare API token

1. Go to <https://dash.cloudflare.com/profile/api-tokens>.
2. Click **Create Token** -> use the **Edit zone DNS** template.
3. Under **Zone Resources**, pick **Include -> Specific zone -> gluecron.com**.
4. Click **Continue to summary** -> **Create Token**.
5. Copy the token (it is shown once).

Prerequisite: `gluecron.com` must already be added to this Cloudflare account
and the registrar's NS records must point at the two Cloudflare nameservers.
If not, the script fails loud with next-step instructions.

## 2. Run the script

```bash
export CF_API_TOKEN='paste-token-here'
# optional; defaults to 45.76.171.37
# export TARGET_IP=45.76.171.37

bash scripts/add-dns-gluecron.sh
```

## 3. What success looks like

```
[+] Token valid.
[+] Zone gluecron.com -> <id> (status: active)
[+] verify: gluecron.com -> 45.76.171.37 (proxied=false, ttl=1)
[+] verify: www.gluecron.com -> 45.76.171.37 (proxied=false, ttl=1)
================================================================
  SUCCESS: gluecron.com DNS records are set.
================================================================
```

Propagation: 1-5 minutes. Verify with:

```bash
dig +short gluecron.com @1.1.1.1
dig +short www.gluecron.com @1.1.1.1
```

## 4. Rollback

The script never deletes. To remove the records manually:

1. Open <https://dash.cloudflare.com> -> select **gluecron.com** -> **DNS**.
2. Find the A records `gluecron.com` and `www.gluecron.com`.
3. Click **Edit** -> **Delete** on each.

DNS-only (grey cloud) means traffic is not proxied through Cloudflare.
