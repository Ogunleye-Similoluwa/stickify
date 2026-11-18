import { useEffect, useMemo, useRef, useState } from "react";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { ApiError, handOff, whatsAppAvailable, type Sticker } from "../lib/api";

interface Props {
  sticker: Sticker;
  onAgain(): void;
  onShareFailed(): void;
}

const isPhone = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);

export function ResultCard({ sticker, onAgain, onShareFailed }: Props) {
  const url = useObjectUrl(sticker.blob);
  const ref = useRef<HTMLElement>(null);
  const [whatsApp, setWhatsApp] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void whatsAppAvailable().then((ok) => live && setWhatsApp(ok));
    return () => {
      live = false;
    };
  }, []);

  /** Leave the sticker with Stickify's WhatsApp number, then open the chat with the code typed in. */
  async function sendToWhatsApp() {
    setSending(true);
    setSendError(null);
    try {
      const handoff = await handOff(sticker.blob);
      setCode(handoff.code);
      window.location.href = handoff.link;
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Couldn't prepare the sticker for WhatsApp. Try again.");
    } finally {
      setSending(false);
    }
  }

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
          {whatsApp && (
            <button className="cta small share" type="button" id="send-whatsapp" onClick={sendToWhatsApp} disabled={sending}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {sending ? "Opening WhatsApp…" : "Send to WhatsApp"}
            </button>
          )}
          {!whatsApp && canShare && !isPhone() && (
            <button className="cta small share" type="button" id="share" onClick={share}>
              Share to WhatsApp
            </button>
          )}
          {url && <a className={whatsApp || (canShare && !isPhone()) ? "ghost" : "cta small"} id="download" href={url} download="sticker.webp">Download</a>}
          <button className="ghost" type="button" id="again" onClick={onAgain}>Make another</button>
        </div>
        {sendError && <p className="error" role="alert">{sendError}</p>}
        <p className="share-hint" id="share-hint">
          {whatsApp ? (
            <>
              WhatsApp opens with a code typed in. Tap <strong>send</strong> and Stickify replies with your sticker in a few
              seconds. Tap it and choose <strong>Add to Favorites</strong>.
              {code && <> Didn't open? Send <strong>sticker {code}</strong> to the Stickify WhatsApp number.</>}
            </>
          ) : isPhone() ? (
            <>
              To use it as a sticker, open WhatsApp Web or Desktop on a computer and drag the downloaded file into a chat; then
              tap it on your phone and choose <strong>Add to Favorites</strong>.
            </>
          ) : (
            <>
              Drag the downloaded file into a chat in WhatsApp Web or Desktop. It arrives as a sticker; tap it on your phone
              and choose <strong>Add to Favorites</strong>.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
