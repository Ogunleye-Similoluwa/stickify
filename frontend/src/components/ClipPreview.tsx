import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { MediaKind, StickerFit } from "../lib/api";
import { MAX_ZOOM, canPan, pan, placement, type Framing } from "../lib/framing";
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
  fit: StickerFit;
  framing: Framing;
  /** The picture's natural size, once known. */
  mediaSize: { width: number; height: number } | null;
  onVideoReady(duration: number | null, playable: boolean): void;
  onSelect(selection: Selection): void;
  onMediaSize(size: { width: number; height: number }): void;
  onFraming(framing: Framing): void;
}

export function ClipPreview({
  clip, loading, duration, playable, selection, mode, fit, framing, mediaSize, onVideoReady, onSelect, onMediaSize, onFraming,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; framing: Framing } | null>(null);
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

  // Place the picture exactly where it will be in the sticker (zoom and pan included).
  const box = mediaSize ? placement(mediaSize.width, mediaSize.height, fit, framing) : null;
  const pannable = !!box && canPan(box);
  const mediaStyle: CSSProperties | undefined = box
    ? {
        position: "absolute",
        left: `${(box.x / 512) * 100}%`,
        top: `${(box.y / 512) * 100}%`,
        width: `${(box.w / 512) * 100}%`,
        height: `${(box.h / 512) * 100}%`,
        maxWidth: "none",
        objectFit: "fill",
      }
    : undefined;

  function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pannable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, framing };
  }
  function moveDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    const stage = stageRef.current;
    if (!start || !stage || !box) return;
    const toSticker = 512 / stage.clientWidth; // screen pixels -> sticker pixels
    const from = placement(mediaSize!.width, mediaSize!.height, fit, start.framing);
    onFraming(pan(start.framing, from, (e.clientX - start.x) * toSticker, (e.clientY - start.y) * toSticker));
  }
  function endDrag() {
    drag.current = null;
  }

  const label = clip.kind === "gif" ? "GIF" : clip.kind === "video" ? "Video" : "Photo";
  const badge = loading ? "" : duration ? `${label} · ${formatSeconds(duration)}` : label;

  let hint = "";
  if (!loading) {
    if (clip.kind === "photo") hint = "Photos become still stickers.";
    else if (!duration) hint = `The sticker will use the whole clip, up to ${MAX_SECONDS} seconds.`;
    else if (still) hint = "Drag to pick the frame for your sticker.";
    else if (selection && (selection.start > 0 || selection.end < duration))
      hint = `The preview plays your selection. Drag the handles to change it (up to ${MAX_SECONDS} seconds).`;
    else if (duration > MAX_SECONDS) hint = `Drag the handles to choose up to ${MAX_SECONDS} seconds. The preview plays your selection.`;
    else hint = "The whole clip is selected. Drag the handles to cut it shorter.";
  }

  const trimStyle = duration && selection
    ? ({ "--s": selection.start / duration, "--e": selection.end / duration } as CSSProperties)
    : undefined;

  return (
    <section className="clip" aria-label="Preview and trim">
      <div
        ref={stageRef}
        className={`clip-stage checker is-${fit}${pannable ? " is-pannable" : ""}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {clip.display === "video" && (
          <video
            ref={videoRef}
            src={clip.src}
            muted
            playsInline
            preload="auto"
            hidden={loading || !playable}
            style={mediaStyle}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) onMediaSize({ width: v.videoWidth, height: v.videoHeight });
              const d = v.duration;
              onVideoReady(isFinite(d) && d > 0 ? d : clip.knownDuration, true);
            }}
            onError={() => onVideoReady(clip.knownDuration, false)}
            onEnded={release}
          />
        )}
        {clip.display === "image" && clip.src && (
          <img
            src={clip.src}
            alt="Preview of your file"
            draggable={false}
            style={mediaStyle}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) onMediaSize({ width: img.naturalWidth, height: img.naturalHeight });
            }}
          />
        )}
        {pannable && !loading && <span className="clip-pan-hint">Drag to move</span>}
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
      {!loading && mediaSize && (
        <label className="zoom">
          <span className="zoom-label">Zoom</span>
          <input
            id="zoom"
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.05}
            value={framing.zoom}
            onChange={(e) => onFraming({ ...framing, zoom: Number(e.target.value) })}
          />
          <span className="zoom-value">{framing.zoom.toFixed(1)}×</span>
          {(framing.zoom !== 1 || framing.panX !== 0.5 || framing.panY !== 0.5) && (
            <button type="button" className="link-button" onClick={() => onFraming({ zoom: 1, panX: 0.5, panY: 0.5 })}>
              Reset
            </button>
          )}
        </label>
      )}
    </section>
  );
}
