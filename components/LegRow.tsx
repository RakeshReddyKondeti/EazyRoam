import type { Leg } from "@/lib/types";
import { Icon, type IconName } from "./Icons";

const icon: Record<Leg["mode"], IconName> = { roll: "roll", bus: "bus", rail: "train" };
const word: Record<Leg["mode"], string> = { roll: "Roll", bus: "Bus", rail: "Train" };

/** Travel between stops (.leg): mode, stops used, minutes and any issues. */
export function LegRow({ leg, isNew }: { leg: Leg; isNew?: boolean }) {
  const first = leg.stops[0]?.name;
  const last = leg.stops[leg.stops.length - 1]?.name;
  const via = first && last && first !== last ? ` · ${first} → ${last}` : "";
  const out = leg.stops.filter((s) => s.elevatorOut).map((s) => `Elevator out at ${s.name}`);
  const noStep = leg.stops.filter((s) => s.wheelchair === "no").map((s) => `${s.name} is not step-free`);
  const unknown = leg.stops.filter((s) => s.wheelchair === "unknown").map((s) => `${s.name}: access unknown`);

  return (
    <li className={`leg${isNew ? " new" : ""}`}>
      <Icon name={icon[leg.mode]} />
      <span>
        {word[leg.mode]}
        {via} · {leg.minutes} min
        {[...out, ...noStep].map((t) => (
          <span key={t} className="bad"> · {t}</span>
        ))}
        {[...unknown, ...leg.issues].map((t) => (
          <span key={t} className="warn"> · {t}</span>
        ))}
      </span>
    </li>
  );
}
