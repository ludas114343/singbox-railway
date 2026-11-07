#!/bin/sh
set -eu
UUID="${SUB_UUID:-c69d9310-66db-4614-b3b7-0fb01e68b4ec}"
sed "s|__UUID__|$UUID|g" /app/singbox.json.tpl > /app/singbox.json
echo "[entrypoint] starting sing-box on :8443 (uuid=$UUID)"
/app/sing-box run -c /app/singbox.json &
SB_PID=$!
echo "[entrypoint] starting node subscription server on :${SUB_PORT:-8080}"
PORT=8444 SUB_PORT="${SUB_PORT:-8080}" node /app/server.js &
NODE_PID=$!
trap 'kill $SB_PID $NODE_PID 2>/dev/null; exit 0' INT TERM
wait $SB_PID $NODE_PID