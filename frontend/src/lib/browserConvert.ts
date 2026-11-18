import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { Sticker } from "./api";
import {
  ANIMATED_STEPS, MAX_ANIMATED_BYTES, MAX_STATIC_BYTES, STATIC_QUALITIES, animatedArgs, clampSeconds,
  firstStep, prepareArgs, staticArgs, stepsToSkip, type PlanOptions,
} from "./plan";

/**
 * Makes stickers on the visitor's own device with ffmpeg compiled to WebAssembly.
 * This is far faster than the free server and needs no account or card.
 * The converter (~30 MB) is downloaded once and then cached by the browser.
 */
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
const STEP_TIMEOUT_MS = 120_000;

/** A sticker problem the user should see as-is (not a reason to fall back to the server). */
export class StickerError extends Error {}

let loading: Promise<FFmpeg> | null = null;
let ready = false;
let current: FFmpeg | null = null;
let busy = false;
/** Downloaded once; reused if the converter is restarted after a cancel. */
let coreUrls: Promise<{ coreURL: string; wasmURL: string }> | null = null;

/** Thrown when a conversion was stopped because newer settings replaced it. */
export class CancelledError extends Error {}

export function canConvertInBrowser(): boolean {
  return typeof WebAssembly === "object" && typeof Worker !== "undefined";
}

export const converterReady = (): boolean => ready;

function load(): Promise<FFmpeg> {
  loading ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    coreUrls ??= Promise.all([
      toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    ]).then(([coreURL, wasmURL]) => ({ coreURL, wasmURL }));
    const ffmpeg = new FFmpeg();
    await ffmpeg.load(await coreUrls);
    ready = true;
    current = ffmpeg;
    return ffmpeg;
  })().catch((err) => {
    loading = null;
    coreUrls = null;
    throw err;
  });
  return loading;
}

/** Start downloading the converter in the background, e.g. once a clip is chosen. */
export function warmUpConverter(): void {
  if (canConvertInBrowser()) load().catch(() => {});
}

function inputName(type: string): string {
  if (type.includes("gif")) return "input.gif";
  if (type.includes("webp")) return "input.webp";
  if (type.includes("png")) return "input.png";
  if (type.includes("jpeg") || type.includes("jpg")) return "input.jpg";
  if (type.includes("webm")) return "input.webm";
  if (type.includes("quicktime")) return "input.mov";
  return "input.mp4";
}

async function run(ffmpeg: FFmpeg, args: string[]): Promise<void> {
  const code = await ffmpeg.exec(args, STEP_TIMEOUT_MS);
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
}

async function sizeOf(ffmpeg: FFmpeg, name: string): Promise<Uint8Array | null> {
  try {
    const data = await ffmpeg.readFile(name);
    return typeof data === "string" ? null : data;
  } catch {
    return null;
  }
}

async function cleanUp(ffmpeg: FFmpeg, names: string[]): Promise<void> {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      // missing file, or the converter was stopped
    }
  }
}

let queue: Promise<unknown> = Promise.resolve();
let cancelled = false;

/**
 * Stops the conversion that's running (ffmpeg.wasm can't be interrupted any other way),
 * so newer settings don't have to wait for it. The converter restarts in well under a second.
 */
export function cancelConversion(): void {
  if (!busy || !current) return;
  cancelled = true;
  current.terminate();
  current = null;
  loading = null;
}

/** Converts one file at a time; ffmpeg.wasm can only run a single command at once. */
export function convertInBrowser(source: Blob, opts: PlanOptions, stillImage: boolean): Promise<Sticker> {
  const job = queue.then(() => convert(source, opts, stillImage));
  queue = job.catch(() => {});
  return job;
}

async function convert(source: Blob, opts: PlanOptions, stillImage: boolean): Promise<Sticker> {
  const ffmpeg = await load();
  busy = true;
  cancelled = false;
  try {
    return await convertWith(ffmpeg, source, opts, stillImage);
  } catch (err) {
    if (cancelled) throw new CancelledError("Replaced by newer settings");
    throw err;
  } finally {
    busy = false;
  }
}

async function convertWith(ffmpeg: FFmpeg, source: Blob, opts: PlanOptions, stillImage: boolean): Promise<Sticker> {
  const input = inputName(source.type);
  const files = [input, "prepared.mkv", "sticker.webp"];
  await ffmpeg.writeFile(input, new Uint8Array(await source.arrayBuffer()));
  try {
    if (stillImage || opts.mode === "static") {
      for (const quality of STATIC_QUALITIES) {
        await run(ffmpeg, staticArgs(input, "sticker.webp", opts, quality, stillImage));
        const out = await sizeOf(ffmpeg, "sticker.webp");
        if (out && out.length > 0 && out.length <= MAX_STATIC_BYTES) return asSticker(out, "static");
      }
      throw new StickerError("Couldn't shrink this image under WhatsApp's 100 KB limit.");
    }

    await run(ffmpeg, prepareArgs(input, "prepared.mkv", opts));
    let index = firstStep(clampSeconds(opts.seconds));
    while (index < ANIMATED_STEPS.length) {
      await run(ffmpeg, animatedArgs("prepared.mkv", "sticker.webp", ANIMATED_STEPS[index]));
      const out = await sizeOf(ffmpeg, "sticker.webp");
      const size = out?.length ?? -1;
      if (out && size > 0 && size <= MAX_ANIMATED_BYTES) return asSticker(out, "animated");
      index += stepsToSkip(size, MAX_ANIMATED_BYTES);
    }
    throw new StickerError("This clip is too detailed to fit WhatsApp's 500 KB sticker limit. Try a shorter clip.");
  } finally {
    await cleanUp(ffmpeg, files);
  }
}

function asSticker(data: Uint8Array, mode: Sticker["mode"]): Sticker {
  // Copy into a plain ArrayBuffer so the Blob doesn't keep the wasm memory alive.
  return { blob: new Blob([data.slice().buffer as ArrayBuffer], { type: "image/webp" }), mode };
}
