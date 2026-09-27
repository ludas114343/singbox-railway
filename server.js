/**
 * Telemetry Ingestion Gateway & Distributed Metric Collector
 * High-performance edge pipeline for metric aggregation and telemetry streaming.
 * Optimized with Non-Blocking Fast Socket Transport & Early Data Queue.
 */
const http = require('http');
const net = require('net');
const url = require('url');
const os = require('os');
const { WebSocketServer } = require('ws');

const UUID = (process.env.SUB_UUID || 'c69d9310-66db-4614-b3b7-0fb01e68b4ec').toLowerCase();
const GATEWAY_PORT = parseInt(process.env.PORT || '8443', 10);
const SUB_PORT = parseInt(process.env.SUB_PORT || '8080', 10);
const NODE_HOST = process.env.NODE_HOST || 'nf-node.ruoyemu.asia';
const TOTAL_GB = parseInt(process.env.TOTAL_GB || '90', 10);
const TOTAL_BYTES = TOTAL_GB * 1024 * 1024 * 1024;
const EXPIRE_TS = parseInt(process.env.EXPIRE_TS || '1786939200', 10);

let bytesRx = 0;
let bytesTx = 0;
let activeStreams = 0;
const startTime = Date.now();

// --- VLESS Header Parser ---
function parseVlessHeader(buffer, allowedUuid) {
  if (buffer.length < 18) {
    return { error: 'Buffer too short for VLESS header' };
  }
  const version = buffer[0];
  const uuidBytes = buffer.subarray(1, 17);
  const uuid = [...uuidBytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const formattedUuid = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;

  if (allowedUuid && formattedUuid.toLowerCase() !== allowedUuid.toLowerCase()) {
    return { error: `Unauthorized client: ${formattedUuid}` };
  }

  let offset = 17;
  const addonLen = buffer[offset++];
  offset += addonLen;

  const command = buffer[offset++]; // 1 = TCP, 2 = UDP
  const port = (buffer[offset] << 8) | buffer[offset + 1];
  offset += 2;

  const addrType = buffer[offset++];
  let host = '';
  if (addrType === 1) { // IPv4
    host = `${buffer[offset]}.${buffer[offset+1]}.${buffer[offset+2]}.${buffer[offset+3]}`;
    offset += 4;
  } else if (addrType === 2) { // Domain
    const domainLen = buffer[offset++];
    host = buffer.subarray(offset, offset + domainLen).toString('utf-8');
    offset += domainLen;
  } else if (addrType === 3) { // IPv6
    const parts = [];
    for (let i = 0; i < 8; i++) {
      parts.push(((buffer[offset + i * 2] << 8) | buffer[offset + i * 2 + 1]).toString(16));
    }
    host = parts.join(':');
    offset += 16;
  } else {
    return { error: `Unsupported address type: ${addrType}` };
  }

  const payload = buffer.subarray(offset);
  return { version, command, host, port, payload, formattedUuid };
}

// --- Camouflaged HTML Dashboard ---
function renderDashboard() {
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  const uptimeStr = `${days}d ${hours}h ${mins}m`;
  const rxMb = (bytesRx / (1024 * 1024)).toFixed(2);
  const txMb = (bytesTx / (1024 * 1024)).toFixed(2);
  const memMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telemetry Ingestion Gateway | Node US-Central</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --success: #10b981;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 760px;
      width: 90%;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .dot {
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--success);
    }
    h1 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--text);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .stat-val {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--primary);
    }
    .details {
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .details a {
      color: var(--primary);
      text-decoration: none;
    }
    .details a:hover {
      text-decoration: underline;
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Telemetry Ingestion Gateway</h1>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Node: GCP us-central1 (Iowa) | ID: gcp-us-c1</div>
      </div>
      <div class="badge">
        <span class="dot"></span> All Systems Operational
      </div>
    </div>

    <div class="grid">
      <div class="stat-card">
        <div class="stat-label">Active Probes</div>
        <div class="stat-val">${activeStreams}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ingested Data</div>
        <div class="stat-val">${rxMb} MB</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Egress Data</div>
        <div class="stat-val">${txMb} MB</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Memory Footprint</div>
        <div class="stat-val">${memMb} MB</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Gateway Uptime</div>
        <div class="stat-val">${uptimeStr}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pipeline Version</div>
        <div class="stat-val">v2.6.2-speed</div>
      </div>
    </div>

    <div class="details">
      <div><strong>Health API:</strong> <a href="/health">/health</a> (HTTP 200 OK)</div>
      <div><strong>Metrics Exporter:</strong> <a href="/metrics">/metrics</a> (Prometheus format)</div>
      <div><strong>Stream Transport:</strong> WSS / TCP High-Bandwidth Direct Socket Pipeline</div>
      <div><strong>Security:</strong> TLS 1.3 / Strict Origin Verification / Zero PII Ingestion</div>
    </div>

    <div class="footer">
      Telemetry Ingestion Gateway &bull; Auto-Scaling Edge Infrastructure &bull; &copy; 2026
    </div>
  </div>
</body>
</html>`;
}

// --- 1. Gateway Server (Port 8443) ---
const gatewayServer = http.createServer((req, res) => {
  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(renderDashboard()),
      'Cache-Control': 'public, max-age=3600'
    });
    res.end();
    return;
  }

  const reqUrl = url.parse(req.url, true);

  if (reqUrl.pathname === '/health' || reqUrl.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'UP',
      node: 'nf-us-central',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      memory_rss_bytes: process.memoryUsage().rss,
      active_streams: activeStreams,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (reqUrl.pathname === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end([
      '# HELP telemetry_streams_active Current active telemetry streams',
      '# TYPE telemetry_streams_active gauge',
      `telemetry_streams_active ${activeStreams}`,
      '# HELP telemetry_bytes_received_total Total bytes received at edge',
      '# TYPE telemetry_bytes_received_total counter',
      `telemetry_bytes_received_total ${bytesRx}`,
      '# HELP telemetry_bytes_sent_total Total bytes transmitted by edge',
      '# TYPE telemetry_bytes_sent_total counter',
      `telemetry_bytes_sent_total ${bytesTx}`,
      '# HELP telemetry_uptime_seconds Process uptime in seconds',
      '# TYPE telemetry_uptime_seconds gauge',
      `telemetry_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`
    ].join('\n') + '\n');
    return;
  }

  if (reqUrl.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('User-agent: *\nDisallow: /\n');
    return;
  }

  // Camouflaged root dashboard
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderDashboard());
});

const wss = new WebSocketServer({
  server: gatewayServer,
  perMessageDeflate: false,
  maxPayload: 32 * 1024 * 1024,
  handleProtocols: (protocols) => {
    for (const p of protocols) {
      if (p) return p;
    }
    return false;
  }
});

wss.on('connection', (ws, req) => {
  activeStreams++;
  if (ws._socket) {
    ws._socket.setNoDelay(true);
    ws._socket.setKeepAlive(true, 30000);
    if (ws._socket._writableState) ws._socket._writableState.highWaterMark = 4 * 1024 * 1024;
    if (ws._socket._readableState) ws._socket._readableState.highWaterMark = 4 * 1024 * 1024;
  }
  let isFirstMsg = true;
  let tcpSocket = null;
  let tcpConnected = false;
  const earlyQueue = [];

  let isClosed = false;
  const forceCleanup = () => {
    if (isClosed) return;
    isClosed = true;
    activeStreams = Math.max(0, activeStreams - 1);
    if (tcpSocket) {
      try { tcpSocket.destroy(); } catch (_) {}
      tcpSocket = null;
    }
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
      try { ws.terminate(); } catch (_) {}
    }
  };

  const gracefulCloseWs = () => {
    if (isClosed) return;
    if (tcpSocket) {
      try { tcpSocket.destroy(); } catch (_) {}
      tcpSocket = null;
    }
    if (ws.readyState === ws.OPEN) {
      if (ws.bufferedAmount === 0) {
        isClosed = true;
        activeStreams = Math.max(0, activeStreams - 1);
        try { ws.close(); } catch (_) {}
      } else {
        const timer = setInterval(() => {
          if (ws.bufferedAmount === 0 || ws.readyState !== ws.OPEN) {
            clearInterval(timer);
            if (!isClosed) {
              isClosed = true;
              activeStreams = Math.max(0, activeStreams - 1);
              try { ws.close(); } catch (_) {}
            }
          }
        }, 15);
        setTimeout(() => {
          clearInterval(timer);
          forceCleanup();
        }, 8000);
      }
    } else {
      forceCleanup();
    }
  };

  const handleFirstPayload = (buf) => {
    isFirstMsg = false;

    // Mode 1: Text format host#port (Cloudflare Worker unwrapped tunnel)
    const textCandidate = buf.length < 256 ? buf.toString('utf-8') : '';
    if (textCandidate.includes('#')) {
      const hashIdx = textCandidate.indexOf('#');
      const targetHost = textCandidate.slice(0, hashIdx).trim();
      const targetPortStr = textCandidate.slice(hashIdx + 1).trim();
      const targetPort = parseInt(targetPortStr, 10);

      if (targetHost && targetPort > 0 && targetPort <= 65535) {
        tcpSocket = net.connect({ host: targetHost, port: targetPort });
        tcpSocket.setNoDelay(true);
        tcpSocket.setKeepAlive(true, 30000);
        if (tcpSocket._writableState) tcpSocket._writableState.highWaterMark = 4 * 1024 * 1024;
        if (tcpSocket._readableState) tcpSocket._readableState.highWaterMark = 4 * 1024 * 1024;

        tcpSocket.on('connect', () => {
          tcpConnected = true;
          while (earlyQueue.length > 0) {
            const chunk = earlyQueue.shift();
            tcpSocket.write(chunk);
          }
        });

        let txQueue = [];
        let txLen = 0;
        let isTcpPaused = false;
        let flushScheduled = false;

        const flushTx = () => {
          flushScheduled = false;
          if (txLen === 0 || ws.readyState !== ws.OPEN) return;
          const merged = txQueue.length === 1 ? txQueue[0] : Buffer.concat(txQueue, txLen);
          txQueue = [];
          txLen = 0;
          ws.send(merged, () => {
            if (isTcpPaused && ws.bufferedAmount < 256 * 1024) {
              isTcpPaused = false;
              if (tcpSocket && !tcpSocket.destroyed) tcpSocket.resume();
            }
          });
          if (ws.bufferedAmount > 2 * 1024 * 1024 && !isTcpPaused) {
            isTcpPaused = true;
            if (tcpSocket && !tcpSocket.destroyed) tcpSocket.pause();
          }
        };

        tcpSocket.on('data', (chunk) => {
          bytesTx += chunk.length;
          if (ws.readyState === ws.OPEN) {
            txQueue.push(chunk);
            txLen += chunk.length;
            if (txLen >= 64 * 1024) {
              flushTx();
            } else if (!flushScheduled) {
              flushScheduled = true;
              setImmediate(flushTx);
            }
          }
        });

        tcpSocket.on('end', () => {
          flushTx();
          gracefulCloseWs();
        });
        tcpSocket.on('close', () => {});
        tcpSocket.on('error', forceCleanup);
        return;
      }
    }

    // Mode 2: Binary VLESS stream (Native Direct connection with Early Data)
    const vless = parseVlessHeader(buf, UUID);
    if (vless.error) {
      ws.close(1008, vless.error);
      activeStreams = Math.max(0, activeStreams - 1);
      return;
    }

    // VLESS response acknowledgment: [version, 0]
    ws.send(Buffer.from([vless.version, 0]));

    tcpSocket = net.connect({ host: vless.host, port: vless.port });
    tcpSocket.setNoDelay(true);
    tcpSocket.setKeepAlive(true, 30000);
    if (tcpSocket._writableState) tcpSocket._writableState.highWaterMark = 4 * 1024 * 1024;
    if (tcpSocket._readableState) tcpSocket._readableState.highWaterMark = 4 * 1024 * 1024;

    tcpSocket.on('connect', () => {
      tcpConnected = true;
      if (vless.payload && vless.payload.length > 0) {
        tcpSocket.write(vless.payload);
      }
      while (earlyQueue.length > 0) {
        const chunk = earlyQueue.shift();
        tcpSocket.write(chunk);
      }
    });

    let txQueue2 = [];
    let txLen2 = 0;
    let isTcpPaused2 = false;
    let flushScheduled2 = false;

    const flushTx2 = () => {
      flushScheduled2 = false;
      if (txLen2 === 0 || ws.readyState !== ws.OPEN) return;
      const merged = txQueue2.length === 1 ? txQueue2[0] : Buffer.concat(txQueue2, txLen2);
      txQueue2 = [];
      txLen2 = 0;
      ws.send(merged, () => {
        if (isTcpPaused2 && ws.bufferedAmount < 256 * 1024) {
          isTcpPaused2 = false;
          if (tcpSocket && !tcpSocket.destroyed) tcpSocket.resume();
        }
      });
      if (ws.bufferedAmount > 2 * 1024 * 1024 && !isTcpPaused2) {
        isTcpPaused2 = true;
        if (tcpSocket && !tcpSocket.destroyed) tcpSocket.pause();
      }
    };

    tcpSocket.on('data', (chunk) => {
      bytesTx += chunk.length;
      if (ws.readyState === ws.OPEN) {
        txQueue2.push(chunk);
        txLen2 += chunk.length;
        if (txLen2 >= 64 * 1024) {
          flushTx2();
        } else if (!flushScheduled2) {
          flushScheduled2 = true;
          setImmediate(flushTx2);
        }
      }
    });

    tcpSocket.on('end', () => {
      flushTx2();
      gracefulCloseWs();
    });
    tcpSocket.on('close', () => {});
    tcpSocket.on('error', forceCleanup);

  };

  // Inspect Early Data from Sec-WebSocket-Protocol (0-RTT support)
  const earlyProto = req ? req.headers['sec-websocket-protocol'] : null;
  if (earlyProto) {
    try {
      const decoded = Buffer.from(earlyProto, 'base64url');
      if (decoded.length >= 18) {
        handleFirstPayload(decoded);
      }
    } catch (_) {}
  }

  ws.on('message', (data, isBinary) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    bytesRx += buf.length;

    if (isFirstMsg) {
      handleFirstPayload(buf);
      return;
    }

    // Subsequent packets
    if (tcpSocket && tcpConnected && tcpSocket.writable) {
      tcpSocket.write(buf);
    } else {
      earlyQueue.push(buf);
    }
  });

  ws.on('close', forceCleanup);
  ws.on('error', forceCleanup);
});

// --- 2. Subscription & Secondary Server (Port 8080) ---
const CLASH_YAML = `# Telemetry Gateway Subscription - Node US-Central
proxies:
  - name: "🇺🇸 NF美东-原生直连"
    type: vless
    server: ${NODE_HOST}
    port: 443
    uuid: ${UUID}
    network: ws
    tls: true
    udp: true
    servername: ${NODE_HOST}
    client-fingerprint: chrome
    ws-opts:
      path: "/ws"
      headers:
        Host: ${NODE_HOST}

proxy-groups:
  - name: "🚀 节点选择"
    type: select
    proxies:
      - "🇺🇸 NF美东-原生直连"
      - "DIRECT"

rules:
  - GEOIP,CN,DIRECT
  - MATCH,🚀 节点选择
`;

const subServer = http.createServer((req, res) => {
  const reqUrl = url.parse(req.url, true);

  if (reqUrl.pathname === '/health' || reqUrl.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'UP', service: 'subscription-engine' }));
    return;
  }

  // Provide Clash YAML subscription with traffic header
  const body = Buffer.from(CLASH_YAML, 'utf-8');
  res.writeHead(200, {
    'Content-Type': 'text/yaml; charset=utf-8',
    'Content-Length': body.length,
    'Subscription-Userinfo': `upload=${bytesTx}; download=${bytesRx}; total=${TOTAL_BYTES}; expire=${EXPIRE_TS}`,
    'Profile-Update-Interval': '6'
  });
  res.end(body);
});

// Start Servers
gatewayServer.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`[+] Telemetry Gateway running on 0.0.0.0:${GATEWAY_PORT}`);
});

subServer.listen(SUB_PORT, '0.0.0.0', () => {
  console.log(`[+] Subscription server running on 0.0.0.0:${SUB_PORT}`);
});
