import type { AtmosphereCycle, AudioPreference } from './types';

export class OfficeAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private enabled = false;
  private quiet = false;
  private volume = 0.3;
  private atmosphere: AtmosphereCycle = 'day';

  constructor(preference?: AudioPreference) {
    if (preference) {
      this.enabled = preference.enabled;
      this.volume = preference.volume;
    }
  }

  private initContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.enabled && !this.quiet ? this.volume : 0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.startAmbient();
    } catch {
      // AudioContext unavailable
    }
  }

  public setEnabled(value: boolean) {
    this.enabled = value;
    if (value && !this.ctx) {
      this.initContext();
    }
    this.updateGain();
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.updateGain();
  }

  public setQuiet(quiet: boolean) {
    this.quiet = quiet;
    this.updateGain();
  }

  public setAtmosphere(cycle: AtmosphereCycle) {
    this.atmosphere = cycle;
    if (!this.ctx || !this.ambientOsc) return;
    try {
      const now = this.ctx.currentTime;
      // Adjust ambient pitch based on atmosphere: day=180Hz (calm), sunset=140Hz (warm), night=100Hz (deep)
      const freq = cycle === 'day' ? 180 : cycle === 'sunset' ? 140 : 105;
      this.ambientOsc.frequency.setTargetAtTime(freq, now, 0.5);
    } catch {
      // Context might be closed
    }
  }

  private updateGain() {
    if (!this.ctx || !this.masterGain) return;
    try {
      const targetGain = this.enabled && !this.quiet ? this.volume : 0;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
    } catch {
      // Ignore audio parameter errors
    }
  }

  private startAmbient() {
    if (!this.ctx || !this.masterGain || this.ambientOsc) return;
    try {
      this.ambientOsc = this.ctx.createOscillator();
      this.ambientGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      this.ambientOsc.type = 'sine';
      this.ambientOsc.frequency.setValueAtTime(160, this.ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      // Low ambient volume relative to sound cues
      this.ambientGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

      this.ambientOsc.connect(filter);
      filter.connect(this.ambientGain);
      this.ambientGain.connect(this.masterGain);

      this.ambientOsc.start();
    } catch {
      // Ambient oscillator failed
    }
  }

  public playClick() {
    if (!this.enabled || this.quiet) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.04);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Ignore transient audio error
    }
  }

  public playRipple() {
    if (!this.enabled || this.quiet) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      // Multi-tone water drop simulation
      const frequencies = [680, 880, 1100];
      frequencies.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = now + idx * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, start + 0.15);

        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + 0.18);
      });
    } catch {
      // Ignore
    }
  }

  public playChime() {
    if (!this.enabled || this.quiet) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [440, 554.37, 659.25]; // A4, C#5, E5
      notes.forEach((freq, i) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = now + i * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch {
      // Ignore
    }
  }

  public dispose() {
    try {
      if (this.ambientOsc) {
        this.ambientOsc.stop();
        this.ambientOsc.disconnect();
        this.ambientOsc = null;
      }
      if (this.ctx && this.ctx.state !== 'closed') {
        this.ctx.close().catch(() => {});
      }
    } catch {
      // Disposed
    }
  }
}
