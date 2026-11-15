import { wantFor } from "@/lib/planner/wants";
import type { Event, Plan } from "@/lib/types";
import { fmtTime } from "./format";
import { LegRow } from "./LegRow";
import { StopRow } from "./StopRow";

type Props = {
  plan: Plan;
  newIds?: Set<string>;
  startLabel?: string; // "Start" (Today) or "Leave" (Vacation)
  endLabel?: string; // "Home" (Today) or "Back to where you’re staying" (Vacation)
  visited?: Set<string>;
  onVisited?: (placeId: string, v: boolean) => void;
  /** Today: + / − stay and start time on each stop. */
  onAdjust?: (events: Event[]) => void;
  busy?: boolean;
};

/** Keys DayList uses for highlighting changed rows: stop = placeId, leg = "leg:<from>><to>". */
export const legKey = (fromId: string, toId: string) => `leg:${fromId}>${toId}`;

/** What's new in `next` compared with `prev` (for the .new highlight after a re-plan). */
export function changedIds(prev: Plan | null, next: Plan): Set<string> {
  const out = new Set<string>();
  if (!prev) return out;
  const prevStops = new Set(prev.stops.map((s) => s.placeId));
  const prevLegs = new Set(prev.legs.map((l) => `${legKey(l.fromId, l.toId)}|${l.mode}|${l.minutes}`));
  for (const s of next.stops) if (!prevStops.has(s.placeId)) out.add(s.placeId);
  for (const l of next.legs) if (!prevLegs.has(`${legKey(l.fromId, l.toId)}|${l.mode}|${l.minutes}`)) out.add(legKey(l.fromId, l.toId));
  return out;
}

/** The day as a timeline (.list): Start, leg, stop, leg, stop … then home. */
export function DayList({ plan, newIds, startLabel, endLabel, visited, onVisited, onAdjust, busy }: Props) {
  const rows: React.ReactNode[] = [];
  let prev = "home";
  // A leg re-planned "from where I am" starts at "here", not at the previous stop.
  const legFor = (from: string, to: string) =>
    plan.legs.find((l) => l.fromId === from && l.toId === to) ?? plan.legs.find((l) => l.fromId === "here" && l.toId === to);
  const where = plan.request.startLabel ?? "Your starting point";

  rows.push(
    <li key="start" className="home endpoint">
      <span className="t">{fmtTime(plan.legs[0]?.departAt ?? plan.request.start)}</span>
      <span>
        {startLabel ?? "Start"}
        <small>{where}</small>
      </span>
    </li>,
  );
  for (const s of plan.stops) {
    const l = legFor(prev, s.placeId);
    const name = plan.places[s.placeId]?.name ?? s.placeId;
    if (l) rows.push(<LegRow key={legKey(prev, s.placeId)} leg={l} toName={name} isNew={newIds?.has(legKey(prev, s.placeId))} />);
    rows.push(
      <StopRow
        key={s.placeId}
        stop={s}
        place={plan.places[s.placeId]}
        backup={s.backupId ? plan.places[s.backupId] : undefined}
        isNew={newIds?.has(s.placeId)}
        visited={visited?.has(s.placeId)}
        onVisited={onVisited ? (v) => onVisited(s.placeId, v) : undefined}
        want={plan.request.wants[wantFor(plan, plan.request.wants, s.placeId)]}
        onAdjust={onAdjust}
        busy={busy}
      />,
    );
    prev = s.placeId;
  }
  const back = legFor(prev, "home");
  // A different end location reads "End · <address>"; a round trip reads "Home · <start address>".
  const endsElsewhere = Boolean(plan.request.endLabel);
  const homeName = endsElsewhere ? "End" : (endLabel ?? "Home");
  const endWhere = plan.request.endLabel ?? where;
  if (back)
    rows.push(<LegRow key={legKey(prev, "home")} leg={back} toName={endsElsewhere ? endWhere : homeName.toLowerCase()} isNew={newIds?.has(legKey(prev, "home"))} />);
  rows.push(
    <li key="end" className="home endpoint">
      <span className="t">{fmtTime(plan.endAt)}</span>
      <span>
        {homeName}
        <small>{endWhere}</small>
      </span>
    </li>,
  );

  return <ol className="list">{rows}</ol>;
}
