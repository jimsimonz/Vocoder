/**
 * Tempo maths, with nothing from the engine or the browser in it (so it has tests).
 *
 * A clock is two numbers: the time of beat 0 and the tempo. Beat n falls at
 * `originTime + n * 60 / bpm`, in the page's AudioContext time. It is the same shape as the
 * engine's ClockBeat (@engine/core/musicClock), so one can be handed over as the other.
 */
export interface Beat {
  /** AudioContext time of beat 0 (seconds). */
  originTime: number;
  bpm: number;
}

export const MIN_BPM = 60, MAX_BPM = 240, DEFAULT_BPM = 120;

/** A whole tempo inside the machine's range (the default for anything that isn't a number). */
export const clampBpm = (bpm: number): number =>
  (Number.isFinite(bpm) ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm))) : DEFAULT_BPM);

/** The beat (fractional) at time `t`. */
export const beatAt = (clock: Beat, t: number): number => (t - clock.originTime) * (clock.bpm / 60);

/**
 * The same clock at another tempo, changed at time `now` without a jump: the beat it has reached
 * at `now` stays where it is, and the beats after it come at the new spacing.
 */
export const retempo = (clock: Beat, bpm: number, now: number): Beat => ({
  originTime: now - beatAt(clock, now) * (60 / bpm),
  bpm,
});
