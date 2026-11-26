// Mischief, heard (design section 13b). Owner: Mischief.
//
// A crackle that swells with how much is burning, a hiss while hoses play
// on a fire, the alarm bell rung when a fire starts, the fuse's fizz, a
// deep drawn-out BOOM and a splash for a bomb in the sea. Off until the
// player turns sound on (the same switch as the rest of the town's sound).

import { hash, rand } from '@/core/rand';
import { defineSystem, type LifeStage } from '../api';
import { noiseBuffer, pop, strike } from '../sound/synth';
import { holdAudio, releaseAudio } from '../sound/context';
import { SOUND_VOLUME_DEFAULT, SOUND_VOLUME_EVENT, SOUND_VOLUME_KEY, readVolume, soundOn } from '../sound/volume';
import { mischiefOf, type Director } from './director';
import { ufosOf } from './ufo.system';

/** The master level with the player's volume for sounds on it (the menu's slider). */
const level = (): number => 0.5 * readVolume(SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT);

interface Audio {
  ac: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
  crackle: GainNode;
  hiss: GainNode;
  /** The UFO: a wobbling hum while one is about, a rising tone while its beam is on. */
  hum: GainNode;
  humOsc: OscillatorNode;
  ray: GainNode;
  rayOsc: OscillatorNode;
}
interface State {
  d: Director;
  /** The UFOs' phases last frame (a zip as one shoots off), and the stage they are found on. */
  ufoPhases: Map<number, string>;
  /** When the next zip may sound. */
  zipAt: number;
  stage: LifeStage;
  wanted: boolean;
  audio: Audio | null;
  off: (() => void)[];
  crackleIn: number;
  bellUntil: number;
  bellAt: number;
  n: number;
}

/**
 * Townspeople going up in the air: short rising "whoa!"s, each its own pitch and moment, from `from` seconds
 * on (the nuke's after its flash), a few each.
 */
function yelps(a: Audio, n: number, from: number, seed: number): void {
  const t0 = a.ac.currentTime + from;
  for (let i = 0; i < n; i++) {
    const at = t0 + rand(seed, 'yelp-at', i) * (n > 4 ? 1.1 : 0.3);
    const f = 420 + rand(seed, 'yelp-f', i) * 380;
    const o = a.ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 1.9, at + 0.12);
    o.frequency.exponentialRampToValueAtTime(f * 1.4, at + 0.3);
    const g = a.ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.05, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
    o.connect(g).connect(a.master);
    o.start(at);
    o.stop(at + 0.35);
  }
}

const hasAudio = (): boolean => typeof window !== 'undefined' && typeof (window as { AudioContext?: unknown }).AudioContext === 'function';

function start(st: State): void {
  if (st.audio) {
    void st.audio.ac.resume();
    st.audio.master.gain.setTargetAtTime(level(), st.audio.ac.currentTime, 0.15);
    return;
  }
  const ac = holdAudio();
  const master = ac.createGain();
  master.gain.value = level();
  master.connect(ac.destination);
  const noise = noiseBuffer(ac, 0x6d15);
  // The crackle: noise through a band in the middle, its level following the fire.
  const fireSrc = ac.createBufferSource();
  fireSrc.buffer = noise;
  fireSrc.loop = true;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400;
  band.Q.value = 0.6;
  const crackle = ac.createGain();
  crackle.gain.value = 0;
  fireSrc.connect(band).connect(crackle).connect(master);
  fireSrc.start();
  // The hiss of water on a fire: high noise.
  const waterSrc = ac.createBufferSource();
  waterSrc.buffer = noise;
  waterSrc.loop = true;
  waterSrc.playbackRate.value = 1.3;
  const high = ac.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 2600;
  const hiss = ac.createGain();
  hiss.gain.value = 0;
  waterSrc.connect(high).connect(hiss).connect(master);
  waterSrc.start(0, 0.4);
  // The UFO's hum: a low square-ish tone wobbled by a slow one; and its beam's tone, which rises.
  const humOsc = ac.createOscillator();
  humOsc.type = 'triangle';
  humOsc.frequency.value = 92;
  const wob = ac.createOscillator();
  wob.frequency.value = 5.5;
  const wobDepth = ac.createGain();
  wobDepth.gain.value = 9;
  wob.connect(wobDepth).connect(humOsc.frequency);
  const hum = ac.createGain();
  hum.gain.value = 0;
  humOsc.connect(hum).connect(master);
  humOsc.start();
  wob.start();
  const rayOsc = ac.createOscillator();
  rayOsc.type = 'sine';
  rayOsc.frequency.value = 300;
  const ray = ac.createGain();
  ray.gain.value = 0;
  rayOsc.connect(ray).connect(master);
  rayOsc.start();
  st.audio = { ac, master, noise, crackle, hiss, hum, humOsc, ray, rayOsc };
}

/** A UFO shooting off: a quick rising zip. */
function zip(a: Audio): void {
  const t = a.ac.currentTime;
  const o = a.ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
  const g = a.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g).connect(a.master);
  o.start(t);
  o.stop(t + 0.42);
}

/** A bang: a thump that drops in pitch, under a burst of rumbling noise. */
function boom(a: Audio, big: number): void {
  const { ac, master } = a;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.7);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6 * big, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 1.3);
  const src = ac.createBufferSource();
  src.buffer = a.noise;
  const low = ac.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(1800, t);
  low.frequency.exponentialRampToValueAtTime(120, t + 1.4);
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.5 * big, t + 0.015);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  src.connect(low).connect(ng).connect(master);
  src.start(t, 0.2);
  src.stop(t + 1.7);
}

/**
 * The nuke going off (after the beat of silence the warning leaves): a sharp crack with the flash, a deep
 * rolling boom arriving with the shockwave a moment later, and a long low rumble under the rising cloud.
 */
function nukeBang(a: Audio): void {
  const { ac, master } = a;
  const t = ac.currentTime;
  const burst = (at: number, filter: BiquadFilterType, f0: number, f1: number, peak: number, attack: number, len: number, offset: number): void => {
    const src = ac.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f).connect(g).connect(master);
    src.start(at, offset);
    src.stop(at + len + 0.05);
  };
  // The crack.
  burst(t, 'highpass', 2400, 900, 0.7, 0.004, 0.18, 0.1);
  // The boom, with the shockwave.
  const boomAt = t + 0.22;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(72, boomAt);
  osc.frequency.exponentialRampToValueAtTime(22, boomAt + 2.2);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, boomAt);
  g.gain.exponentialRampToValueAtTime(1.1, boomAt + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, boomAt + 2.6);
  osc.connect(g).connect(master);
  osc.start(boomAt);
  osc.stop(boomAt + 2.7);
  burst(boomAt, 'lowpass', 1100, 70, 0.9, 0.03, 3.2, 0.3);
  // The rumble under the cloud.
  const src = ac.createBufferSource();
  src.buffer = a.noise;
  src.loop = true;
  src.playbackRate.value = 0.5;
  const low = ac.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 130;
  const rg = ac.createGain();
  rg.gain.setValueAtTime(0.0001, boomAt);
  rg.gain.exponentialRampToValueAtTime(0.45, boomAt + 1.2);
  rg.gain.setValueAtTime(0.45, boomAt + 3);
  rg.gain.exponentialRampToValueAtTime(0.0001, boomAt + 14);
  src.connect(low).connect(rg).connect(master);
  src.start(boomAt, 0.7);
  src.stop(boomAt + 14.1);
}

/** Thunder with a lightning strike: a sharp crack, then a short rolling rumble. */
function thunder(a: Audio): void {
  const { ac, master } = a;
  const t = ac.currentTime;
  const burst = (at: number, type: BiquadFilterType, f0: number, f1: number, peak: number, attack: number, len: number, offset: number): void => {
    const src = ac.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f).connect(g).connect(master);
    src.start(at, offset);
    src.stop(at + len + 0.05);
  };
  burst(t, 'highpass', 3000, 1200, 0.45, 0.003, 0.14, 0.05);
  burst(t + 0.05, 'lowpass', 900, 80, 0.5, 0.06, 1.9, 0.4);
}

/** The nuke coming: a siren rising and falling and a whistle dropping in pitch, both cut off as it lands (it goes off on landing, so nothing overlaps the bang). */
function nukeWarning(a: Audio, fall: number): void {
  const { ac, master } = a;
  const t = ac.currentTime;
  const siren = ac.createOscillator();
  siren.type = 'triangle';
  for (let i = 0; i < 3; i++) {
    siren.frequency.setValueAtTime(420, t + i * 0.9);
    siren.frequency.linearRampToValueAtTime(780, t + i * 0.9 + 0.45);
    siren.frequency.linearRampToValueAtTime(420, t + i * 0.9 + 0.9);
  }
  const sg = ac.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.06, t + 0.2);
  // Both stop just short of the landing, which is the bang.
  const end = Math.max(0.6, fall - 0.08);
  sg.gain.setValueAtTime(0.06, Math.max(t + 0.25, t + end - 0.3));
  sg.gain.exponentialRampToValueAtTime(0.0001, t + end);
  siren.connect(sg).connect(master);
  siren.start(t);
  siren.stop(t + end + 0.02);
  // The whistle: from high to low over the fall.
  const whistle = ac.createOscillator();
  whistle.type = 'sine';
  whistle.frequency.setValueAtTime(2200, t + 0.4);
  whistle.frequency.exponentialRampToValueAtTime(380, t + end);
  const wg = ac.createGain();
  wg.gain.setValueAtTime(0.0001, t + 0.4);
  wg.gain.exponentialRampToValueAtTime(0.05, t + 0.8);
  wg.gain.setValueAtTime(0.05, t + end - 0.08);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + end);
  whistle.connect(wg).connect(master);
  whistle.start(t + 0.4);
  whistle.stop(t + end + 0.02);
}

export default defineSystem<State>({
  id: 'mischief.sound',
  order: 101,
  create(ctx) {
    const st: State = { stage: ctx.stage, ufoPhases: new Map(), zipAt: 0, d: mischiefOf(ctx.stage), wanted: false, audio: null, off: [], crackleIn: 0, bellUntil: 0, bellAt: 0, n: 0 };
    if (!hasAudio()) return st;
    st.wanted = soundOn();
    const gesture = (): void => {
      if (st.wanted && !st.audio) start(st);
    };
    const toggle = (e: Event): void => {
      st.wanted = (e as CustomEvent<boolean>).detail === true;
      if (st.wanted) start(st);
      else if (st.audio) st.audio.master.gain.setTargetAtTime(0, st.audio.ac.currentTime, 0.15);
    };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    const volume = (e: Event): void => {
      const a = st.audio;
      if (a && st.wanted) a.master.gain.setTargetAtTime(0.5 * (e as CustomEvent<number>).detail, a.ac.currentTime, 0.08);
    };
    window.addEventListener('lc:sound', toggle);
    window.addEventListener(SOUND_VOLUME_EVENT, volume);
    st.off.push(
      () => window.removeEventListener(SOUND_VOLUME_EVENT, volume),
      () => window.removeEventListener('pointerdown', gesture),
      () => window.removeEventListener('keydown', gesture),
      () => window.removeEventListener('lc:sound', toggle),
      st.d.on((e) => {
        const a = st.audio;
        if (!a || !st.wanted) return;
        if (e.type === 'drop' && e.bomb.nuke) nukeWarning(a, e.bomb.fall);
        else if (e.type === 'strike') thunder(a);
        else if (e.type === 'lit') st.bellUntil = Math.max(st.bellUntil, a.ac.currentTime + 4);
        else if (e.type === 'blast') {
          if (e.nuke) nukeBang(a);
          else if (e.blast.water) pop(a.ac, a.master, a.noise, 0.25, 0.3);
          else boom(a, 1);
          // Blown about (design section 13b): a little chorus of yelps on the way up.
          if (!e.blast.water) yelps(a, e.nuke ? 9 : 3, e.nuke ? 0.35 : 0.05, e.bomb);
        } else if (e.type === 'knock') pop(a.ac, a.master, a.noise, 0.18, (st.n++ % 5) * 0.2);
        else if (e.type === 'mend') strike(a.ac, a.master, 330, 'plank', 0.06);
      }),
    );
    return st;
  },
  update(st, dt) {
    const a = st.audio;
    if (!a || !st.wanted) return;
    const t = a.ac.currentTime;
    // How much is burning, and how many hoses are at work.
    let heat = 0;
    for (const b of st.d.engine.burning()) heat += b.intensity;
    let hoses = 0;
    for (const b of st.d.brigades?.values() ?? []) hoses += b.aim.size;
    a.crackle.gain.setTargetAtTime(Math.min(0.09, 0.02 * Math.sqrt(heat)), t, 0.3);
    a.hiss.gain.setTargetAtTime(Math.min(0.05, 0.018 * hoses), t, 0.3);
    // Crackles: little pops now and then, more for a bigger fire.
    st.crackleIn -= dt;
    if (heat > 0.05 && st.crackleIn <= 0) {
      st.crackleIn = 0.05 + rand(hash(st.n++), 'crackle') * (0.5 / Math.min(4, 1 + heat));
      pop(a.ac, a.master, a.noise, Math.min(0.06, 0.02 + heat * 0.005), (st.n % 9) * 0.11);
    }
    // The UFO: one hum while any is about (however many), one beam tone rising while any lifts somebody, a zip as one shoots off.
    const ufos = st.stage ? ufosOf(st.stage) : null;
    let about = 0, beaming = 0;
    const live = new Set<number>();
    for (const u of ufos?.saucers ?? []) {
      live.add(u.n);
      if (u.phase !== 'gone' && u.phase !== 'done') about++;
      if (u.beam > 0.05) beaming = Math.max(beaming, u.phase === 'lift' ? Math.min(1, u.t / 3) : 0.3);
      const was = st.ufoPhases.get(u.n);
      // (Many going at once: a zip at most every 0.3 s, never a pile of them.)
      if (was !== u.phase && (u.phase === 'away' || u.phase === 'leave') && t >= st.zipAt) {
        zip(a);
        st.zipAt = t + 0.3;
      }
      st.ufoPhases.set(u.n, u.phase);
    }
    for (const n of [...st.ufoPhases.keys()]) if (!live.has(n)) st.ufoPhases.delete(n);
    a.hum.gain.setTargetAtTime(about > 0 ? 0.035 : 0, t, 0.25);
    a.ray.gain.setTargetAtTime(beaming > 0 ? 0.03 : 0, t, 0.12);
    a.rayOsc.frequency.setTargetAtTime(300 + beaming * 500, t, 0.2);
    // The alarm bell: a quick ding-ding while a fire has just started.
    if (t < st.bellUntil && t >= st.bellAt) {
      st.bellAt = t + 0.42;
      strike(a.ac, a.master, 880, 'bell', 0.05);
    }
  },
  dispose(st) {
    for (const off of st.off) off();
    if (st.audio) releaseAudio();
    st.audio = null;
  },
});
