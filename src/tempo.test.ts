import { describe, expect, it } from "vitest";
import { beatAt, clampBpm, DEFAULT_BPM, retempo } from "./tempo";

describe("clampBpm", () => {
  it("keeps the tempo between 60 and 240, as a whole number", () => {
    expect(clampBpm(40)).toBe(60);
    expect(clampBpm(300)).toBe(240);
    expect(clampBpm(127.6)).toBe(128);
  });
  it("gives the default for something that isn't a number", () => {
    expect(clampBpm(NaN)).toBe(DEFAULT_BPM);
  });
});

describe("retempo", () => {
  it("keeps the beat reached so far and changes the spacing after it", () => {
    const clock = { originTime: 10, bpm: 120 };
    const now = 12.25; // beat 4.5
    const faster = retempo(clock, 180, now);
    expect(beatAt(faster, now)).toBeCloseTo(4.5);
    // Half a beat to go at 180 BPM: a sixth of a second.
    expect(faster.originTime + 5 * (60 / 180)).toBeCloseTo(now + 1 / 6);
  });
});
