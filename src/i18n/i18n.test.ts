import { describe, expect, it } from "vitest";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { vocoderLesson } from "../lesson";
import type { VocoderMachine } from "../vocoder-machine";

// The lesson only reads the machine when it runs: a stand-in is enough to read its words.
const lesson = vocoderLesson({} as VocoderMachine, () => null, "");
const LESSON_TEXT = [lesson.title, lesson.sub, ...Object.values(lesson.lines)].filter((s): s is string => !!s);

const catalogues = { es, fr, de, ja };
const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("translations", () => {
  it("all four catalogues have the same keys", () => {
    const keys = Object.keys(es).sort();
    for (const c of [fr, de, ja]) expect(Object.keys(c).sort()).toEqual(keys);
  });
  for (const [lang, c] of Object.entries(catalogues)) {
    it(`${lang}: no empty values, same {placeholders} as the key`, () => {
      for (const [k, v] of Object.entries(c)) {
        expect(v.trim(), `${lang}: ${k}`).not.toBe("");
        expect(holes(v), `${lang}: ${k}`).toEqual(holes(k));
      }
    });
  }
  it("every lesson line, title and sub is a key", () => {
    for (const s of LESSON_TEXT) expect(Object.keys(es), s).toContain(s);
  });
});
