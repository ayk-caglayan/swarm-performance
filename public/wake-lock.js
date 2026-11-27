export class ScreenAwake {
  constructor(api, visible, changed) {
    this.api = api; this.visible = visible; this.changed = changed;
    this.lock = null; this.wanted = false; this.pending = false;
    this.message = api ? 'Screen wake starts when you enable sound.' : 'Automatic screen wake needs trusted HTTPS and a supported browser.';
  }
  async enable() { this.wanted = true; await this.acquire(); }
  async acquire() {
    if (!this.api || !this.wanted || !this.visible() || this.lock || this.pending) return;
    this.pending = true; this.message = 'Requesting screen wake…'; this.changed();
    try {
      const lock = await this.api.request('screen');
      if (!this.wanted || !this.visible()) { await lock.release(); return; }
      this.lock = lock; this.message = 'Screen will stay awake while this page is visible.';
      lock.addEventListener('release', () => {
        if (this.lock !== lock) return;
        this.lock = null;
        this.message = this.wanted ? 'Screen wake released. Tap Keep screen awake to retry.' : 'Automatic screen wake is off.';
        this.changed();
      });
    } catch {
      this.message = 'Screen wake was denied. Check battery saver, then tap Keep screen awake to retry.';
    } finally { this.pending = false; this.changed(); }
  }
  async release() {
    const lock = this.lock; this.lock = null;
    if (lock) {
      try { await lock.release(); } catch { /* It may already have been released by the OS. */ }
    }
    this.changed();
  }
  async disable() {
    this.wanted = false; this.message = 'Automatic screen wake is off.';
    await this.release();
  }
  async visibilityChanged() {
    if (this.visible()) await this.acquire();
    else await this.release();
  }
}
