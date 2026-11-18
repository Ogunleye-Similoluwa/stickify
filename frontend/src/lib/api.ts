import { API_BASE } from "./config";
import type { StickerMode, Timing } from "./trim";

export type MediaKind = "gif" | "video" | "photo";

/**
 * "fit" keeps the whole picture with transparent space around it, "fill" crops to a square,
 * "stretch" fills the square edge to edge by stretching the picture.
 */
export type StickerFit = "fit" | "fill" | "stretch";

/** The server only knows fit and fill; stretch falls back to fill there. */
export const serverFit = (fit: StickerFit): "fit" | "fill" => (fit === "fit" ? "fit" : "fill");

/** What an X post contains, from POST /api/media/resolve. */
export interface MediaInfo {
  mediaUrl: string;
  kind: MediaKind;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export interface Sticker {
  blob: Blob;
  mode: StickerMode;
}

/** An error the API explained, or a network failure (offline = true). */
export class ApiError extends Error {
  constructor(message: string, readonly offline = false) {
    super(message);
    this.name = "ApiError";
  }
}

const OFFLINE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

async function call(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, true);
  }
  if (!res.ok) {
    let message = `Something went wrong (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // not JSON
    }
    throw new ApiError(message);
  }
  return res;
}

async function asSticker(res: Response): Promise<Sticker> {
  const mode: StickerMode = res.headers.get("X-Sticker-Mode") === "static" ? "static" : "animated";
  return { blob: await res.blob(), mode };
}

export async function checkHealth(): Promise<boolean> {
  try {
    await call("/api/health", { cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

/** Whether the server has the Stickify WhatsApp number set up ("Send to WhatsApp"). */
export async function whatsAppAvailable(): Promise<boolean> {
  try {
    const res = await call("/api/health", { cache: "no-store" });
    const body = (await res.json()) as { whatsapp?: boolean };
    return body.whatsapp === true;
  } catch {
    return false;
  }
}

export interface Handoff {
  code: string;
  /** wa.me link that opens a chat with the Stickify number, with "sticker CODE" typed in. */
  link: string;
}

/** Leaves the sticker with the server under a short code; WhatsApp replies with it when the code is sent. */
export async function handOff(sticker: Blob): Promise<Handoff> {
  const body = new FormData();
  body.append("sticker", sticker, "sticker.webp");
  const res = await call("/api/handoff", { method: "POST", body });
  return (await res.json()) as Handoff;
}

export async function resolveLink(url: string): Promise<MediaInfo> {
  const res = await call("/api/media/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return (await res.json()) as MediaInfo;
}

export async function stickerFromLink(url: string, mode: StickerMode, fit: StickerFit, timing: Timing): Promise<Sticker> {
  const body: Record<string, unknown> = { url, mode, fit: serverFit(fit) };
  if (timing.start != null) body.startSeconds = timing.start;
  if (timing.seconds != null) body.seconds = timing.seconds;
  const res = await call("/api/stickers/from-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return asSticker(res);
}

export async function stickerFromFile(file: File, mode: StickerMode, fit: StickerFit, timing: Timing): Promise<Sticker> {
  const body = new FormData();
  body.append("file", file);
  body.append("mode", mode);
  body.append("fit", serverFit(fit));
  if (timing.start != null) body.append("start", String(timing.start));
  if (timing.seconds != null) body.append("seconds", String(timing.seconds));
  const res = await call("/api/stickers", { method: "POST", body });
  return asSticker(res);
}
