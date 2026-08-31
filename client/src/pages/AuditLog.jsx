import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const MODULE_TONE = {
  risk:        'text-red-300 bg-risk-danger/10 border-risk-danger/30',
  recovery:    'text-blue-300 bg-risk-info/10 border-risk-info/30',
  agent_audit: 'text-amber-300 bg-risk-warn/10 border-risk-warn/30',
  finance:     'text-emerald-300 bg-risk-ok/10 border-risk-ok/30',
};

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.auditLog(filter || undefined).then(setEvents).catch((e) => setError(e.message));
  }, [filter]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Audit Log</h1>
        <p className="text-sm text-mute-400 mt-1 max-w-2xl">
          Append-only. Every AI verdict and every analyst decision, from all four modules,
          in one trail — this is the property that makes the four queues one system rather
          than four tools.
        </p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {[['', 'All'], ['risk', 'Risk'], ['recovery', 'Recovery'],
          ['agent_audit', 'Agent Audit'], ['finance', 'Finance']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              filter === v ? 'bg-ink-600 text-slate-200' : 'text-mute-400 hover:bg-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="panel p-4 text-sm text-red-400">{error}</div>}

      {events.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-mute-400">
          Nothing logged yet. Run a scan or action a case.
        </div>
      ) : (
        <div className="panel divide-y divide-ink-700">
          {events.map((e) => (
            <div key={e.id} className="p-4 flex gap-4">
              <div className="shrink-0 w-32">
                <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] ${
                  MODULE_TONE[e.module] ?? 'text-mute-300 border-ink-500'
                }`}>
                  {e.module.replace('_', ' ')}
                </span>
                <div className="text-[11px] text-mute-400 mt-1.5 font-mono">
                  {new Date(e.created_at).toLocaleString()}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="text-slate-200">{e.action.replace(/_/g, ' ')}</span>
                  <span className="text-mute-400"> · {e.actor}</span>
                  {e.outcome && (
                    <span className="text-mute-400"> → <span className="text-slate-300">{e.outcome}</span></span>
                  )}
                </div>
                {e.reasoning && (
                  <p className="text-xs text-mute-400 mt-1 line-clamp-2">{e.reasoning}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
