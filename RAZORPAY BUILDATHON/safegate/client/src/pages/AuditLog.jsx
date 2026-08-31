import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, Empty } from '../components/Bits.jsx';

export default function AuditLog() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    api.audit()
      .then((data) => setState({ loading: false, data }))
      .catch((err) => setState({ loading: false, error: err.message }));
  }, []);

  if (state.loading) return <Empty>Loading…</Empty>;
  if (state.error) return <Empty><span className="text-rose-400">{state.error}</span></Empty>;

  const entries = state.data.entries;

  return (
    <Card title={`Audit log — ${entries.length} entries`}>
      <p className="mb-3 text-xs text-slate-400">
        Every module and every actor writes here, so the trail reads the same whether the decision
        came from the reasoner or a human.
      </p>
      {entries.length === 0 ? (
        <Empty>Nothing logged yet.</Empty>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="border-b border-slate-800/60 pb-2 last:border-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{e.actor}</span>
                <span className="text-slate-500">{e.module}</span>
                <span className="text-slate-200">{e.action}</span>
                <span className="ml-auto text-slate-600">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
              {e.outcome && <div className="mt-1 text-xs text-slate-400">{e.outcome}</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
