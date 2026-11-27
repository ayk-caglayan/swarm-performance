export class PhoneAudio {
  constructor() { this.context = null; this.volume = 0.5; this.muted = false; }
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = 0;
      this.output.channelCount = 1;
      this.output.connect(this.context.destination);
      for (const name of ['tone', 'beep']) {
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        gain.gain.value = 0; oscillator.type = 'sine';
        oscillator.connect(gain).connect(this.output); oscillator.start();
        this[name] = { oscillator, gain };
      }
    }
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio paused. Tap Resume.');
  }
  ramp(param, value, seconds = 0.02) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }
  update(state, armed) {
    if (!this.context) return;
    this.ramp(this.output.gain, armed && !this.muted ? this.volume : 0);
    this.ramp(this.tone.oscillator.frequency, state.pitch);
    // Two fixed voices share the 0.15 output cap, including overlapping beeps.
    this.ramp(this.tone.gain.gain, armed && state.gate ? state.gain * 0.5 : 0);
  }
  trigger(state) {
    if (!this.context || this.context.state !== 'running' || this.muted) return;
    const now = this.context.currentTime, gain = this.beep.gain.gain;
    this.ramp(this.beep.oscillator.frequency, state.pitch, 0.005);
    gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(state.gain * 0.5, now + 0.01);
    gain.linearRampToValueAtTime(0, now + 0.15);
  }
  silence() {
    if (!this.context) return;
    this.ramp(this.output.gain, 0);
    this.ramp(this.tone.gain.gain, 0);
    this.ramp(this.beep.gain.gain, 0);
  }
}
