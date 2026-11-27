import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenAwake } from '../public/wake-lock.js';

class Lock extends EventTarget {
  constructor() { super(); this.released = false; }
  async release() { this.released = true; this.dispatchEvent(new Event('release')); }
}
test('acquires once, releases when hidden, reacquires on return and respects opting out', async () => {
  let visible = true;
  const locks = [], api = { async request(type) { assert.equal(type, 'screen'); const lock = new Lock(); locks.push(lock); return lock; } };
  const wake = new ScreenAwake(api, () => visible, () => {});
  await wake.enable(); await wake.enable(); assert.equal(locks.length, 1); assert.equal(wake.lock, locks[0]);
  visible = false; await wake.visibilityChanged(); assert.equal(locks[0].released, true); assert.equal(wake.lock, null);
  visible = true; await wake.visibilityChanged(); assert.equal(locks.length, 2);
  await wake.disable(); assert.equal(locks[1].released, true);
  await wake.visibilityChanged(); assert.equal(locks.length, 2);
});
test('system release is reported without a retry loop; manual retry works', async () => {
  let count = 0;
  const wake = new ScreenAwake({ async request() { count++; return new Lock(); } }, () => true, () => {});
  await wake.enable(); await wake.lock.release();
  assert.equal(wake.lock, null); assert.match(wake.message, /released/); assert.equal(count, 1);
  await wake.enable(); assert.equal(count, 2);
});
test('unsupported or denied wake lock leaves audio independent and allows retries', async () => {
  const unsupported = new ScreenAwake(null, () => true, () => {});
  await unsupported.enable(); assert.equal(unsupported.lock, null); assert.match(unsupported.message, /HTTPS/);
  let deny = true;
  const wake = new ScreenAwake({ async request() { if (deny) throw new Error('NotAllowedError'); return new Lock(); } }, () => true, () => {});
  await wake.enable(); assert.equal(wake.pending, false); assert.match(wake.message, /denied/);
  deny = false; await wake.enable(); assert.ok(wake.lock);
});
test('a pending request is released if the user opts out or the page hides', async () => {
  let resolve;
  const lock = new Lock();
  const wake = new ScreenAwake({ request() { return new Promise(r => { resolve = r; }); } }, () => true, () => {});
  const pending = wake.enable(); await wake.disable(); resolve(lock); await pending;
  assert.equal(lock.released, true); assert.equal(wake.lock, null);
});
