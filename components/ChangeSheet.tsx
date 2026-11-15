"use client";

// "Something changed?" button + bottom sheet with the 4 events (.fab, .sheet, .opt).
import { useEffect, useRef, useState } from "react";
import type { Event, Plan } from "@/lib/types";
import { Icon } from "./Icons";

type Step = "menu" | "ramp" | "elevator" | "add";
type Props = { plan: Plan; busy: boolean; onEvent: (e: Event) => void };

const ADD_IDEAS = ["pharmacy", "accessible restroom", "coffee", "grocery"];

export function ChangeSheet({ plan, busy, onEvent }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [custom, setCustom] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  const fab = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setStep("menu");
    fab.current?.focus();
  };
  const fire = (e: Event) => {
    close();
    onEvent(e);
  };

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step]);

  const stopNames = [...new Set(plan.legs.flatMap((l) => l.stops.map((s) => s.name)))];

  return (
    <>
      <button ref={fab} className="fab" onClick={() => setOpen(true)} disabled={busy} aria-haspopup="dialog">
        {busy ? "Re-planning…" : "Something changed?"}
      </button>
      {open && (
        <>
          <div className="scrim" onClick={close} />
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
            {step === "menu" && (
              <>
                <h2 id="sheetTitle">What changed?</h2>
                <button ref={first} className="opt o1" onClick={() => setStep("ramp")}>
                  <span className="ic"><Icon name="ramp" /></span>A ramp or entrance is blocked
                </button>
                <button className="opt o1" onClick={() => setStep("elevator")} disabled={!stopNames.length}>
                  <span className="ic"><Icon name="lift" /></span>An elevator is out
                </button>
                <button className="opt o2" onClick={() => fire({ type: "late", minutes: 30 })}>
                  <span className="ic"><Icon name="clock" /></span>I’m running 30 min late
                </button>
                <button className="opt o3" onClick={() => setStep("add")}>
                  <span className="ic"><Icon name="plus" /></span>Add a stop
                </button>
                <button className="reset" onClick={close}>Cancel</button>
              </>
            )}

            {step === "ramp" && (
              <>
                <h2 id="sheetTitle">Which place is blocked?</h2>
                {plan.stops.map((s, i) => (
                  <button key={s.placeId} ref={i === 0 ? first : undefined} className="opt" onClick={() => fire({ type: "rampBlocked", placeId: s.placeId })}>
                    <span className="ic pin-num-inline">{i + 1}</span>
                    {plan.places[s.placeId]?.name ?? s.placeId}
                  </button>
                ))}
                <button className="reset" onClick={() => setStep("menu")}>Back</button>
              </>
            )}

            {step === "elevator" && (
              <>
                <h2 id="sheetTitle">Which station’s elevator is out?</h2>
                {stopNames.map((n, i) => (
                  <button key={n} ref={i === 0 ? first : undefined} className="opt" onClick={() => fire({ type: "elevatorOut", stopName: n })}>
                    <span className="ic"><Icon name="lift" /></span>
                    {n}
                  </button>
                ))}
                <button className="reset" onClick={() => setStep("menu")}>Back</button>
              </>
            )}

            {step === "add" && (
              <>
                <h2 id="sheetTitle">Add a stop</h2>
                <div className="needs">
                  {ADD_IDEAS.map((c, i) => (
                    <button key={c} ref={i === 0 ? first : undefined} className="chip" onClick={() => fire({ type: "addStop", category: c })}>
                      {c}
                    </button>
                  ))}
                </div>
                <form
                  className="addrow"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (custom.trim()) fire({ type: "addStop", category: custom.trim().toLowerCase() });
                  }}
                >
                  <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Something else, e.g. bank" aria-label="Kind of place to add" />
                  <button className="ghost" type="submit">Add</button>
                </form>
                <button className="reset" onClick={() => setStep("menu")}>Back</button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
