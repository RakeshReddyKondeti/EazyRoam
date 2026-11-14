"use client";

// Scaffold screen: proves the stylesheet, fonts and the /api/plan fixture path work.
// C replaces this with the ported prototype screens (PLAN.md §8, Person C).
import { useState } from "react";
import type { Plan } from "@/lib/types";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function Home() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function planDay() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/plan", { method: "POST", body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPlan(data as Plan);
    } catch (e) {
      setPlan(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">EazyRoam</div>
      </div>
      <main id="ask">
        <div>
          <h1>Where to today?</h1>
          <p className="sub">Tell us your plans. We’ll check every door, bus and sidewalk.</p>
        </div>
        <button className="primary" onClick={planDay} disabled={busy}>
          {busy ? "Planning…" : "Plan my day"}
        </button>
        <div aria-live="polite">
          {error && <p className="note-line">{error}</p>}
          {plan && (
            <ol className="list">
              {plan.stops.map((s) => (
                <li key={s.placeId} className="home">
                  <span className="t">{time(s.arrive)}</span>
                  <span>{plan.places[s.placeId]?.name ?? s.placeId}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  );
}
