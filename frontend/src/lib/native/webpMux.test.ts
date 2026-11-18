import { describe, expect, it } from "vitest";
import { frameDurations, muxAnimatedWebp, parseWebp } from "./webpMux";

function chunk(id: string, payload: number[]): number[] {
  const size = payload.length;
  const bytes = [...id].map((c) => c.charCodeAt(0));
  bytes.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff, ...payload);
  if (size & 1) bytes.push(0);
  return bytes;
}
function webp(...chunks: number[][]): Uint8Array {
  const body = [..."WEBP"].map((c) => c.charCodeAt(0)).concat(...chunks);
  const size = body.length;
  return new Uint8Array([..."RIFF"].map((c) => c.charCodeAt(0)).concat([size & 0xff, (size >> 8) & 0xff, 0, 0], body));
}
const fourCC = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4));
const u32 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);
const u24 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);

describe("parseWebp", () => {
  it("keeps image chunks and spots alpha", () => {
    const simple = parseWebp(webp(chunk("VP8 ", [1, 2, 3])));
    expect(simple.chunks).toHaveLength(1);
    expect(simple.hasAlpha).toBe(false);
    const withAlpha = parseWebp(webp(chunk("VP8X", new Array(10).fill(0)), chunk("ALPH", [9]), chunk("VP8 ", [1, 2])));
    expect(withAlpha.chunks.map((c) => fourCC(c, 0))).toEqual(["ALPH", "VP8 "]);
    expect(withAlpha.hasAlpha).toBe(true);
  });
  it("rejects things that aren't WebP", () => {
    expect(() => parseWebp(new Uint8Array(30))).toThrow();
  });
});

describe("frameDurations", () => {
  it("adds up to the clip length", () => {
    const d = frameDurations(100, 10);
    expect(d.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(frameDurations(150, 15).reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(Math.min(...frameDurations(150, 15))).toBeGreaterThanOrEqual(8);
  });
});

describe("muxAnimatedWebp", () => {
  it("writes a valid animated WebP container", () => {
    const frames = [parseWebp(webp(chunk("VP8 ", [1, 2, 3]))), parseWebp(webp(chunk("ALPH", [7]), chunk("VP8 ", [4, 5])))];
    const out = muxAnimatedWebp(frames, [100, 250], 512, 512);
    expect(fourCC(out, 0)).toBe("RIFF");
    expect(u32(out, 4)).toBe(out.length - 8);
    expect(fourCC(out, 8)).toBe("WEBP");
    expect(fourCC(out, 12)).toBe("VP8X");
    expect(out[20] & 0x12).toBe(0x12); // animation + alpha
    expect(u24(out, 24) + 1).toBe(512);
    expect(fourCC(out, 30)).toBe("ANIM");
    // first frame
    let at = 30 + 8 + 6;
    expect(fourCC(out, at)).toBe("ANMF");
    expect(u24(out, at + 8 + 12)).toBe(100);
    const size = u32(out, at + 4);
    at += 8 + size + (size & 1);
    expect(fourCC(out, at)).toBe("ANMF");
    expect(u24(out, at + 8 + 12)).toBe(250);
    expect(fourCC(out, at + 8 + 16)).toBe("ALPH");
  });
});
