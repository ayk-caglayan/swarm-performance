import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { randomBytes, X509Certificate } from 'node:crypto';
import { DOMAIN, domainTls } from './scripts/domain-tls.js';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import osc from 'osc';
import { WebSocketServer, WebSocket } from 'ws';
import { VERSION, FIELDS, validId, integer, validState } from './public/protocol.js';

const assets = new Map([
  ['/', ['public/index.html', 'text/html']],
  ...['app.js', 'audio.js', 'protocol.js', 'wake-lock.js'].map(name => ['/' + name, ['public/' + name, 'text/javascript']]),
  ['/swarm-ca.crt', ['.certs/swarm-ca.crt', 'application/x-x509-ca-cert']],
  ['/style.css', ['public/style.css', 'text/css']],
  ['/p5.min.js', ['node_modules/p5/lib/p5.min.js', 'text/javascript']]
]);

export async function startGateway({ httpPort = 8081, httpsPort = 8443, tls, domain = false, oscPort = 57121, host = '0.0.0.0', log = console.log } = {}) {
  if (domain && !tls) throw new Error('Domain mode requires a trusted domain certificate. See README.');
  const clients = new Map();
  const epoch = randomBytes(8).toString('hex');
  let master = null, stopped = false;
  const handler = async (req, res) => {
    const asset = assets.get(req.url?.split('?')[0]);
    if (!asset || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end(); return; }
    try {
      const data = await readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(503).end('Missing local assets. Run npm install.'); }
  };
  const server = http.createServer(handler);
  const secureServer = tls ? https.createServer(tls, handler) : null;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const udp = new osc.UDPPort({ localAddress: '127.0.0.1', localPort: oscPort, metadata: false });
  function send(client, message) {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    if (client.ws.bufferedAmount > 32768) {
      client.blockedAt ??= performance.now();
      if (performance.now() - client.blockedAt > 1000) client.ws.terminate();
      return; // Full snapshots replace obsolete updates on the next tick.
    }
    client.blockedAt = null;
    client.ws.send(JSON.stringify({ v: VERSION, ...message }));
  }
  const broadcast = message => { for (const client of clients.values()) send(client, message); };
  function report(client, connected = 1) {
    if (!master) return;
    const s = client.status;
    udp.send({ address: '/swarm/client', args: [client.id, connected, s.ready, s.muted, s.visible, s.fps, s.revision, client.rtt, s.audio] }, '127.0.0.1', master.port);
  }
  function reset(reason) {
    for (const client of clients.values()) { client.state = null; client.status.ready = 0; }
    broadcast({ type: 'reset', reason });
  }
  const upgrade = (req, socket, head) => {
    const scheme = req.socket.encrypted ? 'https://' : 'http://';
    if (req.url !== '/socket' || (req.headers.origin && req.headers.origin !== scheme + req.headers.host) || wss.clients.size >= 16) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  };
  server.on('upgrade', upgrade);
  secureServer?.on('upgrade', upgrade);
  wss.on('connection', ws => {
    let client, count = 0, windowStart = performance.now();
    const helloDeadline = setTimeout(() => { if (!client) ws.close(1008, 'Register first'); }, 3000);
    ws.on('error', () => {});
    ws.on('message', raw => {
      const now = performance.now();
      if (now - windowStart > 1000) { count = 0; windowStart = now; }
      if (++count > 40) { ws.close(1008, 'Too many messages'); return; }
      let m;
      try { m = JSON.parse(raw); } catch { ws.close(1008, 'Invalid JSON'); return; }
      if (!m || m.v !== VERSION) { ws.close(1008, 'Protocol version'); return; }
      if (!client) {
        if (m.type !== 'hello' || (m.id !== undefined && !validId(m.id))) { ws.close(1008, 'Invalid registration'); return; }
        const id = m.id || randomBytes(6).toString('hex');
        const previous = clients.get(id);
        if (previous) { report(previous, 0); previous.ws.close(1000, 'Replaced connection'); }
        client = { id, ws, state: null, rtt: -1, probe: null, status: { ready: 0, muted: 0, visible: 1, fps: 0, revision: -1, audio: 'not-enabled' } };
        clients.set(id, client); clearTimeout(helloDeadline);
        send(client, { type: 'welcome', id });
        if (master) send(client, { type: 'heartbeat' });
        report(client); return;
      }
      if (clients.get(client.id) !== client) return;
      if (m.type === 'status' && ['ready', 'muted', 'visible'].every(k => integer(m[k], 0, 1)) && Number.isFinite(m.fps) && m.fps >= 0 && m.fps <= 240 && integer(m.revision, -1, Number.MAX_SAFE_INTEGER) && ['not-enabled', 'running', 'suspended', 'interrupted', 'closed'].includes(m.audio)) {
        client.status = { ready: m.ready, muted: m.muted, visible: m.visible, fps: m.fps, revision: m.revision, audio: m.audio }; report(client);
      } else if (m.type === 'ack' && client.probe && m.token === client.probe.token) {
        client.rtt = Math.round(now - client.probe.sent); client.probe = null;
      } else { ws.close(1008, 'Invalid client message'); }
    });
    ws.on('close', () => { clearTimeout(helloDeadline); if (client && clients.get(client.id) === client) { report(client, 0); clients.delete(client.id); } });
  });
  udp.on('message', (message, time, info) => {
    if (info.address !== '127.0.0.1') return;
    const a = message.args, now = performance.now();
    if (!Array.isArray(a)) return;
    if (message.address === '/swarm/heartbeat' && a.length === 1 && typeof a[0] === 'string' && /^[\w-]{1,80}$/.test(a[0])) {
      udp.send({ address: '/swarm/gateway', args: [epoch] }, '127.0.0.1', info.port);
      if (!master || master.session !== a[0] || master.port !== info.port) {
        reset('Master connected; enable sound to join');
        master = { session: a[0], port: info.port, last: now };
        for (const c of clients.values()) report(c);
      }
      master.last = now; broadcast({ type: 'heartbeat' }); return;
    }
    if (!master || info.port !== master.port || now - master.last >= 3000) return;
    if (message.address === '/swarm/panic' && a.length === 0) {
      for (const c of clients.values()) if (c.state) c.state.state.gate = 0;
      broadcast({ type: 'panic' }); return;
    }
    if (!(a[0] === '*' || validId(a[0]))) return;
    const targets = a[0] === '*' ? [...clients.values()] : [clients.get(a[0])].filter(Boolean);
    if (message.address === '/swarm/state' && a.length === FIELDS.length + 2 && integer(a[1], 0, Number.MAX_SAFE_INTEGER)) {
      const state = Object.fromEntries(FIELDS.map((key, i) => [key, a[i + 2]]));
      if (!validState(state)) return;
      for (const c of targets) {
        if (c.state && a[1] < c.state.revision) continue;
        c.state = { type: 'state', revision: a[1], state: { ...state } }; send(c, c.state);
      }
    } else if (message.address === '/swarm/beep' && a.length === 2 && integer(a[1], 0, Number.MAX_SAFE_INTEGER)) {
      for (const c of targets) if (c.state) send(c, { type: 'beep', event: a[1] });
    }
  });
  const interval = setInterval(() => {
    if (master && performance.now() - master.last >= 3000) { master = null; reset('Master unavailable'); }
    for (const c of clients.values()) {
      if (c.probe && performance.now() - c.probe.sent >= 5000) { c.ws.terminate(); continue; }
      if (!c.probe) {
        c.probe = { token: randomBytes(4).toString('hex'), sent: performance.now() };
        send(c, { type: 'probe', token: c.probe.token });
      }
      report(c);
    }
  }, 1000);
  async function close() {
    if (stopped) return;
    stopped = true; master = null; clearInterval(interval);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    try { udp.close(); } catch (error) { if (error.code !== 'ERR_SOCKET_DGRAM_NOT_RUNNING') throw error; }
    if (server.listening) await new Promise(resolve => server.close(resolve));
    if (secureServer?.listening) await new Promise(resolve => secureServer.close(resolve));
  }
  try {
    await new Promise((resolve, reject) => { udp.once('ready', resolve); udp.once('error', reject); udp.open(); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(httpPort, host, resolve); });
    if (secureServer) await new Promise((resolve, reject) => { secureServer.once('error', reject); secureServer.listen(httpsPort, host, resolve); });
  } catch (error) { await close(); throw new Error(`Gateway could not start (${error.code || error.message}). Check HTTP ${httpPort}, HTTPS ${httpsPort} and OSC ${oscPort}. EACCES means the OS denied binding the port; do not run the gateway as root.`, { cause: error }); }
  udp.on('error', error => log('OSC error: ' + error.message));
  server.on('error', error => log('HTTP error: ' + error.message));
  secureServer?.on('error', error => log('HTTPS error: ' + error.message));
  const port = server.address().port;
  log(`Nervengarten: http://localhost:${port} | OSC 127.0.0.1:${udp.socket.address().port}`);
  if (!domain) for (const addresses of Object.values(networkInterfaces())) for (const a of addresses || []) if (a.family === 'IPv4' && !a.internal) log(`Phone URL: http://${a.address}:${port}`);
  const securePort = secureServer?.address().port;
  if (secureServer && domain) {
    log(`Phone URL: https://${DOMAIN}${securePort === 443 ? '' : ':' + securePort}`);
    log('Domain certificate expires: ' + new X509Certificate(tls.cert).validTo);
  } else if (secureServer) {
    for (const addresses of Object.values(networkInterfaces())) for (const a of addresses || []) if (a.family === 'IPv4' && !a.internal) log(`Keep-awake URL: https://${a.address}:${securePort} (trust Swarm LAN CA on the phone first; see README)`);
  } else log('Automatic screen wake needs HTTPS. Run npm run setup:https, then restart.');
  return { close, port, httpsPort: securePort, oscPort: udp.socket.address().port };
}

async function localTls() {
  const files = await Promise.allSettled(['server-key.pem', 'server-cert.pem'].map(name => readFile(new URL('.certs/' + name, import.meta.url))));
  if (files.every(f => f.status === 'rejected' && f.reason.code === 'ENOENT')) return undefined;
  if (files.some(f => f.status === 'rejected')) throw new Error('Incomplete or unreadable HTTPS certificates. Run npm run setup:https.');
  return { key: files[0].value, cert: files[1].value };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const domain = process.argv.includes('--domain');
  (domain ? domainTls() : localTls()).then(tls => startGateway({ tls, domain, httpsPort: domain ? 443 : 8443 })).then(gateway => {
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => gateway.close().then(() => process.exit()));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
