import { readFile } from 'node:fs/promises';
import { X509Certificate, createPrivateKey } from 'node:crypto';

export const DOMAIN = 'swarm.aykutcaglayan.net';

export async function domainTls(directory = new URL(`../.certs/acme/live/${DOMAIN}/`, import.meta.url), now = Date.now()) {
  try {
    const [key, cert] = await Promise.all(['privkey.pem', 'fullchain.pem'].map(name => readFile(new URL(name, directory))));
    const leaf = new X509Certificate(cert);
    if (leaf.checkHost(DOMAIN, { subject: 'never', wildcards: false }) !== DOMAIN) throw new Error(`Certificate must cover ${DOMAIN}`);
    if (now < Date.parse(leaf.validFrom) || now >= Date.parse(leaf.validTo)) throw new Error('Certificate is expired or not yet valid');
    if (!leaf.checkPrivateKey(createPrivateKey(key))) throw new Error('Certificate and private key do not match');
    return { key, cert };
  } catch (error) {
    throw new Error(`Domain HTTPS unavailable: ${error.message}. See README domain setup and renewal instructions.`, { cause: error });
  }
}
