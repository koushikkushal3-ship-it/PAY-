/**
 * Four cells, labelled in plain language rather than TP/FP/TN/FN, because the
 * two error types have very different costs here and the reader should see
 * which one is which without decoding an abbreviation.
 */
export default function ConfusionMatrix({ matrix }) {
  if (!matrix) return null;
  const { true_positive: tp, false_positive: fp, true_negative: tn, false_negative: fn } = matrix;

  const Cell = ({ n, title, sub, tone }) => (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="text-2xl font-semibold tabular-nums">{n}</div>
      <div className="text-xs font-medium mt-1">{title}</div>
      <div className="text-[11px] text-mute-400 mt-0.5 leading-snug">{sub}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      <Cell n={tp} title="Correctly held" sub="Risky, and it said risky"
            tone="bg-risk-ok/10 border-risk-ok/30 text-emerald-300" />
      <Cell n={fn} title="Missed risk" sub="Risky, but it said release"
            tone="bg-risk-danger/10 border-risk-danger/30 text-red-300" />
      <Cell n={fp} title="Wrongly held" sub="Legitimate, but it said risky"
            tone="bg-risk-warn/10 border-risk-warn/30 text-amber-300" />
      <Cell n={tn} title="Correctly released" sub="Legitimate, and it said release"
            tone="bg-risk-ok/10 border-risk-ok/30 text-emerald-300" />
    </div>
  );
}
