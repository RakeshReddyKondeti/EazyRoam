"use client";

import { useState } from "react";
import type { Event, Place, PlanStop, Want } from "@/lib/types";
import { accessTone, accessWord, fmtTime, stayLabel, stopStatus } from "./format";
import { StatusPill } from "./StatusPill";

type Props = {
  stop: PlanStop;
  place?: Place;
  backup?: Place;
  isNew?: boolean;
  /** The request item this stop came from (stay length, start time, timed). */
  want?: Want;
  /** Today: + / − stay and "Start at". Sends the changes as re-plan events. */
  onAdjust?: (events: Event[]) => void;
  busy?: boolean;
  /** Vacation mode: "I've been here" checkbox. */
  visited?: boolean;
  onVisited?: (v: boolean) => void;
};

const STEP = 15;
const minsBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
const lenLabel = (m: number) => {
  const h = Math.floor(m / 60);
  return h ? `${h} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
};

/** + / − for how long to stay, and a start time. Changes collect locally; "Update plan" sends them once. */
function StayEditor({ stop, want, busy, onAdjust }: { stop: PlanStop; want?: Want; busy?: boolean; onAdjust: (e: Event[]) => void }) {
  const planned = minsBetween(stop.arrive, stop.depart);
  const [minutes, setMinutes] = useState(planned);
  const [at, setAt] = useState(want?.at ?? "");
  const stayChanged = minutes !== planned;
  const atChanged = at !== (want?.at ?? "");

  function apply() {
    const events: Event[] = [];
    if (atChanged) events.push({ type: "setTime", placeId: stop.placeId, at: at || null });
    if (stayChanged) events.push({ type: "setStay", placeId: stop.placeId, minutes });
    if (events.length) onAdjust(events);
  }

  return (
    <div className="adjust">
      <div className="adjust-row">
        <span className="adjust-label" id={`stay-${stop.placeId}`}>Stay</span>
        <div className="stepper" role="group" aria-labelledby={`stay-${stop.placeId}`}>
          <button type="button" aria-label={`${STEP} minutes shorter`} disabled={minutes <= STEP} onClick={() => setMinutes((m) => Math.max(STEP, m - STEP))}>
            −
          </button>
          <output aria-live="polite">{lenLabel(minutes)}</output>
          <button type="button" aria-label={`${STEP} minutes longer`} disabled={minutes >= 600} onClick={() => setMinutes((m) => Math.min(600, m + STEP))}>
            +
          </button>
        </div>
      </div>
      <label className="adjust-row">
        <span className="adjust-label">Start at</span>
        <input className="input adjust-time" type="time" value={at} onChange={(e) => setAt(e.target.value)} />
        {at && (
          <button type="button" className="link" onClick={() => setAt("")}>
            Any time
          </button>
        )}
      </label>
      {(stayChanged || atChanged) && (
        <button type="button" className="ghost adjust-apply" disabled={busy} onClick={apply}>
          {busy ? "Updating…" : "Update plan"}
        </button>
      )}
    </div>
  );
}

/** One stop in the day list (.stop). Opens to show per-feature access, the stay editor and any backup. */
export function StopRow({ stop, place, backup, isNew, want, onAdjust, busy, visited, onVisited }: Props) {
  const { tone, label } = stopStatus(stop);
  const name = place?.name ?? stop.placeId;
  const needsTime = Boolean(want?.timed && !want.at);
  const parts = place
    ? ([
        ["Entrance", place.access.entrance],
        ["Restroom", place.access.restroom],
        ["Seating", place.access.seating],
      ] as const)
    : [];

  return (
    <li className={`stop${isNew ? " new fade" : ""}${visited ? " done" : ""}`}>
      <details open={needsTime && Boolean(onAdjust) ? true : undefined}>
        <summary>
          <span className="t">{fmtTime(stop.arrive)}</span>
          <span className="n">
            {name}
            <small>
              {place?.category ?? "Stop"} · <span className={`s-${tone}`}>{label}</span> · {stayLabel(stop.arrive, stop.depart)}
              {needsTime && <span className="achip warn needs-time">Set start time</span>}
            </small>
          </span>
          <StatusPill access={place?.overall ?? "unknown"} />
        </summary>
        <div className="more">
          {needsTime && (
            <div className="unknown">
              <b>This starts at a set time.</b> We planned it at {fmtTime(stop.arrive)} as a guess. Set your start time below and we’ll plan around it.
            </div>
          )}
          {parts.map(([k, v]) => (
            <span key={k}>
              {k}: <b className={`s-${accessTone(v)}`}>{accessWord(v)}</b>
            </span>
          ))}
          {stop.status === "unknown" && (
            <span>{place?.phone ? `Call ${place.phone} before you go.` : "Call ahead before you go."}</span>
          )}
          {stop.reasons.map((r) => (
            <span key={r}>{r}</span>
          ))}
          {backup && <span className="alt">Backup: {backup.name}</span>}
          <span>
            {fmtTime(stop.arrive)}–{fmtTime(stop.depart)}
            {place?.address ? ` · ${place.address}` : ""}
          </span>
          {onAdjust && (
            <StayEditor key={`${stop.arrive}|${stop.depart}|${want?.at ?? ""}`} stop={stop} want={want} busy={busy} onAdjust={onAdjust} />
          )}
          {onVisited && (
            <label className="visit">
              <input type="checkbox" checked={!!visited} onChange={(e) => onVisited(e.target.checked)} />
              I’ve been here
            </label>
          )}
        </div>
      </details>
    </li>
  );
}
