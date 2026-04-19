#!/usr/bin/env bash
# install-observability.sh
# Idempotent bare-metal install of Prometheus + Loki + Grafana + node_exporter
# Target: Ubuntu 22.04 (Vultr). No Docker. Inline configs via heredoc.
#
# Usage:
#   sudo GRAFANA_ADMIN_PASSWORD='somepass' bash scripts/install-observability.sh
set -euo pipefail

log() { echo ">>> $*"; }

: "${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD must be set}"

PROM_VER="2.54.1"
LOKI_VER="3.1.1"
NODE_EXPORTER_VER="1.8.2"
ARCH="linux-amd64"

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

log "updating apt and installing base deps"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl wget gnupg2 apt-transport-https software-properties-common unzip tar ca-certificates

############################################
# node_exporter
############################################
log "installing node_exporter ${NODE_EXPORTER_VER}"
if ! id -u node_exporter >/dev/null 2>&1; then
  useradd --no-create-home --shell /usr/sbin/nologin node_exporter
fi
if [[ ! -x /usr/local/bin/node_exporter ]] || ! /usr/local/bin/node_exporter --version 2>&1 | grep -q "${NODE_EXPORTER_VER}"; then
  cd /tmp
  wget -q "https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VER}/node_exporter-${NODE_EXPORTER_VER}.${ARCH}.tar.gz"
  tar xzf "node_exporter-${NODE_EXPORTER_VER}.${ARCH}.tar.gz"
  install -m 0755 -o node_exporter -g node_exporter "node_exporter-${NODE_EXPORTER_VER}.${ARCH}/node_exporter" /usr/local/bin/node_exporter
  rm -rf "node_exporter-${NODE_EXPORTER_VER}.${ARCH}"*
fi

cat >/etc/systemd/system/node_exporter.service <<'EOF'
[Unit]
Description=Prometheus Node Exporter
After=network-online.target
[Service]
User=node_exporter
Group=node_exporter
ExecStart=/usr/local/bin/node_exporter --web.listen-address=127.0.0.1:9100
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

############################################
# Prometheus
############################################
log "installing prometheus ${PROM_VER}"
if ! id -u prometheus >/dev/null 2>&1; then
  useradd --no-create-home --shell /usr/sbin/nologin prometheus
fi
mkdir -p /etc/prometheus /var/lib/prometheus
chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus

if [[ ! -x /usr/local/bin/prometheus ]] || ! /usr/local/bin/prometheus --version 2>&1 | grep -q "${PROM_VER}"; then
  cd /tmp
  wget -q "https://github.com/prometheus/prometheus/releases/download/v${PROM_VER}/prometheus-${PROM_VER}.${ARCH}.tar.gz"
  tar xzf "prometheus-${PROM_VER}.${ARCH}.tar.gz"
  install -m 0755 -o prometheus -g prometheus "prometheus-${PROM_VER}.${ARCH}/prometheus" /usr/local/bin/prometheus
  install -m 0755 -o prometheus -g prometheus "prometheus-${PROM_VER}.${ARCH}/promtool" /usr/local/bin/promtool
  cp -r "prometheus-${PROM_VER}.${ARCH}/consoles" /etc/prometheus/ 2>/dev/null || true
  cp -r "prometheus-${PROM_VER}.${ARCH}/console_libraries" /etc/prometheus/ 2>/dev/null || true
  chown -R prometheus:prometheus /etc/prometheus
  rm -rf "prometheus-${PROM_VER}.${ARCH}"*
fi

log "writing prometheus.yml"
cat >/etc/prometheus/prometheus.yml <<'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['127.0.0.1:9090']
  - job_name: node_exporter
    static_configs:
      - targets: ['127.0.0.1:9100']
  - job_name: caddy
    metrics_path: /metrics
    static_configs:
      - targets: ['127.0.0.1:2019']
EOF
chown prometheus:prometheus /etc/prometheus/prometheus.yml

cat >/etc/systemd/system/prometheus.service <<'EOF'
[Unit]
Description=Prometheus
After=network-online.target
[Service]
User=prometheus
Group=prometheus
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus \
  --storage.tsdb.retention.time=30d \
  --web.listen-address=127.0.0.1:9090 \
  --web.console.templates=/etc/prometheus/consoles \
  --web.console.libraries=/etc/prometheus/console_libraries
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

############################################
# Loki (single-binary, filesystem, 30d)
############################################
log "installing loki ${LOKI_VER}"
if ! id -u loki >/dev/null 2>&1; then
  useradd --no-create-home --shell /usr/sbin/nologin loki
fi
mkdir -p /etc/loki /var/lib/loki/{chunks,rules,compactor,wal}
chown -R loki:loki /etc/loki /var/lib/loki

if [[ ! -x /usr/local/bin/loki ]] || ! /usr/local/bin/loki -version 2>&1 | grep -q "${LOKI_VER}"; then
  cd /tmp
  wget -q -O loki.zip "https://github.com/grafana/loki/releases/download/v${LOKI_VER}/loki-linux-amd64.zip"
  unzip -o loki.zip
  install -m 0755 -o loki -g loki loki-linux-amd64 /usr/local/bin/loki
  rm -f loki.zip loki-linux-amd64
fi

log "writing loki-config.yml"
cat >/etc/loki/loki-config.yml <<'EOF'
auth_enabled: false
server:
  http_listen_address: 127.0.0.1
  http_listen_port: 3100
  grpc_listen_port: 9096
common:
  path_prefix: /var/lib/loki
  storage:
    filesystem:
      chunks_directory: /var/lib/loki/chunks
      rules_directory: /var/lib/loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
limits_config:
  retention_period: 720h
  reject_old_samples: true
  reject_old_samples_max_age: 168h
compactor:
  working_directory: /var/lib/loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
ruler:
  storage:
    type: local
    local:
      directory: /var/lib/loki/rules
analytics:
  reporting_enabled: false
EOF
chown loki:loki /etc/loki/loki-config.yml

cat >/etc/systemd/system/loki.service <<'EOF'
[Unit]
Description=Loki
After=network-online.target
[Service]
User=loki
Group=loki
ExecStart=/usr/local/bin/loki -config.file=/etc/loki/loki-config.yml
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

############################################
# Grafana (apt)
############################################
log "installing grafana (apt)"
if ! command -v grafana-server >/dev/null 2>&1; then
  mkdir -p /etc/apt/keyrings
  wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
  echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" >/etc/apt/sources.list.d/grafana.list
  apt-get update -y
  apt-get install -y grafana
fi

log "writing /etc/grafana/grafana.ini"
cat >/etc/grafana/grafana.ini <<EOF
[server]
http_addr = 127.0.0.1
http_port = 3003
[security]
admin_user = admin
admin_password = ${GRAFANA_ADMIN_PASSWORD}
[analytics]
reporting_enabled = false
check_for_updates = false
[users]
allow_sign_up = false
EOF
chown root:grafana /etc/grafana/grafana.ini
chmod 640 /etc/grafana/grafana.ini

mkdir -p /etc/grafana/provisioning/datasources
cat >/etc/grafana/provisioning/datasources/datasources.yaml <<'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://127.0.0.1:9090
    isDefault: true
  - name: Loki
    type: loki
    access: proxy
    url: http://127.0.0.1:3100
EOF

############################################
# Enable + start everything
############################################
log "reloading systemd and enabling services"
systemctl daemon-reload
for svc in node_exporter prometheus loki grafana-server; do
  systemctl enable "$svc"
  systemctl restart "$svc"
done

log "done. services:"
systemctl --no-pager --lines=0 status node_exporter prometheus loki grafana-server || true
log "grafana: http://127.0.0.1:3003  prom: 127.0.0.1:9090  loki: 127.0.0.1:3100"
