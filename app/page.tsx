"use client";

import { useState } from "react";
import { addDays } from "@/lib/planner/geo";
import { compareRequest } from "@/lib/planner/compareTrip";
import type { Event, Plan, Trip } from "@/lib/types";
import { CompareView } from "@/components/CompareView";
import { changedIds } from "@/components/DayList";
import { Icon, IconSprite } from "@/components/Icons";
import { LiveDay } from "@/components/LiveDay";
import { loadTrips, storeTrips, upsertTrip, useSavedTrips } from "@/components/savedTrips";
import { TripView, dayName } from "@/components/TripView";
import { useToday } from "@/components/useToday";
import { type TripRequest, VacationSetup } from "@/components/VacationSetup";

// EazyRoam is a vacation planner for wheelchair users: plan the trip, then take each day step by step.
type Screen = "vac" | "trip" | "live" | "compare";

/** Re-check a day automatically when it's today or tomorrow and the last check is older than this. */
const STALE_MS = 60 * 60 * 1000;
type Rechecked = { plan: Plan; changes: string[]; checkedAt: string };

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
  const [screen, setScreen] = useState<Screen>("vac");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripSaved, setTripSaved] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set()); // "<date>:<placeId>"
  const [tripBusyDay, setTripBusyDay] = useState<number | undefined>();
  const [tripNewIds, setTripNewIds] = useState<Record<string, Set<string>>>({});
  const [liveDay, setLiveDay] = useState<number | undefined>();
  const [checkingDay, setCheckingDay] = useState<number | undefined>();
  const [cmp, setCmp] = useState<{ day: number; normal: Plan | null } | null>(null);
  const saved = useSavedTrips();
  const today = useToday();

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const go = (s: Screen) => {
    setError("");
    setScreen(s);
    window.scrollTo({ top: 0 });
  };

  async function planTrip(r: TripRequest) {
    setBusy(true);
    setError("");
    try {
      const { date, offset, now } = localDateAndOffset();
      const t = await post<Trip>("/api/trip", {
        places: r.places,
        days: r.days,
        needs: r.needs,
        origin: r.start.origin,
        startAddress: r.start.address,
        date,
        offset,
        now,
        startDate: r.startDate,
        dayStart: r.dayStart,
        dayEnd: r.dayEnd,
      });
      setTrip(t);
      setTripNewIds({});
      setTripSaved(false);
      setVisited(new Set());
      go("trip");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  /** Keep the saved copy (if any) in step with the trip on screen. */
  function persist(t: Trip, isSaved = tripSaved) {
    if (!isSaved) return;
    const s = loadTrips().find((x) => x.trip.id === t.id);
    if (s) upsertTrip({ ...s, trip: t });
  }

  /** Re-check days against fresh data (hours, outages, routes) and record what changed. One at a time. */
  async function recheckDays(t: Trip, idxs: number[], isSaved = tripSaved) {
    let working = t;
    for (const i of idxs) {
      const day = working.dayPlans[i];
      if (!day) continue;
      setCheckingDay(i);
      try {
        const r = await post<Rechecked>("/api/recheck", { plan: day.plan, now: localDateAndOffset().now });
        working = { ...working, dayPlans: working.dayPlans.map((d, j) => (j === i ? { ...d, plan: r.plan, changes: r.changes, checkedAt: r.checkedAt } : d)) };
        setTripNewIds((m) => ({ ...m, [day.date]: changedIds(day.plan, r.plan) }));
        setTrip(working);
        persist(working, isSaved);
      } catch (e) {
        fail(e);
        break;
      } finally {
        setCheckingDay(undefined);
      }
    }
  }

  /** Days that are today or tomorrow and haven't been checked in the last hour. */
  function staleSoonDays(t: Trip): number[] {
    const today = localDateAndOffset().date;
    const tomorrow = addDays(today, 1);
    return t.dayPlans
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => (d.date === today || d.date === tomorrow) && (!d.checkedAt || Date.now() - Date.parse(d.checkedAt) > STALE_MS))
      .map(({ i }) => i);
  }

  function startDay(i: number) {
    if (!trip) return;
    setLiveDay(i);
    go("live");
    // Starting a day that hasn't been checked recently: check it first (in the background).
    const d = trip.dayPlans[i];
    if (d && (!d.checkedAt || Date.now() - Date.parse(d.checkedAt) > STALE_MS / 2)) recheckDays(trip, [i]);
  }

  /** The pitch moment: the same day as a normal map app would plan it. */
  async function compareDay(i: number) {
    if (!trip?.dayPlans[i]) return;
    setCmp({ day: i, normal: null });
    go("compare");
    try {
      const normal = await post<Plan>("/api/compare", { request: compareRequest(trip, i) });
      setCmp({ day: i, normal });
    } catch (e) {
      fail(e);
    }
  }

  function saveTrip() {
    if (!trip) return;
    upsertTrip({ trip, savedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), visited: [...visited] });
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
    }
  }

  /** + / −, Start at, day times, or a live change on a stop: re-plans that one day (and updates the saved copy). */
  async function adjustTripDay(i: number, events: Event[]) {
    if (!trip?.dayPlans[i]) return;
    const day = trip.dayPlans[i];
    setTripBusyDay(i);
    setError("");
    try {
      let next = day.plan;
      for (const e of events) next = await post<Plan>("/api/replan", { plan: next, event: e, now: localDateAndOffset().now });
      // The user's own change: the old "what changed" list no longer applies.
      const updated: Trip = { ...trip, dayPlans: trip.dayPlans.map((d, j) => (j === i ? { ...d, plan: next, changes: undefined } : d)) };
      setTripNewIds((m) => ({ ...m, [day.date]: changedIds(day.plan, next) }));
      setTrip(updated);
      persist(updated);
    } catch (e) {
      fail(e);
    } finally {
      setTripBusyDay(undefined);
    }
  }

  const live = liveDay != null ? trip?.dayPlans[liveDay] : undefined;
  const cmpDay = cmp ? trip?.dayPlans[cmp.day] : undefined;

  return (
    <div className={`app${screen === "compare" ? " wide" : ""}`}>
      <IconSprite />
      <div className="topbar">
        <div className="brand">
          <Icon name="roll" />
          EazyRoam
        </div>
      </div>

      <div aria-live="assertive">{error && <p className="note-line error-line">{error}</p>}</div>

      {screen === "vac" && (
        <VacationSetup
          busy={busy}
          saved={saved}
          onSubmit={planTrip}
          onOpen={(s) => {
            setTrip(s.trip);
            setTripNewIds({});
            setVisited(new Set(s.visited));
            setTripSaved(true);
            go("trip");
            // A trip planned weeks ago: check today's and tomorrow's days again with fresh data.
            const stale = staleSoonDays(s.trip);
            if (stale.length) recheckDays(s.trip, stale, true);
          }}
          onRemove={(id) => storeTrips(loadTrips().filter((t) => t.trip.id !== id))}
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
          today={today}
          tomorrow={today && addDays(today, 1)}
          onStart={startDay}
          onRecheck={(i) => recheckDays(trip, [i])}
          checkingDay={checkingDay}
          onCompare={compareDay}
        />
      )}

      {screen === "live" && trip && live && liveDay != null && (
        <LiveDay
          key={live.plan.id}
          plan={live.plan}
          title={`Day ${liveDay + 1} · ${dayName(live.date)}`}
          isToday={live.date === today}
          endName={trip.input.startLabel ?? "where you’re staying"}
          visited={new Set(live.plan.stops.map((s) => s.placeId).filter((id) => visited.has(`${live.date}:${id}`)))}
          onVisited={(id, v) => toggleVisited(`${live.date}:${id}`, v)}
          onEvent={(events) => adjustTripDay(liveDay, events)}
          busy={tripBusyDay === liveDay || checkingDay === liveDay}
          onExit={() => go("trip")}
        />
      )}

      {screen === "compare" && cmp && cmpDay && (
        <main id="compare">
          <button className="back" onClick={() => go("trip")}>
            <Icon name="back" />
            Back to the trip
          </button>
          <h1>Day {cmp.day + 1}, two plans</h1>
          <p className="sub">What a normal map app plans for the places you picked, checked the way EazyRoam checks everything.</p>
          {cmp.normal ? <CompareView normal={cmp.normal} mine={cmpDay.plan} /> : <p className="hint" style={{ marginTop: 24 }}>Building the normal plan…</p>}
        </main>
      )}
    </div>
  );
}
