{
  "log": { "level": "warn", "timestamp": true },
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-ws",
      "listen": "0.0.0.0",
      "listen_port": 8443,
      "users": [ { "uuid": "__UUID__" } ],
      "transport": { "type": "ws", "path": "/ws" }
    }
  ],
  "outbounds": [ { "type": "direct", "tag": "direct" } ]
}