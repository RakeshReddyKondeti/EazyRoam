import type { Place, PlanStop } from "@/lib/types";
import { accessTone, accessWord, fmtTime } from "./format";
import { StatusPill } from "./StatusPill";

const SOURCE: Record<Place["sources"][number], string> = { google: "Google", osm: "OpenStreetMap", report: "user reports" };

type Props = { place: Place; stop?: PlanStop; index?: number; backup?: Place };

/** Details for one place under the map (.place): per-feature access, honest unknowns, backup. */
export function PlaceCard({ place, stop, index, backup }: Props) {
  const rows = [
    ["Entrance", place.access.entrance],
    ["Restroom", place.access.restroom],
    ["Seating", place.access.seating],
    ["Parking", place.access.parking],
  ] as const;
  const where = stop ? `Stop ${(index ?? 0) + 1} · ${fmtTime(stop.arrive)}–${fmtTime(stop.depart)}` : "Not in your plan";

  return (
    <div className="place" aria-live="polite">
      <div className="place-head">
        <div>
          <h2>{place.name}</h2>
          <div className="meta">
            {place.category} · {where}
          </div>
          {place.address && <div className="meta">{place.address}</div>}
        </div>
        <StatusPill access={place.overall} />
      </div>

      <div className="access-rows">
        {rows.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <b className={`s-${accessTone(v)}`}>{accessWord(v)}</b>
          </div>
        ))}
      </div>

      {place.overall !== "yes" && (
        <div className="unknown">
          <b>{place.overall === "no" ? "Not wheelchair accessible." : "Accessibility not confirmed."}</b>{" "}
          {place.phone ? `Call ${place.phone} before you go.` : "Call ahead before you go."}
        </div>
      )}
      {stop?.reasons.filter((r) => !/accessib/i.test(r)).map((r) => (
        <p key={r} className="pnote">
          {r}
        </p>
      ))}
      {backup && (
        <div className="altbox">
          Backup: <b>{backup.name}</b>
          {backup.address ? `, ${backup.address}` : ""}. Entrance: {accessWord(backup.access.entrance).toLowerCase()}.
        </div>
      )}
      <p className="hint" style={{ textAlign: "left" }}>
        Data: {place.sources.map((s) => SOURCE[s]).join(", ")}
      </p>
    </div>
  );
}
