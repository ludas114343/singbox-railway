#!/bin/sh
set -eu
UUID="${SUB_UUID:-c69d9310-66db-4614-b3b7-0fb01e68b4ec}"
SB_VER="${SB_VER:-1.14.4}"

# sing-box is fetched at container start (build-time network to GitHub is not reliable here).
if [ ! -x /tmp/sing-box ]; then
  for i in 1 2 3; do
    if curl -fsSL -o /tmp/sb.tar.gz "https://github.com/SagerNet/sing-box/releases/download/v${SB_VER}/sing-box-${SB_VER}-linux-amd64.tar.gz"; then
      tar -xzf /tmp/sb.tar.gz -C /tmp && mv /tmp/sing-box-${SB_VER}-linux-amd64/sing-box /tmp/sing-box && break
    fi
    echo "[entrypoint] sing-box download attempt $i failed, retrying..."
    sleep 3
  done
fi

if [ -x /tmp/sing-box ]; then
  sed "s|__UUID__|$UUID|g" /app/singbox.json.tpl > /tmp/singbox.json
  echo "[entrypoint] sing-box $SB_VER up on :8443 (uuid=$UUID)"
  /tmp/sing-box run -c /tmp/singbox.json &
  SB_PID=$!
else
  echo "[entrypoint] WARN: sing-box unavailable, falling back to node gateway on :8443"
  SB_PID=""
fi

if [ -n "$SB_PID" ]; then
  PORT=8444 SUB_PORT="${SUB_PORT:-8080}" node /app/server.js &
else
  PORT=8443 SUB_PORT="${SUB_PORT:-8080}" node /app/server.js &
fi
NODE_PID=$!
trap 'kill $SB_PID $NODE_PID 2>/dev/null; exit 0' INT TERM
wait $NODE_PID