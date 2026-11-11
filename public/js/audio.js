// Synthetische Geräusche (Web Audio, keine Dateien). Läuft über destination, damit der Hub die Lautstärke regeln kann.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.noise = null; this.last = {}; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      this.ctx = new AC();
      const n = this.ctx.sampleRate * 0.6, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
      let s = 7; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 2147483648) - 1; }
      this.noise = b;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }
  _ok(key, gap) { if (!this.on || !this.ctx) return false; const t = this.ctx.currentTime; if (t - (this.last[key] || -9) < gap) return false; this.last[key] = t; return true; }
  _burst(freq, q, dur, vol, type) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 1;
    const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random() * 0.3, dur + 0.02);
  }
  _tone(f0, f1, dur, vol, type) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  ball(s) { if (!this._ok('ball', 0.012)) return; const v = Math.min(1, Math.pow(s / 260, 0.7)) * 0.9 + 0.05; this._burst(3200 + Math.random() * 600, 2.2, 0.05, v * 0.9); this._tone(1750 + Math.random() * 150, 1000, 0.06, v * 0.25); }
  rail(s) { if (!this._ok('rail', 0.03)) return; const v = Math.min(1, s / 220) * 0.7 + 0.05; this._burst(260, 0.9, 0.14, v, 'lowpass'); this._tone(150, 90, 0.1, v * 0.35); }
  pocket() { if (!this._ok('pocket', 0.05)) return; this._tone(140, 60, 0.22, 0.45); this._burst(500, 0.8, 0.3, 0.3, 'lowpass'); setTimeout(() => { if (this.ctx) this._burst(900, 1.5, 0.12, 0.1); }, 220); }
  cue(p) { if (!this._ok('cue', 0.05)) return; const v = 0.25 + 0.6 * p; this._burst(1800, 1.2, 0.04, v * 0.8); this._tone(190, 110, 0.08, v * 0.5); }
  click() { if (!this._ok('click', 0.03)) return; this._tone(900, 700, 0.04, 0.12, 'triangle'); }
  win() { if (!this.on || !this.ctx) return; [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, f, 0.28, 0.16, 'triangle'), i * 110)); }
  lose() { if (!this.on || !this.ctx) return; [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, f * 0.98, 0.3, 0.15, 'triangle'), i * 160)); }
  foul() { if (!this._ok('foul', 0.2)) return; this._tone(220, 150, 0.22, 0.2, 'sawtooth'); }
}
