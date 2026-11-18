import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ClipPreview, type Clip } from "./components/ClipPreview";
import { Header } from "./components/Header";
import { ModeToggle } from "./components/ModeToggle";
import { ResultCard } from "./components/ResultCard";
import { FileDrop, LinkInput, SourceTabs, type SourceTab } from "./components/SourceInputs";
import { Footer, HowTo, Hero } from "./components/StaticSections";
import { useServerStatus } from "./hooks/useServerStatus";
import { FitToggle } from "./components/FitToggle";
import { MotionToggle, type Motion } from "./components/MotionToggle";
import { ApiError, resolveLink, stickerFromFile, stickerFromLink, type Sticker, type StickerFit } from "./lib/api";
import { MAX_UPLOAD_BYTES } from "./lib/config";
import { animatedImageDuration, looksLikeXLink } from "./lib/media";
import { lookupX } from "./lib/x";
import { DEFAULT_FRAMING, type Framing } from "./lib/framing";
import { CancelledError, StickerError, cancelConversion, canConvertInBrowser, convertInBrowser, converterReady, warmUpConverter } from "./lib/browserConvert";
import { initialSelection, round1, timingFor, type Selection, type StickerMode } from "./lib/trim";

/** Show the "server is waking up" note if a request takes longer than this. */
const WAKE_NOTICE_MS = 6000;

export default function App() {
  const server = useServerStatus();

  const [tab, setTab] = useState<SourceTab>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<StickerMode>("animated");
  const [fit, setFit] = useState<StickerFit>("fit");
  const [framing, setFraming] = useState<Framing>(DEFAULT_FRAMING);
  const [motion, setMotion] = useState<Motion>("smooth");
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null);

  const [clip, setClip] = useState<Clip | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [playable, setPlayable] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const [converting, setConverting] = useState(false);
  const [convertLabel, setConvertLabel] = useState("Making sticker…");
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sticker, setSticker] = useState<Sticker | null>(null);

  const filePreviewUrl = useRef<string | null>(null);
  const loadToken = useRef(0);
  /** A sticker being made in the background for the current settings. */
  const headStart = useRef<{ key: string; promise: Promise<Sticker | null> } | null>(null);

  // ----- clip lifecycle -----
  const clearClip = useCallback(() => {
    loadToken.current++;
    cancelConversion();
    headStart.current = null;
    if (filePreviewUrl.current) {
      URL.revokeObjectURL(filePreviewUrl.current);
      filePreviewUrl.current = null;
    }
    setClip(null);
    setClipLoading(false);
    setDuration(null);
    setPlayable(false);
    setSelection(null);
    setResolvedUrl(null);
    setMediaUrl(null);
    setFraming(DEFAULT_FRAMING);
    setMediaSize(null);
  }, []);

  useEffect(() => clearClip, [clearClip]);

  /** Called once the clip's length is known (or known to be unknown). */
  const clipReady = useCallback((kind: Clip["kind"], length: number | null, canPlay: boolean) => {
    setClipLoading(false);
    warmUpConverter(); // likely about to convert: fetch the converter in the background
    setPlayable(canPlay);
    if (kind === "photo") {
      setMode("static");
      setDuration(null);
      setSelection(null);
      return;
    }
    const d = length && isFinite(length) && length > 0 ? round1(length) : null;
    setDuration(d);
    setSelection(d ? initialSelection(d) : null);
  }, []);

  async function previewFile(next: File | null) {
    clearClip();
    setFile(next);
    setError(null);
    if (!next) return;
    const token = loadToken.current;
    const src = URL.createObjectURL(next);
    filePreviewUrl.current = src;
    const type = next.type || "";

    if (type.startsWith("video/")) {
      setClip({ src, kind: "video", display: "video", knownDuration: null });
      setClipLoading(true);
      return; // ClipPreview reports the length once the video loads
    }
    const animated = type === "image/gif" || type === "image/webp";
    setClip({ src, kind: animated ? "gif" : "photo", display: "image", knownDuration: null });
    if (!animated) {
      clipReady("photo", null, false);
      return;
    }
    setClipLoading(true);
    const length = await animatedImageDuration(next);
    if (token !== loadToken.current) return;
    clipReady(length || type === "image/gif" ? "gif" : "photo", length, false);
  }

  async function loadLink(target: string) {
    const link = target.trim();
    if (!link) {
      setError("Paste a link to an X post first.");
      return;
    }
    if (link === resolvedUrl || linkLoading) return;
    clearClip();
    setError(null);
    const token = loadToken.current;
    setLinkLoading(true);
    setClipLoading(true);
    setClip({ src: "", kind: "video", display: "image", knownDuration: null });
    const wakeTimer = window.setTimeout(() => setWaking(true), WAKE_NOTICE_MS);
    try {
      // Ask X directly first (fast); fall back to our server if that doesn't work.
      const direct = await lookupX(link);
      if (token !== loadToken.current) return;
      if (!direct.ok && direct.reason === "no-media") throw new ApiError("That post has no GIF, video or photo to use.");
      if (!direct.ok && direct.reason === "not-found") throw new ApiError("We couldn't find that post. It may be private or deleted.");
      const info = direct.ok ? direct.info : await resolveLink(link);
      if (token !== loadToken.current) return;
      if (!direct.ok) server.markUp();
      setResolvedUrl(link);
      setMediaUrl(info.mediaUrl);
      if (info.kind === "photo") {
        setClip({ src: info.mediaUrl, kind: "photo", display: "image", knownDuration: null });
        clipReady("photo", null, false);
      } else {
        setClip({ src: info.mediaUrl, kind: info.kind, display: "video", knownDuration: info.durationSeconds });
      }
    } catch (err) {
      if (token !== loadToken.current) return;
      clearClip();
      const apiErr = err as ApiError;
      setError(apiErr.message);
      if (apiErr.offline) server.markDown();
    } finally {
      window.clearTimeout(wakeTimer);
      setWaking(false);
      setLinkLoading(false);
    }
  }

  // Pasting an X link anywhere on the page switches to the link tab and loads it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.id === "url") return;
      const text = e.clipboardData?.getData("text").trim() ?? "";
      if (looksLikeXLink(text)) {
        setTab("link");
        setUrl(text);
        void loadLink(text);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  function switchTab(next: SourceTab) {
    if (next === tab) return;
    setTab(next);
    setError(null);
    clearClip();
    if (next === "upload" && file) void previewFile(file);
    if (next === "link" && url.trim()) void loadLink(url);
  }

  function changeUrl(value: string) {
    setUrl(value);
    if (resolvedUrl && value.trim() !== resolvedUrl) clearClip();
  }

  // ----- convert -----

  /** The file to convert in the browser: the upload, or the media from the X post. */
  async function sourceForBrowser(): Promise<{ blob: Blob; still: boolean } | null> {
    if (tab === "upload") {
      if (!file) return null;
      const type = file.type || "";
      return { blob: file, still: type.startsWith("image/") && clip?.kind === "photo" };
    }
    let media = resolvedUrl === urlInput() ? mediaUrl : null;
    let kind = clip?.kind;
    if (!media) {
      // Not loaded yet (e.g. "Make sticker" pressed straight after pasting).
      const direct = await lookupX(urlInput());
      if (!direct.ok) return null;
      media = direct.info.mediaUrl;
      kind = direct.info.kind;
    }
    const res = await fetch(media, { referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > MAX_UPLOAD_BYTES) return null;
    return { blob, still: kind === "photo" };
  }

  const urlInput = () => url.trim();

  // ----- head start: make the sticker in the background while the user looks at the preview -----

  /** Identifies the sticker the current settings would produce. */
  function stickerKey(): string | null {
    const source = tab === "upload"
      ? file && `${file.name}:${file.size}:${file.lastModified}`
      : resolvedUrl === urlInput() && mediaUrl;
    if (!source) return null;
    const timing = timingFor(duration ? selection : null, mode);
    return [tab, source, mode, fit, timing.start ?? "", timing.seconds ?? "",
      framing.zoom.toFixed(2), framing.panX.toFixed(3), framing.panY.toFixed(3), motion].join("|");
  }

  /** Starts (or reuses) an in-browser conversion; resolves null if the browser path isn't possible. */
  function browserJob(key: string): Promise<Sticker | null> {
    if (headStart.current?.key === key) return headStart.current.promise;
    cancelConversion();
    const timing = timingFor(duration ? selection : null, mode);
    const promise = (async () => {
      const source = await sourceForBrowser();
      if (!source) return null;
      return convertInBrowser(
        source.blob,
        { mode, fit, start: timing.start ?? 0, seconds: timing.seconds ?? null, framing, sourceSize: mediaSize, motion },
        source.still,
      );
    })();
    promise.catch(() => {}); // errors are handled when the user actually asks for the sticker
    headStart.current = { key, promise };
    return promise;
  }

  const clipSettled = !!clip && !clipLoading && (clip.kind === "photo" || !!duration);
  useEffect(() => {
    if (!clipSettled || converting || sticker || !canConvertInBrowser()) return;
    const key = stickerKey();
    if (!key || headStart.current?.key === key) return;
    // Wait until the user stops dragging before starting over with the new settings.
    const timer = window.setTimeout(() => browserJob(key), 600);
    return () => window.clearTimeout(timer);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const timing = timingFor(duration ? selection : null, mode);

    let serverRequest: () => Promise<Sticker>;
    if (tab === "link") {
      const link = urlInput();
      if (!link) return setError("Paste a link to an X post first.");
      serverRequest = () => stickerFromLink(link, mode, fit, link === resolvedUrl ? timing : {});
    } else {
      if (!file) return setError("Choose a GIF, video or image first.");
      if (file.size > MAX_UPLOAD_BYTES) return setError("That file is over 25 MB. Try a shorter clip.");
      serverRequest = () => stickerFromFile(file, mode, fit, timing);
    }

    setConverting(true);
    try {
      // Fast path: convert on this device (often already finished in the background).
      // Falls back to the server if the browser can't.
      const key = canConvertInBrowser() ? stickerKey() ?? `once:${Date.now()}` : null;
      if (key) {
        const readyCheck = window.setInterval(
          () => setConvertLabel(converterReady() ? "Making sticker…" : "Getting the converter ready…"), 250);
        try {
          setConvertLabel(converterReady() ? "Making sticker…" : "Getting the converter ready…");
          const result = await browserJob(key);
          if (result) {
            setSticker(result);
            return;
          }
        } catch (err) {
          if (err instanceof StickerError) return setError(err.message);
          if (err instanceof CancelledError) headStart.current = null;
          // anything else: try the server instead
        } finally {
          window.clearInterval(readyCheck);
        }
      }

      setConvertLabel("Making sticker…");
      const wakeTimer = window.setTimeout(() => setWaking(true), WAKE_NOTICE_MS);
      try {
        setSticker(await serverRequest());
        server.markUp();
      } catch (err) {
        const apiErr = err as ApiError;
        setError(apiErr.message);
        if (apiErr.offline) server.markDown();
      } finally {
        window.clearTimeout(wakeTimer);
        setWaking(false);
      }
    } finally {
      setConverting(false);
    }
  }

  function startOver() {
    cancelConversion();
    headStart.current = null;
    setSticker(null);
    setUrl("");
    setFile(null);
    setMode("animated");
    clearClip();
  }

  const stillOnly = clip?.kind === "photo";

  return (
    <>
      <div className="glow" aria-hidden="true" />
      <Header status={server.state} statusLabel={server.label} />

      <main className="wrap">
        <Hero />

        <section className="card" aria-label="Make a sticker">
          <SourceTabs active={tab} onChange={switchTab} />

          <form id="form" noValidate onSubmit={submit}>
            {tab === "link" ? (
              <LinkInput value={url} loading={linkLoading} onChange={changeUrl} onLoad={(link) => void loadLink(link)} />
            ) : (
              <FileDrop file={file} onFile={(f) => void previewFile(f)} />
            )}

            {clip && (
              <ClipPreview
                clip={clip}
                loading={clipLoading}
                duration={duration}
                playable={playable}
                selection={selection}
                mode={mode}
                fit={fit}
                framing={framing}
                mediaSize={mediaSize}
                onMediaSize={setMediaSize}
                onFraming={setFraming}
                onVideoReady={(length, canPlay) => clipReady(clip.kind, length, canPlay)}
                onSelect={setSelection}
              />
            )}

            <ModeToggle mode={mode} stillOnly={stillOnly} onChange={setMode} />
            <FitToggle fit={fit} onChange={(next) => { setFit(next); setFraming(DEFAULT_FRAMING); }} />
            {mode === "animated" && !stillOnly && <MotionToggle motion={motion} onChange={setMotion} />}

            <button className={`cta${converting ? " is-loading" : ""}`} type="submit" id="submit" disabled={converting}>
              <span className="cta-label">{converting ? convertLabel : "Make sticker"}</span>
              <span className="spinner" aria-hidden="true" />
            </button>
            {error && <p className="error" id="error" role="alert">{error}</p>}
            {waking && (
              <p className="wake" id="wake">The server was asleep and is waking up. The first sticker can take up to a minute.</p>
            )}
          </form>
        </section>

        {sticker && (
          <ResultCard
            sticker={sticker}
            onAgain={startOver}
            onShareFailed={() => setError("Sharing didn't work on this device. Download the sticker instead.")}
          />
        )}

        <HowTo />
      </main>

      <Footer />
    </>
  );
}
