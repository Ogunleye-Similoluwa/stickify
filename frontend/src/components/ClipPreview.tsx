import { useEffect, useRef, type CSSProperties } from "react";
import type { MediaKind } from "../lib/api";
import { formatSeconds, MAX_SECONDS, moveEnd, moveStart, STEP, type Selection, type StickerMode } from "../lib/trim";

export interface Clip {
  src: string;
  kind: MediaKind;
  /** "video" uses a <video> element so it can be scrubbed; "image" shows GIFs and photos. */
  display: "video" | "image";
  /** Length reported by the source (e.g. X), used if the browser can't read it. */
  knownDuration: number | null;
}

interface Props {
  clip: Clip;
  loading: boolean;
  duration: number | null;
  playable: boolean;
  selection: Selection | null;
  mode: StickerMode;
  onVideoReady(duration: number | null, playable: boolean): void;
  onSelect(selection: Selection): void;
}

export function ClipPreview({ clip, loading, duration, playable, selection, mode, onVideoReady, onSelect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trimRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  // Latest values for the animation loop without restarting it on every change.
  const live = useRef({ selection, mode, duration, playable });
  live.current = { selection, mode, duration, playable };

  const still = mode === "static";

  // Loop playback inside the selection so the preview shows exactly what the sticker will be.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const v = videoRef.current;
      const { selection: sel, mode: m, duration: d, playable: p } = live.current;
      if (v && p && sel && d && !scrubbing.current && !v.paused) {
        if (m !== "static" && (v.currentTime >= sel.end - 0.02 || v.currentTime < sel.start - 0.1)) {
          v.currentTime = sel.start;
        }
        trimRef.current?.style.setProperty("--p", String(v.currentTime / d));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Restart the loop (or show the chosen frame) when the mode or clip becomes ready.
  useEffect(() => {
    if (!playable || !selection) return;
    if (still) seek(selection.start);
    else resume(selection.start);
  }, [playable, still]); // only when readiness or mode changes, not on every drag

  function seek(t: number) {
    const v = videoRef.current;
    if (!v || !playable) return;
    scrubbing.current = true;
    v.pause();
    v.currentTime = t;
    if (duration) trimRef.current?.style.setProperty("--p", String(t / duration));
  }

  function resume(from: number) {
    const v = videoRef.current;
    if (!v || !playable) return;
    scrubbing.current = false;
    if (live.current.mode === "static") return;
    v.currentTime = from;
    v.play().catch(() => {});
  }

  function handleStart(value: number) {
    if (!selection || !duration) return;
    const next = moveStart(selection, value, duration, mode);
    onSelect(next);
    seek(next.start);
  }

  function handleEnd(value: number) {
    if (!selection || !duration) return;
    const next = moveEnd(selection, value, duration);
    onSelect(next);
    seek(next.end);
  }

  const release = () => selection && resume(selection.start);

  const label = clip.kind === "gif" ? "GIF" : clip.kind === "video" ? "Video" : "Photo";
  const badge = loading ? "" : duration ? `${label} · ${formatSeconds(duration)}` : label;

  let hint = "";
  if (!loading) {
    if (clip.kind === "photo") hint = "Photos become still stickers.";
    else if (!duration) hint = `The sticker will use the whole clip, up to ${MAX_SECONDS} seconds.`;
    else if (still) hint = "Drag to pick the frame for your sticker.";
    else if (duration > MAX_SECONDS) hint = `Drag the handles to choose up to ${MAX_SECONDS} seconds. The preview plays your selection.`;
    else hint = "The whole clip is selected. Drag the handles to cut it shorter.";
  }

  const trimStyle = duration && selection
    ? ({ "--s": selection.start / duration, "--e": selection.end / duration } as CSSProperties)
    : undefined;

  return (
    <section className="clip" aria-label="Preview and trim">
      <div className="clip-stage checker">
        {clip.display === "video" && (
          <video
            ref={videoRef}
            src={clip.src}
            muted
            playsInline
            preload="auto"
            hidden={loading || !playable}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              onVideoReady(isFinite(d) && d > 0 ? d : clip.knownDuration, true);
            }}
            onError={() => onVideoReady(clip.knownDuration, false)}
            onEnded={release}
          />
        )}
        {clip.display === "image" && clip.src && <img src={clip.src} alt="Preview of your file" />}
        {loading && <span className="clip-loading">Loading preview…</span>}
        {!loading && clip.display === "video" && !playable && (
          <span className="clip-loading">Preview isn't available, but it can still be converted</span>
        )}
        {badge && <span className="clip-badge">{badge}</span>}
      </div>

      {!loading && duration && selection && clip.kind !== "photo" && (
        <div className="trim-wrap">
          <div className={`trim${still ? " is-still" : ""}`} ref={trimRef} style={trimStyle}>
            <div className="trim-track">
              <div className="trim-fill" />
              {playable && <div className="trim-playhead" />}
            </div>
            <input
              className="trim-range"
              id="trim-start"
              type="range"
              min={0}
              max={duration}
              step={STEP}
              value={selection.start}
              aria-label={still ? "Frame to use" : "Sticker starts at"}
              onChange={(e) => handleStart(Number(e.target.value))}
              onPointerUp={release}
              onKeyUp={release}
            />
            {!still && (
              <input
                className="trim-range"
                id="trim-end"
                type="range"
                min={0}
                max={duration}
                step={STEP}
                value={selection.end}
                aria-label="Sticker ends at"
                onChange={(e) => handleEnd(Number(e.target.value))}
                onPointerUp={release}
                onKeyUp={release}
              />
            )}
          </div>
          <div className="trim-readout">
            <span>{still ? "Frame at" : "Start"} <b id="start-out">{formatSeconds(selection.start)}</b></span>
            {!still && <span>End <b id="end-out">{formatSeconds(selection.end)}</b></span>}
            {!still && <span>Length <b id="len-out">{formatSeconds(selection.end - selection.start)}</b></span>}
          </div>
        </div>
      )}
      {hint && <p className="hint" id="trim-hint">{hint}</p>}
    </section>
  );
}
