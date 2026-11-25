import { describe, expect, it } from "vitest";
import { cutoffHz, PolyVoice, VOICES } from "./carrier.worklet";
import { defaultSliders, defaultSwitches, voiceParams } from "./patch";
import { PRESETS } from "./presets";

const SR = 48000, BLOCK = 128;
/** A plain sound to test with: a saw, the filter open, the envelope at full while held, no chorus. */
const PLAIN = { saw: 1, pulse: 0, sub: 0, noise: 0, cutoff: 1, res: 0, envAmt: 0, kybd: 0, attack: 0.001, decay: 0.3, sustain: 1, release: 0.05, chorus: 0, hpf: 1, level: 0.7, volume: 0.7 };
const voice = (params: Record<string, number> = {}) => {
  const v = new PolyVoice({ sampleRate: SR, id: "test", maxNotes: 16 });
  for (const [k, val] of Object.entries({ ...PLAIN, ...params })) v.setParam(k, val);
  return v;
};
/** Render for a while: [left, right]. */
const render = (v: PolyVoice, seconds: number): [Float32Array, Float32Array] => {
  const n = Math.round(seconds * SR), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += BLOCK) {
    const to = Math.min(BLOCK, n - i), l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    v.render([l, r], 0, to);
    L.set(l.subarray(0, to), i);
    R.set(r.subarray(0, to), i);
  }
  return [L, R];
};
const peak = (a: Float32Array, from = 0, to = a.length) => { let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i])); return p; };
const rms = (a: Float32Array, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, to - from)); };
/** How bright a stretch of sound is: the share of its energy in the sample-to-sample changes. */
const brightness = (a: Float32Array, from = 0, to = a.length) => {
  let d = 0, e = 0;
  for (let i = from + 1; i < to; i++) { d += (a[i] - a[i - 1]) ** 2; e += a[i] ** 2; }
  return d / (e + 1e-12);
};
/** The strength of one frequency in a stretch (a single DFT bin, normalised). */
const tone = (a: Float32Array, hz: number, from = 0, to = a.length) => {
  let re = 0, im = 0;
  for (let i = from; i < to; i++) { const w = (2 * Math.PI * hz * i) / SR; re += a[i] * Math.cos(w); im += a[i] * Math.sin(w); }
  return (2 * Math.hypot(re, im)) / (to - from);
};
/** The pitch (Hz) of a stretch, by autocorrelation: the first strong repeat of the waveform. */
const pitchish = (a: Float32Array, from: number, to: number) => {
  const n = Math.min(4096, to - from), x = a.subarray(to - n, to);
  const corr = (lag: number) => { let s = 0, e1 = 0, e2 = 0; for (let i = 0; i + lag < n; i++) { s += x[i] * x[i + lag]; e1 += x[i] * x[i]; e2 += x[i + lag] * x[i + lag]; } return s / Math.sqrt(e1 * e2 + 1e-12); };
  for (let lag = Math.floor(SR / 3000); lag <= Math.floor(SR / 25); lag++) {
    const c = corr(lag);
    if (c > 0.85 && c >= corr(lag - 1) && c >= corr(lag + 1)) return SR / lag;
  }
  return 0;
};
const on = (v: PolyVoice, note: number) => v.noteOn(note, 1, { accent: false, slide: false, at: 0 });
const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

describe("the carrier voice", () => {
  it("is silent until a note, and starts on the very sample it is told", () => {
    const v = voice();
    const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    expect(v.render([l, r], 0, 64)).toBe(false);
    on(v, 48);
    v.render([l, r], 64, BLOCK);
    expect(peak(l, 0, 64)).toBe(0);
    expect(peak(l, 64, BLOCK)).toBeGreaterThan(0);
  });

  it("plays the note it is given, at a sane level; the range and octave move it by octaves", () => {
    const v = voice();
    on(v, 57);
    const [a] = render(v, 0.3);
    expect(pitchish(a, 4000, a.length)).toBeCloseTo(220, -1);
    expect(rms(a, 4000)).toBeGreaterThan(0.03);
    expect(peak(a)).toBeLessThan(0.6);
    const up = voice({ range: 1 }), down = voice({ octave: -1 });
    on(up, 57); on(down, 57);
    expect(pitchish(render(up, 0.3)[0], 4000, a.length) / 220).toBeCloseTo(2, 1);
    expect(pitchish(render(down, 0.3)[0], 4000, a.length) / 220).toBeCloseTo(0.5, 1);
  });

  it("plays six notes at once, and takes over the oldest for a seventh", () => {
    const v = voice({ saw: 0, pulse: 1, pwm: 0, cutoff: 0.5 }); // (squares, filtered: each note mostly its own pitch)
    const chord = [48, 52, 55, 59, 62, 66];
    for (const n of chord) on(v, n);
    const [a] = render(v, 0.5);
    for (const n of chord) expect(tone(a, hz(n), 8000), `note ${n}`).toBeGreaterThan(0.01);
    expect(chord.length).toBe(VOICES);
    on(v, 71);
    const [b] = render(v, 0.5);
    expect(tone(b, hz(71), 8000)).toBeGreaterThan(0.01);
    expect(tone(b, hz(48), 8000)).toBeLessThan(tone(a, hz(48), 8000) * 0.2); // the oldest gave way
    expect(tone(b, hz(52), 8000)).toBeGreaterThan(0.01); // the others play on
  });

  it("holds at its sustain level, and dies away over its release; let go, it falls silent and rests", () => {
    const v = voice({ attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.2 });
    on(v, 48);
    const [held] = render(v, 0.8);
    const early = rms(held, 0.01 * SR, 0.03 * SR), late = rms(held, 0.6 * SR, 0.8 * SR);
    expect(late).toBeLessThan(early * 0.7);
    expect(late).toBeGreaterThan(early * 0.2); // sustained, not gone
    v.noteOff(48, 0);
    const [tail] = render(v, 1.5);
    expect(rms(tail, 0, 0.02 * SR)).toBeGreaterThan(late * 0.3); // a release, not a cut
    expect(peak(tail, 1.2 * SR)).toBeLessThan(1e-3);
    const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    expect(v.render([l, r], 0, BLOCK)).toBe(false);
  });

  it("VCA on GATE: full while the key is down whatever the envelope, gone when it is up", () => {
    const v = voice({ gate: 1, sustain: 0, decay: 0.02, release: 2 });
    on(v, 48);
    const [a] = render(v, 0.5);
    expect(rms(a, 0.3 * SR)).toBeGreaterThan(0.03);
    v.noteOff(48, 0);
    expect(peak(render(v, 0.2)[0], 0.1 * SR)).toBeLessThan(1e-3);
  });

  it("gets brighter as the filter opens, by the slider and by the envelope; ENV inverted closes it instead", () => {
    const bright = (params: Record<string, number>) => { const v = voice(params); on(v, 45); const [a] = render(v, 0.3); return brightness(a, 6000); };
    const closed = bright({ cutoff: 0.3 }), half = bright({ cutoff: 0.6 }), open = bright({ cutoff: 1 });
    expect(half).toBeGreaterThan(closed * 3);
    expect(open).toBeGreaterThan(half * 3);
    expect(bright({ cutoff: 0.3, envAmt: 0.6 })).toBeGreaterThan(closed * 3);
    expect(bright({ cutoff: 0.6, envAmt: 0.6, envInv: 1 })).toBeLessThan(half / 3);
    // The keyboard follows: a high note's filter opens with KYBD up.
    const high = (kybd: number) => { const v = voice({ cutoff: 0.4, kybd }); on(v, 84); const [a] = render(v, 0.3); return rms(a, 6000); };
    expect(high(1)).toBeGreaterThan(high(0) * 2);
    expect(cutoffHz(1)).toBeGreaterThan(18000);
  });

  it("sings by itself at full resonance, at the cutoff, and stays bounded", () => {
    // No oscillator at all: only noise, very quietly, to start it off.
    const v = voice({ saw: 0, noise: 0.02, cutoff: 0.6, res: 1 });
    on(v, 60);
    const [a] = render(v, 1);
    expect(a.every(Number.isFinite)).toBe(true);
    expect(rms(a, 0.5 * SR)).toBeGreaterThan(0.02);
    expect(peak(a)).toBeLessThan(1);
    expect(pitchish(a, 0.5 * SR, a.length) / cutoffHz(0.6)).toBeCloseTo(1, 0.5);
    // Half way up it only rings: far quieter.
    const quiet = voice({ saw: 0, noise: 0.02, cutoff: 0.6, res: 0.5 });
    on(quiet, 60);
    expect(rms(render(quiet, 1)[0], 0.5 * SR)).toBeLessThan(rms(a, 0.5 * SR) * 0.2);
  });

  it("the pulse narrows with PWM, by hand, with the LFO or the envelope; the sub plays an octave below", () => {
    const even = (params: Record<string, number>) => { const v = voice({ saw: 0, pulse: 1, ...params }); on(v, 57); const [a] = render(v, 0.4); return tone(a, 440, 4000) / tone(a, 220, 4000); };
    expect(even({ pwm: 0, pwmMode: 1 })).toBeLessThan(0.05); // a square: no even harmonics
    expect(even({ pwm: 0.6, pwmMode: 1 })).toBeGreaterThan(0.3);
    expect(even({ pwm: 0.8, pwmMode: 2 })).toBeGreaterThan(0.3); // the envelope (held at full)
    // With the LFO the width moves: the second harmonic comes and goes.
    const v = voice({ saw: 0, pulse: 1, pwm: 1, pwmMode: 0, lfoRate: 0.5 });
    on(v, 57);
    const [a] = render(v, 2);
    const parts = Array.from({ length: 20 }, (_, i) => tone(a, 440, i * 4800, (i + 1) * 4800));
    expect(Math.max(...parts)).toBeGreaterThan(Math.min(...parts) * 3);
    const sub = voice({ saw: 0, sub: 1 });
    on(sub, 57);
    expect(pitchish(render(sub, 0.3)[0], 4000, 0.3 * SR)).toBeCloseTo(110, -1);
  });

  it("the LFO bends the pitch after its delay, and the bend lever by its slider's amount", () => {
    const v = voice({ dcoLfo: 0.6, lfoRate: 6, lfoDelay: 0.5, cutoff: 0.6 });
    on(v, 69);
    const [a] = render(v, 1.6);
    const wander = (from: number, to: number) => { const f: number[] = []; for (let t = from; t + 0.04 <= to; t += 0.02) f.push(pitchish(a, Math.round(t * SR), Math.round((t + 0.04) * SR))); return Math.max(...f) / Math.min(...f); };
    expect(wander(0.1, 0.45)).toBeLessThan(1.01);
    expect(wander(1.1, 1.6)).toBeGreaterThan(1.03);
    const bent = voice({ pitchBend: 1, bendDco: 12 });
    on(bent, 57);
    expect(pitchish(render(bent, 0.3)[0], 4000, 0.3 * SR) / 220).toBeCloseTo(2, 1);
  });

  it("the high-pass thins the low end step by step, and lifts the bass at 0", () => {
    const low = (hpf: number) => { const v = voice({ hpf }); on(v, 36); const [a] = render(v, 0.5); return tone(a, hz(36), 8000); };
    expect(low(0)).toBeGreaterThan(low(1) * 1.2);
    expect(low(2)).toBeLessThan(low(1) * 0.5);
    expect(low(3)).toBeLessThan(low(2) * 0.6);
  });

  it("the chorus: off is the same both sides; I, II and I+II spread left from right, each its own way", () => {
    const sides = (chorus: number) => { const v = voice({ chorus, cutoff: 0.8 }); for (const n of [48, 55, 64]) on(v, n); return render(v, 3); };
    const diff = ([l, r]: [Float32Array, Float32Array], from = 0, to = l.length) => { let s = 0; for (let i = from; i < to; i++) s += (l[i] - r[i]) ** 2; return Math.sqrt(s / (to - from)); };
    const off = sides(0);
    expect(diff(off)).toBe(0);
    const results = [1, 2, 3].map((mode) => {
      const out = sides(mode);
      expect(out[0].every(Number.isFinite) && out[1].every(Number.isFinite)).toBe(true);
      expect(diff(out, SR), `mode ${mode}`).toBeGreaterThan(rms(out[0], SR) * 0.15); // a real spread
      // About as loud as without it.
      expect(rms(out[0], SR) / rms(off[0], SR), `mode ${mode}`).toBeGreaterThan(0.6);
      expect(rms(out[0], SR) / rms(off[0], SR), `mode ${mode}`).toBeLessThan(1.5);
      return out;
    });
    // The modes differ from each other.
    expect(diff([results[0][0], results[1][0]], SR)).toBeGreaterThan(0.005);
    expect(diff([results[0][0], results[2][0]], SR)).toBeGreaterThan(0.005);
    // Its sweep comes round at the mode's rate: I about every 2 s (0.5 Hz), II about every 1.2 s (0.83 Hz).
    const sweep = (mode: number, seconds: number) => {
      const v = voice({ chorus: mode, saw: 0, noise: 1, gate: 1 });
      on(v, 60);
      const [l, r] = render(v, 6);
      // The left/right difference's loudness in 20 ms steps, correlated with itself `seconds` later.
      const step = 960, e: number[] = [];
      for (let i = SR; i + step <= l.length; i += step) e.push(Math.log(1e-9 + diff([l, r], i, i + step)));
      const mean = e.reduce((a, b) => a + b, 0) / e.length, lag = Math.round((seconds * SR) / step);
      let c = 0, n = 0;
      for (let i = 0; i + lag < e.length; i++) { c += (e[i] - mean) * (e[i + lag] - mean); n += (e[i] - mean) ** 2; }
      return c / n;
    };
    expect(sweep(1, 2)).toBeGreaterThan(sweep(1, 1.2));
    expect(sweep(2, 1.2)).toBeGreaterThan(sweep(2, 2));
  });

  it("switching the chorus while sounding doesn't click", () => {
    const v = voice({ chorus: 0, cutoff: 0.35 }); // a dull sound: a click would stand out
    on(v, 48);
    const [before] = render(v, 0.5);
    const step = (a: Float32Array, from = 0) => { let m = 0; for (let i = from + 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1])); return m; };
    const usual = step(before, 0.2 * SR);
    for (const mode of [1, 3, 2, 0]) { v.setParam("chorus", mode); expect(step(render(v, 0.3)[0]), `to ${mode}`).toBeLessThan(usual * 2.5); }
  });

  it("every sound in memory plays: heard, finite, under full scale with a full chord, and they differ", () => {
    const prints: number[] = [];
    PRESETS.forEach((p, i) => {
      const v = new PolyVoice({ sampleRate: SR, id: "test", maxNotes: 16 });
      const params = voiceParams({ ...defaultSliders(), ...p.sliders }, { ...defaultSwitches(), ...p.switches });
      for (const [k, val] of Object.entries(params)) v.setParam(k, val);
      for (const n of [36, 48, 55, 60, 64, 67]) on(v, n);
      const [l, r] = render(v, 2.5);
      expect(l.every(Number.isFinite) && r.every(Number.isFinite), p.name).toBe(true);
      const loud = Math.max(rms(l, 0, 0.4 * SR), rms(l, 2 * SR)); // (a pluck is over by the end, a slow pad not yet there at the start)
      expect(loud, p.name).toBeGreaterThan(0.02);
      expect(Math.max(peak(l), peak(r)), p.name).toBeLessThan(1.2);
      prints.push(Math.round(Math.log(brightness(l, SR)) * 20) + Math.round(rms(l, 0, 0.1 * SR) * 2000) * 1000 + i * 0); // brightness and attack
    });
    expect(new Set(prints).size).toBeGreaterThan(5);
  });

  it("never puts out NaN or runaway levels, at any setting", () => {
    const settings: Record<string, number>[] = [
      { cutoff: 1, res: 1, envAmt: 1, saw: 1, pulse: 1, sub: 1, noise: 1, volume: 1, level: 1, kybd: 1, chorus: 3, hpf: 0 },
      { cutoff: 0, res: 1, range: -1, octave: -1, modWheel: 1, vcfLfo: 1, dcoLfo: 1, lfoRate: 30, chorus: 2, hpf: 3 },
      { pulse: 1, pwm: 1, pwmMode: 0, pitchBend: 1, bendDco: 12, bendVcf: 4, range: 1, octave: 1, envInv: 1, envAmt: 1, gate: 1, level: 1, volume: 1 },
    ];
    for (const params of settings) {
      const v = voice(params);
      for (let n = 0; n < 10; n++) on(v, 24 + n * 9);
      const [l, r] = render(v, 0.6);
      v.allNotesOff();
      const [l2] = render(v, 0.3);
      expect(l.every(Number.isFinite) && r.every(Number.isFinite) && l2.every(Number.isFinite)).toBe(true);
      expect(Math.max(peak(l), peak(r))).toBeLessThan(3.4);
    }
  });

  it("costs little of the audio thread with a full chord and the chorus", () => {
    const v = voice({ pulse: 1, sub: 0.6, noise: 0.2, res: 0.8, cutoff: 0.6, envAmt: 0.5, pwm: 0.7, pwmMode: 0, chorus: 1, vcfLfo: 0.3 });
    for (const n of [36, 48, 55, 60, 64, 67]) on(v, n);
    const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    for (let i = 0; i < 400; i++) v.render([l, r], 0, BLOCK);
    const t0 = performance.now(), blocks = (2 * SR) / BLOCK;
    for (let i = 0; i < blocks; i++) v.render([l, r], 0, BLOCK);
    const share = (performance.now() - t0) / 2000;
    console.log(`carrier voice, six notes and the chorus: ${(share * 100).toFixed(2)}% of real time here`);
    expect(share).toBeLessThan(0.05); // a desktop; a Quest is a few times slower
  });
});
