#!/bin/bash
# 流量限制看门狗: 每 5 分钟查 sing-box clash_api 累计流量, 超 15GB 自动 kill sing-box
# 15GB 预算依据: Free 计划 $1/月 = 内存(休眠~$0.17) + CPU(~$0.02) + 流量(15GB×$0.05=$0.75)
LOG=/var/log/watchdog.log
LIMIT=$((15 * 1024 * 1024 * 1024))

log() { echo "[$(date '+%F %T')] $1" >> $LOG; }
log "watchdog started, limit=${LIMIT} bytes (15GB)"

while true; do
  TR=$(curl -s -m 5 http://127.0.0.1:9090/connections 2>/dev/null)
  if [ -n "$TR" ]; then
    UP=$(echo "$TR" | sed -n 's/.*"uploadTotal":\([0-9]*\).*/\1/p')
    DOWN=$(echo "$TR" | sed -n 's/.*"downloadTotal":\([0-9]*\).*/\1/p')
    UP=${UP:-0}; DOWN=${DOWN:-0}
    TOTAL=$((UP + DOWN))
    log "usage: up=$((UP/1024/1024))MB down=$((DOWN/1024/1024))MB total=$((TOTAL/1024/1024/1024))GB"
    if [ "$TOTAL" -gt "$LIMIT" ]; then
      log "!!! 15GB LIMIT REACHED ($TOTAL > $LIMIT) - killing sing-box"
      pkill -f 'sing-box run'
      exit 0
    fi
  else
    log "connections api not reachable"
  fi
  sleep 300
done
