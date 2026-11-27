import { VERSION, ClientState, validId } from './protocol.js';
import { PhoneAudio } from './audio.js';
import { ScreenAwake } from './wake-lock.js';

const model = new ClientState(), audio = new PhoneAudio();
const ui = Object.fromEntries(['device', 'status', 'enable', 'mute', 'volume', 'volume-value', 'diagnostics', 'stage', 'wake', 'wake-status'].map(id => [id, document.getElementById(id)]));
let autoWake = true;
const wake = new ScreenAwake(window.isSecureContext ? navigator.wakeLock : null, () => !document.hidden, () => {
  ui.wake.disabled = !wake.api || wake.pending;
  ui.wake.setAttribute('aria-pressed', String(Boolean(wake.lock)));
  ui.wake.textContent = wake.lock ? 'Allow screen sleep' : 'Keep screen awake';
  ui['wake-status'].textContent = wake.message;
});
wake.changed();
let socket, fps = 0, pulseUntil = 0, phase = 0, everEnabled = false, enabling = false, message = 'Waiting for SuperCollider.';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function send(data) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: VERSION, ...data })); }
function renderStatus() {
  ui.enable.disabled = enabling || !model.live || !model.fresh || model.armed;
  ui.enable.textContent = enabling ? 'Enabling…' : model.armed ? 'Sound enabled' : everEnabled ? 'Resume' : 'Enable sound';
  ui.status.textContent = model.armed ? (audio.muted ? 'You are muted.' : 'Ready. The performer controls this instrument.') : message;
  ui.diagnostics.textContent = `Audio: ${audio.context?.state || 'not enabled'}. Graphics: ${Math.round(fps)} FPS. Revision: ${model.revision}.`;
}
function disarm(reason) { model.disarm(); audio.silence(); message = reason; renderStatus(); }
function connect() {
  model.reset(); audio.silence();
  message = 'Connecting to the local gateway…'; renderStatus();
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/socket`);
  socket.onopen = () => {
    let id;
    try { id = sessionStorage.getItem('swarm-id') || undefined; } catch { /* Storage is optional. */ }
    if (!validId(id)) id = undefined;
    send({ type: 'hello', id });
  };
  socket.onmessage = event => {
    let m;
    try { m = JSON.parse(event.data); } catch { return; }
    if (m.v !== VERSION) return;
    if (m.type === 'welcome') {
      try { sessionStorage.setItem('swarm-id', m.id); } catch { /* Storage is optional. */ }
      ui.device.textContent = `Device ${m.id}`;
      message = 'Connected. Waiting for SuperCollider.';
    } else if (m.type === 'heartbeat') model.heartbeat(performance.now());
    else if (m.type === 'state' && model.snapshot(m.state, m.revision)) {
      if (!model.armed) message = everEnabled ? 'Connection ready. Tap Resume to rejoin.' : 'Connected. Tap Enable sound to join.';
      audio.update(model.state, model.armed);
    } else if (m.type === 'beep' && model.beep(m.event)) {
      audio.trigger(model.state); pulseUntil = performance.now() + 150;
    } else if (m.type === 'panic') {
      model.state.gate = 0; audio.silence(); pulseUntil = 0;
    } else if (m.type === 'reset') {
      model.reset(); disarm(m.reason);
    } else if (m.type === 'probe') send({ type: 'ack', token: m.token });
    renderStatus();
  };
  socket.onclose = () => { model.reset(); disarm('Connection lost. Reconnecting…'); setTimeout(connect, 1000); };
  socket.onerror = () => socket.close();
}
ui.enable.addEventListener('click', async () => {
  if (enabling || !model.live || !model.fresh || document.hidden) return;
  enabling = true; renderStatus();
  try {
    await audio.enable();
    audio.context.onstatechange = () => { if (audio.context.state !== 'running') disarm('Audio interrupted. Tap Resume when ready.'); };
    if (document.hidden || !model.arm()) { audio.silence(); return; }
    everEnabled = true; audio.update(model.state, true);
    audio.trigger({ ...model.state, pitch: 440, gain: 0.03 });
    if (autoWake) void wake.enable();
  } catch (error) { disarm(error.message || 'Could not enable audio. Tap Resume.'); }
  finally { enabling = false; renderStatus(); }
});
ui.mute.addEventListener('click', () => {
  audio.muted = !audio.muted; ui.mute.setAttribute('aria-pressed', String(audio.muted));
  ui.mute.textContent = audio.muted ? 'Unmute' : 'Mute';
  if (audio.muted) audio.silence(); else audio.update(model.state, model.armed);
  renderStatus();
});
ui.volume.addEventListener('input', () => { audio.volume = Number(ui.volume.value) / 100; ui['volume-value'].textContent = `${ui.volume.value}%`; audio.update(model.state, model.armed); });
ui.wake.addEventListener('click', () => {
  autoWake = !wake.lock;
  if (autoWake) void wake.enable(); else void wake.disable();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) disarm('Page paused. Tap Resume to rejoin.');
  void wake.visibilityChanged();
});
window.addEventListener('pagehide', () => { disarm('Page paused. Tap Resume to rejoin.'); void wake.release(); });
window.addEventListener('pageshow', () => { void wake.visibilityChanged(); });
setInterval(() => {
  if (model.live && model.expire(performance.now())) disarm('Master unavailable. Waiting for a fresh connection.');
}, 100);
setInterval(() => {
  send({ type: 'status', ready: Number(model.armed && audio.context?.state === 'running'), muted: Number(audio.muted), visible: Number(!document.hidden), fps: Math.max(0, Math.min(240, fps)), revision: model.revision, audio: audio.context?.state || 'not-enabled' });
  renderStatus();
}, 1000);

window.addEventListener('load', () => {
  if (!window.p5) { disarm('Graphics library missing. Restart after npm install.'); return; }
  new window.p5(p => {
    let background;
    p.setup = () => {
      p.createCanvas(ui.stage.clientWidth, ui.stage.clientHeight).parent(ui.stage);
      p.pixelDensity(1); p.frameRate(30); p.colorMode(p.HSB, 360, 100, 100);
      background = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
      p.describe('A circle whose colour, size and position are controlled by the performer.');
    };
    p.draw = () => {
      fps = p.frameRate(); p.background(background);
      const s = model.state;
      if (!reducedMotion.matches) phase += Math.min(p.deltaTime, 100) / 1000 * s.speed * Math.PI * 2;
      const diameter = Math.min(p.width, p.height) * s.size * (performance.now() < pulseUntil && !reducedMotion.matches ? 1.18 : 1);
      const radius = diameter / 2;
      const x = s.x + (reducedMotion.matches ? 0 : Math.sin(phase) * 0.15);
      p.noStroke(); p.fill(s.hue, 55, model.live ? 90 : 35);
      p.circle(p.constrain(x * p.width, radius, p.width - radius), p.constrain(s.y * p.height, radius, p.height - radius), diameter);
    };
    new ResizeObserver(() => { if (p.canvas) p.resizeCanvas(ui.stage.clientWidth, ui.stage.clientHeight); }).observe(ui.stage);
  });
});
connect();
