#!/bin/bash
# 流量限制看门狗: 每 5 分钟查 clash_api 累计流量, 超 90GB 自动 kill sing-box
LOG=/var/log/watchdog.log
LIMIT=$((90 * 1024 * 1024 * 1024))

log() { echo "[$(date '+%F %T')] $1" >> $LOG; }
log "watchdog started, limit=${LIMIT} bytes (90GB)"

while true; do
  TR=$(curl -s -m 5 http://127.0.0.1:9090/traffic 2>/dev/null)
  if [ -n "$TR" ]; then
    TOTAL=$(echo "$TR" | sed 's/[^0-9,{}:]*//g' | tr ',' '\n' | grep -oE '[0-9]+' | awk '{s+=$1} END {print s+0}')
    log "total traffic: ${TOTAL} bytes"
    if [ "${TOTAL}" -gt "${LIMIT}" ]; then
      log "!!! 90GB LIMIT REACHED - killing sing-box"
      pkill -f 'sing-box run'
      exit 0
    fi
  else
    log "traffic api not reachable"
  fi
  sleep 300
done
