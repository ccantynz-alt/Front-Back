#!/usr/bin/env bash
# install-auto-deploy.sh
#
# Installs the crontech-deploy-hook: a tiny localhost HTTP service that
# receives GitHub push webhooks for the main branch and redeploys
# /opt/crontech (git pull + bun install + bun run build + systemctl restart).
#
# Idempotent. Safe to re-run. Prints webhook URL + secret at the end.
#
# Usage:  sudo bash scripts/install-auto-deploy.sh
# Env overrides (optional):
#   DEPLOY_USER=deploy
#   DEPLOY_DIR=/opt/crontech
#   HOOK_PORT=9999
#   HOOK_HOST=hooks.crontech.ai
#   DEPLOY_WEBHOOK_SECRET=<pre-existing secret to reuse>

set -euo pipefail

log() { printf '>>> %s\n' "$*" >&2; }
die() { printf '!!! %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root (sudo)"

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/crontech}"
HOOK_PORT="${HOOK_PORT:-9999}"
HOOK_HOST="${HOOK_HOST:-hooks.crontech.ai}"
HOOK_LIB="/usr/local/lib/crontech-deploy-hook"
HOOK_BIN="$HOOK_LIB/index.js"
DEPLOY_SCRIPT="$HOOK_LIB/deploy.sh"
ENV_FILE="/etc/crontech-deploy-hook.env"
LOG_FILE="/var/log/crontech-deploy-hook.log"
UNIT_FILE="/etc/systemd/system/crontech-deploy-hook.service"
CADDY_SNIPPET="/etc/caddy/conf.d/crontech-deploy-hook.caddy"
LOCK_FILE="/var/lock/crontech-deploy.lock"

id -u "$DEPLOY_USER" >/dev/null 2>&1 || die "user '$DEPLOY_USER' missing"
[[ -d "$DEPLOY_DIR/.git" ]] || die "'$DEPLOY_DIR' is not a git checkout"
command -v bun >/dev/null 2>&1 || die "bun not in PATH"
command -v node >/dev/null 2>&1 || die "node not in PATH (hook runs on node)"

BUN_BIN="$(command -v bun)"
NODE_BIN="$(command -v node)"

log "deploy user=$DEPLOY_USER  dir=$DEPLOY_DIR  port=$HOOK_PORT  host=$HOOK_HOST"

log "ensuring directories and log file"
install -d -m 0755 "$HOOK_LIB"
install -d -m 0755 /etc/caddy/conf.d
touch "$LOG_FILE"
chown "$DEPLOY_USER:$DEPLOY_USER" "$LOG_FILE"
chmod 0640 "$LOG_FILE"

if [[ -f "$ENV_FILE" ]] && grep -q '^DEPLOY_WEBHOOK_SECRET=' "$ENV_FILE"; then
  log "reusing existing DEPLOY_WEBHOOK_SECRET from $ENV_FILE"
  # shellcheck disable=SC1090
  SECRET="$(. "$ENV_FILE" && printf '%s' "${DEPLOY_WEBHOOK_SECRET:-}")"
fi
SECRET="${DEPLOY_WEBHOOK_SECRET:-${SECRET:-}}"
if [[ -z "${SECRET:-}" ]]; then
  SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n')"
  log "generated new DEPLOY_WEBHOOK_SECRET"
fi

log "writing $ENV_FILE"
umask 077
cat >"$ENV_FILE" <<EOF
DEPLOY_WEBHOOK_SECRET=$SECRET
DEPLOY_DIR=$DEPLOY_DIR
DEPLOY_SCRIPT=$DEPLOY_SCRIPT
HOOK_PORT=$HOOK_PORT
LOG_FILE=$LOG_FILE
LOCK_FILE=$LOCK_FILE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EOF
chown root:"$DEPLOY_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
umask 022

log "writing deploy script $DEPLOY_SCRIPT"
cat >"$DEPLOY_SCRIPT" <<'DEPLOY_EOF'
#!/usr/bin/env bash
# Serialized deploy: only one runs at a time (flock in hook).
# On any failure, exit non-zero BEFORE restarting services, so old ones keep running.
set -euo pipefail
log() { printf '[deploy %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
cd "${DEPLOY_DIR:?}"
log "fetch"
git fetch --prune origin
log "checkout main"
git checkout main
log "reset --hard origin/main"
git reset --hard origin/main
log "bun install (frozen)"
bun install --frozen-lockfile
log "bun run build"
bun run build
log "build ok -> restarting services"
systemctl restart crontech-web crontech-api
log "done"
DEPLOY_EOF
chmod 0755 "$DEPLOY_SCRIPT"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_SCRIPT"

log "writing hook service $HOOK_BIN"
cat >"$HOOK_BIN" <<'HOOK_EOF'
#!/usr/bin/env node
// crontech-deploy-hook: verifies GitHub HMAC, debounces with flock, runs deploy.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.HOOK_PORT || 9999);
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT;
const LOG_FILE = process.env.LOG_FILE || '/var/log/crontech-deploy-hook.log';
const LOCK_FILE = process.env.LOCK_FILE || '/var/lock/crontech-deploy.lock';
if (!SECRET) { console.error('DEPLOY_WEBHOOK_SECRET missing'); process.exit(1); }
if (!DEPLOY_SCRIPT) { console.error('DEPLOY_SCRIPT missing'); process.exit(1); }

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const log = (...a) => {
  const line = `[hook ${new Date().toISOString()}] ${a.join(' ')}\n`;
  logStream.write(line); process.stdout.write(line);
};

function verify(sigHeader, body) {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(sigHeader); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function runDeploy() {
  return new Promise((resolve) => {
    // flock -n: fail fast if another deploy is already holding the lock.
    const child = spawn('flock', ['-n', LOCK_FILE, DEPLOY_SCRIPT], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    child.stdout.on('data', (d) => logStream.write(d));
    child.stderr.on('data', (d) => logStream.write(d));
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (e) => { log('spawn error', e.message); resolve(1); });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok\n');
  }
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404); return res.end('not found');
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    const sig = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];
    const delivery = req.headers['x-github-delivery'] || '-';
    if (!verify(sig, body)) {
      log('reject bad-signature delivery=' + delivery);
      res.writeHead(401); return res.end('bad signature');
    }
    if (event === 'ping') {
      log('ping delivery=' + delivery);
      res.writeHead(200); return res.end('pong');
    }
    if (event !== 'push') {
      log('ignore event=' + event + ' delivery=' + delivery);
      res.writeHead(202); return res.end('ignored');
    }
    let payload;
    try { payload = JSON.parse(body.toString('utf8')); }
    catch { res.writeHead(400); return res.end('bad json'); }
    const ref = payload.ref || '';
    if (ref !== 'refs/heads/main') {
      log('ignore ref=' + ref + ' delivery=' + delivery);
      res.writeHead(202); return res.end('non-main ignored');
    }
    log('deploy start delivery=' + delivery + ' after=' + (payload.after || '-'));
    const code = await runDeploy();
    if (code === 0) { log('deploy ok delivery=' + delivery); res.writeHead(200); res.end('ok'); }
    else { log('deploy FAIL code=' + code + ' delivery=' + delivery); res.writeHead(500); res.end('build failure'); }
  });
  req.on('error', (e) => { log('req error', e.message); });
});

server.listen(PORT, '127.0.0.1', () => log('listening 127.0.0.1:' + PORT));
for (const sig of ['SIGINT','SIGTERM']) process.on(sig, () => { log('shutdown ' + sig); server.close(() => process.exit(0)); });
HOOK_EOF
chmod 0755 "$HOOK_BIN"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$HOOK_LIB"

log "writing systemd unit $UNIT_FILE"
cat >"$UNIT_FILE" <<EOF
[Unit]
Description=Crontech GitHub deploy webhook
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_USER
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $HOOK_BIN
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DEPLOY_DIR $LOG_FILE $LOCK_FILE /var/lock /run/systemd

[Install]
WantedBy=multi-user.target
EOF

log "writing Caddy snippet $CADDY_SNIPPET (subdomain $HOOK_HOST)"
cat >"$CADDY_SNIPPET" <<EOF
$HOOK_HOST {
    encode zstd gzip
    @deploy path /deploy /healthz
    handle @deploy {
        reverse_proxy 127.0.0.1:$HOOK_PORT
    }
    handle { respond "not found" 404 }
}
EOF

if command -v caddy >/dev/null 2>&1 && [[ -f /etc/caddy/Caddyfile ]]; then
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    log "reloading caddy"
    systemctl reload caddy || log "WARN: caddy reload failed (check include of conf.d)"
  else
    log "WARN: caddy validate failed; ensure /etc/caddy/Caddyfile imports /etc/caddy/conf.d/*.caddy"
  fi
fi

log "systemctl daemon-reload + enable + restart"
systemctl daemon-reload
systemctl enable crontech-deploy-hook.service >/dev/null
systemctl restart crontech-deploy-hook.service
sleep 1
systemctl is-active --quiet crontech-deploy-hook.service || die "service failed to start; journalctl -u crontech-deploy-hook"

cat <<SUMMARY

================================================================
crontech-deploy-hook installed and running
================================================================
  Webhook URL:  https://$HOOK_HOST/deploy
  Secret:       $SECRET
  Content type: application/json
  Events:       Just the push event
  Service:      systemctl status crontech-deploy-hook
  Logs:         tail -f $LOG_FILE

Next: GitHub -> repo Settings -> Webhooks -> Add webhook
      Paste URL + secret above. Select "Just the push event".
================================================================
SUMMARY
