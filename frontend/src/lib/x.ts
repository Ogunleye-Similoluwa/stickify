import type { MediaInfo } from "./api";

/**
 * Looks up the media in an X post straight from the browser, using the public fxtwitter API.
 * This skips our server, which can take up to a minute to wake up on the free plan.
 */
const FX_API = "https://api.fxtwitter.com/status/";

/** Smallest size that still fills a 512px sticker; bigger copies only download and decode slower. */
export const USEFUL_SIZE = 512;

export function statusId(link: string): string | null {
  const match = /\/status(?:es)?\/(\d+)/i.exec(link);
  return match ? match[1] : null;
}

interface FxVariant {
  content_type?: string;
  url?: string;
}
interface FxVideo {
  type?: string;
  url?: string;
  duration?: number;
  width?: number;
  height?: number;
  variants?: FxVariant[];
}
interface FxPhoto {
  url?: string;
  width?: number;
  height?: number;
}
export interface FxMedia {
  videos?: FxVideo[];
  photos?: FxPhoto[];
}

interface Variant {
  url: string;
  width: number;
  height: number;
}

/** X keeps several MP4 copies of each video; pick the smallest whose long side still fills a sticker. */
export function smallestUsefulVariant(variants: FxVariant[] = []): Variant | null {
  let best: Variant | null = null;
  let largest: Variant | null = null;
  for (const item of variants) {
    if (item.content_type !== "video/mp4" || !item.url) continue;
    const size = /\/(\d+)x(\d+)\//.exec(item.url);
    if (!size) continue;
    const variant = { url: item.url, width: Number(size[1]), height: Number(size[2]) };
    const long = Math.max(variant.width, variant.height);
    if (!largest || long > Math.max(largest.width, largest.height)) largest = variant;
    if (long >= USEFUL_SIZE && (!best || long < Math.max(best.width, best.height))) best = variant;
  }
  return best ?? largest;
}

const positive = (n: unknown): number | null => (typeof n === "number" && n > 0 ? n : null);

/** Prefer GIFs, then videos, then photos — the same rules as the server. */
export function chooseMedia(media: FxMedia | undefined): MediaInfo | null {
  if (!media) return null;
  let video: MediaInfo | null = null;
  for (const item of media.videos ?? []) {
    if (!item.url) continue;
    const smaller = smallestUsefulVariant(item.variants);
    const info: MediaInfo = {
      mediaUrl: smaller?.url ?? item.url,
      kind: item.type === "gif" ? "gif" : "video",
      durationSeconds: positive(item.duration),
      width: smaller?.width ?? item.width ?? null,
      height: smaller?.height ?? item.height ?? null,
    };
    if (info.kind === "gif") return info;
    video ??= info;
  }
  if (video) return video;
  const photo = (media.photos ?? []).find((p) => p.url);
  return photo?.url
    ? { mediaUrl: photo.url, kind: "photo", durationSeconds: null, width: photo.width ?? null, height: photo.height ?? null }
    : null;
}

export type XLookup =
  | { ok: true; info: MediaInfo }
  | { ok: false; reason: "not-found" | "no-media" | "unavailable" };

export async function lookupX(link: string, timeoutMs = 8000): Promise<XLookup> {
  const id = statusId(link);
  if (!id) return { ok: false, reason: "not-found" };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(FX_API + id, { signal: controller.signal, referrerPolicy: "no-referrer" });
    if (res.status === 404) return { ok: false, reason: "not-found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body = (await res.json()) as { tweet?: { media?: FxMedia } };
    if (!body.tweet) return { ok: false, reason: "not-found" };
    const info = chooseMedia(body.tweet.media);
    return info ? { ok: true, info } : { ok: false, reason: "no-media" };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    window.clearTimeout(timer);
  }
}
