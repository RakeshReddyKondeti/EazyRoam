import type { Plan } from "@/lib/types";
import { fmtTime } from "./format";
import { LegRow } from "./LegRow";
import { StopRow } from "./StopRow";

type Props = { plan: Plan; newIds?: Set<string> };

/** The day as a timeline (.list): leg, stop, leg, stop … then home. Legs are matched by fromId. */
export function DayList({ plan, newIds }: Props) {
  const legFrom = (id: string) => plan.legs.find((l) => l.fromId === id);
  const firstLeg = legFrom("home") ?? plan.legs[0];
  const rows: React.ReactNode[] = [];

  if (firstLeg) rows.push(<LegRow key="leg-home" leg={firstLeg} isNew={newIds?.has(`leg-home`)} />);
  for (const s of plan.stops) {
    rows.push(
      <StopRow
        key={s.placeId}
        stop={s}
        place={plan.places[s.placeId]}
        backup={s.backupId ? plan.places[s.backupId] : undefined}
        isNew={newIds?.has(s.placeId)}
      />,
    );
    const next = legFrom(s.placeId);
    if (next) rows.push(<LegRow key={`leg-${s.placeId}`} leg={next} isNew={newIds?.has(`leg-${s.placeId}`)} />);
  }
  rows.push(
    <li key="end" className="home">
      <span className="t">{fmtTime(plan.endAt)}</span>
      <span>Home</span>
    </li>,
  );

  return <ol className="list">{rows}</ol>;
}
