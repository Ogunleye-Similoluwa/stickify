export const X_LINK = /^https?:\/\/(www\.|mobile\.)?(x|twitter|fxtwitter|vxtwitter|fixupx)\.com\/.+\/status/i;

export const looksLikeXLink = (text: string): boolean => X_LINK.test(text.trim());

/** Minimal typing for the WebCodecs ImageDecoder, which TypeScript's DOM types don't include yet. */
interface DecodedFrame {
  image: { duration: number | null; close(): void };
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<DecodedFrame>;
  close(): void;
}
type ImageDecoderCtor = new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike;

/**
 * Total length of an animated GIF or WebP in seconds, where the browser can tell us
 * (Chrome, Edge and Android). Returns null when unknown or not animated.
 */
export async function animatedImageDuration(file: File): Promise<number | null> {
  const Decoder = (window as unknown as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  if (!Decoder) return null;
  try {
    const decoder = new Decoder({ data: await file.arrayBuffer(), type: file.type });
    await decoder.tracks.ready;
    const frames = Math.min(decoder.tracks.selectedTrack?.frameCount ?? 0, 3000);
    if (frames <= 1) {
      decoder.close();
      return null;
    }
    let micros = 0;
    for (let i = 0; i < frames; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      micros += image.duration || 100_000;
      image.close();
    }
    decoder.close();
    return micros / 1e6;
  } catch {
    return null;
  }
}
