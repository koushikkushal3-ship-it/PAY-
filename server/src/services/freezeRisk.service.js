import { db } from '../lib/supabase.js';
import { freezeVerdict } from './gemini.service.js';
import { upsertCase } from './queue.service.js';

/**
 * Track 1 — the Freeze Appeal Engine.
 *
 * Razorpay's Shield already decides whether to flag. This service decides
 * whether the flag was right, which is the part with no product behind it today
 * ("no appeal process, no human you can call").
 */

/**
 * Build the payload sent to the model.
 *
 * The single most important line in this file is the destructure below:
 * ground_truth and is_holdout are the evaluation answer key and never reach a
 * prompt. Anything the model sees is an analyst could see.
 */
export function buildCaseContext(flag, merchant, stats) {
  const { ground_truth, is_holdout, ...safeFlag } = flag; // eslint-disable-line no-unused-vars

  // The seed script tags each signal with the profile it was generated from
  // ("card_testing", "seasonal_spike") purely so a failure is diagnosable.
  // That name gives the answer away, so it is stripped here alongside the
  // label itself — leaking it would make the evaluation meaningless.
  const { profile, ...safeSignal } = safeFlag.signal ?? {}; // eslint-disable-line no-unused-vars

  return {
    flag: {
      type: safeFlag.flag_type,
      trigger: safeFlag.trigger,
      triggered_at: safeFlag.triggered_at,
      signal: safeSignal,
    },
    merchant: {
      name: merchant.name,
      category: merchant.category,
      mcc: merchant.mcc,
      account_age_days: merchant.account_age_days,
      kyc_status: merchant.kyc_status,
      documentation_completeness: Number(merchant.doc_completeness),
      baseline_monthly_volume_inr: Number(merchant.baseline_monthly_volume),
    },
    observed: stats,
  };
}

/**
 * Deterministic facts computed from transaction rows. The model reasons about
 * these numbers; it never produces them.
 */
export async function computeStats(merchantId, baselineVolume) {
  const { data: txns } = await db
    .from('transactions').select('amount, status, is_cross_border').eq('merchant_id', merchantId);

  const rows = txns ?? [];
  const captured = rows.filter((t) => t.status === 'captured');
  const volume = captured.reduce((sum, t) => sum + Number(t.amount), 0);
  const declined = rows.filter((t) => t.status === 'declined').length;
  const crossBorder = rows.filter((t) => t.is_cross_border).length;
  const baseline = Number(baselineVolume) || 1;

  return {
    recent_volume_inr: Math.round(volume),
    volume_vs_baseline_multiple: Number((volume / baseline).toFixed(2)),
    transaction_count: rows.length,
    declined_count: declined,
    cross_border_share: rows.length ? Number((crossBorder / rows.length).toFixed(2)) : 0,
  };
}

/** Highest-value cases with the least model confidence surface first. */
function priority(verdict, stats) {
  const uncertainty = 1 - Number(verdict.confidence ?? 0.5);
  const exposure = Math.log10(Math.max(stats.recent_volume_inr, 10));
  return Number((uncertainty * 50 + exposure * 10).toFixed(2));
}

export async function scoreFlag(flag) {
  const { data: merchant, error } = await db
    .from('merchants').select('*').eq('id', flag.merchant_id).single();
  if (error) throw error;

  const stats = await computeStats(flag.merchant_id, merchant.baseline_monthly_volume);
  const context = buildCaseContext(flag, merchant, stats);
  const verdict = await freezeVerdict(context);

  return { merchant, stats, context, verdict };
}

/**
 * Scan every open non-holdout flag and queue a case for each.
 * Holdout rows are excluded here as well as in the prompt — they exist purely
 * to be replayed by the evaluator, never worked by an analyst.
 */
export async function scanFlags({ limit = 25 } = {}) {
  const { data: flags, error } = await db
    .from('merchant_flags').select('*').eq('is_holdout', false).limit(limit);
  if (error) throw error;

  const results = [];
  for (const flag of flags ?? []) {
    try {
      const { merchant, stats, verdict } = await scoreFlag(flag);
      const kase = await upsertCase({
        module: 'risk',
        entityType: 'merchant_flag',
        entityId: flag.id,
        title: `${merchant.name} — ${flag.flag_type.replace('_', ' ')} on ${flag.trigger.replace('_', ' ')}`,
        priorityScore: priority(verdict, stats),
        verdict,
      });
      results.push({ caseId: kase.id, label: verdict.label });
    } catch (err) {
      console.error(`[risk] flag ${flag.id} failed:`, err.message);
      results.push({ flagId: flag.id, error: err.message });
    }
  }
  return results;
}
