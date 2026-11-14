import type { Access } from "@/lib/types";
import { accessTone } from "./format";
import { Icon } from "./Icons";

const short: Record<Access, string> = { yes: "Yes", limited: "Partly", no: "No", unknown: "?" };

/** Wheelchair access pill (.rate) for a place's overall access. */
export function StatusPill({ access }: { access: Access }) {
  return (
    <span className={`rate ${accessTone(access)}`} aria-label={`Wheelchair access: ${access}`}>
      <Icon name="chair" />
      {short[access]}
    </span>
  );
}
