import { db } from '../lib/supabase.js';
import { logEvent } from './audit.service.js';

/**
 * The shared queue every module writes into. Building this once is what lets
 * four tracks reuse one UI: a module is just a detector that produces cases in
 * this shape.
 *
 * Upsert on (module, entity_type, entity_id) so re-running a scan refreshes a
 * case's verdict instead of creating duplicates — scans are expected to be run
 * repeatedly during a shift.
 */
export async function upsertCase({ module, entityType, entityId, title, priorityScore, verdict }) {
  const { data, error } = await db
    .from('review_queue')
    .upsert(
      {
        module,
        entity_type: entityType,
        entity_id: entityId,
        title,
        priority_score: priorityScore,
        verdict,
        status: 'open',
      },
      { onConflict: 'module,entity_type,entity_id' }
    )
    .select()
    .single();

  if (error) throw error;

  await logEvent({
    actor: 'gemini',
    module,
    caseId: data.id,
    action: 'verdict_generated',
    reasoning: verdict?.reasoning ?? verdict?.rationale ?? verdict?.summary ?? null,
    outcome: verdict?.label ?? verdict?.path ?? (verdict?.unfair ? 'unfair' : null) ?? 'queued',
  });

  return data;
}

export async function listCases({ module, status = 'open', limit = 100 }) {
  let q = db
    .from('review_queue')
    .select('*')
    .order('priority_score', { ascending: false })
    .limit(limit);
  if (module) q = q.eq('module', module);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getCase(id) {
  const { data: kase, error } = await db.from('review_queue').select('*').eq('id', id).single();
  if (error) throw error;

  const { data: actions } = await db
    .from('case_actions')
    .select('*')
    .eq('case_id', id)
    .order('created_at', { ascending: true });

  return { ...kase, actions: actions ?? [], context: await loadContext(kase) };
}

// Each module stores a different entity type; the case detail view needs the
// underlying record to show the analyst what the verdict was actually about.
async function loadContext(kase) {
  const table = {
    merchant_flag: 'merchant_flags',
    transaction: 'transactions',
    invoice: 'invoices',
    settlement: 'settlements',
    agent_sku: null, // synthesised in the verdict itself, no single source row
  }[kase.entity_type];

  if (!table) return null;

  const { data } = await db.from(table).select('*').eq('id', kase.entity_id).single();
  if (!data) return null;

  // Never ship the evaluation answer key to the client, the same reason an
  // answer key never ships with a quiz question.
  delete data.ground_truth;
  delete data.is_holdout;

  if (data.merchant_id) {
    const { data: merchant } = await db
      .from('merchants').select('*').eq('id', data.merchant_id).single();
    return { record: data, merchant };
  }
  return { record: data };
}

export async function recordAction({ caseId, action, actor, note }) {
  const { data: kase, error: findErr } = await db
    .from('review_queue').select('module').eq('id', caseId).single();
  if (findErr) throw findErr;

  const { error: insErr } = await db
    .from('case_actions').insert({ case_id: caseId, action, actor, note });
  if (insErr) throw insErr;

  const status = action === 'dismiss' ? 'dismissed' : 'actioned';
  const { error: updErr } = await db
    .from('review_queue').update({ status }).eq('id', caseId);
  if (updErr) throw updErr;

  await logEvent({
    actor, module: kase.module, caseId,
    action: `analyst_${action}`, reasoning: note ?? null, outcome: status,
  });

  return { caseId, action, status };
}
