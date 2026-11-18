import { useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { looksLikeXLink } from "../lib/media";

export type SourceTab = "link" | "upload";

interface TabsProps {
  active: SourceTab;
  onChange(tab: SourceTab): void;
}

export function SourceTabs({ active, onChange }: TabsProps) {
  const tabs: { id: SourceTab; label: string }[] = [
    { id: "link", label: "Paste X link" },
    { id: "upload", label: "Upload file" },
  ];
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          className={`tab${active === tab.id ? " is-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface LinkProps {
  value: string;
  loading: boolean;
  onChange(value: string): void;
  onLoad(url: string): void;
}

export function LinkInput({ value, loading, onChange, onLoad }: LinkProps) {
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").trim();
    if (looksLikeXLink(text)) {
      e.preventDefault();
      onChange(text);
      onLoad(text);
    }
  };
  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onLoad(value.trim());
    }
  };

  return (
    <div className="pane">
      <label className="field-label" htmlFor="url">Link to the post</label>
      <div className="url-row">
        <input
          id="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://x.com/someone/status/1234567890"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKey}
        />
        <button className="ghost load" type="button" id="load" disabled={loading} onClick={() => onLoad(value.trim())}>
          {loading ? "Loading…" : "Load"}
        </button>
      </div>
      <p className="hint">Works with posts that have a GIF, video or photo. Private posts can't be fetched.</p>
    </div>
  );
}

interface DropProps {
  file: File | null;
  onFile(file: File | null): void;
}

const ACCEPT = "image/gif,image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm";

export function FileDrop({ file, onFile }: DropProps) {
  const [over, setOver] = useState(false);

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div className="pane">
      <label
        className={`drop${over ? " is-over" : ""}`}
        htmlFor="file"
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={handleDrop}
      >
        <input id="file" type="file" accept={ACCEPT} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <span className="drop-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="drop-title">{file ? file.name : "Drop a GIF, video or image"}</span>
        <span className="drop-sub">or tap to choose · up to 25 MB</span>
      </label>
    </div>
  );
}
