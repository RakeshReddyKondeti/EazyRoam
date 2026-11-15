"use client";

// MapLibre GL + OpenFreeMap tiles (no key, nothing self-hosted). Numbered stops, route lines, elevator outages.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import type { LatLng, Plan } from "@/lib/types";
import { PlaceCard } from "./PlaceCard";
import { decodePolyline } from "./polyline";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";

function endpoint(plan: Plan, id: string): LatLng {
  return id === "home" ? plan.request.origin : (plan.places[id]?.location ?? plan.request.origin);
}

function pin(className: string, text: string, label: string, onClick?: () => void) {
  const el = document.createElement(onClick ? "button" : "div");
  el.className = className;
  el.textContent = text;
  el.setAttribute("aria-label", label);
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

export function MapView({ plan }: { plan: Plan }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<MlMarker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(plan.stops[0]?.placeId);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    // If the map hasn't loaded in 15 s (blocked tiles, no WebGL), say so instead of showing a blank box.
    const timer = setTimeout(() => !cancelled && !loaded && setFailed(true), 15000);
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !box.current) return;
        // MapLibre v6 computes its worker URL at runtime, which the bundler can't serve;
        // scripts/copy-map-worker.mjs puts the worker in public/ before dev and build.
        ml.setWorkerUrl("/maplibre-gl-worker.mjs");
        const m = new ml.Map({ container: box.current, style: STYLE, center: [plan.request.origin.lng, plan.request.origin.lat], zoom: 12, attributionControl: { compact: true } });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.on("load", () => {
          loaded = true;
          if (!cancelled) setReady(true);
        });
        m.on("error", (e) => console.warn("map:", e.error?.message));
        map.current = m;
      } catch (e) {
        console.warn("map failed to start:", e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the plan whenever it changes.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    let alive = true;
    (async () => {
      const ml = await import("maplibre-gl");
      if (!alive) return;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6A5AE0";
      const features = plan.legs.map((l) => {
        const coords = l.polyline
          ? decodePolyline(l.polyline)
          : [endpoint(plan, l.fromId), endpoint(plan, l.toId)].map((p) => [p.lng, p.lat] as [number, number]);
        return { type: "Feature" as const, properties: { dashed: !l.polyline }, geometry: { type: "LineString" as const, coordinates: coords } };
      });
      const data = { type: "FeatureCollection" as const, features };
      const src = m.getSource("route") as { setData?: (d: unknown) => void } | undefined;
      if (src?.setData) src.setData(data);
      else {
        m.addSource("route", { type: "geojson", data });
        m.addLayer({ id: "route", type: "line", source: "route", filter: ["!", ["get", "dashed"]], paint: { "line-color": accent, "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });
        m.addLayer({ id: "route-est", type: "line", source: "route", filter: ["get", "dashed"], paint: { "line-color": accent, "line-width": 4, "line-dasharray": [1.5, 1.5], "line-opacity": 0.7 } });
      }

      markers.current.forEach((mk) => mk.remove());
      markers.current = [];
      const add = (el: HTMLElement, p: LatLng) => markers.current.push(new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
      add(pin("pin pin-home", "H", "Start and home"), plan.request.origin);
      plan.stops.forEach((s, i) => {
        const p = plan.places[s.placeId];
        if (p) add(pin(`pin pin-num s-${s.status}`, String(i + 1), `Stop ${i + 1}: ${p.name}`, () => setSelected(s.placeId)), p.location);
      });
      for (const l of plan.legs) for (const s of l.stops) if (s.elevatorOut) add(pin("pin pin-out", "!", `Elevator out at ${s.name}`), s.location);

      const bounds = new ml.LngLatBounds();
      for (const f of features) for (const c of f.geometry.coordinates) bounds.extend(c);
      if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
    })();
    return () => {
      alive = false;
    };
  }, [plan, ready]);

  const idx = plan.stops.findIndex((s) => s.placeId === selected);
  const stop = plan.stops[idx];
  const place = selected ? plan.places[selected] : undefined;

  return (
    <section className="mapview" aria-label="Map of your day">
      <div className="mapbox">
        {failed ? <p className="hint map-fallback">The map couldn’t load. The list view has everything.</p> : <div ref={box} className="map-canvas" />}
      </div>
      <p className="hint">Tap a numbered stop to see its accessibility. Dashed lines are estimates.</p>
      {place && <PlaceCard place={place} stop={stop} index={idx} backup={stop?.backupId ? plan.places[stop.backupId] : undefined} />}
    </section>
  );
}
