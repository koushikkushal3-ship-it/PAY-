import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr } from '../lib/api.js';
import { Card, Empty, VerdictBadge, ActionBadge } from '../components/Bits.jsx';

const TITLES = {
  risk: 'Freeze & reserve appeals',
  recovery: 'Revenue recovery',
  agent_audit: 'Agent pricing audit',
  finance: 'Finance exceptions',
};

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
    try {
      await api.detectRisk();
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <Empty>Loading…</Empty>;
  if (state.error) return <Empty><span className="text-rose-400">{state.error}</span></Empty>;

  const cases = state.data.cases;

  return (
    <Card
      title={`${TITLES[module] ?? module} — ${cases.length} open`}
      right={
        module === 'risk' ? (
          <button
            onClick={populate}
            disabled={busy}
            className="rounded bg-slate-700 px-3 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
          >
            {busy ? 'Detecting…' : 'Run detector'}
          </button>
        ) : null
      }
    >
      {cases.length === 0 ? (
        <Empty>
          {module === 'risk'
            ? 'No open cases. Seed the database, then press “Run detector”.'
            : `The ${module.replace('_', ' ')} module lands on day 2.`}
        </Empty>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-normal">Case</th>
              <th className="pb-2 font-normal">Value at risk</th>
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
                <td className="py-2.5 pr-4 text-slate-400 tabular-nums">
                  {inr(c.priority_score * 1000)}
                </td>
                <td className="py-2.5 pr-4"><VerdictBadge verdict={c.verdict?.verdict} /></td>
                <td className="py-2.5">
                  {c.verdict ? <ActionBadge action={c.verdict.recommended_action} /> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
