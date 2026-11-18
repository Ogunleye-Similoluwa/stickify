import { useEffect, useMemo, useRef, useState } from "react";
import { useObjectUrl } from "../hooks/useObjectUrl";
import type { Sticker } from "../lib/api";

interface Props {
  sticker: Sticker;
  /** A looping MP4 of the same clip, for sending as a GIF (null while it's being made or unavailable). */
  gifVideo: Blob | null;
  gifVideoPending: boolean;
  onAgain(): void;
  onShareFailed(): void;
}

export function ResultCard({ sticker, gifVideo, gifVideoPending, onAgain, onShareFailed }: Props) {
  const url = useObjectUrl(sticker.blob);
  const gifUrl = useObjectUrl(gifVideo);
  const [sharingGif, setSharingGif] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Phones (and some desktop browsers) can hand the file straight to WhatsApp through the share menu.
  const file = useMemo(() => new File([sticker.blob], "sticker.webp", { type: "image/webp" }), [sticker]);
  const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  useEffect(() => {
    if (window.matchMedia("(max-width: 860px)").matches) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [sticker]);

  async function share() {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onShareFailed();
    }
  }

  const gifFile = useMemo(() => (gifVideo ? new File([gifVideo], "sticker.mp4", { type: "video/mp4" }) : null), [gifVideo]);
  const canShareGif = !!gifFile && typeof navigator.canShare === "function" && navigator.canShare({ files: [gifFile] });

  async function shareGif() {
    if (!gifFile) return;
    setSharingGif(true);
    try {
      await navigator.share({ files: [gifFile] });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onShareFailed();
    } finally {
      setSharingGif(false);
    }
  }

  const kind = sticker.mode === "static" ? "Still" : "Animated";
  const kb = Math.round(sticker.blob.size / 1024);

  return (
    <section className="result" id="result" aria-live="polite" ref={ref}>
      <div className="result-preview checker">
        {url && <img id="preview" src={url} alt="Your sticker preview" />}
      </div>
      <div className="result-body">
        <h2>Your sticker is ready</h2>
        <p className="meta" id="meta">{`${kind} · 512 × 512 · ${kb} KB · WebP`}</p>
        <div className="actions">
          {canShareGif && (
            <button className="cta small share" type="button" id="share-gif" onClick={shareGif} disabled={sharingGif}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Share as GIF
            </button>
          )}
          {canShare && (
            <button className={`cta small share${canShareGif ? " secondary" : ""}`} type="button" id="share" onClick={share}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {canShareGif ? "Share sticker file" : "Share to WhatsApp"}
            </button>
          )}
          {url && <a className="cta small" id="download" href={url} download="sticker.webp">Download sticker</a>}
          {gifUrl && <a className="ghost" id="download-gif" href={gifUrl} download="sticker.mp4">Download as GIF video</a>}
          {gifVideoPending && !gifVideo && <span className="pending" id="gif-pending">Preparing GIF…</span>}
          <button className="ghost" type="button" id="again" onClick={onAgain}>Make another</button>
        </div>
        {canShare && (
          <p className="share-hint" id="share-hint">
            {canShareGif ? (
              <>
                <strong>Share as GIF</strong> sends a moving GIF to any WhatsApp chat (tap <strong>GIF</strong> in WhatsApp's editor if it shows). Phones
                turn a shared sticker file into a still photo, so for a real sticker, download it and use the steps below.
              </>
            ) : (
              <>Pick <strong>WhatsApp</strong> in the share menu, then choose a chat. If it arrives as a photo instead of a sticker, download it and use the steps below.</>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
