"use client";

import { useEffect, useState } from "react";
import type { Needs } from "@/lib/types";
import { NeedsChips } from "./NeedsChips";
import { type Start, StartField } from "./StartField";

export type { Start } from "./StartField";

const STEPS = ["Finding places…", "Checking ramps…", "Checking elevators…", "Checking hours…"];

/** Everything the Today form collects besides the free text and needs. */
export type DayOptions = {
  start: Start;
  end?: Start; // undefined = back to the start
  leaveAt?: string; // "HH:MM"; empty = now
  doneBy?: string; // "HH:MM"; empty = 6 PM or 3 h after leaving
};

type Props = { busy: boolean; onSubmit: (text: string, needs: Needs, opts: DayOptions) => void };

const clean = (s: Start): Start => ({ origin: s.origin, address: s.address?.trim() || undefined });

/** Today: free-text plans, times, where you start and end, needs chips, "Plan my day". */
export function AskForm({ busy, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [needs, setNeeds] = useState<Needs>({ noSteps: true, gentleSlopes: true, restroom: false });
  const [start, setStart] = useState<Start>({});
  const [roundTrip, setRoundTrip] = useState(true);
  const [end, setEnd] = useState<Start>({});
  const [leaveAt, setLeaveAt] = useState("");
  const [doneBy, setDoneBy] = useState("");
  const step = useCycle(busy, STEPS.length);

  return (
    <form
      id="ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        onSubmit(text.trim(), needs, {
          start: clean(start),
          end: roundTrip ? undefined : clean(end),
          leaveAt: leaveAt || undefined,
          doneBy: doneBy || undefined,
        });
      }}
    >
      <div>
        <h1>Where to today?</h1>
        <p className="sub">Tell us your plans. We’ll check every door, bus and sidewalk.</p>
      </div>
      <textarea
        aria-label="Your plans for today"
        placeholder="e.g. Lunch, a birthday gift, then the art museum."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="timerow">
        <label className="timefield">
          <span className="label">Leave at</span>
          <input className="input" type="time" value={leaveAt} onChange={(e) => setLeaveAt(e.target.value)} />
          <span className="sub start-msg">{leaveAt ? " " : "Empty: leave now"}</span>
        </label>
        <label className="timefield">
          <span className="label">Done by</span>
          <input className="input" type="time" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} />
          <span className="sub start-msg">{doneBy ? " " : "Empty: 6 PM"}</span>
        </label>
      </div>

      <StartField label="Starting from" placeholder="Address, e.g. 1 Main St, Northampton MA" value={start} onChange={setStart} />

      <div>
        <label className="visit">
          <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
          End where I started
        </label>
        {!roundTrip && <StartField label="Ending at" placeholder="Address, e.g. Amherst Town Hall" value={end} onChange={setEnd} />}
      </div>

      <NeedsChips needs={needs} onChange={setNeeds} />
      <button className="primary" type="submit" disabled={busy || !text.trim()}>
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
