#!/usr/bin/env python3
"""Clash 订阅生成器: 读 sing-box clash_api 真实累计流量 (uploadTotal/downloadTotal)
生成带 Subscription-Userinfo 头的订阅, Clash Verge Rev / Meta 客户端直接显示已用/总量
"""
import json, time, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

UUID = "c69d9310-66db-4614-b3b7-0fb01e68b4ec"
HOST = "singbox-lite-production.up.railway.app"
TOTAL_BYTES = 90 * 1024 * 1024 * 1024  # 90GB
EXPIRE = 1786939200  # Trial 到期 2026-09-09 前后

CLASH_YAML = f"""# Railway Ubuntu 节点 - Clash Meta 订阅
# upload=0 download=0 total={TOTAL_BYTES} expire={EXPIRE}

proxies:
  - name: "Railway-Ubuntu"
    type: vless
    server: {HOST}
    port: 443
    uuid: {UUID}
    network: ws
    tls: true
    servername: {HOST}
    client-fingerprint: chrome
    ws-opts:
      path: "/ws"
      headers:
        Host: {HOST}
    udp: true

proxy-groups:
  - name: "🚀 节点选择"
    type: select
    proxies:
      - "♻️ 自动选择"
      - "Railway-Ubuntu"
      - "DIRECT"

  - name: "♻️ 自动选择"
    type: url-test
    url: "http://www.gstatic.com/generate_204"
    interval: 300
    proxies:
      - "Railway-Ubuntu"

rules:
  - GEOIP,CN,DIRECT
  - MATCH,🚀 节点选择
"""

def get_traffic():
    """读 sing-box clash_api 累计流量 (普通 GET, 不挂起)"""
    try:
        with urllib.request.urlopen("http://127.0.0.1:9090/connections", timeout=5) as r:
            d = json.loads(r.read().decode())
            return int(d.get("uploadTotal", 0)), int(d.get("downloadTotal", 0))
    except Exception:
        return 0, 0

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        up, down = get_traffic()
        used = up + down
        body = CLASH_YAML.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/yaml; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # Clash 客户端靠这个头显示流量: 已用 (upload+download) / 总量
        self.send_header("Subscription-Userinfo",
                         f"upload={up}; download={down}; total={TOTAL_BYTES}; expire={EXPIRE}")
        self.send_header("Profile-Update-Interval", "6")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
