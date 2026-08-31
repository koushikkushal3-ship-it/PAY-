import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, pct, humanise, formatValue, MODULE_ACTIONS } from '../lib/api.js';
import { Card, Empty, ActionBadge } from '../components/Bits.jsx';

/** Verdicts that mean "this is the bad case" — shown in red rather than green. */
const NEGATIVE = new Set(['genuine_risk', 'unfair_pricing', 'exception_confirmed']);

function Verdict({ value }) {
  if (!value) return <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">not scored</span>;
  const bad = NEGATIVE.has(value);
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
      bad ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
    }`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

/**
 * Renders any context object the modules produce. Deliberately generic: this
 * panel is the claim that nothing is hidden from the reviewer, so it shows the
 * model's input as-is rather than a curated subset.
 */
function ContextTree({ data, depth = 0 }) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;

  return (
    <div className={depth ? 'ml-3 border-l border-slate-800 pl-3' : ''}>
      {Object.entries(data).map(([key, value]) => {
        const nested = value && typeof value === 'object' && !Array.isArray(value);
        if (nested) {
          return (
            <div key={key} className="mt-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                {humanise(key)}
              </div>
              <ContextTree data={value} depth={depth + 1} />
            </div>
          );
        }
        return (
          <div key={key} className="flex justify-between gap-4 border-b border-slate-800/60 py-1.5 last:border-0">
            <span className="text-xs text-slate-500">{humanise(key)}</span>
            <span className="text-right text-xs text-slate-200">{formatValue(key, value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Verdict fields that get their own treatment; everything else is listed. */
const HANDLED = new Set([
  'verdict', 'confidence', 'recommended_action', 'key_signals', 'reasoning',
  'merchant_message', 'model', 'latency_ms', 'scored_at',
]);

export default function CaseDetail() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');

  async function load() {
    try {
      setState({ loading: false, data: await api.case(id) });
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  }
  useEffect(() => { load(); }, [id]);

  async function run(fn, tag) {
    setBusy(tag);
    try { await fn(); await load(); }
    catch (err) { setState((s) => ({ ...s, error: err.message })); }
    finally { setBusy(null); }
  }

  if (state.loading) return <Empty>Loading…</Empty>;
  if (state.error && !state.data) {
    return <Empty><span className="text-rose-400">{state.error}</span></Empty>;
  }

  const { case: c, module, context, panels } = state.data;
  const v = c.verdict;
  const actions = MODULE_ACTIONS[c.module] ?? ['escalate', 'dismiss'];
  const extras = v ? Object.entries(v).filter(([k]) => !HANDLED.has(k)) : [];

  return (
    <div className="space-y-4">
      <div>
        <Link to={`/queue/${c.module}`} className="text-xs text-slate-500 hover:text-slate-300">
          ← {module.label}
        </Link>
        <h1 className="text-lg">{c.title}</h1>
      </div>

      {state.error && <div className="text-sm text-rose-400">{state.error}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="What the model is shown">
          <p className="mb-2 text-[11px] text-slate-500">
            This is the exact input sent to the reasoner — no labels, no hints.
          </p>
          <ContextTree data={context} />
        </Card>

        <div className="space-y-4">
          <Card
            title="Reasoner verdict"
            right={
              <button
                onClick={() => run(() => api.reason(id), 'reason')}
                disabled={busy === 'reason'}
                className="rounded bg-slate-700 px-3 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
              >
                {busy === 'reason' ? 'Thinking…' : v ? 'Re-run' : 'Run reasoner'}
              </button>
            }
          >
            {!v ? (
              <Empty>Not scored yet.</Empty>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Verdict value={v.verdict} />
                  <ActionBadge action={v.recommended_action} />
                  <span className="text-xs text-slate-500">confidence {pct(v.confidence)}</span>
                </div>

                <p className="text-sm leading-relaxed text-slate-200">{v.reasoning}</p>

                {v.key_signals?.length > 0 && (
                  <ul className="space-y-1">
                    {v.key_signals.map((s, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-400">
                        <span className="text-slate-600">•</span>{s}
                      </li>
                    ))}
                  </ul>
                )}

                {extras.length > 0 && (
                  <div className="rounded bg-slate-900/60 p-3">
                    {extras.map(([k, val]) => (
                      <div key={k} className="flex justify-between gap-4 py-0.5">
                        <span className="text-xs text-slate-500">{humanise(k)}</span>
                        <span className="text-xs text-slate-300">{formatValue(k, val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {v.merchant_message && (
                  <div className="rounded bg-slate-900/60 p-3">
                    <div className="mb-1 text-xs text-slate-500">Draft message to merchant</div>
                    <p className="text-sm text-slate-300">{v.merchant_message}</p>
                  </div>
                )}

                <div className="text-[11px] text-slate-600">{v.model} · {v.latency_ms}ms</div>
              </div>
            )}
          </Card>

          <Card title="Analyst decision">
            {c.status !== 'open' ? (
              <div className="text-sm text-slate-400">Case already {c.status}.</div>
            ) : (
              <>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="mb-3 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <button
                      key={a}
                      onClick={() => run(() => api.action(id, a, note || null), a)}
                      disabled={!!busy}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50"
                    >
                      {busy === a ? '…' : a.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Card>

          {panels?.attempts?.length > 0 && (
            <Card title={`Recovery attempts (${panels.attempts.length})`}>
              {panels.attempts.map((a) => (
                <div key={a.id} className="flex justify-between border-b border-slate-800/60 py-1.5 text-xs last:border-0">
                  <span className="text-slate-400">#{a.attempt_no} {a.action_taken}</span>
                  <span className="text-slate-500">{a.outcome}</span>
                </div>
              ))}
            </Card>
          )}

          {panels?.quotes?.length > 0 && (
            <Card title={`Agent quotes (${panels.quotes.length})`}>
              <div className="max-h-56 overflow-y-auto">
                {panels.quotes.map((q) => (
                  <div key={q.id} className="flex justify-between border-b border-slate-800/60 py-1.5 text-xs last:border-0">
                    <span className="text-slate-500">{q.buyer_ref ?? '—'}</span>
                    <span className="tabular-nums text-slate-300">
                      {formatValue('quoted_inr', Number(q.quoted_price))}
                    </span>
                    <span className={q.discount_rule ? 'text-emerald-400' : 'text-amber-400'}>
                      {q.discount_rule ?? 'no rule'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {panels?.transactions?.length > 0 && (
            <Card title={`Recent transactions (${panels.transactions.length})`}>
              <div className="max-h-56 overflow-y-auto">
                {panels.transactions.map((t) => (
                  <div key={t.id} className="flex justify-between border-b border-slate-800/60 py-1.5 text-xs last:border-0">
                    <span className="text-slate-400">
                      {t.method}{t.is_cross_border ? ' · cross-border' : ''}
                    </span>
                    <span className="tabular-nums text-slate-300">
                      {formatValue('amount_inr', Number(t.amount))}
                    </span>
                    <span className={
                      t.status === 'captured' ? 'text-emerald-400'
                        : t.status === 'declined' ? 'text-rose-400' : 'text-amber-400'
                    }>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
