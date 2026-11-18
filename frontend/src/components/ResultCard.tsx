import { useEffect, useMemo, useRef } from "react";
import { useObjectUrl } from "../hooks/useObjectUrl";
import type { Sticker } from "../lib/api";

interface Props {
  sticker: Sticker;
  onAgain(): void;
  onShareFailed(): void;
}

export function ResultCard({ sticker, onAgain, onShareFailed }: Props) {
  const url = useObjectUrl(sticker.blob);
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
          {canShare && (
            <button className="cta small share" type="button" id="share" onClick={share}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Share to WhatsApp
            </button>
          )}
          {url && <a className="cta small" id="download" href={url} download="sticker.webp">Download sticker</a>}
          <button className="ghost" type="button" id="again" onClick={onAgain}>Make another</button>
        </div>
        {canShare && (
          <p className="share-hint" id="share-hint">
            Pick <strong>WhatsApp</strong> in the share menu, then choose a chat. If it arrives as a photo instead of a sticker, download it and use the steps below.
          </p>
        )}
      </div>
    </section>
  );
}
