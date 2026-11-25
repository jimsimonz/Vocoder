/**
 * The front panel: every slider, switch and button, where it starts, and what it sends the voice
 * (carrier.worklet.ts) or the vocoder (vocoder-dsp.ts). Pure data and maths, so it has tests. Where each sits: machine/layout.ts.
 *
 * Sliders are 0..1 (printed 0 to 10). A stepped slider (the arpeggio's rate) clicks
 * between its positions. A switch is a whole number; its buttons each set it to a value (a row of
 * buttons where one is lit), turn it on and off, or (the chorus) flip one bit of it.
 */
export interface SliderSpec {
  id: string;
  section: string;
  label: string;
  def: number;
  /** A stepped slider's positions, from the bottom up; none for a smooth one. */
  steps?: string[];
}

const s = (id: string, section: string, label: string, def: number, steps?: string[]): SliderSpec => ({ id, section, label, def, steps });

export const SLIDERS: SliderSpec[] = [
  s("volume", "MASTER", "VOLUME", 0.7),
  s("micGain", "MIC", "GAIN", 0.35),
  s("arpRate", "ARPEGGIO", "RATE", 0.5, ["8", "16", "16T"]),
  s("arpTempo", "ARPEGGIO", "TEMPO", 0.4),
  s("pwm", "CARRIER", "PWM", 0.5),
  s("sub", "CARRIER", "SUB", 0.2),
  s("noise", "CARRIER", "NOISE", 0.1),
  s("cutoff", "CARRIER", "BRIGHT", 0.85),
  s("attack", "ENV", "A", 0.05),
  s("release", "ENV", "R", 0.3),
  s("formant", "VOCODER", "FORMANT", 0.5),
  s("response", "VOCODER", "RESP", 0.3),
  s("q", "VOCODER", "Q", 0.5),
  s("sibilance", "VOCODER", "SIBIL", 0.3),
  s("vocoderLevel", "MIX", "VOC", 0.8),
  s("synthLevel", "MIX", "SYNTH", 0),
  s("voiceLevel", "MIX", "VOICE", 0),
  // Beside the bend lever: how far it moves the pitch and the carrier's brightness.
  s("bendDco", "BENDER", "DCO", 0.17),
  s("bendVcf", "BENDER", "VCF", 0),
];

export interface SwitchSpec { id: string; def: number; steps: number }
export const SWITCHES: SwitchSpec[] = [
  { id: "octave", def: 1, steps: 3 }, // down, normal, up
  { id: "hold", def: 0, steps: 2 },
  { id: "arp", def: 0, steps: 2 },
  { id: "arpMode", def: 0, steps: 3 }, // up, up and down, down
  { id: "arpRange", def: 0, steps: 3 }, // 1, 2, 3 octaves
  { id: "range", def: 1, steps: 3 }, // 16', 8', 4'
  { id: "pulse", def: 0, steps: 2 },
  { id: "saw", def: 1, steps: 2 },
  { id: "chorus", def: 1, steps: 4 }, // bit 0: I, bit 1: II
  { id: "preset", def: 0, steps: 9 }, // 0: none (as the sliders stand); 1 to 8
];

/**
 * A button: what pressing it does to its switch. `set`: the switch becomes `value` (lit while it
 * is); `toggle`: on and off; `bit`: flips that bit (the chorus's I and II, together I+II);
 * `preset`: sound number `value` (1 to 8); `mic`: this player's microphone, on and off (not a
 * switch: each page's own, never the room's).
 */
export interface ButtonSpec {
  id: string;
  section: string;
  label: string;
  sw: string;
  kind: "set" | "toggle" | "bit" | "preset" | "mic";
  value: number;
  /** Its column within the section's buttons, and its place in that column (0 at the back). */
  col: number;
  row: 0 | 1 | 2;
}

const b = (id: string, section: string, label: string, sw: string, kind: ButtonSpec["kind"], value: number, col: number, row: 0 | 1 | 2): ButtonSpec =>
  ({ id, section, label, sw, kind, value, col, row });

export const BUTTONS: ButtonSpec[] = [
  b("oct-up", "MASTER", "OCT UP", "octave", "set", 2, 0, 0),
  b("oct-normal", "MASTER", "NORMAL", "octave", "set", 1, 0, 1),
  b("oct-down", "MASTER", "OCT DOWN", "octave", "set", 0, 0, 2),
  b("mic", "MIC", "MIC ON", "mic", "mic", 1, 0, 1),
  b("arp", "ARPEGGIO", "ON", "arp", "toggle", 1, 0, 0),
  b("hold", "ARPEGGIO", "HOLD", "hold", "toggle", 1, 0, 2),
  b("arp-up", "ARPEGGIO", "UP", "arpMode", "set", 0, 1, 0),
  b("arp-updown", "ARPEGGIO", "U & D", "arpMode", "set", 1, 1, 1),
  b("arp-down", "ARPEGGIO", "DOWN", "arpMode", "set", 2, 1, 2),
  b("arp-1", "ARPEGGIO", "1 OCT", "arpRange", "set", 0, 2, 0),
  b("arp-2", "ARPEGGIO", "2 OCT", "arpRange", "set", 1, 2, 1),
  b("arp-3", "ARPEGGIO", "3 OCT", "arpRange", "set", 2, 2, 2),
  b("range-16", "CARRIER", "16'", "range", "set", 0, 0, 0),
  b("range-8", "CARRIER", "8'", "range", "set", 1, 0, 1),
  b("range-4", "CARRIER", "4'", "range", "set", 2, 0, 2),
  b("pulse", "CARRIER", "PULSE", "pulse", "toggle", 1, 1, 0),
  b("saw", "CARRIER", "SAW", "saw", "toggle", 1, 1, 2),
  b("chorus-off", "CHORUS", "OFF", "chorus", "set", 0, 0, 0),
  b("chorus-1", "CHORUS", "I", "chorus", "bit", 1, 0, 1),
  b("chorus-2", "CHORUS", "II", "chorus", "bit", 2, 0, 2),
  ...Array.from({ length: 8 }, (_, i) => b(`preset-${i + 1}`, "MEMORY", String(i + 1), "preset", "preset", i + 1, i, 0)),
];

export const sliderById = (id: string): SliderSpec | undefined => SLIDERS.find((x) => x.id === id);
export const switchById = (id: string): SwitchSpec | undefined => SWITCHES.find((x) => x.id === id);
export const buttonById = (id: string): ButtonSpec | undefined => BUTTONS.find((x) => x.id === id);

/** Is a button lit, with its switch at these values? */
export function buttonLit(button: ButtonSpec, switches: Record<string, number>): boolean {
  const v = switches[button.sw] ?? switchById(button.sw)?.def ?? 0;
  switch (button.kind) {
    case "set": return v === button.value;
    case "toggle": return v === 1;
    case "bit": return (v & button.value) !== 0;
    case "preset": return v === button.value;
    case "mic": return false; // (the machine's own: its microphone)
  }
}

/** The switches after a button is pressed (the preset's own sound is the machine's to load). */
export function pressButton(button: ButtonSpec, switches: Record<string, number>): Record<string, number> {
  const v = switches[button.sw] ?? switchById(button.sw)?.def ?? 0;
  switch (button.kind) {
    case "set": return { ...switches, [button.sw]: button.value };
    case "toggle": return { ...switches, [button.sw]: v ? 0 : 1 };
    case "bit": return { ...switches, [button.sw]: v ^ button.value };
    case "preset": return { ...switches, preset: button.value };
    case "mic": return switches;
  }
}

/** A stepped slider's position (0 to steps - 1) for a value 0..1; and the value at a position's middle. */
export const stepOf = (value: number, steps: number): number => Math.min(steps - 1, Math.max(0, Math.floor(value * steps)));
export const valueOfStep = (step: number, steps: number): number => (step + 0.5) / steps;

const unit = (v: number) => Math.min(1, Math.max(0, v));
/** 0..1 to a time or rate, evenly in ratio. */
const ratio = (v: number, lo: number, hi: number) => lo * Math.pow(hi / lo, unit(v));

/** The arpeggiator's tempo (BPM) for its TEMPO slider, when nothing on the page is keeping time. */
export const arpTempo = (v: number): number => Math.round(60 + unit(v) * 120);

/** The carrier's voice (carrier.worklet.ts): what the panel sets, and the rest held where a vocoder's carrier wants it (open, bright, held while the key is). */
export function voiceParams(sliders: Record<string, number>, switches: Record<string, number>): Record<string, number> {
  const v = (id: string) => sliders[id] ?? sliderById(id)!.def;
  const sw = (id: string) => switches[id] ?? switchById(id)!.def;
  return {
    volume: v("volume"),
    lfoRate: 5, lfoDelay: 0, dcoLfo: 0, pwm: v("pwm"), pwmMode: 1, pulse: sw("pulse"), saw: sw("saw"),
    range: sw("range") - 1, sub: v("sub"), noise: v("noise"),
    hpf: 1, cutoff: 0.45 + 0.55 * v("cutoff"), res: 0.05, envAmt: 0, envInv: 0, vcfLfo: 0, kybd: 0.5,
    gate: 0, level: 0.8,
    attack: ratio(v("attack"), 0.001, 3), decay: 1, sustain: 1, release: ratio(v("release"), 0.02, 8),
    chorus: sw("chorus"), octave: sw("octave") - 1,
    bendDco: v("bendDco") * 12, bendVcf: v("bendVcf") * 4, // up to an octave of pitch, four of cutoff
  };
}

/** The vocoder's own values (vocoder-dsp.ts VocoderParams) from its sliders. */
export function vocoderParams(sliders: Record<string, number>): { micGain: number; formant: number; release: number; q: number; sibilance: number; vocoder: number; synth: number; voice: number } {
  const v = (id: string) => sliders[id] ?? sliderById(id)!.def;
  return {
    micGain: Math.pow(10, (v("micGain") * 30) / 20), // 0 to +30 dB
    formant: Math.round((v("formant") * 2 - 1) * 12 * 10) / 10, // -12 to +12 semitones
    release: ratio(v("response"), 0.005, 0.3),
    q: ratio(v("q"), 0.5, 2),
    sibilance: v("sibilance"),
    vocoder: v("vocoderLevel") * v("vocoderLevel"),
    synth: v("synthLevel") * v("synthLevel") * 0.5,
    voice: v("voiceLevel") * v("voiceLevel"),
  };
}

export const defaultSliders = (): Record<string, number> => Object.fromEntries(SLIDERS.map((x) => [x.id, x.def]));
export const defaultSwitches = (): Record<string, number> => Object.fromEntries(SWITCHES.map((x) => [x.id, x.def]));

/** Saved values back: only known ones, in range; the rest at their defaults. */
export function decodePanel(raw: unknown): { sliders: Record<string, number>; switches: Record<string, number> } {
  const sliders = defaultSliders(), switches = defaultSwitches();
  const r = raw as { sliders?: Record<string, unknown>; switches?: Record<string, unknown> } | null;
  for (const [id, v] of Object.entries(r?.sliders ?? {})) if (id in sliders && typeof v === "number" && Number.isFinite(v)) sliders[id] = unit(v);
  for (const [id, v] of Object.entries(r?.switches ?? {})) {
    const spec = switchById(id);
    if (spec && typeof v === "number" && Number.isInteger(v) && v >= 0 && v < spec.steps) switches[id] = v;
  }
  return { sliders, switches };
}
