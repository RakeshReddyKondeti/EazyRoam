import type { Needs } from "@/lib/types";

const CHIPS: { key: keyof Needs; label: string }[] = [
  { key: "noSteps", label: "No steps" },
  { key: "gentleSlopes", label: "Gentle slopes" },
  { key: "restroom", label: "Accessible restroom" },
];

/** Toggle chips for the user's needs (.needs, .chip). */
export function NeedsChips({ needs, onChange }: { needs: Needs; onChange: (n: Needs) => void }) {
  return (
    <div className="needs" role="group" aria-label="My needs">
      {CHIPS.map((c) => (
        <button key={c.key} type="button" className="chip" aria-pressed={needs[c.key]} onClick={() => onChange({ ...needs, [c.key]: !needs[c.key] })}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
