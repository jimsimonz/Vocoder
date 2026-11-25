/**
 * The vocoder on the audio thread: its input is the carrier (the keys' synth, the engine's
 * sequencer track played into this node), the microphone comes in messages (the engine's
 * `openMicrophone` blocks, posted by vocoder.ts with their frame on this context), and its output
 * goes to the instance's channel on the mix bus.
 *
 * The microphone's blocks come a little behind live and not quite evenly: they are written into a
 * ring where their frames say, and read a little behind `currentFrame`, just far enough that every
 * block has come (the largest lateness lately, and a margin). A late block pushes that distance out
 * at once; it comes back in slowly, so nothing jumps while the voice goes on.
 *
 * Built as one self-contained file: it imports only vocoder-dsp.ts, and uses nothing the audio
 * thread lacks. Registered under a name with a number: change it when what it does changes.
 */
import { Vocoder, type VocoderParams } from "./vocoder-dsp";

declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; constructor(options?: unknown); }

export const PROCESSOR = "controllerist-vocoder-1";
const RING = 1 << 16, MASK = RING - 1;
/** Read this many frames behind the latest lateness seen, at least. */
const MARGIN = 384;
/** After this many silent blocks in and out (carrier, microphone and the filters' tails), it stops working. */
const QUIET_BLOCKS = 150;

type Message = { type: "mic"; frame: number; samples: Float32Array } | { type: "params"; params: Partial<VocoderParams> } | { type: "micOff" };

class VocoderProcessor extends AudioWorkletProcessor {
  private readonly v = new Vocoder(sampleRate);
  private readonly ring = new Float32Array(RING);
  /** One past the last frame written (-1: nothing yet). */
  private hi = -1;
  /** How far behind currentFrame it reads, and the largest lateness lately. */
  private delay = MARGIN;
  private late = 0;
  private readonly mic = new Float32Array(128);
  private readonly zeros = new Float32Array(128);
  private quiet = 0;
  private peak = 0;
  private blocks = 0;

  constructor(options?: unknown) {
    super(options);
    this.port.onmessage = (e: MessageEvent<Message>) => {
      const m = e.data;
      if (m.type === "params") this.v.set(m.params);
      else if (m.type === "micOff") this.hi = -1;
      else if (m.type === "mic") this.write(m.frame, m.samples);
    };
  }

  private write(frame: number, samples: Float32Array): void {
    const n = samples.length;
    for (let i = 0; i < n; i++) this.ring[(frame + i) & MASK] = samples[i];
    // A gap (a block that never came): silence there, not an old turn of the ring.
    if (this.hi >= 0 && frame > this.hi) for (let f = this.hi; f < frame && f < this.hi + RING; f++) this.ring[f & MASK] = 0;
    this.hi = Math.max(this.hi, frame + n);
    const lateness = currentFrame - frame;
    if (lateness > this.late) this.late = Math.min(RING / 2, lateness);
    const want = this.late + MARGIN;
    if (want > this.delay) this.delay = want;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0], n = out[0].length;
    const inL = inputs[0]?.[0] ?? this.zeros, inR = inputs[0]?.[1] ?? inL;
    const mic = this.mic;
    // The microphone, a little behind now.
    let heard = false;
    const from = currentFrame - this.delay;
    for (let i = 0; i < n; i++) {
      const f = from + i;
      const x = this.hi >= 0 && f < this.hi && f >= this.hi - RING + 128 ? this.ring[f & MASK] : 0;
      mic[i] = x;
      if (x !== 0) heard = true;
    }
    let carrier = false;
    for (let i = 0; i < n; i += 8) if (inL[i] !== 0 || inR[i] !== 0) { carrier = true; break; }
    if (heard || carrier) this.quiet = 0;
    else if (++this.quiet > QUIET_BLOCKS) { for (const ch of out) ch.fill(0); this.report(0); return true; }
    const p = this.v.process(inL, inR, mic, out[0], out[1] ?? out[0], n);
    this.report(p);
    // The lateness forgotten slowly (a sample every eight blocks), and the distance brought back in a sample a block.
    if (this.late > 0 && this.blocks % 8 === 0) this.late--;
    if (this.delay > this.late + MARGIN) this.delay--;
    return true;
  }

  /** The microphone's level, about ten times a second, for the MIC light. */
  private report(p: number): void {
    if (p > this.peak) this.peak = p;
    if (++this.blocks % 37 === 0) { this.port.postMessage(this.peak); this.peak = 0; }
  }
}

registerProcessor(PROCESSOR, VocoderProcessor);
