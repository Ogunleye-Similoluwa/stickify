export type Motion = "smooth" | "sharp";

interface Props {
  motion: Motion;
  onChange(motion: Motion): void;
}

/** Smooth motion uses more frames; sharp spends WhatsApp's 500 KB on fewer, clearer frames. */
export function MotionToggle({ motion, onChange }: Props) {
  const options: { value: Motion; label: string }[] = [
    { value: "smooth", label: "Smoother motion" },
    { value: "sharp", label: "Sharper picture" },
  ];
  return (
    <fieldset className="options">
      <legend className="field-label">Priority</legend>
      <div className="segmented" role="radiogroup">
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name="motion" value={o.value} checked={motion === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
