import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientState, DEFAULTS, validState, validId } from '../public/protocol.js';
import { PhoneAudio } from '../public/audio.js';

test('validate state at the boundary, including NaN, infinity and nonbinary gates', () => {
  assert.ok(validState(DEFAULTS));
  for (const state of [{ ...DEFAULTS, pitch: NaN }, { ...DEFAULTS, gain: Infinity }, { ...DEFAULTS, gate: 0.5 }, { ...DEFAULTS, size: 2 }, {}]) assert.ok(!validState(state));
  assert.ok(validId('012345abcdef')); assert.ok(!validId('../etc/passwd'));
});
test('fresh master and state are required before arming; recovery never auto-arms', () => {
  const c = new ClientState();
  assert.equal(c.arm(), false);
  assert.equal(c.snapshot(DEFAULTS, 0), false);
  c.heartbeat(1000); assert.equal(c.arm(), false);
  c.snapshot({ ...DEFAULTS, gate: 1 }, 2); assert.equal(c.arm(), true);
  assert.equal(c.expire(3999), false); assert.equal(c.expire(4000), true);
  assert.equal(c.armed, false); assert.equal(c.state.gate, 0);
  c.heartbeat(4100); assert.equal(c.arm(), false);
  c.snapshot(DEFAULTS, 0); assert.equal(c.armed, false); assert.equal(c.arm(), true);
  c.disarm(); c.snapshot(DEFAULTS, 1); assert.equal(c.armed, false);
});
test('old states and duplicate beeps cannot replay; inactive events are discarded', () => {
  const c = new ClientState(); c.heartbeat(0); c.snapshot(DEFAULTS, 4);
  assert.equal(c.snapshot({ ...DEFAULTS, gate: 1 }, 3), false);
  assert.equal(c.beep(10), false); c.arm();
  assert.equal(c.beep(10), false); assert.equal(c.beep(11), true); assert.equal(c.beep(11), false);
  c.reset(); assert.equal(c.beep(12), false);
});
test('audio uses two bounded voices; silence cancels tone and scheduled beep', async () => {
  class Param {
    constructor() { this.value = 0; this.calls = []; }
    cancelScheduledValues(t) { this.calls.push(['cancel', t]); }
    setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; }
    linearRampToValueAtTime(v, t) { this.calls.push(['ramp', v, t]); this.value = v; }
  }
  class Context {
    constructor() { this.currentTime = 0; this.state = 'suspended'; this.destination = {}; }
    resume() { this.state = 'running'; }
    createGain() { return { gain: new Param(), connect: destination => destination }; }
    createOscillator() { return { frequency: new Param(), connect: destination => destination, start() {} }; }
  }
  const previous = globalThis.AudioContext; globalThis.AudioContext = Context;
  try {
    const a = new PhoneAudio(); await a.enable();
    const state = { ...DEFAULTS, gain: 0.15, gate: 1 };
    a.update(state, true); a.trigger(state);
    assert.equal(a.tone.gain.gain.value, 0.075);
    assert.ok(a.beep.gain.gain.calls.some(c => c[0] === 'ramp' && c[1] === 0.075));
    a.silence();
    for (const node of [a.output, a.tone.gain, a.beep.gain]) assert.equal(node.gain.value, 0);
    a.muted = true; a.update(state, true); assert.equal(a.output.gain.value, 0);
  } finally { globalThis.AudioContext = previous; }
});
