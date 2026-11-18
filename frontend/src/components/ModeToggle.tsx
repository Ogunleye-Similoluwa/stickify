import type { StickerMode } from "../lib/trim";

interface Props {
  mode: StickerMode;
  stillOnly: boolean;
  onChange(mode: StickerMode): void;
}

export function ModeToggle({ mode, stillOnly, onChange }: Props) {
  const options: { value: StickerMode; label: string }[] = [
    { value: "animated", label: "Animated" },
    { value: "static", label: "Still" },
  ];
  return (
    <fieldset className="options">
      <legend className="field-label">Sticker type</legend>
      <div className="segmented" role="radiogroup">
        {options.map((o) => (
          <label key={o.value}>
            <input
              type="radio"
              name="mode"
              value={o.value}
              checked={mode === o.value}
              disabled={stillOnly && o.value === "animated"}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
