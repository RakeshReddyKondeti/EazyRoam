// Today's date in the viewer's time zone, "YYYY-MM-DD". Empty during the server prerender
// (Cache Components forbids reading the clock there); the real value appears on the client.
import { useSyncExternalStore } from "react";

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const noop = () => () => {};
export const useToday = () => useSyncExternalStore(noop, () => localDate(), () => "");
