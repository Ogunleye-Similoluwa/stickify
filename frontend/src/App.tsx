import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ClipPreview, type Clip } from "./components/ClipPreview";
import { Header } from "./components/Header";
import { ModeToggle } from "./components/ModeToggle";
import { ResultCard } from "./components/ResultCard";
import { FileDrop, LinkInput, SourceTabs, type SourceTab } from "./components/SourceInputs";
import { Footer, HowTo, Hero } from "./components/StaticSections";
import { useServerStatus } from "./hooks/useServerStatus";
import { ApiError, resolveLink, stickerFromFile, stickerFromLink, type Sticker } from "./lib/api";
import { MAX_UPLOAD_BYTES } from "./lib/config";
import { animatedImageDuration, looksLikeXLink } from "./lib/media";
import { initialSelection, round1, timingFor, type Selection, type StickerMode } from "./lib/trim";

/** Show the "server is waking up" note if a request takes longer than this. */
const WAKE_NOTICE_MS = 6000;

export default function App() {
  const server = useServerStatus();

  const [tab, setTab] = useState<SourceTab>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<StickerMode>("animated");

  const [clip, setClip] = useState<Clip | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [playable, setPlayable] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const [converting, setConverting] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sticker, setSticker] = useState<Sticker | null>(null);

  const filePreviewUrl = useRef<string | null>(null);
  const loadToken = useRef(0);

  // ----- clip lifecycle -----
  const clearClip = useCallback(() => {
    loadToken.current++;
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
  }, []);

  useEffect(() => clearClip, [clearClip]);

  /** Called once the clip's length is known (or known to be unknown). */
  const clipReady = useCallback((kind: Clip["kind"], length: number | null, canPlay: boolean) => {
    setClipLoading(false);
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
      const info = await resolveLink(link);
      if (token !== loadToken.current) return;
      server.markUp();
      setResolvedUrl(link);
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
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const timing = timingFor(duration ? selection : null, mode);

    let request: () => Promise<Sticker>;
    if (tab === "link") {
      const link = url.trim();
      if (!link) return setError("Paste a link to an X post first.");
      request = () => stickerFromLink(link, mode, link === resolvedUrl ? timing : {});
    } else {
      if (!file) return setError("Choose a GIF, video or image first.");
      if (file.size > MAX_UPLOAD_BYTES) return setError("That file is over 25 MB. Try a shorter clip.");
      request = () => stickerFromFile(file, mode, timing);
    }

    setConverting(true);
    const wakeTimer = window.setTimeout(() => setWaking(true), WAKE_NOTICE_MS);
    try {
      setSticker(await request());
      server.markUp();
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message);
      if (apiErr.offline) server.markDown();
    } finally {
      window.clearTimeout(wakeTimer);
      setWaking(false);
      setConverting(false);
    }
  }

  function startOver() {
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
                onVideoReady={(length, canPlay) => clipReady(clip.kind, length, canPlay)}
                onSelect={setSelection}
              />
            )}

            <ModeToggle mode={mode} stillOnly={stillOnly} onChange={setMode} />

            <button className={`cta${converting ? " is-loading" : ""}`} type="submit" id="submit" disabled={converting}>
              <span className="cta-label">{converting ? "Making sticker…" : "Make sticker"}</span>
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
