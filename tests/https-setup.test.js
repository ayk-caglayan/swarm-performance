import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { setupHttps } from '../scripts/setup-https.js';

test('local certificate is signed by the retained CA, covers LAN IPs and restricts key access', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'swarm-cert-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await setupHttps(directory, ['192.168.1.3'], () => {});
  const ca = await readFile(join(directory, 'swarm-ca.crt'));
  const certificate = new X509Certificate(await readFile(join(directory, 'server-cert.pem')));
  assert.ok(certificate.verify(new X509Certificate(ca).publicKey));
  assert.equal(certificate.checkIP('192.168.1.3'), '192.168.1.3');
  assert.equal(certificate.checkIP('127.0.0.1'), '127.0.0.1');
  assert.equal(certificate.checkHost('localhost'), 'localhost');
  assert.equal(certificate.checkIP('192.168.1.99'), undefined);
  for (const file of ['ca-key.pem', 'server-key.pem']) assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600);
  await setupHttps(directory, ['192.168.1.4'], () => {});
  assert.deepEqual(await readFile(join(directory, 'swarm-ca.crt')), ca);
  assert.equal(new X509Certificate(await readFile(join(directory, 'server-cert.pem'))).checkIP('192.168.1.4'), '192.168.1.4');
  await assert.rejects(setupHttps(directory, ['bad-host\nDNS:injected'], () => {}), /literal/);
});
