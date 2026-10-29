// Synthesises the whole soundtrack — a lo-fi loop plus sound effects at the
// scenes' cue times — as a 16-bit stereo WAV. No samples, no network, and a
// fixed noise seed, so the same cues always give the same file.

const SR = 44100;
const BAR = 14 / 6; // tempo chosen so the drums enter exactly at 0:14, when the title appears
const BEAT = BAR / 4;
const DRUMS_FROM = 14;

// Cmaj7 – Am7 – Fmaj7 – G6, as [bass, chord tones] in MIDI note numbers
const CHORDS = [
  [36, [60, 64, 67, 71]],
  [33, [57, 60, 64, 67]],
  [29, [57, 60, 64, 65]],
  [31, [55, 59, 62, 64]],
];

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function noise(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

export function soundtrack({ duration, cues }) {
  const n = Math.ceil(duration * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);

  /** Add `voice(t)` (t = seconds since start) for `len` seconds at `at`, panned -1..1. */
  const add = (at, len, gain, pan, voice) => {
    const i0 = Math.max(0, Math.round(at * SR));
    const i1 = Math.min(n, Math.round((at + len) * SR));
    const gl = gain * Math.min(1, 1 - pan);
    const gr = gain * Math.min(1, 1 + pan);
    const tail = Math.min(0.02, len / 4) * SR;
    for (let i = i0; i < i1; i++) {
      const s = voice((i - i0) / SR) * Math.min(1, (i1 - i) / tail); // short release, no clicks
      L[i] += s * gl;
      R[i] += s * gr;
    }
  };

  const keys = (f, decay) => (t) =>
    Math.exp(-t / decay) * Math.min(1, t / 0.006) *
    (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 3) + 0.08 * Math.sin(6 * Math.PI * f * t)) *
    (1 + 0.15 * Math.sin(2 * Math.PI * 4.5 * t));

  // ---------- music ----------

  for (let bar = 0; bar * BAR < duration; bar++) {
    const t0 = bar * BAR;
    const [bass, chord] = CHORDS[bar % 4];
    const full = t0 >= DRUMS_FROM - 0.01;

    // soft pad underneath everything
    for (const m of chord) {
      const f = hz(m);
      add(t0, BAR + 0.4, 0.035, 0, (t) => {
        const env = Math.min(1, t / 0.5) * Math.min(1, (BAR + 0.4 - t) / 0.4);
        return env * (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.004 * t) * 0.7);
      });
    }
    // electric-piano chords on 1 and the "and" of 2
    for (const at of [0, BEAT * 1.5]) {
      chord.forEach((m, k) => add(t0 + at + k * 0.012, 2, at ? 0.03 : 0.045, (k - 1.5) * 0.2, keys(hz(m), 0.9)));
    }
    // plucked arpeggio: sparse in the opening, eighth notes once the drums are in
    const step = full ? BEAT / 2 : BEAT;
    if (t0 >= 7 - 0.01 || full) {
      for (let k = 0; k * step < BAR - 1e-6; k++) {
        const m = chord[[0, 2, 1, 3, 2, 1, 3, 2][k % 8]] + 12;
        add(t0 + k * step, 0.5, full ? 0.04 : 0.03, k % 2 ? 0.35 : -0.35, keys(hz(m), 0.18));
      }
    }
    if (!full) continue;
    // bass on 1 and 3
    for (const [at, m] of [[0, bass], [BEAT * 2, bass + 7], [BEAT * 3.5, bass + 12]]) {
      const f = hz(m + 12);
      add(t0 + at, 0.55, 0.16, 0, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.3) * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)));
    }
    // drums
    const rnd = noise(1000 + bar);
    for (let b = 0; b < 4; b++) {
      const at = t0 + b * BEAT;
      if (b % 2 === 0) {
        add(at, 0.4, 0.38, 0, (t) => Math.sin(2 * Math.PI * (45 * t + (75 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-t / 0.12));
      } else {
        let lp = 0;
        add(at, 0.25, 0.12, 0, (t) => {
          lp += 0.5 * (rnd() - lp);
          return (lp * 0.9 + 0.4 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t / 0.07);
        });
      }
      for (const off of [0, 0.5]) {
        let prev = 0;
        add(at + off * BEAT, 0.06, off ? 0.05 : 0.025, 0.25, (t) => {
          const x = rnd();
          const hp = x - prev;
          prev = x;
          return hp * Math.exp(-t / 0.018);
        });
      }
    }
  }

  // ---------- sound effects ----------

  const fx = {
    pop: (seed) => {
      const base = 520 + (seed % 5) * 60;
      return [0.12, 0.28, (t) => Math.sin(2 * Math.PI * (base * t + 2200 * t * t)) * Math.exp(-t / 0.035)];
    },
    tick: () => [0.05, 0.12, (t) => Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t / 0.012)],
    type: (seed) => {
      const r = noise(seed);
      let prev = 0;
      return [0.04, 0.12, (t) => {
        const x = r();
        const hp = x - prev;
        prev = x;
        return (hp * 0.7 + 0.3 * Math.sin(2 * Math.PI * 2600 * t)) * Math.exp(-t / 0.008);
      }];
    },
    ding: () => [1.6, 0.2, (t) =>
      Math.min(1, t / 0.003) * (Math.sin(2 * Math.PI * 1318.5 * t) * Math.exp(-t / 0.7) +
        0.5 * Math.sin(2 * Math.PI * 1975.5 * t) * Math.exp(-t / 0.5) +
        0.25 * Math.sin(2 * Math.PI * 3640 * t) * Math.exp(-t / 0.15))],
    whoosh: (seed) => {
      const r = noise(seed);
      let lp = 0;
      const len = 0.75;
      return [len, 0.22, (t) => {
        const p = t / len;
        lp += (0.02 + 0.25 * Math.sin(Math.PI * p)) * (r() - lp);
        return lp * Math.pow(Math.sin(Math.PI * p), 2) * 2.2;
      }];
    },
    stamp: (seed) => {
      const r = noise(seed);
      let lp = 0;
      return [0.4, 0.5, (t) => {
        lp += 0.08 * (r() - lp);
        return (Math.sin(2 * Math.PI * (55 * t + 2 * (1 - Math.exp(-25 * t)))) + lp * 2) * Math.exp(-t / 0.09);
      }];
    },
    boing: () => [0.45, 0.16, (t) => {
      const f = 330 + 140 * Math.sin(2 * Math.PI * 9 * t) * Math.exp(-t * 6) + 200 * t;
      return Math.sin(2 * Math.PI * f * t) * Math.min(1, t / 0.01) * Math.exp(-t / 0.18);
    }],
  };

  cues.forEach(({ t, type }, i) => {
    const [len, gain, voice] = fx[type](i * 7919 + 13);
    add(t, len, gain, ((i % 5) - 2) * 0.1, voice);
  });

  // ---------- master: fades, soft limiter, 16-bit WAV ----------

  const fadeIn = 0.3 * SR;
  const fadeOut = 3 * SR;
  const out = Buffer.alloc(44 + n * 4);
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fadeIn, (n - i) / fadeOut);
    out.writeInt16LE(Math.round(Math.tanh(L[i] * g * 1.4) * 30000), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.tanh(R[i] * g * 1.4) * 30000), 46 + i * 4);
  }
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 4, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * 4, 40);
  return out;
}
