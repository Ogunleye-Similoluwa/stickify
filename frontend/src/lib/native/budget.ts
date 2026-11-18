/** Pure sizing rules for the native encoder (kept separate so they can be unit-tested). */
export const LIMIT_ANIMATED = 500_000;
export const LIMIT_STATIC = 100_000;
/** Aim a little under the limit; frame sizes vary. */
export const TARGET_ANIMATED = 470_000;
export const MAX_FRAMES = 100;

export type Motion = "smooth" | "sharp";

/** Frames kept when the picture matters more than smooth motion: each frame gets twice the bytes. */
export const SHARP_FRAMES = 50;

/**
 * Smooth: up to 15 fps, never more than MAX_FRAMES frames in total.
 * Sharp: up to 10 fps and half as many frames, so each one can be much sharper.
 */
export function framesPerSecond(seconds: number, motion: Motion = "smooth"): number {
  const s = Math.max(seconds, 0.1);
  return motion === "sharp"
    ? Math.max(5, Math.min(10, Math.floor(SHARP_FRAMES / s)))
    : Math.max(6, Math.min(15, Math.floor(MAX_FRAMES / s)));
}

/** Container overhead per frame (ANMF header + chunk headers), roughly. */
export const FRAME_OVERHEAD = 40;

export function perFrameBudget(frames: number, target = TARGET_ANIMATED): number {
  return (target - 64) / frames - FRAME_OVERHEAD;
}

/** Evenly spaced sample of indices, used to estimate the size before encoding everything. */
export function sampleIndices(count: number, samples: number): number[] {
  if (count <= samples) return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length: samples }, (_, i) => Math.round((i * (count - 1)) / (samples - 1)));
}

/** Every n-th frame, for when even the lowest quality is too big. */
export function thin<T>(items: T[], keepEvery: number): T[] {
  return items.filter((_, i) => i % keepEvery === 0);
}

/**
 * Given average frame sizes measured at a few qualities (ascending), the highest quality
 * predicted to stay within the budget, or null if even the lowest is too big.
 */
export function qualityFor(qualities: number[], sizes: number[], budget: number): number | null {
  if (sizes[0] > budget) return null;
  for (let i = qualities.length - 1; i > 0; i--) {
    if (sizes[i] <= budget) return qualities[i];
    if (sizes[i - 1] <= budget) {
      const [q0, q1, s0, s1] = [qualities[i - 1], qualities[i], Math.log(sizes[i - 1]), Math.log(sizes[i])];
      const q = q0 + ((Math.log(budget) - s0) / (s1 - s0 || 1)) * (q1 - q0);
      return Math.min(q1, Math.max(q0, q - 0.02)); // a hair lower for safety
    }
  }
  return qualities[0];
}
