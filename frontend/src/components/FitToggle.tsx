import type { StickerFit } from "../lib/api";

interface Props {
  fit: StickerFit;
  onChange(fit: StickerFit): void;
}

export function FitToggle({ fit, onChange }: Props) {
  const options: { value: StickerFit; label: string }[] = [
    { value: "fill", label: "Fill square" },
    { value: "fit", label: "Show whole" },
  ];
  return (
    <fieldset className="options">
      <legend className="field-label">Shape</legend>
      <div className="segmented" role="radiogroup">
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name="fit" value={o.value} checked={fit === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
