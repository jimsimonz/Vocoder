import { describe, expect, it } from "vitest";
import { BUTTONS, SLIDERS } from "../patch";
import { BODY, KEY_COUNT, KEYS, LIGHTS, SECTIONS, SLIDER, SLIDES, sliderValue, sliderZ, WHEEL, wheelValue, wheelZ, WHEELS } from "./layout";

const rect = (x: number, z: number, w: number, d: number) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
type Rect = ReturnType<typeof rect>;
const overlaps = (a: Rect, b: Rect, gap = 0) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;

// Where fingers press: each key's hit area; each slider's whole run with room for a pinch; each wheel's slot.
const hits = KEYS.map((k) => ({ id: k.id, kind: k.kind as string, r: rect(k.x, k.hitZ, k.w, k.hitD) }));
const slides = SLIDES.map((s) => ({ id: `slider-${s.id}`, kind: "slider", r: rect(s.x, s.z, SLIDER.capW + 0.009, 2 * SLIDER.travel + SLIDER.capD) }));
const wheels = WHEELS.map((w) => ({ id: `wheel-${w.id}`, kind: "wheel", r: rect(w.x, WHEEL.z, WHEEL.capW + 0.004, WHEEL.slot + WHEEL.capD) }));
const all = [...hits, ...slides, ...wheels];

describe("layout", () => {
  it("has 61 keys, C2 to C7, each note once", () => {
    const notes = KEYS.filter((k) => k.note !== undefined).map((k) => k.note!);
    expect(notes.length).toBe(KEY_COUNT);
    expect(new Set(notes).size).toBe(KEY_COUNT);
    expect(Math.min(...notes)).toBe(36);
    expect(Math.max(...notes)).toBe(96);
    expect(new Set(KEYS.map((k) => k.id)).size).toBe(KEYS.length);
  });

  it("places every slider and every button of the panel, with a light for each button", () => {
    expect(SLIDES.map((s) => s.id).sort()).toEqual(SLIDERS.map((s) => s.id).sort());
    expect(KEYS.filter((k) => k.button).map((k) => k.button!.id).sort()).toEqual(BUTTONS.map((b) => b.id).sort());
    expect(LIGHTS.map((l) => l.id).sort()).toEqual(BUTTONS.map((b) => b.id).sort());
  });

  it("keeps everything on the body", () => {
    for (const { id, r } of all) {
      expect(r.x0, id).toBeGreaterThan(-BODY.width / 2);
      expect(r.x1, id).toBeLessThan(BODY.width / 2);
      expect(r.z0, id).toBeGreaterThan(-BODY.depth / 2);
      expect(r.z1, id).toBeLessThan(BODY.depth / 2);
    }
    for (const s of SECTIONS) { expect(s.x0).toBeGreaterThan(-BODY.width / 2 + 0.005); expect(s.x1).toBeLessThan(BODY.width / 2 - 0.005); }
  });

  it("never lets two places a fingertip presses overlap (a fingertip's gap between buttons)", () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const pressed = (k: string) => k === "button" || k === "memory" || k === "power";
        // Keyboard keys sit as close as a real keyboard's, sliders as close as their columns; buttons keep 5 mm from each other.
        const gap = pressed(all[i].kind) && pressed(all[j].kind) ? 0.005 : 0;
        expect(overlaps(all[i].r, all[j].r, gap), `${all[i].id} / ${all[j].id}`).toBe(false);
      }
    }
  });

  it("gives each section its own stretch of the panel, in order", () => {
    for (let i = 1; i < SECTIONS.length; i++) expect(SECTIONS[i].x0).toBeGreaterThan(SECTIONS[i - 1].x1);
  });

  it("maps sliders and wheels both ways", () => {
    for (const v of [0, 0.3, 1]) expect(sliderValue(-0.1, sliderZ(-0.1, v))).toBeCloseTo(v);
    expect(sliderZ(0, 1)).toBeLessThan(sliderZ(0, 0)); // 10 is at the back
    for (const v of [-1, 0, 0.5, 1]) expect(wheelValue(wheelZ(v))).toBeCloseTo(v);
  });
});
