"use client";

import { useEffect, useState } from "react";
import type { Needs } from "@/lib/types";

const CHIPS: { key: keyof Needs; label: string }[] = [
  { key: "noSteps", label: "No steps" },
  { key: "gentleSlopes", label: "Gentle slopes" },
  { key: "restroom", label: "Accessible restroom" },
];
const STEPS = ["Checking ramps…", "Checking elevators…", "Checking hours…"];

type Props = { busy: boolean; onSubmit: (text: string, needs: Needs) => void };

/** Ask screen (#ask): free-text plans + needs chips + "Plan my day". */
export function AskForm({ busy, onSubmit }: Props) {
  const [text, setText] = useState("Lunch, a birthday gift, then the art museum. Leave at 11, home by 6.");
  const [needs, setNeeds] = useState<Needs>({ noSteps: true, gentleSlopes: true, restroom: false });
  const [step, setStep] = useState(0);

  // Cycle the progress label while a plan is being built.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 900);
    return () => {
      clearInterval(t);
      setStep(0);
    };
  }, [busy]);

  return (
    <form
      id="ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !busy) onSubmit(text.trim(), needs);
      }}
    >
      <div>
        <h1>Where to today?</h1>
        <p className="sub">Tell us your plans. We’ll check every door, bus and sidewalk.</p>
      </div>
      <textarea aria-label="Your plans for today" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="needs" role="group" aria-label="My needs">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            className="chip"
            aria-pressed={needs[c.key]}
            onClick={() => setNeeds((n) => ({ ...n, [c.key]: !n[c.key] }))}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? STEPS[step] : "Plan my day"}
      </button>
    </form>
  );
}
