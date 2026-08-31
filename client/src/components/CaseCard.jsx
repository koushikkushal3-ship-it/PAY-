import { Link } from 'react-router-dom';
import VerdictBadge from './VerdictBadge.jsx';

export default function CaseCard({ kase }) {
  const v = kase.verdict ?? {};
  const reasoning = v.reasoning ?? v.rationale ?? v.summary ?? '';

  return (
    <Link
      to={`/cases/${kase.id}`}
      className="panel block p-4 hover:border-ink-500 hover:bg-ink-700/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-slate-100 truncate">{kase.title}</div>
          {reasoning && (
            <p className="text-sm text-mute-400 mt-1.5 line-clamp-2">{reasoning}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <VerdictBadge verdict={v} confidence={v.confidence} />
          <span className="text-[11px] text-mute-400 font-mono">
            P {Number(kase.priority_score).toFixed(0)}
          </span>
        </div>
      </div>

      {v.recommended_action && (
        <div className="mt-3 text-xs text-mute-400">
          Suggested:{' '}
          <span className="text-slate-300">{v.recommended_action.replace(/_/g, ' ')}</span>
        </div>
      )}
    </Link>
  );
}
