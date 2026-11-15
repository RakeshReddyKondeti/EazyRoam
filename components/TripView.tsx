"use client";

// Vacation trip (#trip): one day block per day, the places left out and why, a map per day.
import dynamic from "next/dynamic";
import { useState } from "react";
import { fmtTime } from "./format";
import type { Event, Trip, TripDay } from "@/lib/types";
import { DayList } from "./DayList";
import { Icon } from "./Icons";
import { StatusPill } from "./StatusPill";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <p className="hint" style={{ marginTop: 24 }}>Loading map…</p>,
});

const checkedLabel = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Under each day's heading: when it was last checked, what changed, or that it will be checked later. */
function CheckLine({ d, today, tomorrow, checking, onRecheck }: { d: TripDay; today: string; tomorrow: string; checking: boolean; onRecheck: () => void }) {
  const ahead = d.date > tomorrow;
  const past = d.date < today;
  const button = !past && (
    <button className="link" onClick={onRecheck} disabled={checking}>
      {checking ? "Checking…" : "Check again"}
    </button>
  );
  if (d.changes?.length)
    return (
      <div className="check changed" role="status">
        <p>
          <b>
            Checked again{d.checkedAt ? ` at ${checkedLabel(d.checkedAt)}` : ""}: {d.changes.length} change{d.changes.length === 1 ? "" : "s"}
          </b>
          {button}
        </p>
        <ul>
          {d.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="check" role="status">
      <p>
        <span>
          {d.changes
            ? `Checked again${d.checkedAt ? ` at ${checkedLabel(d.checkedAt)}` : ""}. Nothing changed.`
            : ahead
              ? "Planned ahead. Routes are for a typical " +
                new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) +
                ". We’ll check hours, routes and elevators again the day before."
              : d.checkedAt
                ? `Checked ${checkedLabel(d.checkedAt)}.`
                : "Not checked yet."}
        </span>
        {button}
      </p>
    </div>
  );
}

const hhmm = (iso: string) => iso.match(/T(\d{2}:\d{2})/)?.[1] ?? "";

/** "Leave 10:00 AM · back by 6:00 PM" with a Change button that opens two time fields. */
function DayTimes({ d, busy, onAdjust }: { d: TripDay; busy: boolean; onAdjust: (events: Event[]) => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(hhmm(d.plan.request.start));
  const [end, setEnd] = useState(hhmm(d.plan.request.end));
  const bad = end <= start;
  const changed = start !== hhmm(d.plan.request.start) || end !== hhmm(d.plan.request.end);
  if (!open)
    return (
      <p className="daytimes">
        <span>
          Leave {fmtTime(d.plan.request.start)} · back by {fmtTime(d.plan.request.end)}
        </span>
        <button className="link" onClick={() => setOpen(true)}>
          Change times
        </button>
      </p>
    );
  return (
    <div className="adjust">
      <div className="timerow">
        <label className="timefield">
          <span className="label">Leave at</span>
          <input className="input" type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        <label className="timefield">
          <span className="label">Back by</span>
          <input className="input" type="time" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} aria-invalid={bad} />
        </label>
      </div>
      {bad && <p className="hint" style={{ textAlign: "left" }}>“Back by” has to be later than when you leave.</p>}
      <div className="adjust-row">
        <button
          className="ghost adjust-apply"
          disabled={busy || bad || !changed}
          onClick={() => {
            onAdjust([{ type: "setDay", start, end }]);
            setOpen(false);
          }}
        >
          {busy ? "Updating…" : "Update this day"}
        </button>
        <button className="link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export const dayName = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

type Props = {
  trip: Trip;
  saved: boolean;
  visited: Set<string>; // "<date>:<placeId>"
  onVisited: (key: string, v: boolean) => void;
  onSave: () => void;
  onBack: () => void;
  /** + / − stay and Start at on a stop: re-plans that day only. */
  onAdjust: (dayIndex: number, events: Event[]) => void;
  busyDay?: number; // index of the day being re-planned
  newIds?: Record<string, Set<string>>; // changed rows per day (by date), for the highlight
  today: string; // YYYY-MM-DD, the viewer's date
  tomorrow: string;
  onStart: (dayIndex: number) => void; // open the live day
  onRecheck: (dayIndex: number) => void;
  checkingDay?: number;
  onCompare: (dayIndex: number) => void; // the same day as a normal map app plans it
};

export function TripView({ trip, saved, visited, onVisited, onSave, onBack, onAdjust, busyDay, newIds, today, tomorrow, onStart, onRecheck, checkingDay, onCompare }: Props) {
  const [view, setView] = useState<"list" | "map">("list");
  const [day, setDay] = useState(0);
  const planned = trip.dayPlans.reduce((n, d) => n + d.plan.stops.length, 0);
  const calls = trip.dayPlans.reduce((n, d) => n + d.plan.stops.filter((s) => s.status === "unknown").length, 0);
  const problems = trip.dayPlans.reduce((n, d) => n + d.plan.stops.filter((s) => s.status === "bad").length, 0);

  return (
    <main id="trip">
      <button className="back" onClick={onBack}>
        <Icon name="back" />
        Edit trip
      </button>
      <h1>Your {trip.title.toLowerCase()}</h1>
      <p className="sub">
        {planned} place{planned === 1 ? "" : "s"} planned
        {calls ? ` · ${calls} to call ahead` : ""}
        {problems ? ` · ${problems} with problems` : ""}
        {trip.leftOut.length ? ` · ${trip.leftOut.length} not accessible` : ""}
      </p>
      <div className="bar">
        <div className="seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>
            List
          </button>
          <button role="tab" aria-selected={view === "map"} onClick={() => setView("map")} disabled={!trip.dayPlans.length}>
            Map
          </button>
        </div>
        <button className="link" onClick={onSave} disabled={saved}>
          {saved ? "Saved ✓" : "Save trip"}
        </button>
      </div>

      {view === "list" ? (
        <>
          {trip.dayPlans.map((d, i) => (
            <section key={d.date} className="dayblock">
              <div className="dayhead">
                <h2>Day {i + 1}</h2>
                <span>
                  {dayName(d.date)}
                  {d.date === today ? " · Today" : d.date === tomorrow ? " · Tomorrow" : ""}
                </span>
              </div>
              <DayTimes key={`${d.plan.request.start}|${d.plan.request.end}`} d={d} busy={busyDay === i} onAdjust={(events) => onAdjust(i, events)} />
              <CheckLine d={d} today={today} tomorrow={tomorrow} checking={checkingDay === i} onRecheck={() => onRecheck(i)} />
              {d.plan.stops.length > 0 && (
                <button className={d.date === today ? "primary start-day" : "ghost start-day"} onClick={() => onStart(i)}>
                  <Icon name="chair" />
                  {d.date === today ? "Start today" : "Start this day"}
                </button>
              )}
              {d.plan.stops.length > 0 && (
                <button className="link compare-day" onClick={() => onCompare(i)}>
                  Compare with a normal map app
                </button>
              )}
              {d.plan.explanation && <div className="note-line">{d.plan.explanation}</div>}
              <DayList
                plan={d.plan}
                startLabel="Leave"
                endLabel="Back to where you’re staying"
                visited={new Set(d.plan.stops.map((s) => s.placeId).filter((id) => visited.has(`${d.date}:${id}`)))}
                onVisited={(id, v) => onVisited(`${d.date}:${id}`, v)}
                onAdjust={(events) => onAdjust(i, events)}
                busy={busyDay === i}
                newIds={newIds?.[d.date]}
              />
            </section>
          ))}

          {trip.freeDays > 0 && (
            <div className="block free">
              <h3>
                {trip.freeDays === 1
                  ? `Day ${trip.dayPlans.length + 1} is free`
                  : `Days ${trip.dayPlans.length + 1}–${trip.input.days} are free`}
              </h3>
              <span className="sub">Rest, or add more places to fill {trip.freeDays === 1 ? "it" : "them"}.</span>
            </div>
          )}

          {trip.leftOut.length > 0 && (
            <div className="block left">
              <h3>Not accessible, so we left these out</h3>
              <ul>
                {trip.leftOut.map(({ place, reason }) => (
                  <li key={place.id}>
                    <b>
                      {place.name} <StatusPill access={place.overall} />
                    </b>
                    <span>
                      {reason}
                      {place.phone ? `. Call ${place.phone} to ask about another entrance.` : "."}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trip.notFound.length > 0 && (
            <div className="block over">
              <h3>We couldn’t find these</h3>
              <ul>
                {trip.notFound.map((n) => (
                  <li key={n}>
                    <b>{n}</b>
                    <span>Try the full name or add the city.</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        trip.dayPlans[day] && (
          <>
            <div className="seg" role="tablist" aria-label="Day" style={{ marginTop: 20 }}>
              {trip.dayPlans.map((d, i) => (
                <button key={d.date} role="tab" aria-selected={i === day} onClick={() => setDay(i)}>
                  Day {i + 1}
                </button>
              ))}
            </div>
            <MapView key={trip.dayPlans[day].date} plan={trip.dayPlans[day].plan} />
          </>
        )
      )}
    </main>
  );
}
