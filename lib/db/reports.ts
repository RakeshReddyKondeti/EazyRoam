// User reports ("ramp blocked", "elevator out") in Atlas; in memory without MONGODB_URI. Owner: B.
import type { AddReport, GetReports, Report } from "../contracts";
import { getDb, hasMongo } from "./mongo";

const DAY = 24 * 3600 * 1000;
type ReportDoc = Report & { at: Date };
const mem: ReportDoc[] = [];

export const addReport: AddReport = async (r) => {
  const doc: ReportDoc = { ...r, at: new Date() };
  if (!hasMongo()) {
    mem.push(doc);
    return;
  }
  await (await getDb()).collection<ReportDoc>("reports").insertOne(doc);
};

/** Report kinds per place id from the last 24 hours. */
export const getReports: GetReports = async (placeIds) => {
  if (!placeIds.length) return {};
  const since = new Date(Date.now() - DAY);
  const docs = hasMongo()
    ? await (await getDb())
        .collection<ReportDoc>("reports")
        .find({ placeId: { $in: placeIds }, at: { $gte: since } })
        .toArray()
    : mem.filter((d) => d.placeId && placeIds.includes(d.placeId) && d.at >= since);
  const out: Record<string, string[]> = {};
  for (const d of docs) if (d.placeId) (out[d.placeId] ??= []).push(d.kind);
  return out;
};
