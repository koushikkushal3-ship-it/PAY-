import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { api } from '../lib/api.js';
import ConfusionMatrix from '../components/ConfusionMatrix.jsx';

const METRICS = [
  { key: 'accuracy',  label: 'Accuracy',  hint: 'Share of held-out cases called correctly' },
  { key: 'precision', label: 'Precision', hint: 'When it says risky, how often that is right' },
  { key: 'recall',    label: 'Recall',    hint: 'Share of genuinely risky accounts it caught' },
  { key: 'f1',        label: 'F1',        hint: 'Harmonic mean of precision and recall' },
];

export default function Evidence() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setData(await api.metrics());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const chartData = data
    ? METRICS.map((m) => ({
        name: m.label,
        Model: data.model[m.key],
        Baseline: data.baseline_volume_threshold[m.key],
      }))
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Evidence</h1>
          <p className="text-sm text-mute-400 mt-1 max-w-2xl">
            The Freeze Appeal Engine replayed against a labelled hold-out slice it has never
            seen, alongside the naive rule it has to beat: flag any account whose volume spiked
            more than 3&times;. Every run is live — nothing here is a stored screenshot.
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={run} disabled={busy}>
          {busy ? 'Evaluating…' : 'Run evaluation'}
        </button>
      </div>

      {error && <div className="panel p-4 text-sm text-red-400">{error}</div>}

      {busy && !data && (
        <div className="panel p-8 text-center text-sm text-mute-400">
          Scoring the hold-out set one case at a time — this takes a moment.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {METRICS.map((m) => {
              const model = data.model[m.key];
              const base = data.baseline_volume_threshold[m.key];
              const delta = Number((model - base).toFixed(3));
              return (
                <div key={m.key} className="panel p-4">
                  <div className="label">{m.label}</div>
                  <div className="text-2xl font-semibold text-slate-100 tabular-nums mt-1">
                    {model.toFixed(3)}
                  </div>
                  <div className={`text-xs mt-1 tabular-nums ${
                    delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-mute-400'
                  }`}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(3)} vs baseline
                  </div>
                  <div className="text-[11px] text-mute-400 mt-2 leading-snug">{m.hint}</div>
                </div>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="panel p-5">
              <div className="label mb-3">Model vs naive baseline</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2b3340" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#8b95a7', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 1]} tick={{ fill: '#8b95a7', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#11151d', border: '1px solid #2b3340', borderRadius: 6, fontSize: 12 }}
                      cursor={{ fill: '#ffffff08' }}
                    />
                    <Bar dataKey="Baseline" fill="#3f4859" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Model" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel p-5">
              <div className="label mb-3">Confusion matrix — {data.scored} held-out cases</div>
              <ConfusionMatrix matrix={data.model.confusion_matrix} />
            </div>
          </div>

          <div className="panel p-5">
            <div className="label mb-3">Accuracy by injected case type</div>
            <p className="text-xs text-mute-400 mb-3">
              The seed script builds every case from a named profile, so a weakness is
              diagnosable rather than just a lower number.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(data.accuracy_by_generated_profile).map(([profile, s]) => (
                <div key={profile} className="bg-ink-900 border border-ink-600 rounded p-3">
                  <div className="text-xs text-mute-300">{profile.replace(/_/g, ' ')}</div>
                  <div className="text-lg font-semibold tabular-nums mt-1 text-slate-100">
                    {(s.accuracy * 100).toFixed(0)}%
                  </div>
                  <div className="text-[11px] text-mute-400">{s.correct}/{s.total}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <div className="label mb-3">Every held-out prediction</div>
            <div className="scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-mute-400 border-b border-ink-600">
                    <th className="pb-2 pr-4 font-medium">Merchant</th>
                    <th className="pb-2 pr-4 font-medium">Actual</th>
                    <th className="pb-2 pr-4 font-medium">Predicted</th>
                    <th className="pb-2 pr-4 font-medium">Conf.</th>
                    <th className="pb-2 font-medium">Baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.predictions.map((p) => (
                    <tr key={p.flag_id} className="border-b border-ink-700/50">
                      <td className="py-2 pr-4 text-slate-300 whitespace-nowrap">{p.merchant}</td>
                      <td className="py-2 pr-4 text-mute-400 whitespace-nowrap">{p.actual.replace('_', ' ')}</td>
                      <td className={`py-2 pr-4 whitespace-nowrap ${p.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                        {p.predicted.replace('_', ' ')}
                      </td>
                      <td className="py-2 pr-4 text-mute-400 tabular-nums">{Number(p.confidence).toFixed(2)}</td>
                      <td className={`py-2 whitespace-nowrap ${
                        p.baseline === p.actual ? 'text-mute-400' : 'text-red-400/70'
                      }`}>
                        {p.baseline.replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.failed?.length > 0 && (
            <div className="panel p-4 text-sm text-amber-300">
              {data.failed.length} case(s) failed to score — see server logs.
            </div>
          )}
        </>
      )}
    </div>
  );
}
