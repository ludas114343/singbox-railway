#!/bin/bash
# 启动 sing-box + 流量看门狗
nohup bash /usr/local/bin/traffic-watchdog.sh > /var/log/watchdog.log 2>&1 &
exec /usr/local/bin/sing-box run -c /etc/sing-box/config.json
