// Solmar Bay — every sound is synthesised with WebAudio: no audio files,
// no network. The engine starts on the first user gesture (the start button).

class SolmarAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = true;
    this._engineOsc = null;
    this._engineGain = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenTimer = null;
    this._musicTimer = null;
    this._musicStep = 0;
  }

  // Call from a user gesture; safe to call more than once.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startEngineHum();
      this._startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _startEngineHum() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this._engineOsc = osc;
    this._engineGain = gain;
  }

  // speed01: 0 idle .. 1 flat out; on: false silences the hum.
  setEngine(speed01, on) {
    if (!this._engineOsc) return;
    const t = this._now();
    this._engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
    this._engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
  }

  gunshot() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.18);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this._blip(160, 0.12, 'sine', 0.35, 50);
  }

  hit() {
    this._blip(220, 0.08, 'square', 0.12, 110);
  }

  pickup() {
    this._blip(660, 0.09, 'sine', 0.22);
    setTimeout(() => this._blip(990, 0.14, 'sine', 0.22), 90);
  }

  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this._blip(n, 0.22, 'triangle', 0.25), i * 110));
  }

  busted() {
    const notes = [392, 330, 262];
    notes.forEach((n, i) => setTimeout(() => this._blip(n, 0.3, 'sawtooth', 0.15), i * 160));
  }

  click() {
    this._blip(880, 0.05, 'sine', 0.12);
  }

  carDoor() {
    this._blip(140, 0.1, 'square', 0.15, 70);
  }

  crash() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.25);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // Two-tone police siren while any police unit is near; call every frame.
  setSiren(active) {
    if (!this.ctx) return;
    if (active && !this._sirenOsc) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 720;
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      this._sirenOsc = osc;
      this._sirenGain = gain;
      let high = true;
      this._sirenTimer = setInterval(() => {
        if (!this._sirenOsc) return;
        high = !high;
        this._sirenOsc.frequency.setValueAtTime(high ? 950 : 720, this._now());
      }, 420);
    } else if (!active && this._sirenOsc) {
      clearInterval(this._sirenTimer);
      this._sirenTimer = null;
      this._sirenOsc.stop();
      this._sirenOsc = null;
      this._sirenGain = null;
    }
  }

  // A slow sunset groove: bass line plus soft pad chords, scheduled ahead.
  _startMusic() {
    const bass = [55, 55, 65.41, 49]; // A1 A1 C2 G1, one bar each
    const chords = [[220, 261.63, 329.63], [220, 261.63, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63]];
    const barSeconds = 2.4;
    let bar = 0;
    this._musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const t = this._now() + 0.05;
      const root = bass[bar % bass.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = root;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + barSeconds);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + barSeconds + 0.05);
      chords[bar % chords.length].forEach((f) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.025, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + barSeconds);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + barSeconds + 0.05);
      });
      bar += 1;
    }, barSeconds * 1000);
  }
}
