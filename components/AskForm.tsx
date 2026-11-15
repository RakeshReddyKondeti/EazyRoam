"use client";

import { useEffect, useState } from "react";
import type { Needs } from "@/lib/types";
import { NeedsChips } from "./NeedsChips";
import { type Start, StartField } from "./StartField";

export type { Start } from "./StartField";

const STEPS = ["Finding places…", "Checking ramps…", "Checking elevators…", "Checking hours…"];

type Props = { busy: boolean; onSubmit: (text: string, needs: Needs, start: Start) => void };

/** Today: free-text plans, where you start, needs chips, "Plan my day". */
export function AskForm({ busy, onSubmit }: Props) {
  const [text, setText] = useState("Lunch, a birthday gift, then the art museum. Leave at 11, home by 6.");
  const [needs, setNeeds] = useState<Needs>({ noSteps: true, gentleSlopes: true, restroom: false });
  const [start, setStart] = useState<Start>({});
  const step = useCycle(busy, STEPS.length);

  return (
    <form
      id="ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !busy) onSubmit(text.trim(), needs, { origin: start.origin, address: start.address?.trim() || undefined });
      }}
    >
      <div>
        <h1>Where to today?</h1>
        <p className="sub">Tell us your plans. We’ll check every door, bus and sidewalk.</p>
      </div>
      <textarea aria-label="Your plans for today" value={text} onChange={(e) => setText(e.target.value)} />
      <StartField label="Starting from (and coming home to)" placeholder="Address, e.g. 1 Main St, Northampton MA" value={start} onChange={setStart} />
      <NeedsChips needs={needs} onChange={setNeeds} />
      <button className="primary" type="submit" disabled={busy}>
        {busy ? STEPS[step] : "Plan my day"}
      </button>
    </form>
  );
}

/** Cycles 0..n-1 every 1.2 s while `on`, for progress labels. */
export function useCycle(on: boolean, n: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setI((s) => (s + 1) % n), 1200);
    return () => {
      clearInterval(t);
      setI(0);
    };
  }, [on, n]);
  return i;
}
