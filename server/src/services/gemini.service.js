import { GoogleGenAI, Type } from '@google/genai';
import {
  FREEZE_VERDICT, DECLINE_RECOVERY, INVOICE_DUNNING,
  PRICING_FAIRNESS, GST_ANOMALY, RESERVE_NARRATIVE,
} from '../prompts/index.js';

// Model id is env-configurable so a newer id is a settings change, not a code
// change. gemini-3.6-flash is the newest flagship but has a ~20 req/day free
// quota — a single scan across four modules would burn through it. The -lite
// model has a far higher free quota and is plenty for short structured-JSON
// judgment calls like these.
const DEPRECATED = [
  'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash',
  'gemini-2.5-flash-lite', 'gemini-3.5-flash',
];

function activeModel() {
  const env = process.env.GEMINI_MODEL?.trim();
  return !env || DEPRECATED.includes(env) ? 'gemini-3.5-flash-lite' : env;
}

/**
 * The single door every AI call in this app goes through. Structured JSON only —
 * responseSchema is enforced by the API, then the caller Zod-parses the result,
 * so a malformed model response fails loudly instead of flowing into a case verdict.
 */
async function generateStructured({ systemInstruction, prompt, schema }) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = [activeModel(), 'gemini-3.5-flash-lite', 'gemini-3.6-flash']
    .filter((m, i, arr) => arr.indexOf(m) === i);

  let lastErr;
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction, responseMimeType: 'application/json', responseSchema: schema },
      });
      return JSON.parse(res.text);
    } catch (err) {
      lastErr = err;
      console.warn(`[gemini] model ${model} failed: ${err.message}`);
    }
  }
  throw lastErr;
}

const S = Type.STRING, B = Type.BOOLEAN, N = Type.NUMBER, O = Type.OBJECT, A = Type.ARRAY;

// ---------------------------------------------------------------------------
// 1. freezeVerdict — the centerpiece.
// Input deliberately contains no ground_truth: freezeRisk.service.js strips it
// before building the prompt, and evaluation/evaluate.js asserts that.
// ---------------------------------------------------------------------------
const FREEZE_SCHEMA = {
  type: O,
  properties: {
    label: { type: S, enum: ['genuine_risk', 'false_positive'] },
    confidence: { type: N },
    reasoning: { type: S },
    recommended_action: { type: S, enum: ['release', 'escalate', 'request_documents'] },
    key_factors: { type: A, items: { type: S } },
  },
  required: ['label', 'confidence', 'reasoning', 'recommended_action', 'key_factors'],
};

export function freezeVerdict(caseContext) {
  return generateStructured({
    systemInstruction: FREEZE_VERDICT,
    prompt: JSON.stringify(caseContext, null, 2),
    schema: FREEZE_SCHEMA,
  });
}

// ---------------------------------------------------------------------------
// 2. declineRecovery
// ---------------------------------------------------------------------------
const DECLINE_SCHEMA = {
  type: O,
  properties: {
    recoverable: { type: B },
    path: { type: S, enum: ['step_up', 'alt_method', 'hold', 'none'] },
    rationale: { type: S },
  },
  required: ['recoverable', 'path', 'rationale'],
};

export function declineRecovery(context) {
  return generateStructured({
    systemInstruction: DECLINE_RECOVERY,
    prompt: JSON.stringify(context, null, 2),
    schema: DECLINE_SCHEMA,
  });
}

// ---------------------------------------------------------------------------
// 3. invoiceDunning
// ---------------------------------------------------------------------------
const DUNNING_SCHEMA = {
  type: O,
  properties: {
    message_draft: { type: S },
    channel: { type: S, enum: ['email', 'phone', 'account_manager'] },
    should_escalate: { type: B },
    rationale: { type: S },
  },
  required: ['message_draft', 'channel', 'should_escalate', 'rationale'],
};

export function invoiceDunning(context) {
  return generateStructured({
    systemInstruction: INVOICE_DUNNING,
    prompt: JSON.stringify(context, null, 2),
    schema: DUNNING_SCHEMA,
  });
}

// ---------------------------------------------------------------------------
// 4. pricingFairness — runs only on SKUs a deterministic variance pre-filter
// already flagged. Gemini judges whether the spread has a legitimate cause; it
// never computes the spread itself.
// ---------------------------------------------------------------------------
const FAIRNESS_SCHEMA = {
  type: O,
  properties: {
    unfair: { type: B },
    pattern: { type: S },
    rationale: { type: S },
  },
  required: ['unfair', 'pattern', 'rationale'],
};

export function pricingFairness(context) {
  return generateStructured({
    systemInstruction: PRICING_FAIRNESS,
    prompt: JSON.stringify(context, null, 2),
    schema: FAIRNESS_SCHEMA,
  });
}

// ---------------------------------------------------------------------------
// 5. gstAnomaly
// ---------------------------------------------------------------------------
const GST_SCHEMA = {
  type: O,
  properties: {
    expected_bucket: { type: S },
    mismatch: { type: B },
    rationale: { type: S },
  },
  required: ['expected_bucket', 'mismatch', 'rationale'],
};

export function gstAnomaly(context) {
  return generateStructured({
    systemInstruction: GST_ANOMALY,
    prompt: JSON.stringify(context, null, 2),
    schema: GST_SCHEMA,
  });
}

// ---------------------------------------------------------------------------
// 6. reserveNarrative — explanation only. Every figure in `context` was
// computed by finance.service.js; the model is told not to restate or invent any.
// ---------------------------------------------------------------------------
const RESERVE_SCHEMA = {
  type: O,
  properties: {
    summary: { type: S },
    risk_note: { type: S },
  },
  required: ['summary', 'risk_note'],
};

export function reserveNarrative(context) {
  return generateStructured({
    systemInstruction: RESERVE_NARRATIVE,
    prompt: JSON.stringify(context, null, 2),
    schema: RESERVE_SCHEMA,
  });
}
