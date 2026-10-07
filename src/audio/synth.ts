// The game's sounds, made live with the Web Audio API: filtered noise, oscillators,
// saturation and envelopes. No sound files, no dependency. What to play is decided in
// game/soundCues.ts.
//
// The aim is weight, not tunes (owner, 2026-10-06): everything is heard from inside a metal
// hull (a short metallic reverb), alarms come through the ship's speakers (band-limited and
// a little overdriven), and hits and explosions are built from noise and sub-bass rather
// than ringing tones.
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

/** How much of each group goes to the hull reverb (scaled by audioTuning.reverb). */
const REVERB_SEND: Record<Group, number> = { impacts: 0.7, weapons: 0.45, alarms: 0.3, drive: 0.12 };

/** Rounds per second in the PDC sound (matches the guns' rate of fire). */
const PDC_ROUNDS_PER_S = 50;

export interface SoundSystem {
  /** Plays one-shot sounds (throttled per kind). */
  play(cues: Cue[]): void;
  /** Updates the continuous sounds; call every frame. */
  update(state: SoundState, realDt: number): void;
  /** Applies volume and mute changes from audioTuning. */
  applyVolumes(): void;
  /** Plays one sound on demand, for the debug panel: a cue, or a few seconds of a
   *  continuous sound. */
  preview(name: PreviewName): void;
}

/** Everything the debug panel can play. */
export const PREVIEW_NAMES = [
  "drive", "pdcFire", "countdown", "launchOwn", "railgunOwn", "pdcKillOwn", "hitOwn", "hitOwnLight", "subsystemOffline",
  "ownLost", "enemyKilled", "launchWarning", "railgunWarning", "contact", "contactLost", "enemySensors", "heatCritical",
  "victory", "defeat",
] as const;
export type PreviewName = (typeof PREVIEW_NAMES)[number];

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** A soft-clipping curve: more `drive`, more grit. */
function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const c = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / norm;
  }
  return c;
}

export function createSoundSystem(): SoundSystem {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let reverbIn: GainNode;
  let reverbOut: GainNode;
  /** The ship's speakers: alarm and console sounds go through here. */
  let speaker: AudioNode;
  const groups = {} as Record<Group, GainNode>;
  let noise: AudioBuffer;
  // Continuous sounds.
  let driveGain: GainNode;
  let driveFilter: BiquadFilterNode;
  let driveHiss: GainNode;
  let lastDrive = 0;
  const pdcLayers: GainNode[] = [];
  let clock = 0; // real seconds, for throttling
  // A continuous sound being auditioned from the debug panel, until `until` (real seconds).
  let audition: { name: "drive" | "pdcFire" | "countdown"; from: number; until: number } | null = null;
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
    const c = ctx;
    // A limiter keeps a big moment (a salvo landing) from clipping.
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    master = c.createGain();
    master.connect(limiter).connect(c.destination);

    // Two seconds of white noise, looped or sliced for every noisy sound.
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // The hull: a short, dark, metallic room.
    const convolver = c.createConvolver();
    convolver.buffer = hullImpulse(c);
    reverbIn = c.createGain();
    reverbOut = c.createGain();
    reverbIn.connect(convolver).connect(reverbOut).connect(master);

    for (const g of ["alarms", "weapons", "impacts", "drive"] as Group[]) {
      groups[g] = c.createGain();
      groups[g].connect(master);
      const send = c.createGain();
      send.gain.value = REVERB_SEND[g];
      groups[g].connect(send).connect(reverbIn);
    }

    // Ship's speakers: no deep bass, no sparkle, a little overdriven.
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 320;
    hp.Q.value = 0.7;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    lp.Q.value = 0.9;
    const honk = c.createBiquadFilter();
    honk.type = "peaking";
    honk.frequency.value = 1400;
    honk.Q.value = 1.2;
    honk.gain.value = 5;
    const grit = c.createWaveShaper();
    grit.curve = saturationCurve(2.2);
    grit.oversample = "2x";
    hp.connect(honk).connect(grit).connect(lp).connect(groups.alarms);
    speaker = hp;

    buildDrive();
    buildPdcLoop();
    applyVolumes();
  }

  /** A synthesized room: early reflections off close metal walls, then a dark, fast tail. */
  function hullImpulse(c: AudioContext): AudioBuffer {
    const seconds = 1.4;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / c.sampleRate;
        // The tail gets darker as it dies (a one-pole low-pass closing over time).
        const k = 0.5 * Math.exp(-t * 4) + 0.04;
        lp += k * (Math.random() * 2 - 1 - lp);
        data[i] = lp * Math.exp(-t * 5.5) * 1.6;
      }
      for (const ms of [5, 9, 14, 21, 29, 38]) {
        const i = Math.floor(((ms + (ch ? 1.3 : 0)) / 1000) * c.sampleRate);
        data[i] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.exp(-ms / 30);
      }
    }
    return buf;
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(A.muted ? 0 : A.master, t, 0.03);
    reverbOut.gain.setTargetAtTime(A.reverb, t, 0.03);
    for (const g of Object.keys(groups) as Group[]) groups[g].gain.setTargetAtTime(A[g], t, 0.03);
  }

  // --- Building blocks ---

  function noiseSource(loop = false): AudioBufferSourceNode {
    const src = ctx!.createBufferSource();
    src.buffer = noise;
    src.loop = loop;
    return src;
  }

  function saturator(out: AudioNode, drive: number): WaveShaperNode {
    const s = ctx!.createWaveShaper();
    s.curve = saturationCurve(drive);
    s.oversample = "2x";
    s.connect(out);
    return s;
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

  /** A gain that rises, holds and falls: a held note, not a strike. */
  function held(out: AudioNode, at: number, peak: number, attack: number, hold: number, release: number): GainNode {
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.linearRampToValueAtTime(0, at + attack + hold + release);
    g.connect(out);
    return g;
  }

  /** A tone sliding from f0 to f1 Hz with a strike envelope. */
  function tone(out: AudioNode, at: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number) {
    const o = ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + attack + decay);
    o.connect(envelope(out, at, peak, attack, decay));
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  }

  /** A burst of filtered noise; the filter can sweep to freqEnd. */
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

  /** Short random bursts of band-passed noise over `span` seconds: debris, crackle, tearing. */
  function crackle(out: AudioNode, at: number, span: number, n: number, lo: number, hi: number, peak: number) {
    for (let i = 0; i < n; i++) {
      const when = at + Math.pow(Math.random(), 1.6) * span; // denser at the start
      const fade = 1 - (when - at) / span;
      hiss(out, when, "bandpass", rand(lo, hi), rand(2, 6), peak * rand(0.4, 1) * fade, 0.001, rand(0.02, 0.09));
    }
  }

  /** The thud of a heavy blow: a falling sub tone pushed into saturation. */
  function thud(out: AudioNode, at: number, f0: number, f1: number, peak: number, decay: number) {
    tone(saturator(out, 3), at, "sine", f0, f1, peak, 0.003, decay);
  }

  /** The hull groaning under strain: low, slowly sliding resonant noise. Not a bell. */
  function groan(out: AudioNode, at: number, f0: number, f1: number, peak: number, length: number) {
    const src = noiseSource();
    const f = ctx!.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 9;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.linearRampToValueAtTime(f1, at + length);
    src.connect(f).connect(held(out, at, peak, length * 0.25, length * 0.3, length * 0.45));
    src.start(at, Math.random() * 1.5);
    src.stop(at + length + 0.05);
  }

  /** A horn blast through the speakers: detuned saws with the swoop of a horn coming up. */
  function horn(at: number, freq: number, length: number, peak: number) {
    const g = held(speaker, at, peak, 0.02, length - 0.06, 0.04);
    for (const [mult, type, v] of [[1, "sawtooth", 0.5], [1.012, "sawtooth", 0.45], [0.5, "square", 0.3]] as const) {
      const o = ctx!.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult * 0.84, at);
      o.frequency.exponentialRampToValueAtTime(freq * mult, at + 0.08);
      const v2 = ctx!.createGain();
      v2.gain.value = v;
      o.connect(v2).connect(g);
      o.start(at);
      o.stop(at + length + 0.02);
    }
  }

  /** A short console tone through the speakers. */
  function chirp(at: number, freq: number, length: number, peak: number) {
    const o = ctx!.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    o.connect(held(speaker, at, peak, 0.004, length, 0.02));
    o.start(at);
    o.stop(at + length + 0.05);
  }

  // --- Continuous sounds ---

  function buildDrive() {
    const c = ctx!;
    driveGain = c.createGain();
    driveGain.gain.value = 0;
    driveGain.connect(groups.drive);
    // Turbulence: the roar's strength wanders a little, never quite repeating.
    const wobble = c.createGain();
    wobble.gain.value = 1;
    wobble.connect(driveGain);
    const slowNoise = noiseSource(true);
    slowNoise.playbackRate.value = 0.004; // white noise slowed to a random drift
    const slowLp = c.createBiquadFilter();
    slowLp.type = "lowpass";
    slowLp.frequency.value = 6;
    const depth = c.createGain();
    depth.gain.value = 0.35;
    slowNoise.connect(slowLp).connect(depth).connect(wobble.gain);
    slowNoise.start();

    // The roar: low-passed noise whose filter breathes on two slow, unrelated cycles.
    driveFilter = c.createBiquadFilter();
    driveFilter.type = "lowpass";
    driveFilter.frequency.value = 90;
    driveFilter.Q.value = 1.1;
    for (const [rate, amount] of [[0.13, 18], [0.71, 9]] as const) {
      const lfo = c.createOscillator();
      lfo.frequency.value = rate;
      const amt = c.createGain();
      amt.gain.value = amount;
      lfo.connect(amt).connect(driveFilter.frequency);
      lfo.start();
    }
    const roar = noiseSource(true);
    roar.connect(driveFilter).connect(saturator(wobble, 1.5));
    roar.start();

    // Structure-borne hum: low tones out of tune with each other, beating slowly.
    const hum = c.createGain();
    hum.gain.value = 0.5;
    hum.connect(saturator(wobble, 2));
    for (const [f, v] of [[31, 0.4], [41, 0.35], [43.3, 0.25], [62.5, 0.08]] as const) {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = v;
      o.connect(g).connect(hum);
      o.start();
    }

    // The exhaust's hiss, faint, rising with thrust.
    driveHiss = c.createGain();
    driveHiss.gain.value = 0;
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 520;
    band.Q.value = 0.5;
    const hissSrc = noiseSource(true);
    hissSrc.connect(band).connect(driveHiss).connect(wobble);
    hissSrc.start(0, 0.7);
  }

  /** A buffer of PDC fire: each round a crack, a thump and the feed's click, with the slight
   *  unevenness of a real mechanism. Looped while the guns fire. */
  function pdcBuffer(c: AudioContext): AudioBuffer {
    const seconds = 2;
    const sr = c.sampleRate;
    const buf = c.createBuffer(1, Math.floor(sr * seconds), sr);
    const d = buf.getChannelData(0);
    const rounds = seconds * PDC_ROUNDS_PER_S;
    for (let r = 0; r < rounds; r++) {
      const t0 = r / PDC_ROUNDS_PER_S + rand(-0.0015, 0.0015);
      const amp = rand(0.75, 1);
      const bodyHz = rand(70, 90);
      let lp = 0;
      const bright = rand(0.25, 0.5);
      for (let i = Math.max(0, Math.floor(t0 * sr)), n = 0; n < sr * 0.03 && i < d.length; i++, n++) {
        const t = n / sr;
        lp += bright * (Math.random() * 2 - 1 - lp);
        const crack = lp * Math.exp(-t / 0.0035) * 1.3;
        const body = Math.sin(2 * Math.PI * bodyHz * t) * Math.exp(-t / 0.012) * 0.9;
        const click = t > 0.009 && t < 0.0105 ? (Math.random() * 2 - 1) * 0.25 : 0;
        d[i] += amp * (crack + body + click);
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.4);
    return buf;
  }

  function buildPdcLoop() {
    const c = ctx!;
    const buf = pdcBuffer(c);
    // Heard through the hull: the top end rolled off, the chest thump lifted.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const chest = c.createBiquadFilter();
    chest.type = "peaking";
    chest.frequency.value = 160;
    chest.Q.value = 0.9;
    chest.gain.value = 4;
    lp.connect(chest).connect(groups.weapons);
    // Two layers, out of step with each other: one mount firing, then two or more.
    for (const offset of [0, 0.73]) {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(lp);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = offset ? 1.04 : 1;
      src.connect(g);
      src.start(0, offset);
      pdcLayers.push(g);
    }
  }

  // --- One-shot sounds ---

  function playCue(name: CueName, count: number) {
    const c = ctx!;
    const out = groups[GROUP_OF[name]];
    const t = c.currentTime + 0.01;
    switch (name) {
      case "launchOwn": {
        // The tube's heavy clunk and gas, then the motor's roar falling away. A salvo ripples.
        const n = Math.min(count, 4);
        for (let i = 0; i < n; i++) {
          const at = t + i * rand(0.13, 0.18);
          thud(out, at, rand(95, 110), 35, 0.8, 0.28);
          hiss(out, at, "lowpass", 1800, 0.7, 0.5, 0.002, 0.18, 300);
          hiss(out, at + 0.06, "bandpass", 1400, 0.6, 0.3, 0.05, 1.3, 400);
        }
        break;
      }
      case "railgunOwn":
        // The capacitors dump: a hard electric snap, the slug's crack, a deep recoil through the frame.
        hiss(out, t, "highpass", 2500, 0.6, 0.7, 0.0008, 0.07);
        tone(saturator(out, 4), t, "sawtooth", 900, 60, 0.35, 0.001, 0.16);
        thud(out, t + 0.01, 65, 26, 1, 0.65);
        crackle(out, t + 0.05, 0.4, 5, 800, 2600, 0.12);
        break;
      case "pdcKillOwn":
        // Something shot down out there: a muffled, distant detonation.
        hiss(out, t, "lowpass", rand(900, 1300), 0.6, 0.28, 0.004, 0.3, 200);
        thud(out, t, rand(85, 100), 40, 0.25, 0.22);
        break;
      case "hitOwn":
        // A hit on our hull: the blow, metal crunching and tearing, debris, then the frame groaning.
        thud(out, t, rand(52, 60), 20, 1, 1.1);
        hiss(saturator(out, 2.5), t, "lowpass", 2600, 0.8, 1, 0.002, 0.7, 180);
        crackle(out, t + 0.02, 0.9, 14, 350, 2200, 0.5);
        groan(out, t + 0.35, rand(150, 175), rand(85, 100), 0.55, 2);
        break;
      case "hitOwnLight":
        // PDC rounds striking the hull: hard, dry knocks.
        for (let i = 0; i < Math.min(count, 4); i++) {
          const at = t + i * rand(0.03, 0.06);
          hiss(out, at, "bandpass", rand(1800, 3200), 2.5, 0.35, 0.0008, 0.03);
          thud(out, at, 140, 70, 0.25, 0.06);
        }
        break;
      case "subsystemOffline":
        // A fault buzzer.
        for (let i = 0; i < 2; i++) {
          const at = t + i * 0.42;
          const g = held(speaker, at, 0.35, 0.01, 0.26, 0.03);
          for (const f of [233, 239]) {
            const o = c.createOscillator();
            o.type = "square";
            o.frequency.value = f;
            o.connect(g);
            o.start(at);
            o.stop(at + 0.32);
          }
        }
        break;
      case "ownLost":
        // Our ship breaking up: a long blast, the frame failing, power dying.
        thud(out, t, 48, 16, 1, 2.6);
        hiss(saturator(out, 3), t, "lowpass", 3000, 0.7, 1, 0.003, 2.8, 70);
        crackle(out, t + 0.05, 2.5, 30, 250, 2500, 0.6);
        groan(out, t + 0.6, 130, 60, 0.7, 3);
        tone(saturator(groups.alarms, 2), t + 0.4, "sawtooth", 180, 30, 0.12, 0.1, 2.5);
        break;
      case "enemyKilled":
        // Far off: a deep explosion with a rolling, crackling tail. Then the console confirms.
        thud(out, t, 45, 22, 0.55, 2.2);
        hiss(out, t, "lowpass", 700, 0.6, 0.6, 0.02, 2.6, 60);
        crackle(out, t + 0.1, 2, 18, 150, 900, 0.3);
        chirp(t + 0.7, 880, 0.08, 0.22);
        chirp(t + 0.85, 1320, 0.14, 0.22);
        break;
      case "launchWarning":
        // Three harsh horn blasts.
        for (let i = 0; i < 3; i++) horn(t + i * 0.62, 370, 0.46, 0.45);
        break;
      case "railgunWarning":
        // A rising whoop, twice.
        for (let i = 0; i < 2; i++) {
          const at = t + i * 0.45;
          const g = held(speaker, at, 0.4, 0.02, 0.3, 0.05);
          for (const mult of [1, 1.01]) {
            const o = c.createOscillator();
            o.type = "sawtooth";
            o.frequency.setValueAtTime(380 * mult, at);
            o.frequency.exponentialRampToValueAtTime(1050 * mult, at + 0.35);
            o.connect(g);
            o.start(at);
            o.stop(at + 0.4);
          }
        }
        break;
      case "contact":
        // An active ping and its echo off the hull.
        tone(speaker, t, "sine", 1046, 1040, 0.5, 0.004, 0.6);
        tone(speaker, t + 0.3, "sine", 1046, 1040, 0.15, 0.004, 0.5);
        break;
      case "contactLost":
        tone(speaker, t, "sine", 880, 620, 0.4, 0.004, 0.7);
        break;
      case "enemySensors": {
        // A warble: their sensors are sweeping the area.
        const o = c.createOscillator();
        o.type = "triangle";
        o.frequency.value = 760;
        const lfo = c.createOscillator();
        lfo.frequency.value = 11;
        const depth = c.createGain();
        depth.gain.value = 70;
        lfo.connect(depth).connect(o.frequency);
        o.connect(held(speaker, t, 0.3, 0.05, 0.6, 0.1));
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.8);
        lfo.stop(t + 0.8);
        break;
      }
      case "heatCritical":
        for (let i = 0; i < 3; i++) horn(t + i * 0.36, 220, 0.24, 0.35);
        break;
      case "victory":
        // Stand down: the console's all-clear, three steps up.
        [660, 880, 1100].forEach((f, i) => chirp(t + i * 0.2, f, i === 2 ? 0.4 : 0.12, 0.22));
        break;
      case "defeat":
        // Power failing: everything winds down.
        tone(saturator(out, 2), t, "sawtooth", 240, 35, 0.25, 0.05, 3);
        groan(groups.impacts, t + 0.2, 110, 50, 0.4, 3);
        break;
    }
  }

  function beep() {
    chirp(ctx!.currentTime + 0.005, 1180, 0.05, 0.3);
  }

  /** The drive lighting or cutting out. */
  function driveChange(lit: boolean) {
    const t = ctx!.currentTime + 0.01;
    const out = groups.drive;
    if (lit) {
      thud(out, t, 70, 30, 0.7, 0.5);
      hiss(out, t, "lowpass", 200, 0.8, 0.6, 0.15, 0.6, 1200);
    } else {
      hiss(out, t, "lowpass", 600, 0.7, 0.35, 0.02, 0.8, 60);
      groan(out, t + 0.1, 120, 80, 0.25, 1.2);
    }
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
    update(live, realDt) {
      clock += realDt;
      if (!ctx || ctx.state !== "running") return;
      let state = live;
      if (audition && clock > audition.until) audition = null;
      if (audition) {
        const s = clock - audition.from;
        state = { ...live, quiet: false };
        if (audition.name === "drive") state.drive = s < 3.5 ? 0.8 : 0;
        if (audition.name === "pdcFire") state.pdcsFiring = s < 1 ? 1 : s < 2.5 ? 3 : 0;
        if (audition.name === "countdown") state.impactIn = Math.max(0, A.impactBeepS - s * 4);
      }
      const t = ctx.currentTime;
      const drive = state.quiet ? 0 : state.drive;
      if (!A.muted && !state.quiet) {
        if (drive > 0.05 && lastDrive <= 0.05) driveChange(true);
        else if (drive <= 0.05 && lastDrive > 0.05) driveChange(false);
      }
      lastDrive = drive;
      driveGain.gain.setTargetAtTime(drive * 0.9, t, 0.3);
      driveFilter.frequency.setTargetAtTime(70 + drive * 200, t, 0.3);
      driveHiss.gain.setTargetAtTime(drive * drive * 0.12, t, 0.3);
      const firing = state.quiet ? 0 : state.pdcsFiring;
      pdcLayers[0].gain.setTargetAtTime(firing >= 1 ? 0.55 : 0, t, firing >= 1 ? 0.01 : 0.05);
      pdcLayers[1].gain.setTargetAtTime(firing >= 2 ? 0.45 : 0, t, firing >= 2 ? 0.01 : 0.05);
      // Impact countdown: faster beeps as the hit gets closer.
      const gap = state.quiet || A.muted ? null : beepInterval(state.impactIn);
      if (gap === null) nextBeep = 0;
      else if (clock >= nextBeep) {
        beep();
        nextBeep = clock + gap;
      } else nextBeep = Math.min(nextBeep, clock + gap);
    },
    applyVolumes,
    preview(name) {
      start();
      if (!ctx) return;
      if (ctx.state !== "running") void ctx.resume();
      if (name === "drive" || name === "pdcFire" || name === "countdown") {
        const length = name === "drive" ? 5 : name === "pdcFire" ? 3.2 : A.impactBeepS / 4;
        audition = { name, from: clock, until: clock + length };
      } else playCue(name, name === "launchOwn" ? 4 : 1);
    },
  };
}
