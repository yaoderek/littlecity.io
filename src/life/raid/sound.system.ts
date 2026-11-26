// The raid, heard (design section 13b): the longship's horn as its sail comes
// over the edge of the map and the chief's horn calling the band home, the
// town's alarm bell rung hard when the sail is seen, war cries, splashes as
// they jump over the side, the crunch of the keel on the sand. The fires'
// crackle is the mischief sound system's. Off until the player turns sound on
// (the same switch as the rest of the town's sound).

import { defineSystem } from '../api';
import { noiseBuffer, strike } from '../sound/synth';
import { holdAudio, releaseAudio } from '../sound/context';
import { SOUND_VOLUME_DEFAULT, SOUND_VOLUME_EVENT, SOUND_VOLUME_KEY, readVolume, soundOn } from '../sound/volume';
import { raidsOf } from './raids';
import type { RaidSound } from './raid';

const level = (): number => 0.5 * readVolume(SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT);

interface Audio {
  ac: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}
interface State {
  wanted: boolean;
  audio: Audio | null;
  off: (() => void)[];
  /** The alarm bell: rung until this time, the next stroke at bellAt (AudioContext seconds). */
  bellUntil: number;
  bellAt: number;
  n: number;
  /** When the sounds now playing end (AudioContext seconds): a few voices at most, however many raids are on. */
  voices: number[];
  /** A horn is sounding until then: one horn at a time. */
  hornUntil: number;
}

/** Voices at once, all raids together: a click storm of raids is a few horns and cries, not a din. */
const VOICES = 4;
function room(st: State, t: number, len: number): boolean {
  st.voices = st.voices.filter((e) => e > t);
  if (st.voices.length >= VOICES) return false;
  st.voices.push(t + len);
  return true;
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
  st.audio = { ac, master, noise: noiseBuffer(ac, 0x7a1d) };
}

/** A great ox horn: a low brassy note that swells, wavers and falls away (two notes for the chief's call home). */
export function horn(a: Audio, long: boolean): void {
  const { ac, master } = a;
  const t = ac.currentTime;
  const notes: [number, number, number][] = long ? [[0, 1.1, 98], [1.25, 2.2, 82]] : [[0, 2.4, 92]];
  for (const [at, len, f] of notes) {
    const t0 = t + at;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 0.94, t0);
    osc.frequency.linearRampToValueAtTime(f, t0 + 0.25);
    osc.frequency.linearRampToValueAtTime(f * 0.97, t0 + len);
    // A slow waver, as a breath does.
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ac.createGain();
    lg.gain.value = 1.6;
    lfo.connect(lg).connect(osc.frequency);
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(300, t0);
    tone.frequency.linearRampToValueAtTime(900, t0 + 0.4);
    tone.frequency.linearRampToValueAtTime(500, t0 + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.3);
    g.gain.setValueAtTime(0.16, t0 + len - 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    osc.connect(tone).connect(g).connect(master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + len + 0.05);
    lfo.stop(t0 + len + 0.05);
  }
}

/** A war cry: a rough shout that rises and drops ("RAAR!"), a voice through a formant. */
function cry(a: Audio, n: number): void {
  const { ac, master } = a;
  const t = ac.currentTime;
  const f = 150 + (n % 4) * 22;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.linearRampToValueAtTime(f * 1.35, t + 0.18);
  osc.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.6);
  const formant = ac.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.value = 700 + (n % 3) * 120;
  formant.Q.value = 2.5;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
  osc.connect(formant).connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.7);
  // Grit in the throat.
  const src = ac.createBufferSource();
  src.buffer = a.noise;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1200;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.03, t + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(band).connect(ng).connect(master);
  src.start(t, (n % 7) * 0.13);
  src.stop(t + 0.55);
}

/** A splash, or the keel's crunch on the sand (lower, longer). */
function splash(a: Audio, crunch: boolean, n: number): void {
  const { ac, master } = a;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = a.noise;
  const f = ac.createBiquadFilter();
  f.type = crunch ? 'lowpass' : 'highpass';
  f.frequency.setValueAtTime(crunch ? 700 : 1400, t);
  f.frequency.exponentialRampToValueAtTime(crunch ? 150 : 600, t + (crunch ? 0.9 : 0.35));
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(crunch ? 0.2 : 0.06, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (crunch ? 1 : 0.4));
  src.connect(f).connect(g).connect(master);
  src.start(t, (n % 9) * 0.1);
  src.stop(t + 1.05);
}

export default defineSystem<State>({
  id: 'raid.sound',
  order: 102,
  create(ctx) {
    const st: State = { wanted: false, audio: null, off: [], bellUntil: 0, bellAt: 0, n: 0, voices: [], hornUntil: 0 };
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
    const volume = (e: Event): void => {
      const a = st.audio;
      if (a && st.wanted) a.master.gain.setTargetAtTime(0.5 * (e as CustomEvent<number>).detail, a.ac.currentTime, 0.08);
    };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    window.addEventListener('lc:sound', toggle);
    window.addEventListener(SOUND_VOLUME_EVENT, volume);
    st.off.push(
      () => window.removeEventListener('pointerdown', gesture),
      () => window.removeEventListener('keydown', gesture),
      () => window.removeEventListener('lc:sound', toggle),
      () => window.removeEventListener(SOUND_VOLUME_EVENT, volume),
      raidsOf(ctx.stage).on((e: RaidSound) => {
        const a = st.audio;
        if (!a || !st.wanted) return;
        st.n++;
        const t = a.ac.currentTime;
        if (e.type === 'horn') {
          const len = e.long ? 3.5 : 2.4;
          if (t >= st.hornUntil && room(st, t, len)) {
            st.hornUntil = t + len;
            horn(a, e.long);
          }
        } else if (e.type === 'cry') {
          if (room(st, t, 0.7)) cry(a, st.n);
        } else if (e.type === 'splash') {
          if (room(st, t, 0.4)) splash(a, false, st.n);
        } else if (e.type === 'crash') {
          if (room(st, t, 1)) splash(a, true, st.n);
        } else if (e.type === 'bell') st.bellUntil = Math.max(st.bellUntil, t + 7);
      }),
    );
    return st;
  },
  update(st) {
    const a = st.audio;
    if (!a || !st.wanted) return;
    const t = a.ac.currentTime;
    // The alarm: rung hard and fast, two bells in turn.
    if (t < st.bellUntil && t >= st.bellAt) {
      st.bellAt = t + 0.3;
      strike(a.ac, a.master, st.n++ % 2 ? 784 : 988, 'bell', 0.06);
    }
  },
  dispose(st) {
    for (const off of st.off) off();
    if (st.audio) releaseAudio();
    st.audio = null;
  },
});
