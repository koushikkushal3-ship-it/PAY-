import { env } from '../lib/env.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * One structured reasoning call. Gemini is run in JSON mode with an explicit
 * responseSchema so the output is a validated shape, not free text we have to
 * parse hopefully.
 */
export async function reason({ system, input, schema, temperature = 0.1 }) {
  const url = `${ENDPOINT}/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(input, null, 2) }] }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  const started = Date.now();
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Gemini ${res.status}: ${detail.slice(0, 400)}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned no content part');

      return {
        output: JSON.parse(text),
        model: env.geminiModel,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      lastError = err;
      // 429 / transient 5xx: back off and retry. A hard 400 fails the same way
      // three times, which is fine — we surface the real message either way.
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1200));
      }
    }
  }

  throw lastError;
}
