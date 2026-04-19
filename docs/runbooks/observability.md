# Observability Runbook (bare-metal)

Prometheus + Loki + Grafana + node_exporter on the Vultr Ubuntu 22.04 box. No Docker.

## Prereqs

- Ubuntu 22.04, root/sudo access
- Env var `GRAFANA_ADMIN_PASSWORD` set to a strong password
- Caddy already running on `:2019` (admin) and `:80/:443` (reverse proxy)

## Install (one-liner)

```bash
sudo GRAFANA_ADMIN_PASSWORD='CHANGEME' bash scripts/install-observability.sh
```

Script is idempotent - safe to re-run.

## Verify

```bash
systemctl status node_exporter prometheus loki grafana-server
curl -s http://127.0.0.1:9100/metrics | head -n 3        # node_exporter
curl -s http://127.0.0.1:9090/-/ready                    # prometheus
curl -s http://127.0.0.1:3100/ready                      # loki
curl -s -u admin:"$GRAFANA_ADMIN_PASSWORD" http://127.0.0.1:3003/api/health
```

All four should return 200/healthy. Prometheus targets: `http://127.0.0.1:9090/targets`.

## Expose Grafana at grafana.crontech.ai

1. DNS: add A record `grafana.crontech.ai` -> Vultr box public IP.
2. Add a Caddy site (e.g. `/etc/caddy/sites/grafana.caddy`) and `import sites/*` from main Caddyfile:

   ```
   grafana.crontech.ai {
       reverse_proxy 127.0.0.1:3003
   }
   ```

3. Reload: `sudo systemctl reload caddy`. Caddy auto-provisions TLS.

## Default dashboards (import by ID in Grafana UI -> Dashboards -> New -> Import)

- **1860** - Node Exporter Full (host metrics)
- **3662** - Prometheus 2.0 Overview
- **13639** - Logs / App (Loki)

Pick Prometheus or Loki as the datasource on import.

## Troubleshooting

- **Grafana 502 via Caddy**: check `ss -ltnp | grep 3003` and `journalctl -u grafana-server -n 50`.
- **Prometheus target DOWN for caddy**: confirm Caddy admin is bound to `127.0.0.1:2019` and `metrics` is enabled in the global block (`servers { metrics }`).
- **Loki disk fill**: retention is 720h (30d). Check `du -sh /var/lib/loki/*` and compactor logs: `journalctl -u loki | grep -i compact`.
- **Forgot Grafana admin password**: `sudo grafana-cli admin reset-admin-password 'newpass'`.
- **node_exporter refused**: it binds `127.0.0.1:9100` only - scrape from the same host.
- **Re-run installer**: `sudo GRAFANA_ADMIN_PASSWORD=... bash scripts/install-observability.sh` (idempotent).
