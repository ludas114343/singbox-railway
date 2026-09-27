#!/bin/bash
nohup bash /usr/local/bin/traffic-watchdog.sh > /var/log/watchdog.log 2>&1 &
nohup python3 /usr/local/bin/sub_server.py > /var/log/sub_server.log 2>&1 &
exec /usr/local/bin/sing-box run -c /etc/sing-box/config.json
