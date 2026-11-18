import type { StickerFit } from "../lib/api";

interface Props {
  fit: StickerFit;
  onChange(fit: StickerFit): void;
}

export function FitToggle({ fit, onChange }: Props) {
  const options: { value: StickerFit; label: string }[] = [
    { value: "fit", label: "Show whole" },
    { value: "fill", label: "Fill square" },
    { value: "stretch", label: "Stretch" },
  ];
  return (
    <fieldset className="options">
      <legend className="field-label">Shape</legend>
      <div className="segmented three" role="radiogroup">
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
