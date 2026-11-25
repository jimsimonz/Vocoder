/**
 * The VX-16's printed top: a deep blue-grey front panel with pale print, each section under a
 * coloured heading strip (orange, teal or cream; the Accent names are the layout's), a slot and a 0 to 10 scale for every slider (a
 * stepped one's positions named), the buttons' names, the memory's strip, a dark keybed behind the
 * keys, the brand, and wear. And the wood grain for its cheeks. Drawn once into canvases: one
 * texture and one draw call for all the printing.
 */
import {
  BENDER_LABEL, BODY, BRAND, KEYS, MEMORY_HEADING, ROW, SECTIONS, SLIDER, SLIDES, WHEEL, WHEELS, type Accent, type KeySpec,
} from "./layout";
import { seeded, wearFaceplate } from "./wear";

const PX_PER_M = 2600;
export const FACE = { panel: "#1d2430", ink: "#e6ebf0", red: "#e07a2c", blue: "#1f9e95", cream: "#e8e1cf", keybed: "#0c0f14", slot: "#06080b", dark: "#151a22" };
const ACCENT: Record<Accent, { fill: string; ink: string }> = {
  red: { fill: FACE.red, ink: "#ffffff" }, blue: { fill: FACE.blue, ink: "#ffffff" }, cream: { fill: FACE.cream, ink: FACE.dark },
};
/** Where the panel ends and the keybed begins (z). */
const KEYBED_FROM = 0.018;

export function drawFaceplate(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(BODY.width * PX_PER_M);
  canvas.height = Math.round(BODY.depth * PX_PER_M);
  const g = canvas.getContext("2d")!;
  const px = (x: number) => (x + BODY.width / 2) * PX_PER_M;
  const pz = (z: number) => (z + BODY.depth / 2) * PX_PER_M;
  const m = (metres: number) => metres * PX_PER_M;
  const text = (s: string, x: number, z: number, sizeM: number, color = FACE.ink, weight = "bold", align: CanvasTextAlign = "center") => {
    g.font = `${weight} ${Math.round(m(sizeM))}px "Helvetica Neue", Arial, sans-serif`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(s, px(x), pz(z));
  };
  const rect = (x: number, z: number, w: number, d: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(px(x - w / 2), pz(z - d / 2), m(w), m(d));
  };

  g.fillStyle = FACE.panel;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = FACE.keybed;
  g.fillRect(0, pz(KEYBED_FROM), canvas.width, canvas.height - pz(KEYBED_FROM));
  rect(0, KEYBED_FROM, BODY.width, 0.002, FACE.red);

  // Sections: a coloured strip with the name in it, and a thin line down either side.
  for (const s of SECTIONS) {
    const a = ACCENT[s.accent], mid = (s.x0 + s.x1) / 2;
    rect(mid, ROW.heading, s.x1 - s.x0, ROW.headingD, a.fill);
    text(s.name, mid, ROW.heading + 0.0003, 0.0058, a.ink);
    g.fillStyle = "rgba(230, 235, 240, 0.28)";
    for (const x of [s.x0, s.x1]) g.fillRect(px(x) - m(0.0003), pz(ROW.heading + ROW.headingD / 2), m(0.0006), pz(ROW.bottom) - pz(ROW.heading + ROW.headingD / 2));
    rect(mid, ROW.bottom, s.x1 - s.x0, 0.0008, a.fill);
  }

  // Sliders: the slot, the scale (0 at the front, 10 at the back), the name.
  for (const s of SLIDES) {
    rect(s.x, s.z, SLIDER.slotW, 2 * SLIDER.travel + SLIDER.capD, FACE.slot);
    const tick = (v: number, side: number, long: boolean) => {
      const z = s.z + SLIDER.travel * (1 - 2 * v), from = SLIDER.capW / 2 + 0.0012, len = long ? 0.003 : 0.0018;
      rect(s.x + side * (from + len / 2), z, len, long ? 0.0007 : 0.0004, FACE.ink);
    };
    if (s.steps) {
      s.steps.forEach((name, i) => {
        const v = (i + 0.5) / s.steps!.length;
        tick(v, -1, true);
        text(name, s.x + SLIDER.capW / 2 + 0.0012, s.z + SLIDER.travel * (1 - 2 * v), 0.0026, FACE.ink, "bold", "left");
      });
    } else {
      for (let i = 0; i <= 10; i++) { tick(i / 10, -1, i % 5 === 0); tick(i / 10, 1, i % 5 === 0); }
    }
    text(s.label, s.x, s.labelZ, s.label.length > 5 ? 0.003 : 0.0034);
  }
  text(BENDER_LABEL.text, BENDER_LABEL.x, BENDER_LABEL.z, 0.0031, FACE.cream);

  // The memory's own strip.
  const mh = MEMORY_HEADING;
  rect((mh.x0 + mh.x1) / 2, mh.z, mh.x1 - mh.x0, 0.0065, FACE.cream);
  text(mh.name, (mh.x0 + mh.x1) / 2, mh.z + 0.0002, 0.0042, FACE.dark);

  // Wheel slots and names.
  for (const w of WHEELS) {
    rect(w.x, WHEEL.z, WHEEL.capW + 0.006, WHEEL.slot + WHEEL.capD, FACE.slot);
    text(w.label, w.x, WHEEL.labelZ, 0.0031);
  }

  // The brand: its badge, its name, and two stripes under them.
  text(BRAND.name, BRAND.x, BRAND.z, 0.016, FACE.ink, "900", "left");
  text(BRAND.line, BRAND.x + 0.078, BRAND.z - 0.0035, 0.0064, FACE.ink, "bold", "left");
  text(BRAND.sub, BRAND.x + 0.078, BRAND.z + 0.0045, 0.003, FACE.cream, "bold", "left");
  rect(BRAND.x + 0.24, BRAND.z + 0.0165, 0.48, 0.0016, FACE.red);
  rect(BRAND.x + 0.24, BRAND.z + 0.0195, 0.48, 0.0016, FACE.blue);

  for (const k of KEYS) if (k.label) text(k.label, k.x, k.labelZ, k.kind === "white" ? 0.0034 : k.kind === "button" ? 0.0029 : 0.0032);

  wearFaceplate(g, canvas.width, canvas.height,
    KEYS.filter((k) => k.kind === "button" || k.kind === "memory").map((k) => ({ x: px(k.x - k.w / 2), y: pz(k.z - k.d / 2), w: m(k.w), h: m(k.d), use: 0.3 })),
    (_x, y) => (y > pz(KEYBED_FROM) ? FACE.keybed : FACE.panel));
  return canvas;
}

/** Walnut, for the cheeks: grain along the length, with a few darker streaks. */
export function drawWood(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 512;
  const g = c.getContext("2d")!, rand = seeded(1982);
  g.fillStyle = "#5a3820";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const x = rand() * c.width, wobble = rand() * 6;
    g.strokeStyle = rand() < 0.5 ? `rgba(30, 16, 8, ${0.12 + rand() * 0.25})` : `rgba(140, 92, 54, ${0.08 + rand() * 0.18})`;
    g.lineWidth = 0.5 + rand() * 2.5;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= c.height; y += 32) g.lineTo(x + Math.sin(y / 70 + wobble) * 3 + (rand() - 0.5) * 1.5, y);
    g.stroke();
  }
  return c;
}

/** How much a key has been used: no wear map for this machine's keys beyond the switches. */
export const keyUse = (_k: KeySpec): number => 0.3;
