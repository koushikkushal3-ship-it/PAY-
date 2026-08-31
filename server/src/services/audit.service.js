import { db } from '../lib/supabase.js';

/**
 * Append-only. Every AI verdict and every analyst action lands here, from all
 * four modules, in one trail — the property that makes this a platform rather
 * than four separate tools. There is deliberately no update or delete helper.
 *
 * Logging never throws: an audit write failing should not roll back the action
 * it was recording. It's logged loudly instead.
 */
export async function logEvent({ actor, module, caseId = null, action, reasoning = null, outcome = null }) {
  const { error } = await db.from('audit_log').insert({
    actor, module, case_id: caseId, action, reasoning, outcome,
  });
  if (error) console.error('[audit] write failed:', error.message);
}

export async function listEvents({ module, limit = 200 }) {
  let q = db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (module) q = q.eq('module', module);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
