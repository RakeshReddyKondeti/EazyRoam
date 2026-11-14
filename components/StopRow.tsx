import type { Place, PlanStop } from "@/lib/types";
import { accessTone, accessWord, fmtTime, stopStatus } from "./format";
import { StatusPill } from "./StatusPill";

type Props = { stop: PlanStop; place?: Place; backup?: Place; isNew?: boolean };

/** One stop in the day list (.stop). Opens to show per-feature access and any backup. */
export function StopRow({ stop, place, backup, isNew }: Props) {
  const { tone, label } = stopStatus(stop);
  const name = place?.name ?? stop.placeId;
  const parts = place
    ? ([
        ["Entrance", place.access.entrance],
        ["Restroom", place.access.restroom],
        ["Seating", place.access.seating],
      ] as const)
    : [];

  return (
    <li className={`stop${isNew ? " new fade" : ""}`}>
      <details>
        <summary>
          <span className="t">{fmtTime(stop.arrive)}</span>
          <span className="n">
            {name}
            <small>
              {place?.category ?? "Stop"} · <span className={`s-${tone}`}>{label}</span>
            </small>
          </span>
          <StatusPill access={place?.overall ?? "unknown"} />
        </summary>
        <div className="more">
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
            Until {fmtTime(stop.depart)}
            {place?.address ? ` · ${place.address}` : ""}
          </span>
        </div>
      </details>
    </li>
  );
}
