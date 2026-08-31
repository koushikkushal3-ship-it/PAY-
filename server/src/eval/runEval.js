import { writeFile } from 'node:fs/promises';
import { db } from '../lib/db.js';
import { scoreFlag } from '../detectors/risk.js';

export const RESULTS_PATH = new URL('../../eval-results.json', import.meta.url);

/** Positive class is genuine_risk — the thing the platform must not miss. */
const POSITIVE = 'genuine_risk';

/**
 * Replay every holdout flag through the reasoner and score it against the
 * ground truth it was never shown.
 *
 * A naive volume-threshold rule is scored on the exact same rows, because
 * "the LLM got 85%" means nothing without knowing what a trivial rule gets.
 */
export async function runEval({ onProgress } = {}) {
  const { data: flags, error } = await db
    .from('merchant_flags')
    .select('id, merchant_id, ground_truth, signal, flag_type, trigger')
    .eq('is_holdout', true);
  if (error) throw new Error(`holdout read failed: ${error.message}`);
  if (!flags.length) throw new Error('no holdout flags — run `npm run seed` first');

  const results = [];

  for (const [i, flag] of flags.entries()) {
    onProgress?.({ done: i, total: flags.length });
    try {
      const { verdict } = await scoreFlag(flag.id); // no persistTo: never touches the queue
      results.push({
        flag_id: flag.id,
        truth: flag.ground_truth,
        predicted: verdict.verdict,
        confidence: verdict.confidence,
        recommended_action: verdict.recommended_action,
        reasoning: verdict.reasoning,
        spike_multiple: flag.signal?.spike_multiple ?? null,
        // Set by the seed on archetypes designed to be genuinely hard. It lives
        // in the signal but buildRiskCaseInput never copies it, so the model is
        // not told which cases are the difficult ones.
        ambiguous: flag.signal?.ambiguous === true,
        naive_predicted: naiveBaseline(flag.signal),
      });
    } catch (err) {
      results.push({
        flag_id: flag.id,
        truth: flag.ground_truth,
        predicted: null,
        error: err.message,
        spike_multiple: flag.signal?.spike_multiple ?? null,
        naive_predicted: naiveBaseline(flag.signal),
      });
    }
    // Free-tier friendly pacing.
    await new Promise((r) => setTimeout(r, 700));
  }

  const scored = results.filter((r) => r.predicted);
  const report = {
    generated_at: new Date().toISOString(),
    holdout_size: flags.length,
    scored: scored.length,
    failed: results.length - scored.length,
    // Both scored over the SAME rows. A case the model failed to score (quota,
    // network) is excluded from the baseline too — otherwise the two columns
    // have different denominators and the comparison means nothing.
    model: metricsFor(scored, 'predicted'),
    naive_volume_rule: metricsFor(scored, 'naive_predicted'),
    // Split by how hard the case was designed to be. Aggregate accuracy hides
    // whether the system is confident for the right reasons; a model that is
    // as sure on an ambiguous case as on an obvious one is badly calibrated,
    // and on this problem that matters more than the headline number.
    by_difficulty: difficultySplit(scored),
    results,
  };

  await writeFile(RESULTS_PATH, JSON.stringify(report, null, 2));
  return report;
}

/**
 * The rule a rules-engine would use today: a big volume spike means freeze.
 * This is the thing the reasoner has to beat to be worth anything.
 */
function naiveBaseline(signal) {
  return Number(signal?.spike_multiple ?? 0) > 5 ? 'genuine_risk' : 'false_positive';
}

function difficultySplit(rows) {
  const bucket = (subset) => ({
    cases: subset.length,
    correct: subset.filter((r) => r.predicted === r.truth).length,
    accuracy: subset.length
      ? r4(subset.filter((r) => r.predicted === r.truth).length / subset.length)
      : 0,
    mean_confidence: subset.length
      ? r4(subset.reduce((s, r) => s + Number(r.confidence ?? 0), 0) / subset.length)
      : 0,
  });
  return {
    ambiguous: bucket(rows.filter((r) => r.ambiguous)),
    clear_cut: bucket(rows.filter((r) => !r.ambiguous)),
  };
}

function metricsFor(rows, field) {
  const tp = rows.filter((r) => r.truth === POSITIVE && r[field] === POSITIVE).length;
  const fp = rows.filter((r) => r.truth !== POSITIVE && r[field] === POSITIVE).length;
  const fn = rows.filter((r) => r.truth === POSITIVE && r[field] !== POSITIVE).length;
  const tn = rows.filter((r) => r.truth !== POSITIVE && r[field] !== POSITIVE).length;

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const total = tp + fp + fn + tn;

  return {
    confusion: { tp, fp, fn, tn },
    accuracy: total ? r4((tp + tn) / total) : 0,
    precision: r4(precision),
    recall: r4(recall),
    f1: r4(f1),
    // The number this whole project exists for: of the merchants that were
    // flagged but are actually legitimate, how many did we correctly clear?
    legit_merchants_correctly_cleared: tn,
    legit_merchants_wrongly_kept_frozen: fp,
    false_positive_release_rate: fp + tn ? r4(tn / (fp + tn)) : 0,
  };
}

const r4 = (n) => Number(n.toFixed(4));
