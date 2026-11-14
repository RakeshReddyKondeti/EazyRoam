import type { Access, PlanStop } from "@/lib/types";

/** "11:05 AM" in the viewer's time zone. */
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export type Tone = "ok" | "warn" | "bad" | "none";

export const accessTone = (a: Access): Tone =>
  a === "yes" ? "ok" : a === "limited" ? "warn" : a === "no" ? "bad" : "none";

export const accessWord = (a: Access) =>
  ({ yes: "Accessible", limited: "Partly accessible", no: "Not accessible", unknown: "Unknown" })[a];

/** Status line under a stop name. Never a green check for missing data. */
export function stopStatus(s: PlanStop): { tone: Tone; label: string } {
  if (s.status === "ok") return { tone: "ok", label: "Step-free" };
  if (s.status === "unknown") return { tone: "warn", label: "Accessibility unknown. Call ahead" };
  return { tone: "bad", label: s.reasons[0] ?? "Not accessible" };
}
