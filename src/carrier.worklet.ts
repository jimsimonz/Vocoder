/**
 * The vocoder's carrier (the Poly Sixty's voice, which this module was made from), on the page's audio thread inside the engine's sequencer, which calls it
 * on each note's exact sample. The early-1980s one-oscillator polysynth design, six notes at once:
 *
 *   per note:  DCO (saw + pulse + sub square + noise) -> 4-pole resonant low-pass -> VCA
 *                ^ LFO, bend      ^ PWM: manual, LFO or envelope   ^ envelope (either way up), LFO, keyboard, bend
 *   all notes: -> high-pass (4 positions) -> stereo chorus (off, I, II, I+II) -> out
 *
 * - The DCO: a band-limited (polyBLEP) saw and pulse from one ramp, a square an octave below, white
 *   noise. One envelope (attack, decay, sustain, release) per note, shared by the filter and the VCA
 *   (which can follow the key's gate instead). One LFO for every note (a triangle), fading in after
 *   its DELAY from the first key of a phrase.
 * - The filter is a four-stage ladder solved without a sample's delay in its feedback loop (so its
 *   tuning holds to the top and it sings by itself at full resonance), with a soft limit inside the
 *   loop that keeps that oscillation bounded.
 * - The chorus is what the instrument is known for: the mono mix through two delay lines read by one
 *   triangle LFO in opposite phase, one to each side, each mixed with the dry sound. I: about
 *   0.5 Hz, II: about 0.8 Hz (delays sweeping 1.7 to 5.4 ms); I+II: about 8 Hz, shallow. It runs
 *   once for the instrument, not per note, as the high-pass does.
 * - Six notes: a free one first (the one silent longest), else the oldest is taken over, its
 *   waveform and loudness carrying on from where they are (no click).
 *
 * Rules for a voice file: it imports only `@engine/core/voiceApi`, allocates nothing in render(),
 * starts notes on the sample it is told, and smooths its parameters itself.
 */
import { registerVoice, type NoteOnOptions, type Voice, type VoiceContext } from "@engine/core/voiceApi";

export const VOICES = 6;
/** Pitch, cutoff and pulse width are worked out once per this many samples (and glide between). */
const CTRL = 16;
const SILENT = 1e-5;
/** The VCA on GATE: up and down this fast (s), so a key is not a click. */
const GATE_S = 0.003;
/** The chorus (and the high-pass) ring on this long after the last note is silent (s). */
const TAIL_S = 0.05;

/** The chorus modes: LFO rate (Hz), and the delay's sweep (s). 0 is off. */
export const CHORUS = [
  { hz: 0.5, min: 0.00166, max: 0.00535 },
  { hz: 0.5, min: 0.00166, max: 0.00535 }, // I
  { hz: 0.83, min: 0.00166, max: 0.00535 }, // II
  { hz: 8, min: 0.0033, max: 0.0037 }, // I+II
] as const;
/** The high-pass's corner (Hz) at positions 1 to 3 (0: flat, with a bass lift). */
const HPF_HZ = [0, 0, 240, 720];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function blep(t: number, dt: number): number {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

/** A soft limit (close to tanh, far cheaper): straight through the middle, flat beyond 3. */
function soft(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** The cutoff (Hz) for FREQ 0..1: 16 Hz to about 20 kHz, evenly in octaves. */
export const cutoffHz = (k: number): number => 16 * Math.pow(2, clamp(k, 0, 1) * 10.3);

/** One note: its oscillator, envelope and filter. */
class Note {
  note = -1;
  /** Sounding (held, or still falling). */
  active = false;
  held = false;
  /** When it started, and when it was let go (counters: which is oldest). */
  age = 0;
  phase = 0;
  /** The sub's half: +1 or -1, flipping each cycle. */
  sub = 1;
  dt = 0;
  // Envelope: 0 attack, 1 decay/sustain, 2 release.
  stage = 2;
  env = 0;
  gate = 0;
  // Filter: its stages, and the cutoff coefficient gliding to its target.
  s1 = 0; s2 = 0; s3 = 0; s4 = 0;
  g = 0.01;
  gStep = 0;
  pw = 0.5;
  pwStep = 0;
}

export class PolyVoice implements Voice {
  private readonly sr: number;
  private readonly p: Record<string, number> = {
    lfoRate: 5, lfoDelay: 0, dcoLfo: 0, pwm: 0.5, pwmMode: 1, pulse: 0, saw: 1, range: 0, sub: 0, noise: 0,
    hpf: 1, cutoff: 0.6, res: 0.1, envAmt: 0.4, envInv: 0, vcfLfo: 0, kybd: 0.5,
    gate: 0, level: 0.7, attack: 0.003, decay: 0.4, sustain: 0.6, release: 0.3,
    chorus: 1, volume: 0.7, pitchBend: 0, bendDco: 2, bendVcf: 0, modWheel: 0, octave: 0, tune: 0,
  };
  private readonly notes: Note[] = [];
  private ageCounter = 0;
  private heldCount = 0;
  private ctrl = 0;
  // The LFO (one for every note): its phase, its value now, and how far in it has faded.
  private lfoPhase = 0;
  private lfo = 0;
  private lfoTime = 0;
  private lfoFade = 0;
  // Smoothed (at control rate): cutoff, resonance, bend.
  private cutoffS = 0.6;
  private resS = 0.1;
  private bendS = 0;
  // Smoothed per sample: levels.
  private levelS = 0.7; private volumeS = 0.7; private subS = 0; private noiseS = 0; private sawS = 1; private pulseS = 0;
  private attackK = 0; private decayK = 0; private releaseK = 0; private gateK = 0;
  private noiseState = 0x2f6e2b1;
  // The high-pass and bass lift (on the mix).
  private hpIn = 0; private hpOut = 0; private hpK = 0; private lowS = 0; private lowK = 0;
  // The chorus: one delay line the mix is written to, read twice.
  private readonly delay: Float32Array;
  private readonly mask: number;
  private write = 0;
  private chPhase = 0;
  private chHz = 0.5; private chMid = 0.0035; private chDepth = 0.0018;
  private chWet = 0;
  private wetL = 0; private wetR = 0;
  private wetK = 0;
  /** Samples the tail still has to ring after the notes are silent. */
  private tail = 0;

  constructor(ctx: VoiceContext) {
    this.sr = ctx.sampleRate;
    for (let i = 0; i < VOICES; i++) this.notes.push(new Note());
    let size = 256;
    while (size < this.sr * 0.012) size *= 2;
    this.delay = new Float32Array(size);
    this.mask = size - 1;
    this.gateK = 1 - Math.exp(-1 / (GATE_S * this.sr));
    this.lowK = 1 - Math.exp((-2 * Math.PI * 90) / this.sr);
    this.wetK = 1 - Math.exp((-2 * Math.PI * 9000) / this.sr); // the delay lines' own dullness
    this.updateEnvelope();
    this.setChorus(true);
  }

  // ------------------------------------------------------------------ the voice contract

  noteOn(note: number, _velocity: number, _o: NoteOnOptions): void {
    const notes = this.notes;
    // The same key again: that note restarts. Otherwise a free one (silent longest), else the
    // one let go longest ago, else the oldest held.
    let n: Note | null = null;
    for (let i = 0; i < VOICES; i++) if (notes[i].active && notes[i].note === note) { n = notes[i]; break; }
    if (!n) for (let i = 0; i < VOICES; i++) if (!notes[i].active && (!n || notes[i].age < n.age)) n = notes[i];
    if (!n) for (let i = 0; i < VOICES; i++) if (!notes[i].held && (!n || notes[i].age < n.age)) n = notes[i];
    if (!n) { n = notes[0]; for (let i = 1; i < VOICES; i++) if (notes[i].age < n.age) n = notes[i]; }
    // The LFO's delay starts with the first key of a phrase.
    if (this.heldCount === 0) { this.lfoTime = 0; this.lfoFade = 0; }
    if (!n.held) this.heldCount++;
    if (!n.active) { // from silence: on its very sample, from the start of the wave, the filter at rest
      n.phase = 0; n.sub = 1; n.env = 0; n.gate = 0;
      n.s1 = n.s2 = n.s3 = n.s4 = 0;
    }
    n.note = note;
    n.active = true;
    n.held = true;
    n.stage = 0;
    n.age = ++this.ageCounter;
    this.tune(n, true);
  }

  noteOff(note: number, _at = 0): void {
    for (let i = 0; i < VOICES; i++) {
      const n = this.notes[i];
      if (!n.held || n.note !== note) continue;
      n.held = false;
      n.stage = 2;
      n.age = ++this.ageCounter;
      this.heldCount--;
    }
  }

  allNotesOff(_at = 0): void {
    for (let i = 0; i < VOICES; i++) { const n = this.notes[i]; if (n.held) { n.held = false; n.stage = 2; } }
    this.heldCount = 0;
  }

  setParam(name: string, value: number | string): void {
    if (typeof value !== "number" || !Number.isFinite(value) || !(name in this.p)) return;
    this.p[name] = value;
    if (name === "attack" || name === "decay" || name === "release") this.updateEnvelope();
    else if (name === "chorus") this.setChorus(false);
    else if (name === "hpf") {
      const hz = HPF_HZ[clamp(Math.round(value), 0, 3)];
      this.hpK = hz ? Math.exp((-2 * Math.PI * hz) / this.sr) : 0;
    }
  }

  private updateEnvelope() {
    const sr = this.sr, p = this.p;
    // The attack aims above full (an analogue envelope's curve), so it gets there in its time.
    this.attackK = 1 - Math.exp(-1.2 / (Math.max(0.0005, p.attack) * sr));
    this.decayK = 1 - Math.exp(-1 / (Math.max(0.001, p.decay / 4) * sr));
    this.releaseK = 1 - Math.exp(-1 / (Math.max(0.001, p.release / 4) * sr));
  }

  private setChorus(now: boolean) {
    const mode = clamp(Math.round(this.p.chorus), 0, 3);
    if (mode === 0) return; // (it fades out as it is)
    const c = CHORUS[mode];
    // Changed while sounding: the rate jumps (a triangle at another speed is no click), the sweep glides.
    this.chHz = c.hz;
    if (now) { this.chMid = (c.min + c.max) / 2; this.chDepth = (c.max - c.min) / 2; }
  }

  render(out: Float32Array[], from: number, to: number): boolean {
    let sounding = false;
    for (let i = 0; i < VOICES; i++) if (this.notes[i].active) { sounding = true; break; }
    if (sounding) this.tail = Math.ceil(TAIL_S * this.sr);
    else if (this.tail <= 0) return false;
    const L = out[0], R = out[1] ?? out[0];
    const p = this.p, sr = this.sr, notes = this.notes;
    const smooth = 1 - Math.exp(-1 / (0.008 * sr));
    const sawT = p.saw ? 1 : 0, pulseT = p.pulse ? 1 : 0;
    const gateMode = p.gate >= 0.5, sustain = clamp(p.sustain, 0, 1);
    const attackK = this.attackK, decayK = this.decayK, releaseK = this.releaseK, gateK = this.gateK;
    const hpK = this.hpK, lift = Math.round(p.hpf) === 0 ? 0.55 : 0;
    const delay = this.delay, mask = this.mask;
    const mode = clamp(Math.round(p.chorus), 0, 3), wetT = mode ? 1 : 0;
    const chC = CHORUS[mode || 1], midT = (chC.min + chC.max) / 2, depthT = (chC.max - chC.min) / 2;
    const chStep = this.chHz / sr, wetStep = 1 / (0.02 * sr), glide = 1 - Math.exp(-1 / (0.05 * sr));
    for (let k = from; k < to; k++) {
      if (this.ctrl-- <= 0) { this.ctrl = CTRL - 1; this.control(); }
      this.levelS += (p.level - this.levelS) * smooth;
      this.volumeS += (p.volume - this.volumeS) * smooth;
      this.subS += (p.sub - this.subS) * smooth;
      this.noiseS += (p.noise - this.noiseS) * smooth;
      this.sawS += (sawT - this.sawS) * smooth;
      this.pulseS += (pulseT - this.pulseS) * smooth;
      const sawL = this.sawS * 0.5, pulseL = this.pulseS * 0.5, subL = this.subS * 0.55, noiseL = this.noiseS * 0.5;
      // The resonance: 4 is where the loop sings by itself; a little above, so it does at the top of the slider.
      const res = this.resS * 4.3, drive = 1 + res * 0.35;
      let mix = 0;
      for (let j = 0; j < VOICES; j++) {
        const n = notes[j];
        if (!n.active) continue;
        // The envelope.
        if (n.stage === 0) { n.env += (1.3 - n.env) * attackK; if (n.env >= 1) { n.env = 1; n.stage = 1; } }
        else if (n.stage === 1) n.env += (sustain - n.env) * decayK;
        else n.env -= n.env * releaseK;
        n.gate += ((n.held ? 1 : 0) - n.gate) * gateK;
        const amp = gateMode ? n.gate : n.env;
        if (!n.held && n.env < SILENT && n.gate < SILENT) { n.active = false; n.env = 0; n.gate = 0; continue; }
        // The DCO: saw, pulse (a comparator on the same ramp), the sub an octave below, noise.
        const dt = n.dt, ph = n.phase;
        n.pw += n.pwStep;
        const pw = n.pw, b0 = blep(ph, dt);
        let q = ph - pw;
        if (q < 0) q += 1;
        let x = sawL * (2 * ph - 1 - b0) + pulseL * ((ph < pw ? 1 : -1) + b0 - blep(q, dt) - (2 * pw - 1));
        if (subL > 1e-4) x += subL * (n.sub + n.sub * b0 * (ph < 0.5 ? 1 : -1));
        if (noiseL > 1e-4) {
          let r = this.noiseState;
          r ^= r << 13; r ^= r >>> 17; r ^= r << 5;
          this.noiseState = r;
          x += noiseL * ((r >>> 0) / 2147483648 - 1);
        }
        n.phase = ph + dt;
        if (n.phase >= 1) { n.phase -= 1; n.sub = -n.sub; }
        // The filter: four stages, the feedback solved for this very sample, softly limited inside.
        n.g += n.gStep;
        const G = n.g, G1 = 1 - G, G2 = G * G;
        const sigma = G1 * (G2 * G * n.s1 + G2 * n.s2 + G * n.s3 + n.s4);
        const u = soft((x * drive - res * sigma) / (1 + res * G2 * G2));
        let v = (u - n.s1) * G; const y1 = v + n.s1; n.s1 = y1 + v;
        v = (y1 - n.s2) * G; const y2 = v + n.s2; n.s2 = y2 + v;
        v = (y2 - n.s3) * G; const y3 = v + n.s3; n.s3 = y3 + v;
        v = (y3 - n.s4) * G; const y4 = v + n.s4; n.s4 = y4 + v;
        mix += y4 * amp;
      }
      mix *= this.levelS * 1.1;
      // The high-pass (one for the instrument): flat with a bass lift at 0, flat at 1, then two corners.
      this.lowS += (mix - this.lowS) * this.lowK;
      let dry = mix + this.lowS * lift;
      if (hpK) { this.hpOut = hpK * (this.hpOut + dry - this.hpIn); this.hpIn = dry; dry = this.hpOut; }
      else { this.hpIn = dry; this.hpOut = 0; }
      // The chorus: the mix into the delay line, read twice by one triangle, opposite ways.
      delay[this.write] = dry;
      let left = dry, right = dry;
      if (this.chWet < wetT) this.chWet = Math.min(1, this.chWet + wetStep);
      else if (this.chWet > wetT) this.chWet = Math.max(0, this.chWet - wetStep);
      if (this.chWet > 0) {
        this.chMid += (midT - this.chMid) * glide;
        this.chDepth += (depthT - this.chDepth) * glide;
        this.chPhase += chStep;
        if (this.chPhase >= 1) this.chPhase -= 1;
        const tri = this.chPhase < 0.5 ? 4 * this.chPhase - 1 : 3 - 4 * this.chPhase;
        let d = (this.chMid + this.chDepth * tri) * sr, i0 = d | 0, f = d - i0;
        let a = delay[(this.write - i0) & mask];
        this.wetL += (a + (delay[(this.write - i0 - 1) & mask] - a) * f - this.wetL) * this.wetK;
        d = (this.chMid - this.chDepth * tri) * sr; i0 = d | 0; f = d - i0;
        a = delay[(this.write - i0) & mask];
        this.wetR += (a + (delay[(this.write - i0 - 1) & mask] - a) * f - this.wetR) * this.wetK;
        const w = this.chWet, dryGain = 1 - 0.23 * w; // (two equal parts are louder than one: evened out)
        left = dry * dryGain + this.wetL * w * 0.77;
        right = dry * dryGain + this.wetR * w * 0.77;
      }
      this.write = (this.write + 1) & mask;
      // A soft limit at the end: six notes full up stay under full scale, normal levels pass as they are.
      const vol = this.volumeS * this.volumeS * 0.8;
      left *= vol; right *= vol;
      L[k] += left / (1 + Math.abs(left) * 0.3);
      if (R !== L) R[k] += right / (1 + Math.abs(right) * 0.3);
    }
    if (!sounding) {
      this.tail -= to - from;
      if (this.tail <= 0) this.rest();
    }
    return true;
  }

  dispose(): void {
    for (let i = 0; i < VOICES; i++) { this.notes[i].active = false; this.notes[i].held = false; }
    this.heldCount = 0;
  }

  // ------------------------------------------------------------------ inside

  /** Silent: the delay line and the filters' memories emptied (denormals never linger). */
  private rest() {
    this.delay.fill(0);
    this.wetL = this.wetR = this.hpIn = this.hpOut = this.lowS = 0;
    this.tail = 0;
  }

  /** Per control step: the LFO, the bend, and each note's pitch, pulse width and cutoff. */
  private control() {
    const p = this.p, dt = CTRL / this.sr;
    this.lfoPhase += clamp(p.lfoRate, 0.05, 40) * dt;
    if (this.lfoPhase >= 1) this.lfoPhase -= Math.floor(this.lfoPhase);
    this.lfoTime += dt;
    // After its delay the LFO fades in (over a time that grows with the delay).
    const fadeS = 0.05 + p.lfoDelay * 0.6;
    this.lfoFade = this.lfoTime <= p.lfoDelay ? 0 : Math.min(1, (this.lfoTime - p.lfoDelay) / fadeS);
    this.lfo = this.lfoPhase < 0.5 ? 4 * this.lfoPhase - 1 : 3 - 4 * this.lfoPhase;
    this.bendS += (clamp(p.pitchBend, -1, 1) - this.bendS) * 0.4;
    this.cutoffS += (p.cutoff - this.cutoffS) * 0.35;
    this.resS += (clamp(p.res, 0, 1) - this.resS) * 0.35;
    for (let i = 0; i < VOICES; i++) if (this.notes[i].active) this.tune(this.notes[i], false);
  }

  /** A note's pitch, pulse width and cutoff from where everything stands now. `jump`: at once (a new note). */
  private tune(n: Note, jump: boolean) {
    const p = this.p, sr = this.sr;
    const lfo = this.lfo * this.lfoFade;
    // Pitch: the key, octave and range, the bend lever, the LFO (its slider after the delay; the mod wheel at once).
    const vib = lfo * p.dcoLfo * p.dcoLfo * 4 + this.lfo * clamp(p.modWheel, 0, 1) * 0.6;
    const pitch = n.note + (Math.round(p.octave) + Math.round(p.range)) * 12 + p.tune + this.bendS * p.bendDco + vib;
    n.dt = Math.min(0.45, (440 * Math.pow(2, (pitch - 69) / 12)) / sr);
    // Pulse width: 50% at 0; narrower by hand, with the LFO, or as the envelope rises.
    const mode = Math.round(p.pwmMode);
    const by = mode === 0 ? 0.5 + 0.5 * this.lfo : mode === 2 ? n.env : 1;
    const pw = 0.5 - 0.45 * clamp(p.pwm, 0, 1) * by;
    // Cutoff: the slider, the envelope (up to 8 octaves, either way up), the LFO, the keyboard (from C4), the bend.
    const octaves = (p.envInv >= 0.5 ? -1 : 1) * p.envAmt * 8 * n.env + lfo * p.vcfLfo * 3
      + (p.kybd * (n.note + Math.round(p.octave) * 12 - 60)) / 12 + this.bendS * p.bendVcf;
    const fc = clamp(cutoffHz(this.cutoffS) * Math.pow(2, octaves), 8, sr * 0.45);
    const g = Math.tan((Math.PI * fc) / sr), G = g / (1 + g);
    if (jump) { n.g = G; n.gStep = 0; n.pw = pw; n.pwStep = 0; }
    else { n.gStep = (G - n.g) / CTRL; n.pwStep = (pw - n.pw) / CTRL; }
  }
}

registerVoice("vocoder-carrier-1", PolyVoice);
