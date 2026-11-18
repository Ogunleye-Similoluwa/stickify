import type { StickerFit } from "./api";
import { DEFAULT_FRAMING, framingFilter, type Framing } from "./framing";
import type { StickerMode } from "./trim";
import { MAX_SECONDS, MIN_SECONDS } from "./trim";

/**
 * The conversion recipe, shared by the in-browser converter. It mirrors the server's
 * FfmpegConverter: one resize pass to a small 512x512 clip, then quality attempts until
 * the sticker fits WhatsApp's limits.
 */
export const STICKER_SIZE = 512;
export const MAX_ANIMATED_BYTES = 500_000;
export const MAX_STATIC_BYTES = 100_000;
/** libwebp effort; 6 is ~10x slower than 4 for files only ~2% smaller. */
export const COMPRESSION_LEVEL = 4;

/** Animated attempts, best first: [frames per second, WebP quality]. */
export const ANIMATED_STEPS: ReadonlyArray<readonly [number, number]> = [
  [15, 75], [15, 60], [15, 45], [12, 40], [10, 35], [10, 25], [8, 20], [6, 12],
];
export const STATIC_QUALITIES = [90, 75, 60, 45, 30, 15];
export const LONG_CLIP_SECONDS = 4;

export interface PlanOptions {
  mode: StickerMode;
  fit: StickerFit;
  start: number;
  /** null means "the whole clip, up to the maximum". */
  seconds: number | null;
  framing?: Framing;
  /** The picture's size, needed to apply zoom and pan; without it the picture is centred. */
  sourceSize?: { width: number; height: number } | null;
}

/** The resize filter for these options: zoom/pan when the source size is known, otherwise centred. */
export function filterFor(opts: PlanOptions): string {
  const framing = opts.framing ?? DEFAULT_FRAMING;
  if (opts.sourceSize && opts.sourceSize.width > 0 && opts.sourceSize.height > 0) {
    return framingFilter(opts.sourceSize.width, opts.sourceSize.height, opts.fit, framing, STICKER_SIZE);
  }
  return sizeFilter(opts.fit);
}

/** Clips this long almost never fit at top quality, so they start a little lower. */
export const firstStep = (seconds: number): number => (seconds > LONG_CLIP_SECONDS ? 2 : 0);

/** Jump further down the ladder when a result is far over the limit, to save attempts. */
export function stepsToSkip(size: number, limit: number): number {
  const ratio = size / limit;
  if (ratio > 2.5) return 3;
  if (ratio > 1.6) return 2;
  return 1;
}

export function clampSeconds(seconds: number | null): number {
  const requested = seconds == null || Number.isNaN(seconds) ? MAX_SECONDS : seconds;
  return Math.min(Math.max(requested, MIN_SECONDS), MAX_SECONDS);
}

export function sizeFilter(fit: StickerFit): string {
  const s = STICKER_SIZE;
  return fit === "fit"
    ? `scale=${s}:${s}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=${s}:${s}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
    : `scale=${s}:${s}:force_original_aspect_ratio=increase:flags=lanczos,crop=${s}:${s},format=rgba`;
}

const fixed = (n: number) => n.toFixed(2);

function seekArgs(start: number, input: string): string[] {
  return [...(start > 0 ? ["-ss", fixed(start)] : []), "-i", input];
}

/** Decode, trim and resize once into a lossless 512x512 clip. */
export function prepareArgs(input: string, output: string, opts: PlanOptions): string[] {
  return [
    ...seekArgs(opts.start, input),
    "-t", fixed(clampSeconds(opts.seconds)),
    "-vf", `fps=${ANIMATED_STEPS[0][0]},${filterFor(opts)}`,
    "-c:v", "ffv1", "-an", output,
  ];
}

export function animatedArgs(prepared: string, output: string, step: readonly [number, number]): string[] {
  const [fps, quality] = step;
  return [
    "-i", prepared,
    ...(fps !== ANIMATED_STEPS[0][0] ? ["-vf", `fps=${fps}`] : []),
    "-c:v", "libwebp_anim", "-lossless", "0", "-q:v", String(quality),
    "-compression_level", String(COMPRESSION_LEVEL), "-loop", "0", "-an", output,
  ];
}

export function staticArgs(input: string, output: string, opts: PlanOptions, quality: number, isPhoto: boolean): string[] {
  return [
    ...seekArgs(isPhoto ? 0 : opts.start, input),
    "-frames:v", "1",
    "-vf", filterFor(opts),
    "-c:v", "libwebp", "-q:v", String(quality),
    "-compression_level", String(COMPRESSION_LEVEL), "-an", output,
  ];
}
