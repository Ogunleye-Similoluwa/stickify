import MP4Box from "mp4box";
import type { StickerFit } from "../api";
import { DEFAULT_FRAMING, placement, type Framing } from "../framing";

/** Draws a source frame into a 512x512 canvas, cropping (fill) or letterboxing (fit), honouring rotation. */
export function drawSticker(
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  fit: StickerFit,
  rotation = 0,
  framing: Framing = DEFAULT_FRAMING,
): void {
  const size = ctx.canvas.width;
  const turned = rotation === 90 || rotation === 270;
  const shownW = turned ? height : width;
  const shownH = turned ? width : height;
  const box = placement(shownW, shownH, fit, framing, size);
  const scale = box.w / shownW;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (-width * scale) / 2, (-height * scale) / 2, width * scale, height * scale);
  ctx.restore();
}

export interface FrameRequest {
  start: number;
  seconds: number;
  fps: number;
  fit: StickerFit;
  framing: Framing;
  /** Only the first frame at `start` (still stickers). */
  single?: boolean;
  isCancelled(): boolean;
}

export class UnsupportedSource extends Error {}

/* ---------------- MP4 / MOV (X videos and GIFs, most phone videos) ---------------- */

interface Mp4Sample {
  is_sync: boolean;
  cts: number;
  duration: number;
  timescale: number;
  data: Uint8Array;
}

function decoderDescription(file: any, trackId: number): Uint8Array | undefined {
  const trak = file.getTrackById(trackId);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8); // skip the box header
    }
  }
  return undefined;
}

function rotationOf(matrix: number[] | undefined): number {
  if (!matrix || matrix.length < 2) return 0;
  const a = matrix[0] / 65536;
  const b = matrix[1] / 65536;
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

function demux(buffer: ArrayBuffer): Promise<{ track: any; samples: Mp4Sample[]; description?: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile();
    let track: any = null;
    const samples: Mp4Sample[] = [];
    file.onError = (e: unknown) => reject(new UnsupportedSource(String(e)));
    file.onReady = (info: any) => {
      track = info.videoTracks?.[0];
      if (!track) return reject(new UnsupportedSource("No video track"));
      file.setExtractionOptions(track.id, null, { nbSamples: Infinity });
      file.start();
    };
    file.onSamples = (_id: number, _user: unknown, batch: Mp4Sample[]) => samples.push(...batch);
    const copy = buffer.slice(0) as ArrayBuffer & { fileStart: number };
    copy.fileStart = 0;
    file.appendBuffer(copy);
    file.flush();
    if (!track) return reject(new UnsupportedSource("Not an MP4 file"));
    resolve({ track, samples, description: decoderDescription(file, track.id) });
  });
}

export async function mp4Frames(buffer: ArrayBuffer, req: FrameRequest): Promise<ImageBitmap[]> {
  if (typeof VideoDecoder === "undefined") throw new UnsupportedSource("No WebCodecs");
  const { track, samples, description } = await demux(buffer);
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.video.width,
    codedHeight: track.video.height,
    description,
  };
  if (!(await VideoDecoder.isConfigSupported(config)).supported) throw new UnsupportedSource("Codec not supported");
  const rotation = rotationOf(track.matrix);

  const end = req.single ? req.start + 1 / 30 : req.start + req.seconds;
  const step = 1 / req.fps;
  const canvas = new OffscreenCanvas(512, 512);
  const ctx = canvas.getContext("2d")!;
  const frames: ImageBitmap[] = [];
  let target = req.start;
  let error: unknown = null;

  const decoder = new VideoDecoder({
    output: (frame) => {
      const t = frame.timestamp / 1e6;
      const wanted = req.single ? frames.length === 0 && t + 0.02 >= req.start : t + step / 2 >= target && t < end && t + 0.001 >= req.start - step / 2;
      if (wanted) {
        drawSticker(ctx, frame, frame.displayWidth, frame.displayHeight, req.fit, rotation, req.framing);
        frames.push(canvas.transferToImageBitmap());
        target += step;
        while (target <= t) target += step;
      }
      frame.close();
    },
    error: (e) => {
      error = e;
    },
  });
  decoder.configure(config);

  // Start from the last keyframe at or before the start time.
  const time = (s: Mp4Sample) => s.cts / s.timescale;
  let first = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].is_sync && time(samples[i]) <= req.start + 0.001) first = i;
    if (time(samples[i]) > req.start) break;
  }
  for (let i = first; i < samples.length; i++) {
    const s = samples[i];
    if (time(s) > end + 0.5) break; // a little extra so reordered frames still come out
    decoder.decode(new EncodedVideoChunk({
      type: s.is_sync ? "key" : "delta",
      timestamp: (1e6 * s.cts) / s.timescale,
      duration: (1e6 * s.duration) / s.timescale,
      data: s.data,
    }));
    if (req.isCancelled()) break;
  }
  await decoder.flush().catch((e) => (error = e));
  decoder.close();
  if (error) throw new UnsupportedSource(String(error));
  if (frames.length === 0) throw new UnsupportedSource("No frames decoded");
  return frames;
}

/* ---------------- Animated GIF / WebP uploads ---------------- */

interface DecodedImage {
  image: VideoFrame;
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<DecodedImage>;
  close(): void;
}
type ImageDecoderCtor = new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike;

export async function animatedImageFrames(buffer: ArrayBuffer, type: string, req: FrameRequest): Promise<ImageBitmap[]> {
  const Decoder = (globalThis as unknown as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  if (!Decoder) throw new UnsupportedSource("No ImageDecoder");
  const decoder = new Decoder({ data: buffer, type });
  await decoder.tracks.ready;
  const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
  const canvas = new OffscreenCanvas(512, 512);
  const ctx = canvas.getContext("2d")!;
  const frames: ImageBitmap[] = [];
  const end = req.start + req.seconds;
  const step = 1 / req.fps;
  let target = req.start;
  let t = 0;
  try {
    for (let i = 0; i < count && t < end; i++) {
      if (req.isCancelled()) break;
      const { image } = await decoder.decode({ frameIndex: i });
      const duration = (image.duration ?? 100_000) / 1e6;
      // Emit this frame for every output slot it covers.
      while (target < t + duration && target < end && (!req.single || frames.length === 0)) {
        if (target >= req.start - 1e-6) {
          drawSticker(ctx, image, image.displayWidth, image.displayHeight, req.fit, 0, req.framing);
          frames.push(canvas.transferToImageBitmap());
        }
        target += step;
      }
      image.close();
      t += duration;
      if (req.single && frames.length) break;
    }
  } finally {
    decoder.close();
  }
  if (frames.length === 0) throw new UnsupportedSource("No frames decoded");
  return frames;
}

/* ---------------- Photos ---------------- */

export async function photoFrame(blob: Blob, fit: StickerFit, framing: Framing): Promise<ImageBitmap> {
  const image = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(512, 512);
  drawSticker(canvas.getContext("2d")!, image, image.width, image.height, fit, 0, framing);
  image.close();
  return canvas.transferToImageBitmap();
}
