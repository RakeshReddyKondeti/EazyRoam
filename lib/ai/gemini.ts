// Minimal Gemini REST client (generateContent with JSON output). Owner: C.
import { MissingKeyError, fetchJson, requireKey } from "../http";
import { errText, log } from "../log";

// Fast + cheap is right for parsing a sentence; override with GEMINI_MODEL.
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

type GenResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

/**
 * Ask Gemini for JSON matching `schema` (OpenAPI subset). Throws on missing key, timeout or bad JSON.
 * `task` labels the log line ("parse", "explain").
 */
export async function geminiJson<T>(task: string, system: string, user: string, schema: object, timeoutMs = 10000): Promise<T> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const t0 = Date.now();
  try {
    const key = requireKey("GEMINI_API_KEY");
    const data = await fetchJson<GenResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
        }),
      },
      timeoutMs,
    );
    const c = data.candidates?.[0];
    const text = c?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error(`empty response (finishReason=${c?.finishReason ?? "none"}, blockReason=${data.promptFeedback?.blockReason ?? "none"})`);
    const out = JSON.parse(text) as T;
    log("gemini", `${task}: ok with ${model} in ${Date.now() - t0} ms`);
    return out;
  } catch (e) {
    const why = e instanceof MissingKeyError ? "GEMINI_API_KEY not set" : e instanceof Error && e.name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : errText(e);
    log("gemini", `${task}: FAILED with ${model} after ${Date.now() - t0} ms: ${why}. Using fallback.`);
    throw e;
  }
}
