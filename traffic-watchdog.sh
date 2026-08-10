#!/bin/bash
# 流量限制看门狗: 每 5 分钟查 sing-box clash_api 累计流量, 超 90GB 自动 kill sing-box
LOG=/var/log/watchdog.log
LIMIT=$((90 * 1024 * 1024 * 1024))

log() { echo "[$(date '+%F %T')] $1" >> $LOG; }
log "watchdog started, limit=${LIMIT} bytes (90GB)"

while true; do
  TR=$(curl -s -m 5 http://127.0.0.1:9090/connections 2>/dev/null)
  if [ -n "$TR" ]; then
    UP=$(echo "$TR" | sed -n 's/.*"uploadTotal":\([0-9]*\).*/\1/p')
    DOWN=$(echo "$TR" | sed -n 's/.*"downloadTotal":\([0-9]*\).*/\1/p')
    UP=${UP:-0}; DOWN=${DOWN:-0}
    TOTAL=$((UP + DOWN))
    log "usage: up=$((UP/1024/1024))MB down=$((DOWN/1024/1024))MB total=$((TOTAL/1024/1024/1024))GB"
    if [ "$TOTAL" -gt "$LIMIT" ]; then
      log "!!! 90GB LIMIT REACHED ($TOTAL > $LIMIT) - killing sing-box"
      pkill -f 'sing-box run'
      exit 0
    fi
  else
    log "connections api not reachable"
  fi
  sleep 300
done
