"use client";

import { useEffect, useState } from "react";
import type { LatLng, Needs } from "@/lib/types";

const CHIPS: { key: keyof Needs; label: string }[] = [
  { key: "noSteps", label: "No steps" },
  { key: "gentleSlopes", label: "Gentle slopes" },
  { key: "restroom", label: "Accessible restroom" },
];
const STEPS = ["Finding places…", "Checking ramps…", "Checking elevators…", "Checking hours…"];

export type Start = { origin?: LatLng; address?: string };
type Props = { busy: boolean; onSubmit: (text: string, needs: Needs, start: Start) => void };

/** Ask screen (#ask): free-text plans, where you start, needs chips, "Plan my day". */
export function AskForm({ busy, onSubmit }: Props) {
  const [text, setText] = useState("Lunch, a birthday gift, then the art museum. Leave at 11, home by 6.");
  const [needs, setNeeds] = useState<Needs>({ noSteps: true, gentleSlopes: true, restroom: false });
  const [address, setAddress] = useState("");
  const [origin, setOrigin] = useState<LatLng | undefined>();
  const [locMsg, setLocMsg] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1200);
    return () => {
      clearInterval(t);
      setStep(0);
    };
  }, [busy]);

  function useMyLocation() {
    if (!navigator.geolocation) return setLocMsg("Location isn’t available here. Type an address instead.");
    setLocMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude });
        setAddress("");
        setLocMsg("Using your current location.");
      },
      () => setLocMsg("Couldn’t get your location. Type an address instead."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <form
      id="ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !busy) onSubmit(text.trim(), needs, { origin, address: address.trim() || undefined });
      }}
    >
      <div>
        <h1>Where to today?</h1>
        <p className="sub">Tell us your plans. We’ll check every door, bus and sidewalk.</p>
      </div>
      <textarea aria-label="Your plans for today" value={text} onChange={(e) => setText(e.target.value)} />

      <div>
        <p className="label" id="startLabel">Starting from (and coming home to)</p>
        <div className="addrow">
          <input
            className="input"
            aria-labelledby="startLabel"
            placeholder={origin ? "Current location" : "Address, e.g. 1 Main St, Northampton MA"}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (e.target.value) {
                setOrigin(undefined);
                setLocMsg("");
              }
            }}
            autoComplete="street-address"
          />
          <button type="button" className="ghost" onClick={useMyLocation}>
            Use my location
          </button>
        </div>
        {locMsg && (
          <p className="sub start-msg" aria-live="polite">
            {locMsg}
          </p>
        )}
      </div>

      <div className="needs" role="group" aria-label="My needs">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            className="chip"
            aria-pressed={needs[c.key]}
            onClick={() => setNeeds((n) => ({ ...n, [c.key]: !n[c.key] }))}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? STEPS[step] : "Plan my day"}
      </button>
    </form>
  );
}
