/**
 * Builds an animated WebP from separately encoded WebP frames (as produced by the browser's
 * canvas encoder). Each frame covers the whole canvas and replaces the previous one.
 * Format reference: https://developers.google.com/speed/webp/docs/riff_container
 */
const FRAME_CHUNKS = new Set(["ALPH", "VP8 ", "VP8L"]);

export interface ParsedFrame {
  chunks: Uint8Array[];
  hasAlpha: boolean;
}

const fourCC = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** Pulls the image chunks (ALPH, VP8, VP8L) out of a still WebP file. */
export function parseWebp(file: Uint8Array): ParsedFrame {
  if (file.length < 20 || fourCC(file, 0) !== "RIFF" || fourCC(file, 8) !== "WEBP") {
    throw new Error("Not a WebP image");
  }
  const chunks: Uint8Array[] = [];
  let hasAlpha = false;
  let at = 12;
  while (at + 8 <= file.length) {
    const id = fourCC(file, at);
    const size = u32(file, at + 4);
    const end = at + 8 + size + (size & 1);
    if (FRAME_CHUNKS.has(id)) {
      chunks.push(file.subarray(at, Math.min(end, file.length)));
      if (id === "ALPH") hasAlpha = true;
      // Lossless frames carry their alpha inside the bitstream; bit 28 of the header says if it's used.
      if (id === "VP8L" && size >= 5 && (file[at + 8 + 4] & 0x10) !== 0) hasAlpha = true;
    }
    at = end;
  }
  if (!chunks.some((c) => fourCC(c, 0) === "VP8 " || fourCC(c, 0) === "VP8L")) throw new Error("WebP has no image data");
  return { chunks, hasAlpha };
}

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;
  bytes(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.length;
  }
  ascii(s: string) {
    this.bytes(new Uint8Array([...s].map((c) => c.charCodeAt(0))));
  }
  u24(n: number) {
    this.bytes(new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]));
  }
  u32(n: number) {
    this.bytes(new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]));
  }
  u8(n: number) {
    this.bytes(new Uint8Array([n & 0xff]));
  }
  u16(n: number) {
    this.bytes(new Uint8Array([n & 0xff, (n >> 8) & 0xff]));
  }
  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

/** Frame durations in milliseconds that add up exactly to frames / fps seconds. */
export function frameDurations(count: number, fps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Math.round(((i + 1) * 1000) / fps) - Math.round((i * 1000) / fps));
  return out;
}

export function muxAnimatedWebp(frames: ParsedFrame[], durationsMs: number[], width: number, height: number): Uint8Array {
  if (frames.length === 0) throw new Error("No frames");
  const alpha = frames.some((f) => f.hasAlpha);
  const body = new Writer();

  // VP8X: extended header with the animation flag (and alpha if any frame is transparent).
  body.ascii("VP8X");
  body.u32(10);
  body.u8((alpha ? 0x10 : 0) | 0x02);
  body.u24(0);
  body.u24(width - 1);
  body.u24(height - 1);

  // ANIM: transparent background, loop forever.
  body.ascii("ANIM");
  body.u32(6);
  body.u32(0);
  body.u16(0);

  frames.forEach((frame, i) => {
    const payload = frame.chunks.reduce((n, c) => n + c.length, 0);
    body.ascii("ANMF");
    body.u32(16 + payload);
    body.u24(0); // x / 2
    body.u24(0); // y / 2
    body.u24(width - 1);
    body.u24(height - 1);
    body.u24(Math.max(1, Math.round(durationsMs[i] ?? 100)));
    body.u8(0b10); // do not blend: each frame fully replaces the last; no disposal
    frame.chunks.forEach((c) => body.bytes(c));
    if ((16 + payload) & 1) body.u8(0);
  });

  const file = new Writer();
  file.ascii("RIFF");
  file.u32(4 + body.length);
  file.ascii("WEBP");
  file.bytes(body.toUint8Array());
  return file.toUint8Array();
}
