import type { StickerFit } from "./api";

/**
 * Where the picture sits inside the 512x512 sticker. The user can zoom in and drag (pan)
 * to choose the part they want; the preview, the native encoder and ffmpeg all use this.
 */
export interface Framing {
  /** 1 = the shape's natural size (whole picture for "fit", covering the square for "fill"). */
  zoom: number;
  /** 0..1: which part shows when the picture is wider/taller than the square (0.5 = centre). */
  panX: number;
  panY: number;
}

export const DEFAULT_FRAMING: Framing = { zoom: 1, panX: 0.5, panY: 0.5 };
export const MAX_ZOOM = 4;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The picture's position and size inside a `size` x `size` square. */
export function placement(srcW: number, srcH: number, fit: StickerFit, framing: Framing = DEFAULT_FRAMING, size = 512): Box {
  const zoom = clamp(framing.zoom, 1, MAX_ZOOM);
  let w: number;
  let h: number;
  if (fit === "stretch") {
    w = size * zoom;
    h = size * zoom;
  } else {
    const base = fit === "fit" ? Math.min(size / srcW, size / srcH) : Math.max(size / srcW, size / srcH);
    w = srcW * base * zoom;
    h = srcH * base * zoom;
  }
  const x = (w > size ? (size - w) * clamp(framing.panX, 0, 1) : (size - w) / 2) + 0; // + 0 avoids -0
  const y = (h > size ? (size - h) * clamp(framing.panY, 0, 1) : (size - h) / 2) + 0;
  return { x, y, w, h };
}

/** Moves the framing by a drag of (dx, dy) sticker pixels. */
export function pan(framing: Framing, box: Box, dx: number, dy: number, size = 512): Framing {
  const overX = box.w - size;
  const overY = box.h - size;
  return {
    ...framing,
    panX: overX > 0 ? clamp(framing.panX - dx / overX, 0, 1) : framing.panX,
    panY: overY > 0 ? clamp(framing.panY - dy / overY, 0, 1) : framing.panY,
  };
}

export const canPan = (box: Box, size = 512) => box.w > size + 0.5 || box.h > size + 0.5;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * The same placement as an ffmpeg filter: scale, crop what overflows, pad what's left
 * with transparency.
 */
export function framingFilter(srcW: number, srcH: number, fit: StickerFit, framing: Framing, size = 512): string {
  const box = placement(srcW, srcH, fit, framing, size);
  const w = even(box.w);
  const h = even(box.h);
  const cropW = Math.min(w, size);
  const cropH = Math.min(h, size);
  const cropX = Math.round(Math.max(0, -box.x));
  const cropY = Math.round(Math.max(0, -box.y));
  const padX = Math.round(Math.max(0, box.x));
  const padY = Math.round(Math.max(0, box.y));
  return [
    `scale=${w}:${h}:flags=lanczos`,
    "format=rgba",
    `crop=${cropW}:${cropH}:${Math.min(cropX, w - cropW)}:${Math.min(cropY, h - cropH)}`,
    `pad=${size}:${size}:${Math.min(padX, size - cropW)}:${Math.min(padY, size - cropH)}:color=0x00000000`,
  ].join(",");
}
