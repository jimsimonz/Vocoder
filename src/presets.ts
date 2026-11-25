/**
 * The eight sounds in its memory (1 to 8): our own, made for this machine. Each sets the carrier,
 * its envelope and the vocoder's own sliders, and its switches (range, waveforms, chorus); the
 * rest of the panel (volume, the microphone's gain, the mix, the arpeggio, hold, octave, the
 * bender) stays as it stands.
 */
export interface Preset {
  name: string;
  sliders: Record<string, number>;
  switches: Record<string, number>;
}

/** The sliders a preset sets, in the order of `values` below (each 0 to 10, as printed). */
export const PRESET_SLIDERS = ["pwm", "sub", "noise", "cutoff", "attack", "release", "formant", "response", "q", "sibilance"] as const;
/** The switches a preset sets (RANGE: 0 16', 1 8', 2 4'; CHORUS: 0 off, 1 I, 2 II, 3 I+II). */
export const PRESET_SWITCHES = ["range", "pulse", "saw", "chorus"] as const;

const preset = (name: string, values: number[], sw: [range: number, pulse: number, saw: number, chorus: number]): Preset => ({
  name,
  sliders: Object.fromEntries(PRESET_SLIDERS.map((id, i) => [id, values[i] / 10])),
  switches: Object.fromEntries(PRESET_SWITCHES.map((id, i) => [id, sw[i]])),
});

//                         CARRIER                ENV        VOCODER                     rng pul saw chorus
//                         pwm  sub  noi  brt     A    R     frm  rsp  q    sib
export const PRESETS: Preset[] = [
  preset("Robot Choir",    [  5,   2,   1, 8.5,  0.5,   3,    5,   3,   5,   3], [1, 0, 1, 1]),
  preset("Low Machine",    [  5,   6, 0.5,   7,  0.3, 2.5,    3, 2.5,   5,   2], [0, 0, 1, 0]),
  preset("Glass Voice",    [  7,   0,   1,  10,    1,   4,  6.5,   3, 7.5,   4], [2, 1, 0, 2]),
  preset("Whisper Pad",    [  5,   0,   6,   8,    4,   6,    5,   6, 4.5,   6], [1, 0, 1, 3]),
  preset("Talk Box",       [  5,   0, 0.5,   9,  0.2, 1.5,    5, 1.5,   8,   2], [1, 0, 1, 0]),
  preset("Voice Strings",  [  5,   1,   1, 7.5,    5,   6,    5,   5,   5,   3], [1, 0, 1, 3]),
  preset("Cyborg",         [  3,   3,   1,  10,  0.2,   2,    7,   1,   9,   3], [1, 1, 1, 0]),
  preset("Space Ensemble", [  6,   2,   2,   8,    3,   7,  4.5,   7,   4,   5], [1, 1, 1, 3]),
];
