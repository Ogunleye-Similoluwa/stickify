import { describe, expect, it } from "vitest";
import { MAX_SECONDS, MIN_SECONDS, initialSelection, moveEnd, moveStart, timingFor } from "./trim";

describe("initialSelection", () => {
  it("selects the whole clip when it's short", () => {
    expect(initialSelection(3.04)).toEqual({ start: 0, end: 3 });
  });

  it("selects the first 10 seconds of a long clip", () => {
    expect(initialSelection(42)).toEqual({ start: 0, end: MAX_SECONDS });
  });
});

describe("moveStart", () => {
  it("keeps the end when the selection stays valid", () => {
    expect(moveStart({ start: 0, end: 10 }, 5, 14, "animated")).toEqual({ start: 5, end: 10 });
  });

  it("pushes the end so the clip is never shorter than the minimum", () => {
    expect(moveStart({ start: 0, end: 3 }, 2.9, 14, "animated")).toEqual({ start: 2.9, end: 2.9 + MIN_SECONDS });
  });

  it("never lets the start reach the very end of the clip", () => {
    expect(moveStart({ start: 0, end: 4 }, 4, 4, "animated").start).toBe(4 - MIN_SECONDS);
  });

  it("moves freely in still mode", () => {
    expect(moveStart({ start: 0, end: 4 }, 4, 4, "static")).toEqual({ start: 4, end: 4 });
  });
});

describe("moveEnd", () => {
  it("pulls the start along to stay within the 10 second limit", () => {
    expect(moveEnd({ start: 0, end: 10 }, 14, 14)).toEqual({ start: 4, end: 14 });
  });

  it("pulls the start back to keep the minimum length", () => {
    expect(moveEnd({ start: 2, end: 6 }, 2.2, 14)).toEqual({ start: 1.7, end: 2.2 });
  });

  it("never goes below zero", () => {
    expect(moveEnd({ start: 0, end: 6 }, 0, 14)).toEqual({ start: 0, end: MIN_SECONDS });
  });
});

describe("timingFor", () => {
  it("sends start and length for animated stickers", () => {
    expect(timingFor({ start: 2, end: 4.5 }, "animated")).toEqual({ start: 2, seconds: 2.5 });
  });

  it("sends only the frame for still stickers", () => {
    expect(timingFor({ start: 3, end: 8 }, "static")).toEqual({ start: 3 });
  });

  it("sends nothing when the clip length is unknown", () => {
    expect(timingFor(null, "animated")).toEqual({});
  });
});
