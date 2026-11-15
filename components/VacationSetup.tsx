"use client";

// Vacation setup (#vac): where you're going → its top sights to pick from → trip length,
// where you're staying, needs → "Plan my trip". Saved trips below.
import { useState } from "react";
import type { Attraction } from "@/lib/data/attractions";
import type { Needs } from "@/lib/types";
import { useCycle } from "./AskForm";
import { accessTone } from "./format";
import { Icon } from "./Icons";
import { NeedsChips } from "./NeedsChips";
import type { SavedTrip } from "./savedTrips";
import { type Start, StartField } from "./StartField";

export const MAX_TRIP_DAYS = 14;
const SHORTCUTS = [
  { days: 2, label: "Weekend" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
];
const STEPS = ["Finding places…", "Checking entrances…", "Sorting your days…", "Checking routes…"];
const daysLabel = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const ACCESS_TEXT = { yes: "Accessible entrance", limited: "Partly accessible", no: "Not accessible", unknown: "Access unknown" } as const;

export type TripRequest = { places: string[]; days: number; needs: Needs; start: Start };

type Props = {
  busy: boolean;
  saved: SavedTrip[];
  onSubmit: (r: TripRequest) => void;
  onOpen: (t: SavedTrip) => void;
  onRemove: (id: string) => void;
};

export function VacationSetup({ busy, saved, onSubmit, onOpen, onRemove }: Props) {
  const [city, setCity] = useState("");
  const [sights, setSights] = useState<{ city: string; list: Attraction[] } | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");
  const [days, setDays] = useState(3);
  const [places, setPlaces] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [needs, setNeeds] = useState<Needs>({ noSteps: true, gentleSlopes: true, restroom: false });
  const [start, setStart] = useState<Start>({});
  const step = useCycle(busy, STEPS.length);

  async function findSights() {
    const c = city.trim();
    if (!c || finding) return;
    setFinding(true);
    setFindError("");
    try {
      const res = await fetch(`/api/attractions?city=${encodeURIComponent(c)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSights({ city: c, list: data.attractions as Attraction[] });
      if (!data.attractions.length) setFindError(`We couldn’t find top sights for “${c}”. Try adding the state, e.g. “Portland, OR”.`);
      // Where you're staying starts as the city until they type a hotel.
      if (!start.origin && !start.address?.trim()) setStart({ address: c });
    } catch (e) {
      setFindError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinding(false);
    }
  }

  const toggle = (name: string) => setPlaces((ps) => (ps.includes(name) ? ps.filter((p) => p !== name) : [...ps, name]));
  const add = () => {
    const v = draft.trim();
    if (v && !places.some((p) => p.toLowerCase() === v.toLowerCase())) setPlaces([...places, v]);
    setDraft("");
  };

  return (
    <main id="vac">
      <div>
        <h1>Plan a trip</h1>
        <p className="sub">Tell us where you’re going. We’ll show the top sights, check which are accessible, and sort your picks into days.</p>
      </div>

      {/* 1. Where */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          findSights();
        }}
      >
        <p className="label" id="cityLabel">Where are you going?</p>
        <div className="addrow">
          <input className="input" aria-labelledby="cityLabel" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City, e.g. Chicago or San Diego, CA" autoComplete="address-level2" />
          <button className="ghost" type="submit" disabled={finding || !city.trim()}>
            {finding ? "Finding…" : "Show top sights"}
          </button>
        </div>
      </form>
      <div aria-live="polite">{findError && <p className="note-line">{findError}</p>}</div>

      {/* 2. Pick sights */}
      {sights && sights.list.length > 0 && (
        <section aria-label={`Top sights in ${sights.city}`}>
          <div className="sights-head">
            <p className="label">Top sights in {sights.city}</p>
            <span className="sub">{places.filter((p) => sights.list.some((a) => a.name === p)).length} picked</span>
          </div>
          <ul className="sights">
            {sights.list.map((a) => {
              const on = places.includes(a.name);
              return (
                <li key={a.id}>
                  <button type="button" className={`sight${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(a.name)}>
                    <span className="sight-check" aria-hidden="true">{on ? "✓" : "+"}</span>
                    <span className="sight-body">
                      <b>{a.name}</b>
                      <small>
                        {a.kind ?? "Attraction"}
                        {a.rating ? ` · ★ ${a.rating.toFixed(1)}` : ""}
                        {a.ratings ? ` (${a.ratings.toLocaleString("en-US")})` : ""}
                      </small>
                      <span className={`achip ${accessTone(a.access)}`}>
                        <Icon name="chair" /> {ACCESS_TEXT[a.access]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hint" style={{ textAlign: "left" }}>
            Places that aren’t accessible can still be picked; we’ll tell you why we left them out.
          </p>
        </section>
      )}

      {/* 3. Your list */}
      <div>
        <p className="label">Your places</p>
        <div className="vplaces">
          {places.length ? (
            places.map((p) => (
              <span key={p} className="vchip">
                {p}
                <button type="button" aria-label={`Remove ${p}`} onClick={() => setPlaces(places.filter((x) => x !== p))}>
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className="sub">{sights ? "Pick sights above, or add your own below." : "Choose a city first, or add places yourself."}</span>
          )}
        </div>
      </div>
      <form
        className="addrow"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add your own place" aria-label="Add your own place" autoComplete="off" />
        <button className="ghost" type="submit">
          Add
        </button>
      </form>

      {/* 4. Trip details */}
      <div>
        <p className="label" id="lenLabel">How long?</p>
        <div className="triplen">
          <div className="stepper" role="group" aria-labelledby="lenLabel">
            <button type="button" aria-label="One day fewer" disabled={days <= 1} onClick={() => setDays((d) => Math.max(1, d - 1))}>
              −
            </button>
            <output aria-live="polite">{daysLabel(days)}</output>
            <button type="button" aria-label="One day more" disabled={days >= MAX_TRIP_DAYS} onClick={() => setDays((d) => Math.min(MAX_TRIP_DAYS, d + 1))}>
              +
            </button>
          </div>
          <div className="needs" role="group" aria-label="Quick lengths">
            {SHORTCUTS.map((l) => (
              <button key={l.days} type="button" className="chip" aria-pressed={days === l.days} onClick={() => setDays(l.days)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <StartField label="Where you’re staying" placeholder="Hotel or address" value={start} onChange={setStart} />
      <NeedsChips needs={needs} onChange={setNeeds} />

      <button
        className="primary"
        disabled={busy || !places.length}
        onClick={() => onSubmit({ places, days, needs, start: { origin: start.origin, address: start.address?.trim() || undefined } })}
      >
        {busy ? STEPS[step] : places.length ? `Plan my trip (${places.length} place${places.length === 1 ? "" : "s"})` : "Plan my trip"}
      </button>

      {saved.length > 0 && (
        <div>
          <p className="label">Saved trips</p>
          <ul className="saved">
            {saved.map((s) => {
              const n = s.trip.dayPlans.reduce((a, d) => a + d.plan.stops.length, 0);
              return (
                <li key={s.trip.id}>
                  <button className="open" onClick={() => onOpen(s)}>
                    <b>{s.trip.title}</b>
                    <span>
                      {n} places · saved {s.savedAt}
                      {s.visited.length ? ` · ${s.visited.length} visited` : ""}
                    </span>
                  </button>
                  <button className="rm" aria-label={`Remove ${s.trip.title}`} onClick={() => onRemove(s.trip.id)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
