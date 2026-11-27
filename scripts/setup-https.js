import { mkdir, writeFile, chmod, access } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function setupHttps(directory, addresses, log = console.log) {
  const ips = [...new Set(['127.0.0.1', ...addresses])];
  if (ips.some(ip => !isIP(ip))) throw new Error('Certificate addresses must be literal IPv4 or IPv6 addresses.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const run = args => {
    const result = spawnSync('openssl', args, { cwd: directory, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'OpenSSL failed');
  };
  const existing = await Promise.all(['ca-key.pem', 'swarm-ca.crt'].map(name => access(directory + '/' + name).then(() => true, () => false)));
  if (existing[0] !== existing[1]) throw new Error('Incomplete CA files in .certs; restore the missing file before proceeding.');
  if (!existing[0]) {
    run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-subj', '/CN=Swarm LAN CA', '-keyout', 'ca-key.pem', '-out', 'swarm-ca.crt', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  }
  await chmod(directory + '/ca-key.pem', 0o600);
  await writeFile(directory + '/server.ext', 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,' + ips.map(ip => 'IP:' + ip).join(',') + '\n');
  run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=Swarm LAN', '-keyout', 'server-key.pem', '-out', 'server.csr']);
  await chmod(directory + '/server-key.pem', 0o600);
  run(['x509', '-req', '-in', 'server.csr', '-CA', 'swarm-ca.crt', '-CAkey', 'ca-key.pem', '-CAcreateserial', '-out', 'server-cert.pem', '-days', '365', '-sha256', '-extfile', 'server.ext']);
  log('HTTPS certificates ready for: localhost, ' + ips.join(', '));
  log('Restart npm start. Install and trust only swarm-ca.crt on each phone; never share the private keys. See README.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const addresses = process.argv.slice(2);
  if (!addresses.length) for (const list of Object.values(networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) addresses.push(a.address);
  setupHttps(fileURLToPath(new URL('../.certs', import.meta.url)), addresses).catch(error => { console.error(error.message); process.exitCode = 1; });
}
