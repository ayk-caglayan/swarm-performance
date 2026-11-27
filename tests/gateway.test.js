import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import osc from 'osc';
import { WebSocket } from 'ws';
import { startGateway } from '../server.js';
import { DEFAULTS, FIELDS } from '../public/protocol.js';
import https from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DOMAIN, domainTls } from '../scripts/domain-tls.js';
import { setupHttps } from '../scripts/setup-https.js';

async function until(predicate, timeout = 2000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for message'); await delay(10); }
}
async function phone(port, id) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket`), messages = [];
  ws.on('message', raw => {
    const m = JSON.parse(raw); messages.push(m);
    if (m.type === 'probe') ws.send(JSON.stringify({ v: 1, type: 'ack', token: m.token }));
  });
  await once(ws, 'open'); ws.send(JSON.stringify({ v: 1, type: 'hello', id }));
  await until(() => messages.some(m => m.type === 'welcome'));
  return { ws, messages, id: messages.find(m => m.type === 'welcome').id };
}
test('HTTP, real UDP OSC and WebSocket routing, failures, reconnect and rejected commands', { timeout: 15000 }, async t => {
  const gateway = await startGateway({ httpPort: 0, oscPort: 0, host: '127.0.0.1', log() {} });
  t.after(() => gateway.close());
  const master = new osc.UDPPort({ localAddress: '127.0.0.1', localPort: 0 });
  const ready = once(master, 'ready'); master.open(); await ready;
  t.after(() => master.close());
  const reports = []; master.on('message', m => reports.push(m));
  const send = (address, ...args) => master.send({ address, args }, '127.0.0.1', gateway.oscPort);
  let session = 'test-master';
  const heartbeat = setInterval(() => send('/swarm/heartbeat', session), 200);
  t.after(() => clearInterval(heartbeat));
  send('/swarm/heartbeat', session);
  await until(() => reports.some(m => m.address === '/swarm/gateway'));
  const a = await phone(gateway.port), b = await phone(gateway.port);
  const state = (target, revision, override = {}) => send('/swarm/state', target, revision, ...FIELDS.map(key => ({ ...DEFAULTS, ...override })[key]));
  const page = await fetch(`http://127.0.0.1:${gateway.port}/`);
  assert.equal(page.status, 200); assert.match(await page.text(), /Enable sound/);
  assert.equal((await fetch(`http://127.0.0.1:${gateway.port}/package.json`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${gateway.port}/.certs/ca-key.pem`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${gateway.port}/p5.min.js`)).status, 200);
  state('*', 1, { pitch: 550 });
  await until(() => [a, b].every(c => c.messages.some(m => m.type === 'state' && m.revision === 1)));
  state(a.id, 2, { pitch: 880, gate: 1 });
  await until(() => a.messages.some(m => m.type === 'state' && m.revision === 2));
  await delay(50);
  assert.ok(!b.messages.some(m => m.type === 'state' && m.revision === 2));
  state(a.id, 1); state(a.id, 3, { gain: 999 });
  await delay(50);
  assert.equal(a.messages.filter(m => m.type === 'state').at(-1).revision, 2);
  send('/swarm/beep', a.id, 10);
  await until(() => a.messages.some(m => m.type === 'beep'));
  assert.ok(!b.messages.some(m => m.type === 'beep'));
  send('/swarm/panic');
  await until(() => [a, b].every(c => c.messages.some(m => m.type === 'panic')));
  await until(() => reports.some(m => m.address === '/swarm/client' && m.args[0] === a.id));
  const closed = once(a.ws, 'close'); a.ws.close(); await closed;
  const returning = await phone(gateway.port, a.id);
  await delay(50);
  assert.ok(!returning.messages.some(m => ['state', 'beep'].includes(m.type)));
  state(returning.id, 4); await until(() => returning.messages.some(m => m.type === 'state'));
  const rejected = once(b.ws, 'close'); b.ws.send(JSON.stringify({ v: 1, type: 'panic' }));
  assert.equal((await rejected)[0], 1008);
  const badAck = await phone(gateway.port);
  const badAckClosed = once(badAck.ws, 'close');
  badAck.ws.send(JSON.stringify({ v: 1, type: 'ack' }));
  assert.equal((await badAckClosed)[0], 1008);
  const resetCount = returning.messages.filter(m => m.type === 'reset').length;
  session = 'new-master'; send('/swarm/heartbeat', session);
  await until(() => returning.messages.filter(m => m.type === 'reset').length > resetCount);
  clearInterval(heartbeat);
  await until(() => returning.messages.some(m => m.type === 'reset' && m.reason === 'Master unavailable'), 4500);
  const before = returning.messages.filter(m => m.type === 'state').length;
  state('*', 99, { gate: 1 }); await delay(50);
  assert.equal(returning.messages.filter(m => m.type === 'state').length, before);
});

test('occupied ports produce an actionable startup error', async t => {
  const first = await startGateway({ httpPort: 0, oscPort: 0, host: '127.0.0.1', log() {} });
  t.after(() => first.close());
  await assert.rejects(startGateway({ httpPort: first.port, oscPort: 0, host: '127.0.0.1', log() {} }), /Gateway could not start.*EADDRINUSE/);
});

test('trusted HTTPS serves the app and accepts a same-origin secure WebSocket', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'swarm-tls-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await setupHttps(directory, [], () => {});
  const [key, cert, ca] = await Promise.all(['server-key.pem', 'server-cert.pem', 'swarm-ca.crt'].map(name => readFile(join(directory, name))));
  const gateway = await startGateway({ httpPort: 0, httpsPort: 0, oscPort: 0, tls: { key, cert }, host: '127.0.0.1', log() {} });
  t.after(() => gateway.close());
  const origin = `https://127.0.0.1:${gateway.httpsPort}`;
  await new Promise((resolve, reject) => {
    https.get(origin + '/', { ca }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => { try { assert.equal(response.statusCode, 200); assert.match(body, /Keep screen awake/); resolve(); } catch (error) { reject(error); } });
    }).on('error', reject);
  });
  const socket = new WebSocket(origin.replace('https:', 'wss:') + '/socket', { ca, origin });
  await once(socket, 'open');
  const welcome = once(socket, 'message'); socket.send(JSON.stringify({ v: 1, type: 'hello' }));
  assert.equal(JSON.parse((await welcome)[0]).type, 'welcome');
  const closed = once(socket, 'close'); socket.close(); await closed;
  const badOrigin = new WebSocket(origin.replace('https:', 'wss:') + '/socket', { ca, origin: 'https://other.invalid' });
  await once(badOrigin, 'error');
});


test('domain mode serves HTTPS and WSS with domain SNI and rejects a foreign origin', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'swarm-domain-gateway-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=' + DOMAIN, '-addext', 'subjectAltName=DNS:' + DOMAIN, '-keyout', join(directory, 'privkey.pem'), '-out', join(directory, 'fullchain.pem')], { stdio: 'ignore' });
  const tls = await domainTls(pathToFileURL(directory + '/'));
  const logs = [];
  const gateway = await startGateway({ httpPort: 0, httpsPort: 0, oscPort: 0, tls, domain: true, host: '127.0.0.1', log: line => logs.push(line) });
  t.after(() => gateway.close());
  assert.ok(logs.some(line => line === `Phone URL: https://${DOMAIN}:${gateway.httpsPort}`));
  const origin = `https://${DOMAIN}:${gateway.httpsPort}`;
  const options = { ca: tls.cert, servername: DOMAIN, headers: { Host: `${DOMAIN}:${gateway.httpsPort}` } };
  await new Promise((resolve, reject) => {
    https.get(`https://127.0.0.1:${gateway.httpsPort}/`, options, response => {
      response.resume(); response.on('end', () => { try { assert.equal(response.statusCode, 200); resolve(); } catch (error) { reject(error); } });
    }).on('error', reject);
  });
  const socket = new WebSocket(`wss://127.0.0.1:${gateway.httpsPort}/socket`, { ...options, origin });
  await once(socket, 'open');
  const welcome = once(socket, 'message'); socket.send(JSON.stringify({ v: 1, type: 'hello' }));
  assert.equal(JSON.parse((await welcome)[0]).type, 'welcome');
  const closed = once(socket, 'close'); socket.close(); await closed;
  const rejected = new WebSocket(`wss://127.0.0.1:${gateway.httpsPort}/socket`, { ...options, origin: 'https://other.invalid' });
  await once(rejected, 'error');
});
