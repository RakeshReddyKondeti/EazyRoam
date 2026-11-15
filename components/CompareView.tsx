"use client";

// The pitch moment: the same request planned by a normal map app vs EazyRoam. Side by side on wide screens.
import { useState } from "react";
import type { Plan } from "@/lib/types";
import { DayList } from "./DayList";
import { fmtTime } from "./format";

/** Every problem a wheelchair user would hit, in plain words. Exported for tests. */
export function problemList(plan: Plan): string[] {
  const out: string[] = [];
  for (const s of plan.stops) {
    const name = plan.places[s.placeId]?.name ?? s.placeId;
    if (s.status === "bad") out.push(`${name}: ${s.reasons.join(", ") || "not accessible"}`);
    else if (s.status === "unknown") out.push(`${name}: accessibility not checked`);
  }
  for (const l of plan.legs)
    for (const st of l.stops) {
      if (st.elevatorOut) out.push(`${st.name}: elevator out`);
      else if (st.wheelchair === "no") out.push(`${st.name}: not step-free`);
    }
  for (const l of plan.legs) for (const i of l.issues) if (/^No step-free/.test(i)) out.push(i);
  if (Date.parse(plan.request.end) < Date.parse(plan.endAt)) out.push(`Home at ${fmtTime(plan.endAt)}, after ${fmtTime(plan.request.end)}`);
  return [...new Set(out)];
}

function Column({ title, plan, tone }: { title: string; plan: Plan; tone: "bad" | "ok" }) {
  const problems = problemList(plan);
  return (
    <section className="compare-col" aria-label={title}>
      <h2>{title}</h2>
      <p className={`sub s-${problems.length ? tone : "ok"}`}>
        {problems.length ? `${problems.length} problem${problems.length > 1 ? "s" : ""} for a wheelchair user` : "No problems found"}
      </p>
      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <DayList plan={plan} />
    </section>
  );
}

export function CompareView({ normal, mine }: { normal: Plan; mine: Plan }) {
  const [show, setShow] = useState<"normal" | "mine">("normal");
  return (
    <div className="compare">
      <div className="seg compare-toggle" role="tablist" aria-label="Which plan">
        <button role="tab" aria-selected={show === "normal"} onClick={() => setShow("normal")}>
          Normal map app
        </button>
        <button role="tab" aria-selected={show === "mine"} onClick={() => setShow("mine")}>
          EazyRoam
        </button>
      </div>
      <div className="compare-grid" data-show={show}>
        <Column title="A normal map app" plan={normal} tone="bad" />
        <Column title="EazyRoam" plan={mine} tone="bad" />
      </div>
    </div>
  );
}
