#!/usr/bin/env bash
# Gatekeeper agent — one-shot install on the Hermes VPS (Ubuntu).
# Run as root in the Hostinger browser terminal:
#   bash <(curl -fsSL https://raw.githubusercontent.com/anpratama/agent-games-gatekeeper/main/deploy/install.sh)
# Idempotent: safe to re-run (pulls latest, restarts services).
set -euo pipefail

APP_DIR=/opt/gatekeeper-agent
REPO=https://github.com/anpratama/agent-games-gatekeeper.git

echo "== 1/5 Node.js =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "== 2/5 Code =="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
mkdir -p "$APP_DIR/data" "$APP_DIR/circuits"
if [ ! -s "$APP_DIR/circuits/gatekeeper.wasm" ]; then
  curl -fsSL -o "$APP_DIR/circuits/gatekeeper.wasm" https://agentgames.zkverify.io/circuits/gatekeeper.wasm
fi
if [ ! -s "$APP_DIR/circuits/gatekeeper_final.zkey" ]; then
  curl -fsSL -o "$APP_DIR/circuits/gatekeeper_final.zkey" https://agentgames.zkverify.io/circuits/gatekeeper_final.zkey
fi
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "!! .env created from example — set AGENT_GAMES_HMAC_SECRET in it (step: Rotate Secret on the Agent Games dashboard), then: systemctl restart gatekeeper-agent"
fi

echo "== 3/5 Agent service =="
cp "$APP_DIR/deploy/gatekeeper-agent.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gatekeeper-agent
sleep 2
curl -fsS localhost:8080/health && echo

echo "== 4/5 cloudflared (public HTTPS tunnel) =="
if ! command -v cloudflared >/dev/null 2>&1; then
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  dpkg -i /tmp/cloudflared.deb
fi
cp "$APP_DIR/deploy/gatekeeper-tunnel.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gatekeeper-tunnel

echo "== 5/5 Public URL (tunggu ~10 detik) =="
for i in $(seq 1 15); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /var/log/gatekeeper-tunnel.log 2>/dev/null | tail -1 || true)
  [ -n "${URL:-}" ] && break
  sleep 2
done
echo "AGENT ENDPOINT: ${URL:-NOT_READY}/agent"
echo "Register that exact URL in the Agent Games dashboard (Proof Gatekeeper)."
echo "NOTE: a trycloudflare URL changes if the tunnel restarts — re-check this log and update the dashboard if it ever changes."
