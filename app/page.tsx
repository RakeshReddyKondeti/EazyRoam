"use client";

import { useState } from "react";
import type { Needs, Plan } from "@/lib/types";
import { AskForm } from "@/components/AskForm";
import { DayList } from "@/components/DayList";
import { fmtTime } from "@/components/format";
import { Icon, IconSprite } from "@/components/Icons";

type Screen = "ask" | "day";
type View = "list" | "map";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("ask");
  const [view, setView] = useState<View>("list");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function planDay(text: string, needs: Needs) {
    setBusy(true);
    setError("");
    try {
      // TODO(C): send origin/home from browser geolocation once /api/plan is wired to parseRequest.
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, needs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPlan(data as Plan);
      setView("list");
      setScreen("day");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const unknowns = plan?.stops.filter((s) => s.status === "unknown").length ?? 0;

  return (
    <div className="app">
      <IconSprite />
      <div className="topbar">
        <div className="brand">
          <Icon name="roll" />
          EazyRoam
        </div>
      </div>

      {screen === "ask" && (
        <>
          <AskForm busy={busy} onSubmit={planDay} />
          <div aria-live="polite">{error && <p className="note-line">{error}</p>}</div>
        </>
      )}

      {screen === "day" && plan && (
        <main id="day">
          <button className="back" onClick={() => setScreen("ask")}>
            <Icon name="back" />
            Edit plans
          </button>
          <h1>Your day</h1>
          <p className="sub">
            {plan.stops.length} stops · {unknowns ? `${unknowns} to call ahead` : "step-free all the way"} · home
            by {fmtTime(plan.endAt)}
          </p>
          <div className="bar">
            <div className="seg" role="tablist" aria-label="View">
              <button role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>
                List
              </button>
              <button role="tab" aria-selected={view === "map"} onClick={() => setView("map")}>
                Map
              </button>
            </div>
          </div>
          {plan.explanation && (
            <div className="note-line" aria-live="polite">
              {plan.explanation}
            </div>
          )}
          {view === "list" ? (
            <DayList plan={plan} />
          ) : (
            <p className="hint" style={{ marginTop: 24 }}>
              Map view is coming next (MapView).
            </p>
          )}
        </main>
      )}
    </div>
  );
}
