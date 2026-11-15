"use client";

// "Starting from" input + "Use my location". Shared by Today (home) and Vacation (where you're staying).
import { useState } from "react";
import type { LatLng } from "@/lib/types";

export type Start = { origin?: LatLng; address?: string };

type Props = { label: string; placeholder: string; value: Start; onChange: (s: Start) => void };

export function StartField({ label, placeholder, value, onChange }: Props) {
  const [msg, setMsg] = useState("");

  function locate() {
    if (!navigator.geolocation) return setMsg("Location isn’t available here. Type an address instead.");
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({ origin: { lat: p.coords.latitude, lng: p.coords.longitude } });
        setMsg("Using your current location.");
      },
      () => setMsg("Couldn’t get your location. Type an address instead."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <div>
      <p className="label" id={`${label}-l`}>{label}</p>
      <div className="addrow">
        <input
          className="input"
          aria-labelledby={`${label}-l`}
          placeholder={value.origin ? "Current location" : placeholder}
          value={value.address ?? ""}
          onChange={(e) => {
            onChange({ address: e.target.value });
            setMsg("");
          }}
          autoComplete="street-address"
        />
        <button type="button" className="ghost" onClick={locate}>
          Use my location
        </button>
      </div>
      {msg && (
        <p className="sub start-msg" aria-live="polite">
          {msg}
        </p>
      )}
    </div>
  );
}
