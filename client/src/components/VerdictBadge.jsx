const STYLES = {
  genuine_risk:   { text: 'Genuine risk',   cls: 'bg-risk-danger/15 text-red-300 border-risk-danger/40' },
  false_positive: { text: 'False positive', cls: 'bg-risk-ok/15 text-emerald-300 border-risk-ok/40' },
  unfair:         { text: 'Unfair pricing', cls: 'bg-risk-danger/15 text-red-300 border-risk-danger/40' },
  fair:           { text: 'Explained',      cls: 'bg-risk-ok/15 text-emerald-300 border-risk-ok/40' },
  recoverable:    { text: 'Recoverable',    cls: 'bg-risk-info/15 text-blue-300 border-risk-info/40' },
  mismatch:       { text: 'Tax mismatch',   cls: 'bg-risk-warn/15 text-amber-300 border-risk-warn/40' },
};

/** One badge component for all four modules — each stores a differently-shaped
 *  verdict, so the label is derived here rather than at every call site. */
export function verdictKey(verdict) {
  if (!verdict) return null;
  if (verdict.label) return verdict.label;
  if (typeof verdict.unfair === 'boolean') return verdict.unfair ? 'unfair' : 'fair';
  if (typeof verdict.mismatch === 'boolean') return verdict.mismatch ? 'mismatch' : 'fair';
  if (typeof verdict.recoverable === 'boolean') return verdict.recoverable ? 'recoverable' : 'fair';
  return null;
}

export default function VerdictBadge({ verdict, confidence }) {
  const key = verdictKey(verdict);
  const style = STYLES[key];
  if (!style) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium ${style.cls}`}>
      {style.text}
      {confidence != null && (
        <span className="opacity-70 font-mono">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  );
}
