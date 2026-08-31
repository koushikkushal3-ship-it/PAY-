import 'dotenv/config';
import { db } from '../lib/supabase.js';
import { buildCaseContext, computeStats } from '../services/freezeRisk.service.js';
import { freezeVerdict } from '../services/gemini.service.js';

/**
 * The evidence behind the whole submission.
 *
 * Replays the held-out labelled flags through the exact same scoring path the
 * live queue uses, and reports how it actually did. Two things make the number
 * mean something:
 *
 *  1. A leak assertion. Before any prompt is sent, the built context is
 *     serialised and checked for the answer key. If ground_truth, is_holdout or
 *     the generator's profile name ever appear, evaluation aborts rather than
 *     reporting an inflated score.
 *  2. A baseline. "78% accurate" is meaningless alone — the naive rule any
 *     engineer would write first (flag a spike above 3x) is scored on the same
 *     rows, so the model has something to beat.
 *
 * Positive class is genuine_risk: precision is "when it says freeze, how often
 * is that right", recall is "of the accounts that really were risky, how many
 * did it catch".
 */

const LEAK_TOKENS = ['ground_truth', 'is_holdout', 'genuine_risk', 'false_positive', 'profile'];

function assertNoLeak(context) {
  const serialised = JSON.stringify(context);
  const found = LEAK_TOKENS.filter((t) => serialised.includes(t));
  if (found.length) {
    throw new Error(
      `Evaluation aborted — answer key leaked into the prompt payload: ${found.join(', ')}`
    );
  }
}

function scoreBinary(rows, predictionKey) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    const predicted = r[predictionKey] === 'genuine_risk';
    const actual = r.actual === 'genuine_risk';
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && !actual) tn++;
    else fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = rows.length ? (tp + tn) / rows.length : 0;

  const r3 = (n) => Number(n.toFixed(3));
  return {
    accuracy: r3(accuracy),
    precision: r3(precision),
    recall: r3(recall),
    f1: r3(f1),
    confusion_matrix: {
      true_positive: tp, false_positive: fp,
      true_negative: tn, false_negative: fn,
    },
  };
}

export async function runEvaluation() {
  const { data: flags, error } = await db
    .from('merchant_flags').select('*').eq('is_holdout', true);
  if (error) throw error;
  if (!flags?.length) {
    throw new Error('No holdout flags found — run `npm run seed` first.');
  }

  const rows = [];
  const failures = [];

  for (const flag of flags) {
    try {
      const { data: merchant } = await db
        .from('merchants').select('*').eq('id', flag.merchant_id).single();

      const stats = await computeStats(flag.merchant_id, merchant.baseline_monthly_volume);
      const context = buildCaseContext(flag, merchant, stats);

      assertNoLeak(context);

      const verdict = await freezeVerdict(context);

      rows.push({
        flag_id: flag.id,
        merchant: merchant.name,
        generated_profile: flag.signal?.profile ?? 'unknown', // for the breakdown only
        actual: flag.ground_truth,
        predicted: verdict.label,
        confidence: verdict.confidence,
        // The baseline any engineer writes first: a big spike means risk.
        baseline: Number(flag.signal?.spike_multiple_observed ?? 0) > 3
          ? 'genuine_risk' : 'false_positive',
        correct: verdict.label === flag.ground_truth,
      });
    } catch (err) {
      if (err.message.startsWith('Evaluation aborted')) throw err;
      failures.push({ flag_id: flag.id, error: err.message });
    }
  }

  // Which generated profiles the model handles well, and which it doesn't.
  const byProfile = {};
  for (const r of rows) {
    const p = (byProfile[r.generated_profile] ??= { total: 0, correct: 0 });
    p.total++;
    if (r.correct) p.correct++;
  }
  for (const p of Object.values(byProfile)) {
    p.accuracy = Number((p.correct / p.total).toFixed(3));
  }

  const model = scoreBinary(rows, 'predicted');
  const baseline = scoreBinary(rows, 'baseline');

  return {
    evaluated_at: new Date().toISOString(),
    holdout_size: flags.length,
    scored: rows.length,
    failed: failures,
    model,
    baseline_volume_threshold: baseline,
    beats_baseline: {
      f1: Number((model.f1 - baseline.f1).toFixed(3)),
      accuracy: Number((model.accuracy - baseline.accuracy).toFixed(3)),
    },
    accuracy_by_generated_profile: byProfile,
    predictions: rows,
  };
}

// Runnable directly: `npm run evaluate`
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runEvaluation()
    .then((r) => {
      console.log(`\nHold-out: ${r.scored}/${r.holdout_size} scored`);
      console.table({ model: r.model, baseline: r.baseline_volume_threshold });
      console.log('Confusion (model):', r.model.confusion_matrix);
      console.log('By profile:', r.accuracy_by_generated_profile);
      if (r.failed.length) console.warn('Failures:', r.failed);
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
