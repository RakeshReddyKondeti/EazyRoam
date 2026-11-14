// Minimal Gemini REST client (generateContent with JSON output). Owner: C.
import { fetchJson, requireKey } from "../http";

// Fast + cheap is right for parsing a sentence; override with GEMINI_MODEL.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

type GenResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

/** Ask Gemini for JSON matching `schema` (OpenAPI subset). Throws on missing key, timeout or bad JSON. */
export async function geminiJson<T>(system: string, user: string, schema: object, timeoutMs = 4000): Promise<T> {
  const key = requireKey("GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
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
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return JSON.parse(text) as T;
}
