import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr } from '../lib/api.js';
import { Card, Empty, ActionBadge } from '../components/Bits.jsx';

const NEGATIVE = new Set(['genuine_risk', 'unfair_pricing', 'exception_confirmed']);

function VerdictCell({ v }) {
  if (!v) return <span className="text-xs text-slate-600">not scored</span>;
  const bad = NEGATIVE.has(v.verdict);
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${
      bad ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
    }`}>
      {v.verdict.replace(/_/g, ' ')}
    </span>
  );
}

export default function Queue() {
  const { module } = useParams();
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);

  async function load() {
    setState({ loading: true });
    try {
      setState({ loading: false, data: await api.queue(module) });
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  }
  useEffect(() => { load(); }, [module]);

  async function populate() {
    setBusy(true);
    try { await api.detect(module); await load(); }
    catch (err) { setState((s) => ({ ...s, error: err.message })); }
    finally { setBusy(false); }
  }

  if (state.loading) return <Empty>Loading…</Empty>;
  if (state.error) return <Empty><span className="text-rose-400">{state.error}</span></Empty>;

  const { cases, label } = state.data;
  // Risk, recovery and finance rank by rupees at stake. Agent audit ranks by
  // an unexplained-spread score, so it must not be rendered as currency.
  const ranksByMoney = module !== 'agent_audit';

  return (
    <Card
      title={`${label} — ${cases.length} open`}
      right={
        <button
          onClick={populate}
          disabled={busy}
          className="rounded bg-slate-700 px-3 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
        >
          {busy ? 'Detecting…' : 'Run detector'}
        </button>
      }
    >
      {cases.length === 0 ? (
        <Empty>No open cases. Seed the database, then press “Run detector”.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-normal">Case</th>
              <th className="pb-2 font-normal">{ranksByMoney ? 'At stake' : 'Spread score'}</th>
              <th className="pb-2 font-normal">Verdict</th>
              <th className="pb-2 font-normal">Recommended</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-t border-slate-800/70">
                <td className="py-2.5 pr-4">
                  <Link to={`/cases/${c.id}`} className="text-slate-200 hover:text-white">
                    {c.title}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 tabular-nums text-slate-400">
                  {ranksByMoney ? inr(c.priority_score * 1000) : c.priority_score}
                </td>
                <td className="py-2.5 pr-4"><VerdictCell v={c.verdict} /></td>
                <td className="py-2.5">
                  {c.verdict
                    ? <ActionBadge action={c.verdict.recommended_action} />
                    : <span className="text-xs text-slate-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
