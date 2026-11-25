/**
 * The vocoder itself: plain arithmetic, so it runs on the audio thread (vocoder.worklet.ts) and is
 * tested in node. Nothing here allocates once it is made.
 *
 *   microphone (the modulator) -> 16 band-pass filters (4-pole) -> an envelope each
 *   carrier (the keys' synth)  -> 16 band-pass filters (2-pole, the same centres moved by FORMANT)
 *   out = each carrier band times its microphone band's envelope, summed
 *       + the microphone's highest sounds (SIBILANCE: s, t, f, which no synth band carries), while keys sound
 *       + the carrier and the microphone as they are, if asked (SYNTH, VOICE)
 *
 * The bands are spaced evenly in pitch from 100 Hz to 8 kHz (about 0.42 of an octave apart), as a
 * vocoder for voice wants: enough below 1 kHz for the vowels, enough above for the consonants.
 */

export const BANDS = 16;
export const LOW_HZ = 100, HIGH_HZ = 8000;
/** The sibilance band: what is above this (Hz) goes through from the microphone. */
export const SIBILANCE_HZ = 6000;
/** How fast an envelope rises (s); how fast it falls is RESPONSE. */
const ATTACK_S = 0.002;

export interface VocoderParams {
  /** The microphone's gain, as a factor (applied before the analysis and to VOICE). */
  micGain: number;
  /** The carrier's bands moved against the voice's, in semitones (-12 to 12): a deeper or higher "throat". */
  formant: number;
  /** How fast an envelope falls (s): short is crisp and clear, long is smooth and smeared. */
  release: number;
  /** The bands' sharpness, a factor of the natural Q (0.5: wide and soft, 2: narrow and ringing). */
  q: number;
  /** The microphone's sibilance, mixed in (0..1). */
  sibilance: number;
  /** The vocoded sound's level (0..1). */
  vocoder: number;
  /** The carrier as it is (0..1). */
  synth: number;
  /** The microphone as it is (0..1). */
  voice: number;
}

export const DEFAULT_PARAMS: VocoderParams = { micGain: 4, formant: 0, release: 0.03, q: 1, sibilance: 0.3, vocoder: 1, synth: 0, voice: 0 };

/** Each band's centre (Hz). */
export function bandCentres(bands = BANDS, low = LOW_HZ, high = HIGH_HZ): number[] {
  const r = Math.pow(high / low, 1 / (bands - 1));
  return Array.from({ length: bands }, (_, i) => low * Math.pow(r, i));
}
/** The Q that makes neighbouring bands meet about 3 dB down. */
export function naturalQ(bands = BANDS, low = LOW_HZ, high = HIGH_HZ): number {
  const r = Math.pow(high / low, 1 / (bands - 1));
  return 1 / (Math.sqrt(r) - 1 / Math.sqrt(r));
}

/** A biquad's coefficients, normalised: [b0, b1, b2, a1, a2]. Band-pass with 0 dB at its centre (RBJ). */
function bandPass(out: Float64Array, at: number, hz: number, q: number, sr: number): void {
  const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  out[at] = alpha / a0; out[at + 1] = 0; out[at + 2] = -alpha / a0;
  out[at + 3] = (-2 * Math.cos(w)) / a0; out[at + 4] = (1 - alpha) / a0;
}
function highPass(out: Float64Array, at: number, hz: number, sr: number): void {
  const w = (2 * Math.PI * hz) / sr, alpha = Math.sin(w) / (2 * Math.SQRT1_2), c = Math.cos(w), a0 = 1 + alpha;
  out[at] = (1 + c) / 2 / a0; out[at + 1] = -(1 + c) / a0; out[at + 2] = (1 + c) / 2 / a0;
  out[at + 3] = (-2 * c) / a0; out[at + 4] = (1 - alpha) / a0;
}

/** A soft limit (close to tanh, far cheaper): straight through the middle, flat beyond 3. */
function soft(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

export class Vocoder {
  readonly sr: number;
  readonly bands: number;
  private readonly centres: number[];
  private readonly q0: number;
  /** Analysis (two in a row per band, the same coefficients), synthesis (left and right, the same coefficients), the sibilance high-pass. */
  private readonly ana = new Float64Array(BANDS * 5);
  private readonly syn = new Float64Array(BANDS * 5);
  private readonly hp = new Float64Array(5);
  /** Filter state, transposed direct form II: two numbers per filter. */
  private readonly anaS1 = new Float64Array(BANDS * 4);
  private readonly synS = new Float64Array(BANDS * 4);
  private readonly hpS = new Float64Array(2);
  private readonly env = new Float64Array(BANDS);
  /** The sum's gain: the bands' outputs, each at most the carrier's, kept near the carrier's level. */
  private readonly norm: number;
  private att = 0;
  private rel = 0;
  private p: VocoderParams = { ...DEFAULT_PARAMS };
  /** The levels mixed, gliding to their targets (no zipper noise): vocoder, synth, voice, sibilance, mic gain. */
  private readonly lv = new Float64Array(5);
  private readonly lvTo = new Float64Array(5);
  /** How much carrier there is (a follower on its level): the sibilance is let through only while keys sound. */
  private carEnv = 0;

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    this.bands = BANDS;
    this.centres = bandCentres();
    this.q0 = naturalQ();
    this.norm = 20;
    highPass(this.hp, 0, SIBILANCE_HZ, sampleRate);
    this.set(DEFAULT_PARAMS);
    this.lv.set(this.lvTo);
  }

  /** New values (only those given change). The bands are worked out again only when FORMANT or Q moves. */
  set(next: Partial<VocoderParams>): void {
    const before = this.p;
    this.p = { ...before, ...next };
    const p = this.p;
    if (p.q !== before.q || p.formant !== before.formant || this.ana[0] === 0) {
      const q = this.q0 * Math.min(2, Math.max(0.5, p.q)), shift = Math.pow(2, Math.min(12, Math.max(-12, p.formant)) / 12);
      for (let b = 0; b < BANDS; b++) {
        bandPass(this.ana, b * 5, this.centres[b], q, this.sr);
        bandPass(this.syn, b * 5, this.centres[b] * shift, q, this.sr);
      }
    }
    this.att = Math.exp(-1 / (ATTACK_S * this.sr));
    this.rel = Math.exp(-1 / (Math.min(0.5, Math.max(0.003, p.release)) * this.sr));
    this.lvTo[0] = p.vocoder; this.lvTo[1] = p.synth; this.lvTo[2] = p.voice; this.lvTo[3] = p.sibilance; this.lvTo[4] = p.micGain;
  }
  params(): VocoderParams { return { ...this.p }; }

  /**
   * `n` samples: the carrier (left, right) and the microphone in, the sound out (left, right; it
   * may be the carrier's own arrays). Returns the microphone's peak in this block (after its gain), for a light.
   */
  process(carL: Float32Array, carR: Float32Array, mic: Float32Array, outL: Float32Array, outR: Float32Array, n: number): number {
    const ana = this.ana, syn = this.syn, aS = this.anaS1, sS = this.synS, env = this.env, hp = this.hp, hpS = this.hpS;
    const att = this.att, rel = this.rel, norm = this.norm, lv = this.lv, to = this.lvTo;
    const glide = 1 - Math.exp(-1 / (0.02 * this.sr));
    let peak = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 5; k++) lv[k] += (to[k] - lv[k]) * glide;
      const m = mic[i] * lv[4], cl = carL[i], cr = carR[i];
      const am = m < 0 ? -m : m;
      if (am > peak) peak = am;
      let sumL = 0, sumR = 0;
      for (let b = 0; b < BANDS; b++) {
        const c = b * 5, s = b * 4;
        const b0 = ana[c], b2 = ana[c + 2], a1 = ana[c + 3], a2 = ana[c + 4];
        // The microphone's band: two band-passes in a row (b1 is 0 for a band-pass).
        let y = b0 * m + aS[s];
        aS[s] = -a1 * y + aS[s + 1];
        aS[s + 1] = b2 * m - a2 * y;
        const x2 = y;
        y = b0 * x2 + aS[s + 2];
        aS[s + 2] = -a1 * y + aS[s + 3];
        aS[s + 3] = b2 * x2 - a2 * y;
        const r = y < 0 ? -y : y;
        const e = env[b];
        env[b] = r > e ? r + (e - r) * att : r + (e - r) * rel;
        // The carrier's band, each side.
        const d0 = syn[c], d2 = syn[c + 2], c1 = syn[c + 3], c2 = syn[c + 4];
        const yl = d0 * cl + sS[s];
        sS[s] = -c1 * yl + sS[s + 1];
        sS[s + 1] = d2 * cl - c2 * yl;
        const yr = d0 * cr + sS[s + 2];
        sS[s + 2] = -c1 * yr + sS[s + 3];
        sS[s + 3] = d2 * cr - c2 * yr;
        sumL += yl * env[b];
        sumR += yr * env[b];
      }
      // The sibilance: the microphone above SIBILANCE_HZ.
      const h = hp[0] * m + hpS[0];
      hpS[0] = hp[1] * m - hp[3] * h + hpS[1];
      hpS[1] = hp[2] * m - hp[4] * h;
      const ac = (cl < 0 ? -cl : cl) + (cr < 0 ? -cr : cr);
      this.carEnv = ac > this.carEnv ? ac + (this.carEnv - ac) * att : ac + (this.carEnv - ac) * rel;
      const gate = this.carEnv * 8 < 1 ? this.carEnv * 8 : 1;
      const voiced = norm * lv[0], extra = h * lv[3] * gate + m * lv[2];
      outL[i] = soft(sumL * voiced + extra + cl * lv[1]);
      outR[i] = soft(sumR * voiced + extra + cr * lv[1]);
    }
    // (Denormals and runaway: a filter state that isn't a number starts again.)
    if (!Number.isFinite(aS[0] + sS[0] + env[0] + hpS[0])) this.reset();
    return peak;
  }

  /** Every filter silent. */
  reset(): void { this.carEnv = 0; this.anaS1.fill(0); this.synS.fill(0); this.env.fill(0); this.hpS.fill(0); }
}
