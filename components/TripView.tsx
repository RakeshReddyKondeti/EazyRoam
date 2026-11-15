"use client";

// Vacation trip (#trip): one day block per day, the places left out and why, a map per day.
import dynamic from "next/dynamic";
import { useState } from "react";
import type { Event, Trip } from "@/lib/types";
import { DayList } from "./DayList";
import { Icon } from "./Icons";
import { StatusPill } from "./StatusPill";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <p className="hint" style={{ marginTop: 24 }}>Loading map…</p>,
});

const dayName = (date: string) =>
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
};

export function TripView({ trip, saved, visited, onVisited, onSave, onBack, onAdjust, busyDay, newIds }: Props) {
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
                <span>{dayName(d.date)}</span>
              </div>
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
