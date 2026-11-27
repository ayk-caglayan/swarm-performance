export const VERSION = 1;
export const DEFAULTS = Object.freeze({ pitch: 440, gain: 0.05, gate: 0, size: 0.2, speed: 0, hue: 40, x: 0.5, y: 0.5 });
export const LIMITS = Object.freeze({ pitch: [220, 1760], gain: [0, 0.15], gate: [0, 1], size: [0.05, 0.5], speed: [0, 2], hue: [0, 360], x: [0, 1], y: [0, 1] });
export const FIELDS = Object.keys(DEFAULTS);
export const validId = id => typeof id === 'string' && /^[a-f0-9]{12}$/.test(id);
export const integer = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
export function validState(state) {
  return state && FIELDS.every(key => Number.isFinite(state[key]) && state[key] >= LIMITS[key][0] && state[key] <= LIMITS[key][1]) && integer(state.gate, 0, 1);
}

// Shared with the browser tests: transport recovery never grants audio permission.
export class ClientState {
  constructor() { this.state = { ...DEFAULTS }; this.reset(); }
  reset() { this.armed = false; this.fresh = false; this.live = false; this.lastHeartbeat = -Infinity; this.revision = -1; this.lastBeep = -1; this.state.gate = 0; }
  heartbeat(now) { this.live = true; this.lastHeartbeat = now; }
  snapshot(state, revision) {
    if (!this.live || !validState(state) || !integer(revision, 0, Number.MAX_SAFE_INTEGER) || revision < this.revision) return false;
    this.state = { ...state }; this.revision = revision; this.fresh = true; return true;
  }
  arm() { this.armed = this.live && this.fresh; return this.armed; }
  disarm() { this.armed = false; }
  expire(now) { if (now - this.lastHeartbeat >= 3000) { this.reset(); return true; } return false; }
  beep(id) {
    if (!integer(id, 0, Number.MAX_SAFE_INTEGER) || id <= this.lastBeep) return false;
    this.lastBeep = id; return this.live && this.fresh && this.armed;
  }
}
