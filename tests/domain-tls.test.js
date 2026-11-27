import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { domainTls, DOMAIN } from '../scripts/domain-tls.js';

test('domain certificates require readable files, correct hostname, valid dates and matching key', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'swarm-domain-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const url = pathToFileURL(directory + '/');
  await assert.rejects(domainTls(url), /Domain HTTPS unavailable.*ENOENT/);
  const generate = host => execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=' + host, '-addext', 'subjectAltName=DNS:' + host, '-keyout', join(directory, 'privkey.pem'), '-out', join(directory, 'fullchain.pem')], { stdio: 'ignore' });
  generate(DOMAIN);
  const tls = await domainTls(url);
  const cert = new X509Certificate(tls.cert);
  assert.equal(cert.checkHost(DOMAIN), DOMAIN);
  await assert.rejects(domainTls(url, Date.parse(cert.validTo)), /expired/);
  await assert.rejects(domainTls(url, Date.parse(cert.validFrom) - 1), /not yet valid/);
  generate(DOMAIN);
  await writeFile(join(directory, 'fullchain.pem'), tls.cert);
  await assert.rejects(domainTls(url), /do not match/);
  generate('other.example');
  await assert.rejects(domainTls(url), /must cover/);
});
