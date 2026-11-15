// Short server-side log lines, e.g. "[eazyroam:gemini] ok in 812 ms". Never log keys or full responses.
// Silent in tests. Set EAZYROAM_LOG=0 to turn off.
export function log(scope: string, msg: string, data?: unknown) {
  if (process.env.NODE_ENV === "test" || process.env.EAZYROAM_LOG === "0") return;
  const line = `[eazyroam:${scope}] ${msg}`;
  if (data === undefined) console.info(line);
  else console.info(line, typeof data === "string" ? data : JSON.stringify(data));
}

/** Error message without stack, trimmed. */
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 400);
