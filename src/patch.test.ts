import { describe, expect, it } from "vitest";
import {
  arpTempo, buttonById, buttonLit, BUTTONS, decodePanel, defaultSliders, defaultSwitches, pressButton, sliderById, SLIDERS, stepOf, switchById, SWITCHES, valueOfStep, vocoderParams, voiceParams,
} from "./patch";
import { PRESET_SLIDERS, PRESET_SWITCHES, PRESETS } from "./presets";
import { ARP_MODES, arpNotes, arpPattern } from "./arp";

describe("the panel", () => {
  it("names every slider and button once, and every stepped slider's positions round-trip", () => {
    expect(new Set(SLIDERS.map((s) => s.id)).size).toBe(SLIDERS.length);
    expect(new Set(BUTTONS.map((b) => b.id)).size).toBe(BUTTONS.length);
    expect(new Set(BUTTONS.map((b) => `${b.section}/${b.col}/${b.row}`)).size).toBe(BUTTONS.length);
    for (const b of BUTTONS) if (b.kind !== "mic" && b.kind !== "arranger") expect(switchById(b.sw), b.id).toBeDefined();
    for (const s of SLIDERS) if (s.steps) for (let i = 0; i < s.steps.length; i++) expect(stepOf(valueOfStep(i, s.steps.length), s.steps.length)).toBe(i);
  });

  it("maps the panel to the carrier: 8' plays as played, times evenly in ratio, held while the key is", () => {
    const p = voiceParams(defaultSliders(), defaultSwitches());
    expect(p.range).toBe(0);
    expect(p.octave).toBe(0);
    expect(p.chorus).toBe(1);
    expect(p.hpf).toBe(1);
    expect(voiceParams(defaultSliders(), { ...defaultSwitches(), range: 0 }).range).toBe(-1);
    expect(voiceParams({ ...defaultSliders(), attack: 1 }, defaultSwitches()).attack).toBeCloseTo(3);
    expect(voiceParams({ ...defaultSliders(), attack: 0 }, defaultSwitches()).attack).toBeCloseTo(0.001);
    expect(p.sustain).toBe(1);
    expect(voiceParams({ ...defaultSliders(), bendDco: 1 }, defaultSwitches()).bendDco).toBe(12);
    for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });

  it("maps the panel to the vocoder: gain in dB, FORMANT an octave either way, the levels", () => {
    const p = vocoderParams(defaultSliders());
    expect(p.formant).toBe(0);
    expect(vocoderParams({ ...defaultSliders(), formant: 0 }).formant).toBe(-12);
    expect(vocoderParams({ ...defaultSliders(), formant: 1 }).formant).toBe(12);
    expect(vocoderParams({ ...defaultSliders(), micGain: 0 }).micGain).toBeCloseTo(1);
    expect(vocoderParams({ ...defaultSliders(), micGain: 1 }).micGain).toBeCloseTo(31.6, 1);
    expect(vocoderParams({ ...defaultSliders(), response: 0 }).release).toBeCloseTo(0.005);
    expect(p.synth).toBe(0);
    expect(p.voice).toBe(0);
    for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });

  it("presses buttons: one of a row, on and off, the chorus's I and II together, a memory number", () => {
    let sw = defaultSwitches();
    sw = pressButton(buttonById("range-4")!, sw);
    expect(sw.range).toBe(2);
    expect(buttonLit(buttonById("range-4")!, sw)).toBe(true);
    expect(buttonLit(buttonById("range-8")!, sw)).toBe(false);
    sw = pressButton(buttonById("hold")!, sw);
    expect(sw.hold).toBe(1);
    expect(pressButton(buttonById("hold")!, sw).hold).toBe(0);
    sw = pressButton(buttonById("chorus-2")!, sw); // I was on: now I+II
    expect(sw.chorus).toBe(3);
    expect(buttonLit(buttonById("chorus-1")!, sw) && buttonLit(buttonById("chorus-2")!, sw)).toBe(true);
    sw = pressButton(buttonById("chorus-off")!, sw);
    expect(sw.chorus).toBe(0);
    sw = pressButton(buttonById("preset-3")!, sw);
    expect(sw.preset).toBe(3);
    expect(buttonLit(buttonById("preset-3")!, sw)).toBe(true);
    expect(pressButton(buttonById("mic")!, sw)).toBe(sw); // the microphone is no switch
  });

  it("reads back saved values, keeping only known ones in range", () => {
    const back = decodePanel({ sliders: { cutoff: 0.9, q: 7, nope: 1 }, switches: { range: 2, arp: 5, chorus: 3 } });
    expect(back.sliders.cutoff).toBe(0.9);
    expect(back.sliders.q).toBe(1);
    expect("nope" in back.sliders).toBe(false);
    expect(back.switches.range).toBe(2);
    expect(back.switches.arp).toBe(0);
    expect(back.switches.chorus).toBe(3);
    expect(decodePanel(null)).toEqual({ sliders: defaultSliders(), switches: defaultSwitches() });
  });

  it("gives the arpeggiator 60 to 180 BPM of its own", () => {
    expect(arpTempo(0)).toBe(60);
    expect(arpTempo(1)).toBe(180);
  });
});

describe("the memory", () => {
  it("holds eight sounds, each named once, each setting every sound slider and switch in range", () => {
    expect(PRESETS.length).toBe(8);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(8);
    for (const p of PRESETS) {
      expect(Object.keys(p.sliders).sort()).toEqual([...PRESET_SLIDERS].sort());
      expect(Object.keys(p.switches).sort()).toEqual([...PRESET_SWITCHES].sort());
      for (const [id, v] of Object.entries(p.sliders)) { expect(sliderById(id), id).toBeDefined(); expect(v >= 0 && v <= 1, `${p.name} ${id}`).toBe(true); }
      for (const [id, v] of Object.entries(p.switches)) { const spec = switchById(id)!; expect(Number.isInteger(v) && v >= 0 && v < spec.steps, `${p.name} ${id}`).toBe(true); }
      // Something to hear: an oscillator, the sub or noise.
      expect(p.switches.saw + p.switches.pulse + p.sliders.sub + p.sliders.noise, p.name).toBeGreaterThan(0);
    }
    for (const s of SWITCHES) expect(s.def).toBeLessThan(s.steps);
  });
});

describe("the arpeggiator", () => {
  it("plays the held keys up, down, or up and down without repeating the ends", () => {
    expect(arpNotes([64, 60, 67], "up", 1)).toEqual([60, 64, 67]);
    expect(arpNotes([64, 60, 67], "down", 1)).toEqual([67, 64, 60]);
    expect(arpNotes([60, 64, 67], "updown", 1)).toEqual([60, 64, 67, 64]);
    expect(arpNotes([60], "updown", 1)).toEqual([60]);
    expect(ARP_MODES).toEqual(["up", "updown", "down"]); // the MODE buttons' order
  });
  it("spreads over octaves, and makes a note pattern for the sequencer", () => {
    expect(arpNotes([60, 64], "up", 2)).toEqual([60, 64, 72, 76]);
    expect(arpPattern([], "up", 1, 4)).toBeNull();
    expect(arpPattern([60, 67], "up", 1, 4)).toEqual({ stepsPerBeat: 4, steps: [{ note: 60, gate: 0.8 }, { note: 67, gate: 0.8 }] });
  });
});
