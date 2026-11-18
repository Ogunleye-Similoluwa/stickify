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

export function canConvertInBrowser(): boolean {
  return typeof WebAssembly === "object" && typeof Worker !== "undefined";
}

export const converterReady = (): boolean => ready;

function load(): Promise<FFmpeg> {
  loading ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ready = true;
    return ffmpeg;
  })().catch((err) => {
    loading = null;
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
  for (const name of names) await ffmpeg.deleteFile(name).catch(() => {});
}

let queue: Promise<unknown> = Promise.resolve();

/** Converts one file at a time; ffmpeg.wasm can only run a single command at once. */
export function convertInBrowser(source: Blob, opts: PlanOptions, stillImage: boolean): Promise<Sticker> {
  const job = queue.then(() => convert(source, opts, stillImage));
  queue = job.catch(() => {});
  return job;
}

async function convert(source: Blob, opts: PlanOptions, stillImage: boolean): Promise<Sticker> {
  const ffmpeg = await load();
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
