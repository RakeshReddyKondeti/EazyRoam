// comparePlan(): what a normal map app would do, then the same checks EazyRoam runs. Owner: A.
import type { ComparePlan } from "../contracts";
import { solve } from "./solve";

/** Top result per want, in the user's order, on the fastest transit route; problems counted, not avoided. */
export const comparePlan: ComparePlan = (req, deps) => solve(req, deps, { accessible: false });
