import { useEffect, useState } from 'react';
import { api, pct } from '../lib/api.js';
import { Card, Empty } from '../components/Bits.jsx';

function Confusion({ m }) {
  const cell = (n, tone) => (
    <div className={`rounded p-3 text-center ${tone}`}>
      <div className="text-xl tabular-nums">{n}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-xs">
      <div />
      <div className="text-center text-slate-500 pb-1">said risk</div>
      <div className="text-center text-slate-500 pb-1">said false positive</div>

      <div className="flex items-center text-slate-500 pr-2">is risk</div>
      {cell(m.confusion.tp, 'bg-emerald-950/60 text-emerald-300')}
      {cell(m.confusion.fn, 'bg-rose-950/60 text-rose-300')}

      <div className="flex items-center text-slate-500 pr-2">is legit</div>
      {cell(m.confusion.fp, 'bg-rose-950/60 text-rose-300')}
      {cell(m.confusion.tn, 'bg-emerald-950/60 text-emerald-300')}
    </div>
  );
}

function Scores({ m }) {
  return (
    <div className="grid grid-cols-4 gap-3 text-center">
      {[['Accuracy', m.accuracy], ['Precision', m.precision], ['Recall', m.recall], ['F1', m.f1]].map(
        ([label, v]) => (
          <div key={label}>
            <div className="text-lg tabular-nums">{pct(v)}</div>
            <div className="text-[11px] text-slate-500">{label}</div>
          </div>
        )
      )}
    </div>
  );
}

export default function Metrics() {
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setState({ loading: false, data: await api.metrics() });
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  }
  useEffect(() => { load(); }, []);

  async function run() {
    setBusy(true);
    try { setState({ loading: false, data: await api.runEval() }); }
    catch (err) { setState({ loading: false, error: err.message }); }
    finally { setBusy(false); }
  }

  const runButton = (
    <button
      onClick={run}
      disabled={busy}
      className="rounded bg-slate-700 px-3 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
    >
      {busy ? 'Scoring holdout…' : 'Run evaluation'}
    </button>
  );

  if (state.loading) return <Empty>Loading…</Empty>;

  if (state.error) {
    return (
      <Card title="Evidence" right={runButton}>
        <Empty>{state.error}</Empty>
      </Card>
    );
  }

  const d = state.data;

  return (
    <div className="space-y-4">
      <Card title="Evidence" right={runButton}>
        <p className="text-xs text-slate-400 leading-relaxed">
          Scored on {d.holdout_size} held-out cases. These flags never enter the working queue, and
          their ground-truth labels are never included in the prompt — the model sees only the case
          context an analyst would see. Positive class is <em>genuine risk</em>.
          {d.failed > 0 && <span className="text-amber-400"> {d.failed} case(s) failed to score.</span>}
        </p>
        <div className="mt-1 text-[11px] text-slate-600">
          Last run {new Date(d.generated_at).toLocaleString()}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Gemini reasoner">
          <Scores m={d.model} />
          <div className="mt-4"><Confusion m={d.model} /></div>
        </Card>
        <Card title="Naive volume rule (spike > 5x = freeze)">
          <Scores m={d.naive_volume_rule} />
          <div className="mt-4"><Confusion m={d.naive_volume_rule} /></div>
        </Card>
      </div>

      <Card title="The number that matters">
        <p className="text-xs text-slate-400 mb-3">
          Of the flagged merchants who are actually legitimate, how many did each approach correctly
          clear instead of leaving frozen?
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded bg-slate-900/60 p-4">
            <div className="text-2xl tabular-nums text-emerald-300">
              {d.model.legit_merchants_correctly_cleared}
            </div>
            <div className="text-xs text-slate-500">cleared by the reasoner</div>
            <div className="mt-1 text-xs text-rose-400">
              {d.model.legit_merchants_wrongly_kept_frozen} left wrongly frozen
            </div>
          </div>
          <div className="rounded bg-slate-900/60 p-4">
            <div className="text-2xl tabular-nums text-slate-300">
              {d.naive_volume_rule.legit_merchants_correctly_cleared}
            </div>
            <div className="text-xs text-slate-500">cleared by the naive rule</div>
            <div className="mt-1 text-xs text-rose-400">
              {d.naive_volume_rule.legit_merchants_wrongly_kept_frozen} left wrongly frozen
            </div>
          </div>
        </div>
      </Card>

      <Card title="Case-by-case">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="pb-2 font-normal">Truth</th>
                <th className="pb-2 font-normal">Reasoner</th>
                <th className="pb-2 font-normal">Naive</th>
                <th className="pb-2 font-normal">Spike</th>
                <th className="pb-2 font-normal">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {d.results.map((r) => {
                const ok = r.predicted === r.truth;
                return (
                  <tr key={r.flag_id} className="border-t border-slate-800/70">
                    <td className="py-1.5 text-slate-400">{r.truth?.replace('_', ' ')}</td>
                    <td className={`py-1.5 ${ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.predicted?.replace('_', ' ') ?? 'error'}
                    </td>
                    <td className={`py-1.5 ${r.naive_predicted === r.truth ? 'text-slate-400' : 'text-rose-400/70'}`}>
                      {r.naive_predicted?.replace('_', ' ')}
                    </td>
                    <td className="py-1.5 tabular-nums text-slate-500">{r.spike_multiple}x</td>
                    <td className="py-1.5 tabular-nums text-slate-500">{pct(r.confidence)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
