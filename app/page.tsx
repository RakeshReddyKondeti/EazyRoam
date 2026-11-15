"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Event, Needs, Plan, Trip } from "@/lib/types";
import { AskForm, type DayOptions } from "@/components/AskForm";
import { ChangeSheet } from "@/components/ChangeSheet";
import { CompareView } from "@/components/CompareView";
import { DayList, changedIds } from "@/components/DayList";
import { fmtTime } from "@/components/format";
import { Icon, IconSprite } from "@/components/Icons";
import { type SavedTrip, loadTrips, storeTrips, upsertTrip } from "@/components/savedTrips";
import { TripView } from "@/components/TripView";
import { type TripRequest, VacationSetup } from "@/components/VacationSetup";

// MapLibre touches window: load it only in the browser.
const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <p className="hint" style={{ marginTop: 24 }}>Loading map…</p>,
});

type Screen = "ask" | "day" | "compare" | "vac" | "trip";
type View = "list" | "map";

/** The user's local date and UTC offset, e.g. "2026-11-14", "-05:00". */
function localDateAndOffset() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? "-" : "+";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { date, offset: `${sign}${pad(off / 60)}:${pad(off % 60)}`, now: `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(off / 60)}:${pad(off % 60)}` };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("ask");
  const [view, setView] = useState<View>("list");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [normal, setNormal] = useState<Plan | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "plan" | "replan" | "compare" | "trip">("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripSaved, setTripSaved] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set()); // Vacation: "<date>:<placeId>"
  const [dayVisited, setDayVisited] = useState<Set<string>>(new Set()); // Today: placeIds
  const [tripBusyDay, setTripBusyDay] = useState<number | undefined>();
  const [tripNewIds, setTripNewIds] = useState<Record<string, Set<string>>>({});
  const [saved, setSaved] = useState<SavedTrip[]>([]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const go = (s: Screen) => {
    if (s === "vac") setSaved(loadTrips()); // browser-only; read on demand
    setError("");
    setScreen(s);
    window.scrollTo({ top: 0 });
  };

  async function planTrip(r: TripRequest) {
    setBusy("trip");
    setError("");
    try {
      const { date, offset, now } = localDateAndOffset();
      const t = await post<Trip>("/api/trip", { places: r.places, days: r.days, needs: r.needs, origin: r.start.origin, startAddress: r.start.address, date, offset, now });
      setTrip(t);
      setTripNewIds({});
      setTripSaved(false);
      setVisited(new Set());
      go("trip");
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  function saveTrip() {
    if (!trip) return;
    upsertTrip({ trip, savedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), visited: [...visited] });
    setSaved(loadTrips());
    setTripSaved(true);
  }

  function toggleVisited(key: string, v: boolean) {
    const next = new Set(visited);
    if (v) next.add(key);
    else next.delete(key);
    setVisited(next);
    if (trip && tripSaved) {
      const s = loadTrips().find((x) => x.trip.id === trip.id);
      if (s) upsertTrip({ ...s, visited: [...next] });
      setSaved(loadTrips());
    }
  }

  /** Vacation: + / − or Start at on a stop re-plans that one day (and updates the saved copy). */
  async function adjustTripDay(i: number, events: Event[]) {
    if (!trip?.dayPlans[i]) return;
    const day = trip.dayPlans[i];
    setTripBusyDay(i);
    setError("");
    try {
      let next = day.plan;
      for (const e of events) next = await post<Plan>("/api/replan", { plan: next, event: e, now: localDateAndOffset().now });
      const updated: Trip = { ...trip, dayPlans: trip.dayPlans.map((d, j) => (j === i ? { ...d, plan: next } : d)) };
      setTripNewIds((m) => ({ ...m, [day.date]: changedIds(day.plan, next) }));
      setTrip(updated);
      if (tripSaved) {
        const s = loadTrips().find((x) => x.trip.id === updated.id);
        if (s) upsertTrip({ ...s, trip: updated });
        setSaved(loadTrips());
      }
    } catch (e) {
      fail(e);
    } finally {
      setTripBusyDay(undefined);
    }
  }

  function toggleDayVisited(placeId: string, v: boolean) {
    setDayVisited((s) => {
      const next = new Set(s);
      if (v) next.add(placeId);
      else next.delete(placeId);
      return next;
    });
  }

  async function planDay(text: string, needs: Needs, o: DayOptions) {
    setBusy("plan");
    setError("");
    try {
      const { date, offset, now } = localDateAndOffset();
      const p = await post<Plan>("/api/plan", {
        text,
        needs,
        origin: o.start.origin,
        startAddress: o.start.address,
        home: o.end?.origin,
        endAddress: o.end?.address,
        leaveAt: o.leaveAt,
        doneBy: o.doneBy,
        date,
        offset,
        now,
      });
      setPlan(p);
      setDayVisited(new Set());
      setNormal(null);
      setNewIds(new Set());
      setView("list");
      setScreen("day");
      window.scrollTo({ top: 0 });
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  /** One or more changes (e.g. a new start time and a longer stay), applied in order. */
  async function change(event: Event | Event[]) {
    if (!plan) return;
    setBusy("replan");
    setError("");
    try {
      let next = plan;
      for (const e of Array.isArray(event) ? event : [event]) next = await post<Plan>("/api/replan", { plan: next, event: e, now: localDateAndOffset().now });
      setNewIds(changedIds(plan, next));
      setPlan(next);
      setNormal(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  async function compare() {
    if (!plan) return;
    setScreen("compare");
    window.scrollTo({ top: 0 });
    if (normal) return;
    setBusy("compare");
    setError("");
    try {
      setNormal(await post<Plan>("/api/compare", { request: plan.request }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  const unknowns = plan?.stops.filter((s) => s.status === "unknown").length ?? 0;
  const bad = plan?.stops.filter((s) => s.status === "bad").length ?? 0;

  return (
    <div className={`app${screen === "compare" ? " wide" : ""}`}>
      <IconSprite />
      <div className="topbar">
        <div className="brand">
          <Icon name="roll" />
          EazyRoam
        </div>
        {(screen === "ask" || screen === "vac") && (
          <div className="seg modes" role="tablist" aria-label="Mode">
            <button role="tab" aria-selected={screen === "ask"} onClick={() => go("ask")}>
              Today
            </button>
            <button role="tab" aria-selected={screen === "vac"} onClick={() => go("vac")}>
              Vacation
            </button>
          </div>
        )}
      </div>

      <div aria-live="assertive">{error && <p className="note-line error-line">{error}</p>}</div>

      {screen === "ask" && <AskForm busy={busy === "plan"} onSubmit={planDay} />}

      {screen === "day" && plan && (
        <main id="day">
          <button className="back" onClick={() => setScreen("ask")}>
            <Icon name="back" />
            Edit plans
          </button>
          <h1>Your day</h1>
          <p className="sub">
            {plan.stops.length} stop{plan.stops.length === 1 ? "" : "s"} ·{" "}
            {bad ? `${bad} problem${bad > 1 ? "s" : ""}` : unknowns ? `${unknowns} to call ahead` : "step-free all the way"} · home by{" "}
            {fmtTime(plan.endAt)}
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
            <button className="link" onClick={compare}>
              Compare
            </button>
          </div>
          <div aria-live="polite">{plan.explanation && <div className="note-line">{plan.explanation}</div>}</div>
          {plan.stops.length === 0 && !plan.explanation && (
            <div className="note-line">We couldn’t plan any stops for this request. Try naming different places.</div>
          )}
          {view === "list" ? <DayList
              plan={plan}
              newIds={newIds}
              startLabel="Start"
              endLabel="Home"
              onAdjust={change}
              busy={busy === "replan"}
              visited={dayVisited}
              onVisited={toggleDayVisited}
            /> : <MapView plan={plan} />}
          <ChangeSheet plan={plan} busy={busy === "replan"} onEvent={change} />
        </main>
      )}

      {screen === "compare" && plan && (
        <main id="compare">
          <button className="back" onClick={() => setScreen("day")}>
            <Icon name="back" />
            Back to my day
          </button>
          <h1>Same request, two plans</h1>
          <p className="sub">What a normal map app suggests, checked the way EazyRoam checks everything.</p>
          {normal ? <CompareView normal={normal} mine={plan} /> : <p className="hint" style={{ marginTop: 24 }}>{busy === "compare" ? "Building the normal plan…" : ""}</p>}
        </main>
      )}

      {screen === "vac" && (
        <VacationSetup
          busy={busy === "trip"}
          saved={saved}
          onSubmit={planTrip}
          onOpen={(s) => {
            setTrip(s.trip);
            setTripNewIds({});
            setVisited(new Set(s.visited));
            setTripSaved(true);
            go("trip");
          }}
          onRemove={(id) => {
            storeTrips(loadTrips().filter((t) => t.trip.id !== id));
            setSaved(loadTrips());
          }}
        />
      )}

      {screen === "trip" && trip && (
        <TripView
          trip={trip}
          saved={tripSaved}
          visited={visited}
          onVisited={toggleVisited}
          onSave={saveTrip}
          onBack={() => go("vac")}
          onAdjust={adjustTripDay}
          busyDay={tripBusyDay}
          newIds={tripNewIds}
        />
      )}
    </div>
  );
}
