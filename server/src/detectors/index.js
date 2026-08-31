import { db } from '../lib/db.js';
import { reason } from '../reasoner/gemini.js';
import risk from './risk.js';
import recovery from './recovery.js';
import agentAudit from './agentAudit.js';
import finance from './finance.js';

/**
 * Every module implements the same interface — detect(), loadContext(),
 * a system prompt and a response schema — so the routes stay generic and
 * adding a module means adding a file here, not a branch in a handler.
 */
export const MODULES = {
  risk,
  recovery,
  agent_audit: agentAudit,
  finance,
};

export const MODULE_KEYS = Object.keys(MODULES);

export function getModule(key) {
  const mod = MODULES[key];
  if (!mod) {
    throw Object.assign(new Error(`unknown module "${key}"`), { status: 400 });
  }
  return mod;
}

/** Run one case through its module's reasoner and store the verdict. */
export async function scoreCase(caseRow) {
  const mod = getModule(caseRow.module);
  const { input } = await mod.loadContext(caseRow);

  const { output, model, latencyMs } = await reason({
    system: mod.system,
    input,
    schema: mod.schema,
  });

  const verdict = {
    ...output,
    model,
    latency_ms: latencyMs,
    scored_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('review_queue')
    .update({ verdict })
    .eq('id', caseRow.id);
  if (error) throw new Error(`verdict save failed: ${error.message}`);

  return verdict;
}

/** Run every detector. Returns per-module counts. */
export async function detectAll() {
  const created = {};
  for (const [key, mod] of Object.entries(MODULES)) {
    created[key] = (await mod.detect()).created;
  }
  return created;
}
