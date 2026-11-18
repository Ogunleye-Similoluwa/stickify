import { describe, expect, it } from "vitest";
import { animatedArgs, clampSeconds, firstStep, prepareArgs, sizeFilter, staticArgs, stepsToSkip } from "./plan";

describe("conversion plan", () => {
  it("starts long clips lower on the ladder", () => {
    expect(firstStep(3)).toBe(0);
    expect(firstStep(4)).toBe(0);
    expect(firstStep(9.3)).toBe(2);
  });

  it("skips further when far over the limit", () => {
    expect(stepsToSkip(510_000, 500_000)).toBe(1);
    expect(stepsToSkip(900_000, 500_000)).toBe(2);
    expect(stepsToSkip(1_500_000, 500_000)).toBe(3);
  });

  it("clamps the length to WhatsApp's limits", () => {
    expect(clampSeconds(null)).toBe(10);
    expect(clampSeconds(42)).toBe(10);
    expect(clampSeconds(0.1)).toBe(0.5);
    expect(clampSeconds(3.4)).toBe(3.4);
  });

  it("crops for fill and pads for fit", () => {
    expect(sizeFilter("fill")).toContain("crop=512:512");
    expect(sizeFilter("fit")).toContain("pad=512:512");
  });

  it("builds ffmpeg arguments like the server", () => {
    const opts = { mode: "animated" as const, fit: "fit" as const, start: 2, seconds: 3 };
    expect(prepareArgs("in", "pre.mkv", opts)).toEqual(expect.arrayContaining(["-ss", "2.00", "-t", "3.00", "ffv1"]));
    expect(prepareArgs("in", "pre.mkv", { ...opts, start: 0 })).not.toContain("-ss");
    expect(animatedArgs("pre.mkv", "out.webp", [15, 75])).not.toContain("-vf");
    expect(animatedArgs("pre.mkv", "out.webp", [10, 35])).toEqual(expect.arrayContaining(["-vf", "fps=10", "-q:v", "35"]));
    expect(staticArgs("in", "out.webp", opts, 90, true)).not.toContain("-ss");
    expect(staticArgs("in", "out.webp", opts, 90, false)).toContain("-ss");
  });
});
