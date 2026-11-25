/**
 * The arpeggiator: the keys held, played one after another on the music clock. It builds a note
 * pattern for the engine's sequencer (which plays it on the exact sample, from the master's
 * downbeat). Pure, so it has tests.
 */
export type ArpMode = "up" | "down" | "updown";
/** In the order of the MODE buttons: UP, U & D, DOWN. */
export const ARP_MODES: ArpMode[] = ["up", "updown", "down"];
/** RATE: eighths, sixteenths, sixteenth-note triplets (steps per beat). */
export const ARP_RATES = [2, 4, 6];

/** The notes in the order they play: the held keys sorted, over `octaves` octaves, in the mode's order. */
export function arpNotes(held: number[], mode: ArpMode, octaves: number): number[] {
  const keys = [...new Set(held)].sort((a, b) => a - b);
  if (!keys.length) return [];
  const up: number[] = [];
  for (let o = 0; o < Math.max(1, Math.min(4, octaves)); o++) for (const n of keys) up.push(n + 12 * o);
  if (mode === "up") return up;
  const down = [...up].reverse();
  if (mode === "down") return down;
  // Up then down, not repeating the top and bottom notes.
  return up.length > 1 ? [...up, ...down.slice(1, -1)] : up;
}

/** The note pattern for the sequencer: one note a step, each sounding most of its step. */
export function arpPattern(held: number[], mode: ArpMode, octaves: number, stepsPerBeat: number): { stepsPerBeat: number; steps: { note: number; gate: number }[] } | null {
  const notes = arpNotes(held, mode, octaves);
  return notes.length ? { stepsPerBeat, steps: notes.map((note) => ({ note, gate: 0.8 })) } : null;
}
