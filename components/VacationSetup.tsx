"use client";

// Vacation setup (#vac): trip length, places to visit, where you're staying, saved trips.
import { useState } from "react";
import type { Needs } from "@/lib/types";
import { useCycle } from "./AskForm";
import { NeedsChips } from "./NeedsChips";
import type { SavedTrip } from "./savedTrips";
import { type Start, StartField } from "./StartField";

const LENGTHS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
];
const STEPS = ["Finding places…", "Checking entrances…", "Sorting your days…", "Checking routes…"];
// Real places as a starting example; remove or replace them.
const EXAMPLE = ["New England Aquarium", "Museum of Fine Arts, Boston", "Boston Public Library", "Faneuil Hall", "Boston Common"];

export type TripRequest = { places: string[]; days: number; needs: Needs; start: Start };

type Props = {
  busy: boolean;
  saved: SavedTrip[];
  onSubmit: (r: TripRequest) => void;
  onOpen: (t: SavedTrip) => void;
  onRemove: (id: string) => void;
};

export function VacationSetup({ busy, saved, onSubmit, onOpen, onRemove }: Props) {
  const [days, setDays] = useState(3);
  const [places, setPlaces] = useState<string[]>(EXAMPLE);
  const [draft, setDraft] = useState("");
  const [needs, setNeeds] = useState<Needs>({ noSteps: true, gentleSlopes: true, restroom: false });
  const [start, setStart] = useState<Start>({ address: "Boston, MA" });
  const step = useCycle(busy, STEPS.length);

  const add = () => {
    const v = draft.trim();
    if (v && !places.some((p) => p.toLowerCase() === v.toLowerCase())) setPlaces([...places, v]);
    setDraft("");
  };

  return (
    <main id="vac">
      <div>
        <h1>Plan a trip</h1>
        <p className="sub">Add the places you want to see. We’ll sort them into days and tell you which ones aren’t accessible.</p>
      </div>

      <div>
        <p className="label" id="lenLabel">How long?</p>
        <div className="seg" role="group" aria-labelledby="lenLabel">
          {LENGTHS.map((l) => (
            <button key={l.days} aria-pressed={days === l.days} onClick={() => setDays(l.days)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label">Places to visit</p>
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
            <span className="sub">No places yet. Add one below.</span>
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
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a place, e.g. Boston Children’s Museum" aria-label="Add a place" autoComplete="off" />
        <button className="ghost" type="submit">
          Add
        </button>
      </form>

      <StartField label="Where you’re staying" placeholder="Hotel or address" value={start} onChange={setStart} />
      <NeedsChips needs={needs} onChange={setNeeds} />

      <button
        className="primary"
        disabled={busy || !places.length}
        onClick={() => onSubmit({ places, days, needs, start: { origin: start.origin, address: start.address?.trim() || undefined } })}
      >
        {busy ? STEPS[step] : "Plan my trip"}
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
