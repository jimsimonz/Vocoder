/**
 * Where everything sits on the 3D vocoder (VX-16), in metres, in the machine's own space: x across
 * (left to right as you face it), z towards the player (+z is the front edge), y up from the top
 * surface (0). Pure numbers, so the layout has tests.
 *
 * Back to front: the front panel (one row of sections, each a coloured heading over its sliders
 * and its columns of buttons; then the memory buttons along its front edge); the keyboard, five
 * octaves at a real keyboard's spacing, with the bend lever, the mod wheel and the bender's two
 * sliders to its left.
 */
import { BUTTONS, SLIDERS, type ButtonSpec } from "../patch";

export const BODY = { width: 1.08, depth: 0.4, height: 0.06 } as const;
export const TRAVEL_M = 0.006, PRESS_AT_M = 0.0045;
/** A button's travel and where it fires (shorter than a key's). */
export const BUTTON_TRAVEL_M = 0.003, BUTTON_PRESS_AT_M = 0.002;

export type ControlKind = "white" | "black" | "button" | "memory" | "power";

export interface KeySpec {
  id: string;
  kind: ControlKind;
  x: number;
  z: number;
  /** The cap you see. */
  w: number;
  d: number;
  h: number;
  /** Where a fingertip presses it (a white key: only its front, clear of the black keys). */
  hitZ: number;
  hitD: number;
  label: string;
  labelZ: number;
  /** Keys: the MIDI note. */
  note?: number;
  /** Panel buttons: which (patch.ts BUTTONS). */
  button?: ButtonSpec;
}

// ------------------------------------------------------------------ the keyboard

/** The lowest key (C2) and how many: five octaves and the C above. */
export const LOWEST_NOTE = 36, KEY_COUNT = 61;
const WHITE = { x0: -0.359, pitch: 0.0235, w: 0.0215, z: 0.095, d: 0.14, h: 0.012, hitZ: 0.1375, hitD: 0.052 };
// The black keys start 4 mm in front of the white keys' backs, so their back faces never share a
// plane with the white keys' (which flickers in a headset).
const BLACK = { w: 0.013, z: 0.067, d: 0.076, h: 0.021 };
/** Semitones of the white keys in an octave, and after which white key each black one sits. */
const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_AFTER: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

function keyboard(): KeySpec[] {
  const out: KeySpec[] = [];
  let white = 0;
  for (let i = 0; i < KEY_COUNT; i++) {
    const note = LOWEST_NOTE + i, inOctave = i % 12, octave = Math.floor(i / 12);
    if (WHITE_STEPS.includes(inOctave)) {
      out.push({ id: `key-${note}`, kind: "white", x: WHITE.x0 + white * WHITE.pitch, z: WHITE.z, w: WHITE.w, d: WHITE.d, h: WHITE.h,
        hitZ: WHITE.hitZ, hitD: WHITE.hitD, label: inOctave === 0 ? `C${Math.floor(note / 12) - 1}` : "", labelZ: 0.178, note });
      white++;
    } else {
      const after = octave * 7 + BLACK_AFTER[inOctave];
      out.push({ id: `key-${note}`, kind: "black", x: WHITE.x0 + (after + 0.5) * WHITE.pitch, z: BLACK.z, w: BLACK.w, d: BLACK.d, h: BLACK.h,
        hitZ: BLACK.z, hitD: BLACK.d, label: "", labelZ: 0, note });
    }
  }
  return out;
}

// ------------------------------------------------------------------ the panel

/** The heading strips' colours (faceplate.ts FACE): which each section wears. */
export type Accent = "red" | "blue" | "cream";

/**
 * The panel's one row, left to right: each section's columns in order. A string is a slider's id;
 * a number is that column of the section's buttons (patch.ts BUTTONS `col`).
 */
const PANEL: { name: string; accent: Accent; columns: (string | number)[] }[] = [
  { name: "MASTER", accent: "cream", columns: ["volume", 0] },
  { name: "MIC", accent: "red", columns: [0, "micGain"] },
  { name: "ARPEGGIO", accent: "cream", columns: [0, 1, 2, "arpRate", "arpTempo"] },
  { name: "CARRIER", accent: "blue", columns: [0, 1, "pwm", "sub", "noise", "cutoff"] },
  { name: "ENV", accent: "blue", columns: ["attack", "release"] },
  { name: "VOCODER", accent: "red", columns: ["formant", "response", "q", "sibilance"] },
  { name: "MIX", accent: "cream", columns: ["vocoderLevel", "synthLevel", "voiceLevel"] },
  { name: "CHORUS", accent: "blue", columns: [0] },
];

/** Column widths, a section's padding either side, and the gap between sections. */
const COL = { slider: 0.027, button: 0.033, pad: 0.004, gap: 0.004 };
/** The row sits left of the middle: the top right corner is the container's (its M and S buttons). */
const PANEL_X = -0.028;
/** Panel rows (z): the headings, the sliders' names, the sliders' middle, the buttons' three rows, the sections' front edge. */
export const ROW = { heading: -0.186, headingD: 0.011, label: -0.1705, slider: -0.118, buttons: [-0.146, -0.117, -0.088], bottom: -0.0745 };
/** A slider: how far its cap goes either way from the middle, and the cap. */
export const SLIDER = { travel: 0.027, capW: 0.014, capD: 0.011, capH: 0.011, slotW: 0.0035 };
/** A slider's cap position (z) for a value 0..1 (1 is at the back); and the value back. */
export const sliderZ = (centre: number, v: number): number => centre + SLIDER.travel * (1 - 2 * Math.min(1, Math.max(0, v)));
export const sliderValue = (centre: number, z: number): number => Math.min(1, Math.max(0, (1 - (z - centre) / SLIDER.travel) / 2));

const BUTTON = { w: 0.022, d: 0.012, h: 0.006, labelDz: -0.0138, lightDz: -0.0088 };
const MEMORY = { z: -0.036, w: 0.028, d: 0.016, h: 0.007, x0: 0.075, pitch: 0.04, labelDz: -0.0185, lightDz: -0.0118 };

export interface SlideSpec { id: string; x: number; z: number; label: string; labelZ: number; steps?: string[] }
export interface SectionSpec { name: string; accent: Accent; x0: number; x1: number }

function panel(): { slides: SlideSpec[]; buttons: KeySpec[]; sections: SectionSpec[] } {
  const slides: SlideSpec[] = [], buttons: KeySpec[] = [], sections: SectionSpec[] = [];
  const widthOf = (c: string | number) => (typeof c === "string" ? COL.slider : COL.button);
  const total = PANEL.reduce((sum, s) => sum + s.columns.reduce((w: number, c) => w + widthOf(c), 0) + 2 * COL.pad, 0) + (PANEL.length - 1) * COL.gap;
  let x = PANEL_X - total / 2;
  for (const section of PANEL) {
    const x0 = x;
    x += COL.pad;
    for (const c of section.columns) {
      const cx = x + widthOf(c) / 2;
      if (typeof c === "string") {
        const spec = SLIDERS.find((s) => s.id === c)!;
        slides.push({ id: c, x: cx, z: ROW.slider, label: spec.label, labelZ: ROW.label, steps: spec.steps });
      } else {
        for (const b of BUTTONS) {
          if (b.section !== section.name || b.col !== c) continue;
          const z = ROW.buttons[b.row];
          buttons.push({ id: `btn-${b.id}`, kind: "button", x: cx, z, w: BUTTON.w, d: BUTTON.d, h: BUTTON.h, hitZ: z, hitD: BUTTON.d, label: b.label, labelZ: z + BUTTON.labelDz, button: b });
        }
      }
      x += widthOf(c);
    }
    x += COL.pad;
    sections.push({ name: section.name, accent: section.accent, x0, x1: x });
    x += COL.gap;
  }
  // The memory: 1 to 8, along the panel's front edge.
  for (const b of BUTTONS) {
    if (b.section !== "MEMORY") continue;
    const bx = MEMORY.x0 + b.col * MEMORY.pitch;
    buttons.push({ id: `btn-${b.id}`, kind: "memory", x: bx, z: MEMORY.z, w: MEMORY.w, d: MEMORY.d, h: MEMORY.h, hitZ: MEMORY.z, hitD: MEMORY.d, label: b.label, labelZ: MEMORY.z + MEMORY.labelDz, button: b });
  }
  return { slides, buttons, sections };
}

const built = panel();

/** The bender's two sliders, left of the lever: how far it bends the pitch and the filter. */
const BEND_SLIDES: SlideSpec[] = [
  { id: "bendDco", x: -0.489, z: 0.095, label: "DCO", labelZ: 0.152 },
  { id: "bendVcf", x: -0.462, z: 0.095, label: "VCF", labelZ: 0.152 },
];
export const BENDER_LABEL = { text: "BENDER", x: -0.4755, z: 0.166 };

/** Every slider: the panel's, then the bender's. */
export const SLIDES: SlideSpec[] = [...built.slides, ...BEND_SLIDES];
export const SECTIONS: SectionSpec[] = built.sections;
/** Where the memory's own heading goes (a short strip over its buttons). */
export const MEMORY_HEADING = { name: "MEMORY", x0: MEMORY.x0 - MEMORY.w / 2, x1: MEMORY.x0 + 7 * MEMORY.pitch + MEMORY.w / 2, z: -0.0655 };

export const POWER = { x: 0.5, z: MEMORY.z };

export const KEYS: KeySpec[] = [
  ...keyboard(),
  ...built.buttons,
  { id: "power", kind: "power", x: POWER.x, z: POWER.z, w: 0.018, d: 0.016, h: 0.007, hitZ: POWER.z, hitD: 0.016, label: "OFF", labelZ: POWER.z + MEMORY.labelDz },
];

/** A light over every button (lit while it is on). */
export const LIGHT = { w: 0.006, d: 0.0022, h: 0.0012 };
export const LIGHTS: { id: string; x: number; z: number }[] = built.buttons.map((k) => ({
  id: k.button!.id, x: k.x, z: k.z + (k.kind === "memory" ? MEMORY.lightDz : BUTTON.lightDz),
}));

/** The wheels: the bend lever (springs back to the middle) and mod, slid towards you and away. */
export const WHEELS = [
  { id: "pitch" as const, x: -0.425, label: "BEND" },
  { id: "mod" as const, x: -0.389, label: "MOD" },
];
export const WHEEL = { z: 0.095, travel: 0.03, slot: 0.075, capW: 0.024, capH: 0.03, capD: 0.016, labelZ: 0.152 };
/** A wheel's position (z) for a value -1..1 (pitch) or 0..1 (mod: back is 0); and the value back. */
export const wheelZ = (v: number): number => WHEEL.z + WHEEL.travel * Math.max(-1, Math.min(1, v));
export const wheelValue = (z: number): number => Math.max(-1, Math.min(1, (z - WHEEL.z) / WHEEL.travel));

/** The wooden cheeks at either end, and the carry handle along the back. */
export const CHEEK = { w: 0.026, extra: 0.035 };
export const HANDLE = { x: 0, z: -BODY.depth / 2 - 0.009, w: 0.5, d: 0.02, h: 0.014, y: -0.014 };
/** The brand line. Not any real product's name. */
export const BRAND = { name: "VX-16", line: "VOCODER", sub: "16-BAND VOICE KEYBOARD", x: -0.5, z: -0.047 };
