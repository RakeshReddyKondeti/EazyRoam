"use client";

// Live day (#live): one trip day as a few big moments — get to a place, stay, get to the next.
// Inside a journey, GPS (or the clock) moves through the steps by itself; the phone only asks for
// attention when you have to act: board, get off soon, arrive. One tap per place, not per step.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Event, LatLng, Plan } from "@/lib/types";
import { ChangeSheet } from "./ChangeSheet";
import { fmtTime, stayLabel, stopStatus } from "./format";
import { Icon, type IconName } from "./Icons";
import { stopChip } from "./LegRow";
import {
  type LiveItem,
  type Part,
  activePart,
  isNear,
  journeySummary,
  liveItems,
  minutesBehind,
  moveText,
  nearingStop,
  nextAction,
  reachedParts,
  startIndex,
} from "./live";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <p className="hint" style={{ marginTop: 24 }}>Loading map…</p>,
});

type Geo = "asking" | "on" | "denied" | "unsupported";
type Me = LatLng & { accuracy: number };
type Go = Extract<LiveItem, { kind: "go" }>;

const BEHIND_MIN = 15;
const ICON: Record<string, IconName> = { roll: "chair", bus: "bus", rail: "train" };

type Props = {
  plan: Plan;
  title: string; // "Day 2 · Sat, Nov 21"
  isToday: boolean; // the clock and behind-schedule checks only make sense on the day itself
  endName: string;
  visited: Set<string>;
  onVisited: (placeId: string, v: boolean) => void;
  onEvent: (events: Event[]) => void;
  busy: boolean;
  onExit: () => void;
};

function StopChip({ name, item }: { name?: string; item: Go }) {
  if (!name) return null;
  const c = stopChip(item.leg.stops.find((s) => s.name === name));
  return <span className={`achip ${c.tone}`}>{c.text}</span>;
}

/** The whole journey to a place: every step listed, the current one highlighted, finished ones ticked. */
function GoCard({ item, active, soon, alertsOn }: { item: Go; active: number; soon: boolean; alertsOn: boolean }) {
  const action = nextAction(item.parts, active, item.toName);
  return (
    <>
      <div className="now-kind">
        {item.parts.map((p, k) => (
          <span key={k} className={`mchip ${p.step.kind}`}>
            <Icon name={ICON[p.step.kind]} />
            {p.step.kind === "roll" ? `${p.step.minutes} min` : p.step.line || (p.step.kind === "bus" ? "Bus" : "Train")}
          </span>
        ))}
      </div>
      <h2 className="now-title">Get to {item.toName}</h2>
      <p className="now-time">
        {journeySummary(item.parts)} · arrive about {fmtTime(item.end)} ({stayLabel(item.start, item.end)})
      </p>

      {soon ? (
        <p className="action soon" role="alert">
          <b>Get off soon:</b> {item.parts[active].step.to ?? "your stop"} is next.
        </p>
      ) : (
        <p className="action">
          <span>Next thing to do</span>
          <b>
            {action.text}
            {action.at ? ` · about ${fmtTime(action.at)}` : ""}
          </b>
          {alertsOn && <small>You can put your phone away. We’ll alert you when it’s time.</small>}
        </p>
      )}

      <ol className="parts-list">
        {item.parts.map((p: Part, k) => (
          <li key={k} className={k < active ? "done" : k === active ? "active" : ""} aria-current={k === active ? "step" : undefined}>
            <span className="pdot" aria-hidden="true">
              {k < active ? "✓" : <Icon name={ICON[p.step.kind]} />}
            </span>
            <span className="ptext">
              {moveText(p.step, item.toName)}
              {p.step.kind !== "roll" && (
                <small>
                  Board {p.step.from ?? "here"} <StopChip name={p.step.from} item={item} /> · get off {p.step.to ?? "at the stop"}{" "}
                  <StopChip name={p.step.to} item={item} />
                </small>
              )}
            </span>
            <span className="t">{fmtTime(p.start)}</span>
          </li>
        ))}
      </ol>
      {item.leg.issues.length > 0 && (
        <div className="leg-issues">
          {item.leg.issues.map((t) => (
            <span key={t} className={`achip ${/^No step-free|out\b/i.test(t) ? "bad" : "warn"}`}>
              {t}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function StayCard({ item, plan }: { item: Extract<LiveItem, { kind: "stay" }>; plan: Plan }) {
  const stop = plan.stops.find((s) => s.placeId === item.placeId);
  const place = plan.places[item.placeId];
  const st = stop ? stopStatus(stop) : null;
  return (
    <>
      <div className="now-kind">
        <span className="mchip roll">
          <Icon name="clock" />
          {stayLabel(item.arrive, item.depart)}
        </span>
        <span className="now-time">until {fmtTime(item.depart)}</span>
      </div>
      <h2 className="now-title">Enjoy {item.name}</h2>
      {st && <p className={`now-detail tone-${st.tone}`}>{st.label}</p>}
      {stop?.status !== "ok" && place?.phone && (
        <p className="now-detail">
          <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}>Call {place.phone}</a> if you need help at the entrance.
        </p>
      )}
    </>
  );
}

function summary(it: LiveItem): { icon: IconName; text: string; at: string } {
  if (it.kind === "go") {
    const ride = it.parts.find((p) => p.step.kind !== "roll");
    return { icon: ICON[ride?.step.kind ?? "roll"], text: `Get to ${it.toName} · ${journeySummary(it.parts)}`, at: it.start };
  }
  if (it.kind === "stay") return { icon: "clock", text: `${it.name} · ${stayLabel(it.arrive, it.depart)}`, at: it.arrive };
  return { icon: "roll", text: `Back at ${it.name}`, at: it.at };
}

/** A short buzz and/or a spoken sentence. Silently does nothing where unsupported (e.g. no vibration on iPhone). */
function alertUser(text: string, buzz: boolean, speak: boolean) {
  try {
    if (buzz && "vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    if (speak && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  } catch {
    // alerts are a bonus; the screen always shows the same thing
  }
}

export function LiveDay({ plan, title, isToday, endName, visited, onVisited, onEvent, busy, onExit }: Props) {
  const items = liveItems(plan, endName);
  const [pos, setPos] = useState(() => startIndex(items, visited));
  const [dir, setDir] = useState<"fwd" | "back">("fwd"); // which way the track animates
  const [view, setView] = useState<"step" | "map">("step");
  const [now, setNow] = useState(() => Date.now());
  const [me, setMe] = useState<Me | null>(null);
  const [geo, setGeo] = useState<Geo>(() => (typeof navigator !== "undefined" && "geolocation" in navigator ? "asking" : "unsupported"));
  const [reached, setReached] = useState(0); // steps of the current journey GPS has seen you finish
  const [buzz, setBuzz] = useState(true);
  const [speak, setSpeak] = useState(false);
  const canBuzz = typeof navigator !== "undefined" && "vibrate" in navigator;

  const i = Math.min(pos, items.length - 1);
  const cur = items[i];
  const curRef = useRef(cur);
  useEffect(() => {
    curRef.current = cur;
  });

  // Clock: moves through steps when there's no GPS, and spots running behind.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  // Follow the phone's location while this screen is open. Only used on this device.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setMe(here);
        setGeo("on");
        const c = curRef.current;
        if (c.kind === "go") setReached((r) => reachedParts(c.parts, here, r));
      },
      (e) => setGeo(e.code === e.PERMISSION_DENIED ? "denied" : "unsupported"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const active = cur.kind === "go" ? activePart(cur.parts, reached, now, isToday && geo !== "on") : 0;
  const soon = cur.kind === "go" && nearingStop(cur.parts[active], me);
  const arrived = Boolean(me && cur.kind === "go" && isNear(me, cur.target));
  const behind = isToday && cur.kind !== "end" ? minutesBehind(cur, now) : 0;
  const done = plan.stops.filter((s) => visited.has(s.placeId)).map((s) => s.placeId);
  const stopsLeft = plan.stops.filter((s) => !visited.has(s.placeId)).length;
  const prev = i > 0 ? items[i - 1] : undefined;
  const nextItem = items[i + 1];
  const later = items.slice(i + 2, i + 4);

  // Alert only at moments that need action: a new step starts, the stop to get off at is close, you've arrived.
  const moment = cur.kind === "go" ? (arrived ? `arrived:${i}` : soon ? `soon:${i}:${active}` : `step:${i}:${active}`) : `item:${i}`;
  const lastMoment = useRef(moment);
  useEffect(() => {
    if (lastMoment.current === moment) return;
    lastMoment.current = moment;
    const c = curRef.current;
    if (c.kind !== "go") return;
    const p = c.parts[active];
    const text = moment.startsWith("arrived")
      ? `You’ve arrived at ${c.toName}.`
      : moment.startsWith("soon")
        ? `Get off soon. ${p?.step.to ?? "Your stop"} is next.`
        : p && p.step.kind !== "roll" // rolling on needs no alert; boarding does
          ? `Board the ${p.step.kind === "bus" ? "bus" : "train"}${p.step.line ? ` ${p.step.line}` : ""}${p.step.from ? ` at ${p.step.from}` : ""}.`
          : "";
    if (text) alertUser(text, buzz, speak);
  }, [moment, active, buzz, speak]);

  const go = (to: number, d: "fwd" | "back") => {
    setDir(d);
    setReached(0);
    setPos(to);
  };
  const next = () => {
    if (cur.kind === "stay") onVisited(cur.placeId, true);
    if (cur.kind === "end") return onExit();
    go(i + 1, "fwd");
  };
  const replanHere = () => onEvent([{ type: "late", minutes: 0, done, ...(me ? { from: { lat: me.lat, lng: me.lng } } : {}) }]);

  const nextLabel = cur.kind === "go" ? `I’m at ${cur.toName}` : cur.kind === "stay" ? "Leave for the next place" : "Finish the day";
  const alertsOn = (buzz && canBuzz) || speak;

  return (
    <main id="live">
      <button className="back" onClick={onExit}>
        <Icon name="back" />
        Back to the trip
      </button>
      <h1>{title}</h1>
      <p className="sub">
        {stopsLeft ? `${stopsLeft} stop${stopsLeft === 1 ? "" : "s"} to go` : "All stops visited"} · back by {fmtTime(plan.endAt)}
      </p>

      <div className="live-status" aria-live="polite">
        {geo === "on" && <span className="achip ok">Location on</span>}
        {geo === "asking" && <span className="achip none">Finding your location…</span>}
        {(geo === "denied" || geo === "unsupported") && <span className="achip none">Location off · following the timetable</span>}
        <span className="alert-toggles" role="group" aria-label="Alerts">
          {canBuzz && (
            <button className="chip" aria-pressed={buzz} onClick={() => setBuzz((b) => !b)}>
              Buzz
            </button>
          )}
          <button className="chip" aria-pressed={speak} onClick={() => setSpeak((s) => !s)}>
            Read aloud
          </button>
        </span>
      </div>

      <div aria-live="polite">{plan.explanation && <div className="note-line">{plan.explanation}</div>}</div>

      {behind >= BEHIND_MIN && (
        <div className="live-alert warn" role="status">
          <p>
            You’re about <b>{behind} min</b> behind the plan.
          </p>
          <button className="ghost" onClick={replanHere} disabled={busy}>
            {busy ? "Re-planning…" : "Re-plan the rest of my day"}
          </button>
        </div>
      )}

      <div className="bar">
        <div className="seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "step"} onClick={() => setView("step")}>
            Now
          </button>
          <button role="tab" aria-selected={view === "map"} onClick={() => setView("map")}>
            Map
          </button>
        </div>
        <button className="link" onClick={replanHere} disabled={busy}>
          {busy ? "Re-planning…" : "Re-plan from here"}
        </button>
      </div>

      {view === "step" ? (
        <>
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${Math.round(((i + 1) / items.length) * 100)}%` }} />
          </div>

          {/* Previous (done) → Now (highlighted) → Next. Keys change on every move, so each card animates in. */}
          <ol className="livetrack" data-dir={dir}>
            {prev && (
              <li key={`prev-${i - 1}`} className="tk tk-prev">
                <span className="tk-dot" aria-hidden="true">✓</span>
                <span className="tk-body">
                  <span className="tk-label">Done</span>
                  <span className="tk-text">{summary(prev).text}</span>
                </span>
              </li>
            )}
            <li key={`now-${i}`} className={`tk tk-now${cur.kind === "end" ? " now-end" : ""}`} aria-label="Now">
              <span className="tk-dot" aria-hidden="true" />
              <div className={`now${arrived ? " arrived" : ""}`} aria-live="polite">
                <p className="label">{cur.kind === "end" ? "Done" : cur.kind === "stay" ? "You’re here" : "On your way"}</p>
                {cur.kind === "go" && <GoCard item={cur} active={active} soon={soon} alertsOn={alertsOn} />}
                {cur.kind === "stay" && <StayCard item={cur} plan={plan} />}
                {cur.kind === "end" && (
                  <>
                    <h2 className="now-title">You’re back. Day done!</h2>
                    <p className="now-detail">
                      {cur.name} · {fmtTime(cur.at)}
                    </p>
                  </>
                )}
                {arrived && cur.kind === "go" && (
                  <p className="action arrived-msg" role="status">
                    <b>Looks like you’ve arrived at {cur.toName}.</b>
                  </p>
                )}
                <div className="now-actions">
                  {i > 0 && (
                    <button className="ghost" onClick={() => go(i - 1, "back")}>
                      Back
                    </button>
                  )}
                  <button className="primary" onClick={next}>
                    {nextLabel}
                  </button>
                </div>
              </div>
            </li>
            {nextItem && (
              <li key={`next-${i + 1}`} className="tk tk-next">
                <span className="tk-dot" aria-hidden="true" />
                <span className="tk-body">
                  <span className="tk-label">Next · {fmtTime(summary(nextItem).at)}</span>
                  <span className="tk-text">
                    <Icon name={summary(nextItem).icon} />
                    {summary(nextItem).text}
                  </span>
                </span>
              </li>
            )}
          </ol>

          {later.length > 0 && (
            <section aria-label="Later">
              <p className="label">Later</p>
              <ol className="upcoming">
                {later.map((it, k) => {
                  const u = summary(it);
                  return (
                    <li key={`${i}-${k}`}>
                      <Icon name={u.icon} />
                      <span>{u.text}</span>
                      <span className="t">{fmtTime(u.at)}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </>
      ) : (
        <MapView plan={plan} me={me ?? undefined} />
      )}

      <ChangeSheet plan={plan} busy={busy} onEvent={(e) => onEvent([e])} />
    </main>
  );
}
