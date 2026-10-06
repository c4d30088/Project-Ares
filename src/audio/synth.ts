// The game's sounds, made live with the Web Audio API: oscillators, filtered noise and
// envelopes. No sound files, no dependency. What to play is decided in game/soundCues.ts.
//
// Browsers only allow sound after the player has clicked or pressed a key, so the audio
// context starts on the first click or key press; cues before that are dropped.

import { audioTuning as A } from "../data/audio";
import { beepInterval, createThrottle, type Cue, type CueName, type SoundState } from "../game/soundCues";

type Group = "alarms" | "weapons" | "impacts" | "drive";

const GROUP_OF: Record<CueName, Group> = {
  launchOwn: "weapons",
  railgunOwn: "weapons",
  pdcKillOwn: "weapons",
  hitOwn: "impacts",
  hitOwnLight: "impacts",
  ownLost: "impacts",
  enemyKilled: "impacts",
  subsystemOffline: "alarms",
  launchWarning: "alarms",
  railgunWarning: "alarms",
  contact: "alarms",
  contactLost: "alarms",
  enemySensors: "alarms",
  heatCritical: "alarms",
  victory: "alarms",
  defeat: "alarms",
};

export interface SoundSystem {
  /** Plays one-shot sounds (throttled per kind). */
  play(cues: Cue[]): void;
  /** Updates the continuous sounds; call every frame. */
  update(state: SoundState, realDt: number): void;
  /** Applies volume and mute changes from audioTuning. */
  applyVolumes(): void;
}

export function createSoundSystem(): SoundSystem {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  const groups = {} as Record<Group, GainNode>;
  let noise: AudioBuffer;
  // Continuous sounds.
  let driveGain: GainNode;
  let driveFilter: BiquadFilterNode;
  let pdcGain: GainNode;
  let clock = 0; // real seconds, for throttling
  let nextBeep = 0;
  const throttle = createThrottle();

  function start() {
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    // A gentle limiter keeps a big moment (a salvo landing) from clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    master = ctx.createGain();
    master.connect(limiter).connect(ctx.destination);
    for (const g of ["alarms", "weapons", "impacts", "drive"] as Group[]) {
      groups[g] = ctx.createGain();
      groups[g].connect(master);
    }
    // Two seconds of white noise, looped or sliced for every noisy sound.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildDrive();
    buildPdcLoop();
    applyVolumes();
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(A.muted ? 0 : A.master, t, 0.03);
    for (const g of Object.keys(groups) as Group[]) groups[g].gain.setTargetAtTime(A[g], t, 0.03);
  }

  // --- Building blocks ---

  function noiseSource(loop = false): AudioBufferSourceNode {
    const src = ctx!.createBufferSource();
    src.buffer = noise;
    src.loop = loop;
    return src;
  }

  /** A gain with a quick attack and an exponential decay; returns the node to connect into. */
  function envelope(out: AudioNode, at: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(out);
    return g;
  }

  /** A tone sliding from f0 to f1 Hz. */
  function tone(out: AudioNode, at: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number) {
    const o = ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + attack + decay);
    o.connect(envelope(out, at, peak, attack, decay));
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  }

  /** A burst of filtered noise. */
  function hiss(out: AudioNode, at: number, filter: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, freqEnd?: number) {
    const src = noiseSource();
    const f = ctx!.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, at);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, at + attack + decay);
    f.Q.value = q;
    src.connect(f).connect(envelope(out, at, peak, attack, decay));
    src.start(at, Math.random() * 1.5);
    src.stop(at + attack + decay + 0.05);
  }

  // --- Continuous sounds ---

  function buildDrive() {
    const c = ctx!;
    driveGain = c.createGain();
    driveGain.gain.value = 0;
    driveGain.connect(groups.drive);
    // A deep roar: low-passed noise over two low hums a little out of tune with each other.
    driveFilter = c.createBiquadFilter();
    driveFilter.type = "lowpass";
    driveFilter.frequency.value = 90;
    driveFilter.Q.value = 0.8;
    const n = noiseSource(true);
    n.connect(driveFilter).connect(driveGain);
    n.start();
    for (const [f, v] of [[41, 0.35], [43.5, 0.25], [82, 0.08]] as const) {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = v;
      o.connect(g).connect(driveGain);
      o.start();
    }
  }

  function buildPdcLoop() {
    const c = ctx!;
    // A PDC's stream: band-passed noise chopped about 50 times a second (its rate of fire).
    pdcGain = c.createGain();
    pdcGain.gain.value = 0;
    pdcGain.connect(groups.weapons);
    const chop = c.createGain();
    chop.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 48;
    const depth = c.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    lfo.start();
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900;
    band.Q.value = 0.9;
    const n = noiseSource(true);
    n.connect(band).connect(chop).connect(pdcGain);
    n.start();
    // A low thud under each round.
    const thud = c.createOscillator();
    thud.type = "square";
    thud.frequency.value = 48;
    const thudLp = c.createBiquadFilter();
    thudLp.type = "lowpass";
    thudLp.frequency.value = 160;
    const thudGain = c.createGain();
    thudGain.gain.value = 0.35;
    thud.connect(thudLp).connect(thudGain).connect(pdcGain);
    thud.start();
  }

  // --- One-shot sounds ---

  function playCue(name: CueName, count: number) {
    const c = ctx!;
    const out = groups[GROUP_OF[name]];
    const t = c.currentTime + 0.01;
    switch (name) {
      case "launchOwn": {
        // A thump as the torpedo leaves the tube, then the hiss of its motor. A salvo ripples.
        const n = Math.min(count, 4);
        for (let i = 0; i < n; i++) {
          const at = t + i * 0.14;
          tone(out, at, "sine", 110, 38, 0.8, 0.005, 0.3);
          hiss(out, at + 0.04, "bandpass", 2400, 0.7, 0.25, 0.03, 0.9, 900);
        }
        break;
      }
      case "railgunOwn":
        // A sharp crack, a falling zap and a heavy recoil thump.
        hiss(out, t, "highpass", 3000, 0.5, 0.6, 0.001, 0.12);
        tone(out, t, "sawtooth", 1800, 120, 0.25, 0.002, 0.22);
        tone(out, t, "sine", 70, 30, 0.9, 0.004, 0.5);
        break;
      case "pdcKillOwn":
        // A small, bright pop: a torpedo or slug shot down.
        tone(out, t, "triangle", 1500, 900, 0.18, 0.002, 0.07);
        hiss(out, t, "highpass", 2500, 0.7, 0.12, 0.001, 0.06);
        break;
      case "hitOwn":
        // The hull rings: a boom with a metallic clang.
        hiss(out, t, "lowpass", 900, 0.7, 1, 0.005, 1.1, 120);
        tone(out, t, "sine", 75, 28, 1, 0.005, 0.9);
        for (const [f, v] of [[317, 0.18], [523, 0.12], [841, 0.08]] as const) tone(out, t, "sine", f, f * 0.98, v, 0.002, 1.4);
        break;
      case "hitOwnLight":
        // PDC rounds rattling on the hull.
        for (let i = 0; i < Math.min(count, 3); i++) hiss(out, t + i * 0.05, "bandpass", 1800, 2, 0.3, 0.001, 0.05);
        break;
      case "subsystemOffline":
        tone(out, t, "square", 440, 440, 0.12, 0.005, 0.12);
        tone(out, t + 0.18, "square", 311, 311, 0.12, 0.005, 0.2);
        break;
      case "ownLost":
        hiss(out, t, "lowpass", 1200, 0.5, 1, 0.005, 2.5, 60);
        tone(out, t, "sine", 60, 20, 1, 0.005, 2.2);
        tone(out, t + 0.3, "sawtooth", 330, 110, 0.12, 0.05, 2);
        break;
      case "enemyKilled":
        // A distant rumble, then a two-note confirmation.
        hiss(out, t, "lowpass", 500, 0.5, 0.45, 0.02, 1.4, 80);
        tone(out, t + 0.25, "triangle", 659, 659, 0.18, 0.01, 0.25);
        tone(out, t + 0.45, "triangle", 988, 988, 0.18, 0.01, 0.5);
        break;
      case "launchWarning":
        // The two-tone klaxon: three cycles.
        for (let i = 0; i < 3; i++) {
          const at = t + i * 0.42;
          tone(out, at, "square", 587, 587, 0.13, 0.01, 0.18);
          tone(out, at + 0.2, "square", 784, 784, 0.13, 0.01, 0.18);
        }
        break;
      case "railgunWarning":
        // Two fast rising sweeps.
        for (let i = 0; i < 2; i++) tone(out, t + i * 0.22, "sawtooth", 500, 1600, 0.1, 0.01, 0.17);
        break;
      case "contact":
        // A ping with its echo.
        tone(out, t, "sine", 1046, 1046, 0.3, 0.004, 1.0);
        tone(out, t + 0.32, "sine", 1046, 1046, 0.08, 0.004, 0.8);
        break;
      case "contactLost":
        tone(out, t, "sine", 880, 587, 0.22, 0.004, 0.9);
        break;
      case "enemySensors": {
        // A warble: their sensors are painting the area.
        const o = c.createOscillator();
        o.frequency.value = 740;
        const lfo = c.createOscillator();
        lfo.frequency.value = 14;
        const depth = c.createGain();
        depth.gain.value = 60;
        lfo.connect(depth).connect(o.frequency);
        o.connect(envelope(out, t, 0.12, 0.05, 0.7));
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.85);
        lfo.stop(t + 0.85);
        break;
      }
      case "heatCritical":
        for (let i = 0; i < 3; i++) tone(out, t + i * 0.25, "sawtooth", 220, 200, 0.12, 0.01, 0.18);
        break;
      case "victory":
        [523, 659, 784, 1046].forEach((f, i) => tone(out, t + i * 0.16, "triangle", f, f, 0.2, 0.01, i === 3 ? 1.2 : 0.3));
        break;
      case "defeat":
        [392, 311, 262, 196].forEach((f, i) => tone(out, t + i * 0.28, "triangle", f, f, 0.18, 0.01, i === 3 ? 1.6 : 0.4));
        break;
    }
  }

  function beep() {
    const t = ctx!.currentTime + 0.005;
    tone(groups.alarms, t, "square", 1250, 1250, 0.07, 0.003, 0.06);
  }

  // The audio context may start only after the player interacts with the page.
  const unlock = () => start();
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });

  return {
    play(cues) {
      if (!ctx || ctx.state !== "running" || A.muted) return;
      for (const cue of cues) if (throttle.allow(cue.name, clock)) playCue(cue.name, cue.count);
    },
    update(state, realDt) {
      clock += realDt;
      if (!ctx || ctx.state !== "running") return;
      const t = ctx.currentTime;
      const drive = state.quiet ? 0 : state.drive;
      driveGain.gain.setTargetAtTime(drive * 0.9, t, 0.25);
      driveFilter.frequency.setTargetAtTime(70 + drive * 180, t, 0.25);
      const pdc = state.quiet ? 0 : Math.min(1, state.pdcsFiring / 2);
      pdcGain.gain.setTargetAtTime(pdc * 0.5, t, 0.04);
      // Impact countdown: faster beeps as the hit gets closer.
      const gap = state.quiet || A.muted ? null : beepInterval(state.impactIn);
      if (gap === null) nextBeep = 0;
      else if (clock >= nextBeep) {
        beep();
        nextBeep = clock + gap;
      } else nextBeep = Math.min(nextBeep, clock + gap);
    },
    applyVolumes,
  };
}
