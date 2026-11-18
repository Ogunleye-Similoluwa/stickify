import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { placement } from "../framing";
import { sourceFrames, type NativeOptions } from "./index";

/**
 * Makes a short looping MP4 of the clip. WhatsApp keeps a shared WebP as a still photo,
 * but it plays a shared MP4, and short ones can be sent as a GIF.
 */
const FPS = 15;
const CODEC = "avc1.42001f"; // H.264 baseline: plays everywhere, incl. WhatsApp

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

let support: Promise<boolean> | null = null;
export function gifVideoSupported(): Promise<boolean> {
  support ??= (async () => {
    try {
      if (typeof VideoEncoder === "undefined") return false;
      const res = await VideoEncoder.isConfigSupported({ codec: CODEC, width: 512, height: 512, bitrate: 1_500_000, framerate: FPS });
      return !!res.supported;
    } catch {
      return false;
    }
  })();
  return support;
}

export async function makeGifVideo(
  blob: Blob,
  opts: NativeOptions,
  sourceSize: { width: number; height: number } | null,
): Promise<Blob> {
  const frames = await sourceFrames(blob, { ...opts, mode: "animated" }, false, FPS, () => false);
  try {
    // For the whole picture, drop the transparent bands and keep the video's own shape.
    const whole = opts.fit === "fit" && opts.framing.zoom === 1 && sourceSize;
    const box = whole ? placement(sourceSize.width, sourceSize.height, "fit", opts.framing) : { x: 0, y: 0, w: 512, h: 512 };
    const width = even(box.w);
    const height = even(box.h);

    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height }, fastStart: "in-memory" });
    let failure: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => (failure = e),
    });
    encoder.configure({ codec: CODEC, width, height, bitrate: 1_500_000, framerate: FPS });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    const step = 1e6 / FPS;
    frames.forEach((bitmap, i) => {
      ctx.fillStyle = "#000"; // MP4 has no transparency
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, width, height);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * step), duration: Math.round(step) });
      encoder.encode(frame, { keyFrame: i % 30 === 0 });
      frame.close();
    });
    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    frames.forEach((b) => b.close());
  }
}
