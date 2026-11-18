/** WhatsApp's longest animated sticker. */
export const MAX_SECONDS = 10;
/** Shortest clip worth making into a sticker. */
export const MIN_SECONDS = 0.5;
export const STEP = 0.1;

export type StickerMode = "animated" | "static";

export interface Selection {
  start: number;
  end: number;
}

export const round1 = (s: number): number => Math.round(s * 10) / 10;

export const formatSeconds = (s: number): string => `${s.toFixed(1)} s`;

/** By default the sticker uses the whole clip, or its first 10 seconds if it's longer. */
export function initialSelection(duration: number): Selection {
  return { start: 0, end: round1(Math.min(duration, MAX_SECONDS)) };
}

/**
 * Moves the start handle. For animated stickers the end handle is pushed along
 * so the selection always stays between MIN_SECONDS and MAX_SECONDS long.
 */
export function moveStart(sel: Selection, value: number, duration: number, mode: StickerMode): Selection {
  if (mode === "static") {
    return { ...sel, start: clamp(round1(value), 0, duration) };
  }
  const start = clamp(round1(value), 0, Math.max(0, duration - MIN_SECONDS));
  let end = sel.end;
  if (end - start < MIN_SECONDS) end = start + MIN_SECONDS;
  if (end - start > MAX_SECONDS) end = start + MAX_SECONDS;
  return { start, end: round1(Math.min(end, duration)) };
}

/** Moves the end handle, pulling the start handle along to respect the same limits. */
export function moveEnd(sel: Selection, value: number, duration: number): Selection {
  const end = clamp(round1(value), Math.min(MIN_SECONDS, duration), duration);
  let start = sel.start;
  if (end - start < MIN_SECONDS) start = end - MIN_SECONDS;
  if (end - start > MAX_SECONDS) start = end - MAX_SECONDS;
  return { start: round1(Math.max(0, start)), end };
}

export interface Timing {
  start?: number;
  seconds?: number;
}

/**
 * What to send to the API. When the clip length is unknown nothing is sent,
 * and the server uses the whole clip up to the maximum.
 */
export function timingFor(sel: Selection | null, mode: StickerMode): Timing {
  if (!sel) return {};
  if (mode === "static") return { start: sel.start };
  return { start: sel.start, seconds: round1(sel.end - sel.start) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
