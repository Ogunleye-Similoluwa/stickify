import type { Sticker, StickerFit } from "../api";
import type { StickerMode } from "../trim";
import { LIMIT_ANIMATED, LIMIT_STATIC, framesPerSecond, perFrameBudget, qualityFor, sampleIndices, thin } from "./budget";
import { UnsupportedSource, animatedImageFrames, mp4Frames, photoFrame, type FrameRequest } from "./decode";
import { encodeAll } from "./encoderPool";
import { frameDurations, muxAnimatedWebp, parseWebp } from "./webpMux";

/**
 * The fastest converter: decodes with the device's hardware video decoder (WebCodecs),
 * encodes frames with the browser's own WebP encoder on every CPU core, and assembles
 * the animated sticker in JavaScript. Used where supported (Chrome, Edge, Android);
 * other browsers fall back to ffmpeg.wasm.
 */
export { UnsupportedSource };

export class NativeStickerError extends Error {}

let support: Promise<boolean> | null = null;

export function nativeSupported(): Promise<boolean> {
  support ??= (async () => {
    try {
      if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined" || typeof createImageBitmap === "undefined") return false;
      const canvas = new OffscreenCanvas(4, 4);
      canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
      const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.5 });
      return blob.type === "image/webp";
    } catch {
      return false;
    }
  })();
  return support;
}

export interface NativeOptions {
  mode: StickerMode;
  fit: StickerFit;
  start: number;
  seconds: number;
}

const isVideo = (type: string) => type.startsWith("video/") || type === "";
const isMp4Family = (type: string) => /mp4|quicktime|m4v/.test(type) || type === "";
const isAnimatedImage = (type: string) => type === "image/gif" || type === "image/webp";

async function sourceFrames(blob: Blob, opts: NativeOptions, still: boolean, fps: number, isCancelled: () => boolean): Promise<ImageBitmap[]> {
  const type = blob.type;
  if (still && !isVideo(type) && !isAnimatedImage(type)) return [await photoFrame(blob, opts.fit)];
  const req: FrameRequest = { start: opts.start, seconds: opts.seconds, fps, fit: opts.fit, single: opts.mode === "static", isCancelled };
  const buffer = await blob.arrayBuffer();
  if (isAnimatedImage(type)) return animatedImageFrames(buffer, type, req);
  if (isVideo(type) && isMp4Family(type)) return mp4Frames(buffer, req);
  if (type.startsWith("image/")) return [await photoFrame(blob, opts.fit)];
  throw new UnsupportedSource(`Can't decode ${type} natively`);
}

const totalSize = (frames: Uint8Array[]) => frames.reduce((n, f) => n + f.length, 0);

/** Qualities tried on a few sample frames, all at once, to predict the right one. */
const PROBE_QUALITIES = [0.08, 0.3, 0.55, 0.8];

/**
 * Picks the highest quality whose predicted frame size fits the budget, from one parallel round
 * of sample encodes (frame size grows roughly exponentially with quality, so interpolate in log space).
 */
async function pickQuality(bitmaps: ImageBitmap[], budget: number): Promise<number | null> {
  const sample = sampleIndices(bitmaps.length, 4).map((i) => bitmaps[i]);
  const sizes = await Promise.all(PROBE_QUALITIES.map(async (q) => totalSize(await encodeAll(sample, q)) / sample.length));
  return qualityFor(PROBE_QUALITIES, sizes, budget);
}

/** Stage timings of the last conversion, for diagnostics (window.__stickifyTimings). */
let t0 = 0;
let timings: Record<string, number> = {};
function mark(stage: string) {
  timings[stage] = Math.round(performance.now() - t0);
  (globalThis as unknown as { __stickifyTimings?: Record<string, number> }).__stickifyTimings = timings;
}

export async function convertNative(blob: Blob, opts: NativeOptions, still: boolean, isCancelled: () => boolean): Promise<Sticker> {
  t0 = performance.now();
  timings = {};
  const check = () => {
    if (isCancelled()) throw new DOMException("Cancelled", "AbortError");
  };
  const fps = framesPerSecond(opts.seconds);
  let bitmaps = await sourceFrames(blob, opts, still, fps, isCancelled);
  mark("decode");
  check();
  try {
    if (still || opts.mode === "static" || bitmaps.length === 1) {
      const frame = [bitmaps[0]];
      for (const q of [0.9, 0.75, 0.6, 0.45, 0.3, 0.15]) {
        const [data] = await encodeAll(frame, q);
        if (data.length <= LIMIT_STATIC) return { blob: new Blob([data.slice().buffer as ArrayBuffer], { type: "image/webp" }), mode: "static" };
      }
      throw new NativeStickerError("Couldn't shrink this image under WhatsApp's 100 KB limit.");
    }

    let rate = fps;
    for (let attempt = 0; attempt < 4; attempt++) {
      let quality = await pickQuality(bitmaps, perFrameBudget(bitmaps.length));
      mark("pickQuality");
      check();
      if (quality == null) {
        // Too much detail even at the lowest quality: keep half the frames and try again.
        const kept = thin(bitmaps, 2);
        bitmaps.filter((bm) => !kept.includes(bm)).forEach((bm) => bm.close());
        bitmaps = kept;
        rate /= 2;
        continue;
      }
      for (let tries = 0; tries < 3; tries++) {
        const encoded = await encodeAll(bitmaps, quality);
        mark("encode");
        check();
        // Spread the frames evenly over the chosen length, even if the source had a few gaps.
        const shownFps = Math.min(rate, encoded.length / Math.max(opts.seconds, 0.1)) || rate;
        const out = muxAnimatedWebp(encoded.map(parseWebp), frameDurations(encoded.length, shownFps), 512, 512);
        mark("mux");
        if (out.length <= LIMIT_ANIMATED) return { blob: new Blob([out.buffer as ArrayBuffer], { type: "image/webp" }), mode: "animated" };
        quality = Math.max(0.02, quality - 0.08);
      }
    }
    throw new NativeStickerError("This clip is too detailed to fit WhatsApp's 500 KB sticker limit. Try a shorter clip.");
  } finally {
    bitmaps.forEach((b) => b.close());
  }
}
