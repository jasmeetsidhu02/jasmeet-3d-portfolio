// Fully synthesized sound design via the Web Audio API — no external audio
// files. Inspired by the *idea* of speed-linked engine sound and a reward
// chime on interaction (a pattern common to driving games), implemented here
// from scratch with oscillators/noise rather than any sampled audio.

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  _ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    const master = this.ctx.createGain();
    master.gain.value = 0.35;
    master.connect(this.ctx.destination);
    this.master = master;

    // Engine: a low sawtooth whose pitch/gain track speed, plus a little
    // detuned second oscillator for a thicker "idle" texture.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.value = 61.5;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(master);

    this.engineOsc.start();
    this.engineOsc2.start();

    // Tire noise: filtered white noise, gain rises with lateral slip / speed.
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;

    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 1200;
    this.noiseFilter.Q.value = 0.6;

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0;

    this.noiseSource.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(master);
    this.noiseSource.start();

    this.enabled = true;
  }

  // Call once on the first user gesture (browsers block audio before that).
  unlock() {
    this._ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  update({ speedKmh, throttle, slip }) {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    const speedRatio = Math.min(Math.abs(speedKmh) / 90, 1);

    const targetFreq = 55 + speedRatio * 260 + Math.abs(throttle) * 40;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(targetFreq * 1.015, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speedRatio * 2200, now, 0.1);

    const targetGain = 0.12 + speedRatio * 0.22 + Math.abs(throttle) * 0.12;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);

    const slipRatio = Math.min(slip, 1);
    this.noiseGain.gain.setTargetAtTime(slipRatio * 0.18, now, 0.05);
    this.noiseFilter.frequency.setTargetAtTime(900 + speedRatio * 800, now, 0.1);
  }

  // Short synthesized reward chime — two quick rising tones.
  playChime() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    [660, 990].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.25, now + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.4);
    });
  }
}
