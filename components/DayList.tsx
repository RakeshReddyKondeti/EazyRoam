import type { Plan } from "@/lib/types";
import { fmtTime } from "./format";
import { LegRow } from "./LegRow";
import { StopRow } from "./StopRow";

type Props = { plan: Plan; newIds?: Set<string> };

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

/** The day as a timeline (.list): leg, stop, leg, stop … then home. */
export function DayList({ plan, newIds }: Props) {
  const rows: React.ReactNode[] = [];
  let prev = "home";
  const legFor = (from: string, to: string) => plan.legs.find((l) => l.fromId === from && l.toId === to);

  for (const s of plan.stops) {
    const l = legFor(prev, s.placeId);
    if (l) rows.push(<LegRow key={legKey(prev, s.placeId)} leg={l} isNew={newIds?.has(legKey(prev, s.placeId))} />);
    rows.push(
      <StopRow
        key={s.placeId}
        stop={s}
        place={plan.places[s.placeId]}
        backup={s.backupId ? plan.places[s.backupId] : undefined}
        isNew={newIds?.has(s.placeId)}
      />,
    );
    prev = s.placeId;
  }
  const back = legFor(prev, "home");
  if (back) rows.push(<LegRow key={legKey(prev, "home")} leg={back} isNew={newIds?.has(legKey(prev, "home"))} />);
  rows.push(
    <li key="end" className="home">
      <span className="t">{fmtTime(plan.endAt)}</span>
      <span>Home</span>
    </li>,
  );

  return <ol className="list">{rows}</ol>;
}
