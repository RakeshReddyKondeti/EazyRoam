import type { Leg, LegStep, Stop } from "@/lib/types";
import { fmtTime, stayLabel } from "./format";
import { Icon, type IconName } from "./Icons";

const ICON: Record<LegStep["kind"], IconName> = { roll: "chair", bus: "bus", rail: "train" };
const WORD: Record<LegStep["kind"], string> = { roll: "Roll", bus: "Bus", rail: "Train" };

/** Steps for a leg; legs without `steps` (older plans, fixtures) get one built from mode + stops. Exported for tests. */
export function legSteps(leg: Leg): LegStep[] {
  if (leg.steps?.length) return leg.steps;
  if (leg.mode === "roll" || !leg.stops.length) return [{ kind: "roll", minutes: leg.minutes }];
  return [{ kind: leg.mode, minutes: leg.minutes, from: leg.stops[0].name, to: leg.stops[leg.stops.length - 1].name }];
}

/** Access chip for one transit stop: never a green check without data. */
export function stopChip(s?: Stop): { tone: "ok" | "bad" | "warn" | "none"; text: string } {
  if (!s) return { tone: "none", text: "Access unknown" };
  if (s.elevatorOut) return { tone: "bad", text: "Elevator out" };
  if (s.wheelchair === "no") return { tone: "bad", text: "Not step-free" };
  if (s.reliability != null && s.reliability < 0.8) return { tone: "warn", text: "Elevator often out" };
  if (s.wheelchair === "yes") return { tone: "ok", text: "Step-free" };
  if (s.wheelchair === "limited") return { tone: "warn", text: "Partly step-free" };
  return { tone: "none", text: "Access unknown" };
}

function ModeChip({ step }: { step: LegStep }) {
  const label = step.kind === "roll" ? `Roll ${step.minutes} min` : `${WORD[step.kind]}${step.line ? ` ${step.line}` : ""}`;
  return (
    <span className={`mchip ${step.kind}`}>
      <Icon name={ICON[step.kind]} />
      {label}
    </span>
  );
}

function StopName({ name, stop }: { name: string; stop?: Stop }) {
  const c = stopChip(stop);
  return (
    <>
      <b>{name}</b> <span className={`achip ${c.tone}`}>{c.text}</span>
    </>
  );
}

type Props = { leg: Leg; toName: string; isNew?: boolean };

/** Travel between stops (.leg), spelled out: how you go (roll / bus / train), where you board and get off, and each stop's access. */
export function LegRow({ leg, toName, isNew }: Props) {
  const steps = legSteps(leg);
  const byName = new Map(leg.stops.map((s) => [s.name, s]));
  const rides = steps.filter((s) => s.kind !== "roll");
  const summary = rides.length
    ? `${rides.map((r) => `${WORD[r.kind].toLowerCase()}${r.line ? ` ${r.line}` : ""}`).join(" then ")}, ${stayLabel(leg.departAt, leg.arriveAt)}`
    : `roll ${leg.minutes} min`;

  return (
    <li className={`leg leg-rich${isNew ? " new fade" : ""}`} aria-label={`Travel to ${toName}: ${summary}`}>
      <div className="leg-sum">
        {steps.map((s, i) => (
          <span key={i} className="leg-chipwrap">
            {i > 0 && <span className="chev" aria-hidden="true">›</span>}
            <ModeChip step={s} />
          </span>
        ))}
        <span className="leg-time">
          {fmtTime(leg.departAt)}–{fmtTime(leg.arriveAt)} · {stayLabel(leg.departAt, leg.arriveAt)}
        </span>
      </div>

      <ol className="leg-steps">
        {steps.map((s, i) =>
          s.kind === "roll" ? (
            <li key={i}>
              <Icon name="chair" />
              <span>
                Roll {s.minutes} min to {s.to ? <StopName name={s.to} stop={byName.get(s.to)} /> : <b>{toName}</b>}
              </span>
            </li>
          ) : (
            <li key={i}>
              <Icon name={ICON[s.kind]} />
              <span>
                Take the {WORD[s.kind].toLowerCase()}
                {s.line ? ` ${s.line}` : ""} for {s.minutes} min. Board at {s.from ? <StopName name={s.from} stop={byName.get(s.from)} /> : "the stop"}, get off at{" "}
                {s.to ? <StopName name={s.to} stop={byName.get(s.to)} /> : "the stop"}.
              </span>
            </li>
          ),
        )}
      </ol>

      {leg.issues.length > 0 && (
        <div className="leg-issues">
          {leg.issues.map((t) => (
            <span key={t} className={`achip ${/^No step-free|out\b/i.test(t) ? "bad" : "warn"}`}>
              {t}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
