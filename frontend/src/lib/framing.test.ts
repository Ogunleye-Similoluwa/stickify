import { describe, expect, it } from "vitest";
import { DEFAULT_FRAMING, canPan, framingFilter, pan, placement } from "./framing";

describe("placement", () => {
  it("shows the whole wide video at zoom 1 with fit", () => {
    expect(placement(640, 360, "fit")).toEqual({ x: 0, y: 112, w: 512, h: 288 });
  });
  it("covers the square with fill, centred", () => {
    const box = placement(640, 360, "fill");
    expect(box.h).toBe(512);
    expect(box.w).toBeCloseTo(910.2, 1);
    expect(box.x).toBeCloseTo((512 - box.w) / 2, 5);
  });
  it("pans to the left and right edges", () => {
    expect(placement(640, 360, "fill", { zoom: 1, panX: 0, panY: 0.5 }).x).toBe(0);
    const right = placement(640, 360, "fill", { zoom: 1, panX: 1, panY: 0.5 });
    expect(right.x + right.w).toBeCloseTo(512, 5);
  });
  it("zooms in", () => {
    const box = placement(640, 360, "fit", { zoom: 2, panX: 0.5, panY: 0.5 });
    expect(box.w).toBe(1024);
    expect(box.h).toBe(576);
  });
});

describe("pan", () => {
  it("moves the picture with the drag and stops at the edges", () => {
    const box = placement(640, 360, "fill");
    const moved = pan(DEFAULT_FRAMING, box, 100, 0);
    expect(moved.panX).toBeLessThan(0.5);
    expect(pan(DEFAULT_FRAMING, box, 10_000, 0).panX).toBe(0);
    expect(pan(DEFAULT_FRAMING, box, 0, 100).panY).toBe(0.5); // nothing to pan vertically
  });
  it("knows when there's anything to pan", () => {
    expect(canPan(placement(640, 360, "fit"))).toBe(false);
    expect(canPan(placement(640, 360, "fill"))).toBe(true);
  });
});

describe("framingFilter", () => {
  it("pads a whole wide video", () => {
    expect(framingFilter(640, 360, "fit", DEFAULT_FRAMING)).toBe(
      "scale=512:288:flags=lanczos,format=rgba,crop=512:288:0:0,pad=512:512:0:112:color=0x00000000");
  });
  it("crops a filled one from the chosen side", () => {
    expect(framingFilter(640, 360, "fill", { zoom: 1, panX: 0, panY: 0.5 })).toBe(
      "scale=910:512:flags=lanczos,format=rgba,crop=512:512:0:0,pad=512:512:0:0:color=0x00000000");
    expect(framingFilter(640, 360, "fill", { zoom: 1, panX: 1, panY: 0.5 })).toContain("crop=512:512:398:0");
  });
});
