import { describe, expect, it } from "vitest";
import { framesPerSecond, perFrameBudget, qualityFor, sampleIndices, thin } from "./budget";

describe("native budget", () => {
  it("caps frames at 100", () => {
    expect(framesPerSecond(10)).toBe(10);
    expect(framesPerSecond(3)).toBe(15);
    expect(framesPerSecond(8)).toBe(12);
    expect(framesPerSecond(10) * 10).toBeLessThanOrEqual(100);
  });
  it("splits the size budget across frames", () => {
    expect(perFrameBudget(100)).toBeGreaterThan(4000);
    expect(perFrameBudget(100)).toBeLessThan(4700);
  });
  it("samples evenly including both ends", () => {
    expect(sampleIndices(100, 6)).toEqual([0, 20, 40, 59, 79, 99]);
    expect(sampleIndices(3, 6)).toEqual([0, 1, 2]);
  });
  it("thins frames", () => {
    expect(thin([0, 1, 2, 3, 4], 2)).toEqual([0, 2, 4]);
  });
});

describe("qualityFor", () => {
  const q = [0.08, 0.3, 0.55, 0.8];
  const sizes = [2000, 3500, 6000, 12000];
  it("takes the top quality when it fits", () => expect(qualityFor(q, sizes, 15000)).toBe(0.8));
  it("gives up when even the lowest is too big", () => expect(qualityFor(q, sizes, 1500)).toBeNull());
  it("interpolates between probes", () => {
    const got = qualityFor(q, sizes, 4500)!;
    expect(got).toBeGreaterThan(0.3);
    expect(got).toBeLessThan(0.55);
  });
});
