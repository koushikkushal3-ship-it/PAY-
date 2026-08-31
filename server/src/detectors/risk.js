import { db } from '../lib/db.js';
import { reason } from '../reasoner/gemini.js';
import { riskVerdictSchema } from '../reasoner/schemas.js';
import { RISK_SYSTEM_PROMPT, buildRiskCaseInput } from '../reasoner/prompts.js';

/**
 * Turn merchant_flags into review_queue cases.
 *
 * Holdout flags are deliberately excluded: they exist only to score the
 * reasoner against known labels, so they must never appear in the working
 * queue where an analyst (or a demo) could action them.
 */
export async function detectRiskCases() {
  const { data: flags, error } = await db
    .from('merchant_flags')
    .select('id, merchant_id, flag_type, trigger, signal, triggered_at')
    .eq('is_holdout', false);
  if (error) throw new Error(`merchant_flags read failed: ${error.message}`);

  const { data: existing, error: qErr } = await db
    .from('review_queue')
    .select('entity_id')
    .eq('module', 'risk');
  if (qErr) throw new Error(`review_queue read failed: ${qErr.message}`);

  const already = new Set((existing ?? []).map((r) => r.entity_id));
  const merchants = await merchantsById(flags.map((f) => f.merchant_id));

  const rows = flags
    .filter((f) => !already.has(f.id))
    .map((f) => {
      const merchant = merchants.get(f.merchant_id);
      const valueAtRisk = Number(f.signal?.value_at_risk ?? 0);
      return {
        module: 'risk',
        entity_type: 'merchant_flag',
        entity_id: f.id,
        title: `${merchant?.name ?? 'Unknown merchant'} — ${labelFor(f)}`,
        priority_score: priorityScore(valueAtRisk, f),
        status: 'open',
      };
    });

  if (rows.length === 0) return { created: 0 };

  const { error: insErr } = await db.from('review_queue').insert(rows);
  if (insErr) throw new Error(`review_queue insert failed: ${insErr.message}`);
  return { created: rows.length };
}

/**
 * Run the reasoner over one flag and return the structured verdict.
 * `persistTo` is a review_queue id when scoring a live case; the eval harness
 * omits it so holdout scoring never writes into the queue.
 */
export async function scoreFlag(flagId, { persistTo } = {}) {
  const { data: flag, error } = await db
    .from('merchant_flags')
    .select('id, merchant_id, flag_type, trigger, signal, triggered_at')
    .eq('id', flagId)
    .single();
  if (error) throw new Error(`flag ${flagId} not found: ${error.message}`);

  const { data: merchant, error: mErr } = await db
    .from('merchants')
    .select('*')
    .eq('id', flag.merchant_id)
    .single();
  if (mErr) throw new Error(`merchant read failed: ${mErr.message}`);

  const input = buildRiskCaseInput({ merchant, flag });

  const { output, model, latencyMs } = await reason({
    system: RISK_SYSTEM_PROMPT,
    input,
    schema: riskVerdictSchema,
  });

  const verdict = { ...output, model, latency_ms: latencyMs, scored_at: new Date().toISOString() };

  if (persistTo) {
    const { error: upErr } = await db
      .from('review_queue')
      .update({ verdict })
      .eq('id', persistTo);
    if (upErr) throw new Error(`verdict save failed: ${upErr.message}`);
  }

  return { verdict, input };
}

async function merchantsById(ids) {
  const unique = [...new Set(ids)];
  const { data, error } = await db
    .from('merchants')
    .select('id, name')
    .in('id', unique);
  if (error) throw new Error(`merchants read failed: ${error.message}`);
  return new Map((data ?? []).map((m) => [m.id, m]));
}

function labelFor(flag) {
  const kind = {
    freeze: 'account frozen',
    reserve_hold: 'reserve hold applied',
    review: 'under review',
  }[flag.flag_type] ?? flag.flag_type;
  const why = {
    volume_spike: 'volume spike',
    doc_gap: 'documentation gap',
    chargeback_ratio: 'chargeback ratio',
    velocity: 'transaction velocity',
    manual: 'manual referral',
  }[flag.trigger] ?? flag.trigger;
  return `${kind} (${why})`;
}

// Money at stake dominates the ordering — an analyst with limited hours should
// see the largest frozen settlement first — with a nudge for full freezes,
// which hurt a merchant more than a partial reserve hold.
function priorityScore(valueAtRisk, flag) {
  const weight = { freeze: 1.25, reserve_hold: 1.0, review: 0.8 }[flag.flag_type] ?? 1;
  return Math.round((valueAtRisk / 1000) * weight);
}

/** Shared module interface: build the model input and the display panels. */
export async function loadContext(caseRow) {
  const { data: flag, error } = await db
    .from('merchant_flags')
    .select('id, merchant_id, flag_type, trigger, signal, triggered_at')
    .eq('id', caseRow.entity_id)
    .single();
  if (error) throw new Error(error.message);

  const { data: merchant, error: mErr } = await db
    .from('merchants').select('*').eq('id', flag.merchant_id).single();
  if (mErr) throw new Error(mErr.message);

  const [{ data: transactions }, { data: settlements }] = await Promise.all([
    db.from('transactions').select('*')
      .eq('merchant_id', merchant.id)
      .order('created_at', { ascending: false })
      .limit(12),
    db.from('settlements').select('*').eq('merchant_id', merchant.id),
  ]);

  return {
    input: buildRiskCaseInput({ merchant, flag }),
    panels: { merchant, transactions: transactions ?? [], settlements: settlements ?? [] },
  };
}

export default {
  key: 'risk',
  label: 'Freeze & reserve appeals',
  system: RISK_SYSTEM_PROMPT,
  schema: riskVerdictSchema,
  detect: detectRiskCases,
  loadContext,
};
