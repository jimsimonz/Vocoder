/**
 * The vocoder's lesson: the container's guide (a small robot: the engine's lessons, MODULES.md
 * "Lessons") teaches its first words: the microphone on, a key held while talking, FORMANT. Pure data over what the machine and its 3D body
 * say about themselves: each step points at a key, button or slider and waits for the machine's
 * own state to show it was done. The "?" after the M and S runs it.
 *
 * Nothing here loads a sound from MEMORY or moves a slider for the player: what they had made stays.
 * Every step can be done with one finger (or the mouse, which holds one key at a time).
 */
import { anyOf, isTrue, valueMoved, type Begin, type Lesson, type LessonTarget } from "@engine/api/module";
import { HEARD, type VocoderMachine } from "./vocoder-machine";

/** Where the machine's things are in the world (vocoder-machine-3d.ts), or null while it isn't built. */
export interface LessonBody {
  keyWorldPosition(id: string, out: Parameters<LessonTarget>[0]): boolean;
  sliderWorldPosition(id: string, out: Parameters<LessonTarget>[0]): boolean;
  /** A slider's travel (world): away from the player and back. */
  sliderAxis(out: Parameters<LessonTarget>[0]): boolean;
}

/** The key the guide points at: middle C, in the middle of the keyboard. */
const MIDDLE_KEY = "key-60";
/** A slider moved this far (of its travel) counts as set. */
const SLIDER_MOVED = 0.15;
const HINT_S = 20;

export const LINES = {
  intro: "This is a vocoder. Your voice shapes the sound of the keys.",
  mic: "Press MIC ON. The first time, allow the microphone.",
  micHint: "Press MIC ON under the orange MIC heading, and allow the microphone if you are asked.",
  key: "Hold a key down and talk or sing. The keys play your words.",
  keyHint: "Keep a key down and speak into the microphone.",
  formant: "Under VOCODER, slide FORMANT. Down sounds bigger and deeper, up smaller and higher.",
  formantHint: "Pinch the FORMANT slider under the orange VOCODER heading, and slide it up or down.",
  wellDone: "That's your voice on the keys! Try a chord, press HOLD to keep it, or try the eight sounds under MEMORY.",
} as const;


export function vocoderLesson(machine: VocoderMachine, body: () => LessonBody | null | undefined, clips?: string): Lesson {
  const key = (id: string): LessonTarget => (out) => !!body()?.keyWorldPosition(id, out);
  const slider = (id: string): LessonTarget => (out) => !!body()?.sliderWorldPosition(id, out);
  const slide: LessonTarget = (out) => !!body()?.sliderAxis(out);
  const state = () => machine.state();
  const formant = () => machine.slider("formant");
  /** Stops listening to the machine: for the latch below, when its step is done or the lesson ends. */
  const stops = new Set<() => void>();
  /**
   * A key has sounded while the voice was heard since the step began. The guide asks a step's check
   * only between its lines, so a short phrase spoken while it is still talking would otherwise be missed.
   */
  const spokenSince: Begin = () => {
    const now = () => state().notes.length > 0 && state().micLevel > HEARD;
    let seen = now();
    const stop = machine.onChange(() => { if (now()) seen = true; });
    stops.add(stop);
    return () => {
      if (!seen) return false;
      stop(); stops.delete(stop);
      return true;
    };
  };
  return {
    id: "first-words",
    title: "Your first words",
    sub: "Play the keys with your voice",
    lines: LINES,
    clips,
    // A guest who may not play it (or whose page has no microphone to give it) can't be taught on it.
    available: () => state().canPlay && state().micAllowed,
    teardown() { for (const stop of stops) stop(); stops.clear(); },
    steps: [
      { id: "intro", cues: [{ line: "intro", at: key(MIDDLE_KEY) }] },
      {
        id: "mic",
        cues: [{ line: "mic", at: key("btn-mic"), show: { kind: "poke" } }],
        begin: isTrue(() => state().mic),
        hint: { line: "micHint", at: key("btn-mic"), show: { kind: "poke" } }, hintAfterS: HINT_S,
      },
      {
        id: "key",
        cues: [{ line: "key", at: key(MIDDLE_KEY), show: { kind: "poke" } }],
        begin: spokenSince,
        hint: { line: "keyHint", at: key(MIDDLE_KEY), show: { kind: "poke" } }, hintAfterS: HINT_S,
      },
      {
        id: "formant",
        cues: [{ line: "formant", at: slider("formant"), show: { kind: "pinch", slide } }],
        begin: anyOf(valueMoved(formant, SLIDER_MOVED), valueMoved(formant, -SLIDER_MOVED)),
        hint: { line: "formantHint", at: slider("formant"), show: { kind: "pinch", slide } }, hintAfterS: HINT_S,
      },
    ],
    outro: [{ line: "wellDone" }],
  };
}
