import { describe, expect, it } from "vitest";
import { BANDS, bandCentres, DEFAULT_PARAMS, Vocoder } from "./vocoder-dsp";

const SR = 48000, N = SR; // one second
const rms = (a: Float32Array, from = SR / 4) => { let s = 0; for (let i = from; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / (a.length - from)); };
function saw(hz: number, amp: number): Float32Array { const a = new Float32Array(N); let ph = 0; for (let i = 0; i < N; i++) { a[i] = amp * (2 * ph - 1); ph = (ph + hz / SR) % 1; } return a; }
function noise(amp: number, seed = 1): Float32Array { const a = new Float32Array(N); let s = seed; for (let i = 0; i < N; i++) { s = (s * 1664525 + 1013904223) >>> 0; a[i] = amp * (s / 2 ** 31 - 1); } return a; }
/** Low-passed (one pole) noise: a "dark" voice. */
function dark(amp: number): Float32Array { const n = noise(amp * 6); let y = 0; for (let i = 0; i < N; i++) { y += (n[i] - y) * 0.03; n[i] = y; } return n; }
function run(v: Vocoder, car: Float32Array, mic: Float32Array) {
  const l = new Float32Array(N), r = new Float32Array(N);
  for (let i = 0; i < N; i += 128) v.process(car.subarray(i, i + 128), car.subarray(i, i + 128), mic.subarray(i, i + 128), l.subarray(i, i + 128), r.subarray(i, i + 128), Math.min(128, N - i));
  return { l, r };
}
/** Energy of `a` below and above `hz` (a one-pole split, rough but enough to compare). */
function split(a: Float32Array, hz: number) { const k = 1 - Math.exp(-2 * Math.PI * hz / SR); let y = 0, lo = 0, hi = 0; for (let i = SR / 4; i < a.length; i++) { y += (a[i] - y) * k; lo += y * y; hi += (a[i] - y) ** 2; } return { lo, hi }; }

describe("the vocoder", () => {
  it("has its bands from 100 Hz to 8 kHz", () => {
    const c = bandCentres();
    expect(c).toHaveLength(BANDS);
    expect(c[0]).toBeCloseTo(100); expect(c[BANDS - 1]).toBeCloseTo(8000);
  });

  it("is silent with no voice, and about as loud as the synth with one", () => {
    const car = saw(110, 0.3);
    expect(rms(run(new Vocoder(SR), car, new Float32Array(N)).l)).toBeLessThan(1e-4);
    const out = rms(run(new Vocoder(SR), car, noise(0.05)).l);
    console.log("carrier rms", rms(car).toFixed(3), "vocoded rms", out.toFixed(3));
    expect(out).toBeGreaterThan(rms(car) * 0.3);
    expect(out).toBeLessThan(rms(car) * 2);
  });

  it("follows the voice's spectrum: a dark voice gives a dark sound", () => {
    const v1 = new Vocoder(SR), v2 = new Vocoder(SR);
    v1.set({ sibilance: 0 }); v2.set({ sibilance: 0 });
    const car = saw(110, 0.3);
    const bright = split(run(v1, car, noise(0.05)).l, 1000), darker = split(run(v2, car, dark(0.05)).l, 1000);
    expect(darker.lo / darker.hi).toBeGreaterThan(4 * (bright.lo / bright.hi));
  });

  it("mixes in the synth and the voice as they are when asked", () => {
    const v = new Vocoder(SR);
    v.set({ ...DEFAULT_PARAMS, vocoder: 0, sibilance: 0, synth: 1 });
    const car = saw(220, 0.3);
    expect(rms(run(v, car, new Float32Array(N)).l)).toBeCloseTo(rms(car), 2);
  });

  it("costs little of the audio thread", () => {
    const v = new Vocoder(SR), car = saw(110, 0.3), mic = noise(0.05);
    run(v, car, mic); // warm up
    const t = performance.now();
    for (let k = 0; k < 5; k++) run(v, car, mic);
    const share = (performance.now() - t) / 5 / 1000;
    console.log(`vocoder: ${(share * 100).toFixed(2)}% of one core for 16 bands, stereo`);
    expect(share).toBeLessThan(0.1);
  });
});

describe("the sibilance", () => {
  it("goes through only while keys sound", () => {
    const v = new Vocoder(SR);
    v.set({ sibilance: 1 });
    expect(rms(run(v, new Float32Array(N), noise(0.1)).l)).toBeLessThan(1e-3);
    expect(rms(run(new Vocoder(SR), saw(110, 0.3), noise(0.1)).l)).toBeGreaterThan(0.01);
  });
});
