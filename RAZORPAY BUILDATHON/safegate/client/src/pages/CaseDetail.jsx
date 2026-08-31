import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr, pct } from '../lib/api.js';
import { Card, Empty, Field, VerdictBadge, ActionBadge } from '../components/Bits.jsx';

const ACTIONS = ['release', 'request_documents', 'hold', 'escalate'];

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

  async function score() {
    setBusy('reason');
    try { await api.reason(id); await load(); }
    catch (err) { setState((s) => ({ ...s, error: err.message })); }
    finally { setBusy(null); }
  }

  async function act(action) {
    setBusy(action);
    try { await api.action(id, action, note || null); await load(); }
    catch (err) { setState((s) => ({ ...s, error: err.message })); }
    finally { setBusy(null); }
  }

  if (state.loading) return <Empty>Loading…</Empty>;
  if (state.error) return <Empty><span className="text-rose-400">{state.error}</span></Empty>;

  const { case: c, context, merchant, transactions, settlements } = state.data;
  const v = c.verdict;
  const o = context?.observed ?? {};
  const held = (settlements ?? []).reduce((sum, s) => sum + Number(s.reserve_held ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/queue/risk" className="text-xs text-slate-500 hover:text-slate-300">← queue</Link>
          <h1 className="text-lg">{c.title}</h1>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">settlement held</div>
          <div className="tabular-nums">{inr(held)}</div>
        </div>
      </div>

      {state.data.error && <div className="text-rose-400 text-sm">{state.data.error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card title="Merchant">
            <Field label="Business" value={merchant?.name} />
            <Field label="Category / MCC" value={`${merchant?.category} · ${merchant?.mcc}`} />
            <Field label="Account age" value={`${merchant?.account_age_days} days`} />
            <Field label="KYC" value={merchant?.kyc_status} />
            <Field label="Documentation" value={pct(merchant?.doc_completeness)} />
            <Field label="Baseline monthly volume" value={inr(merchant?.baseline_monthly_volume)} />
          </Card>

          <Card title="What triggered the flag">
            <Field label="Volume last 30d" value={inr(o.volume_last_30d_inr)} />
            <Field label="Spike vs baseline" value={o.spike_multiple_vs_baseline ? `${o.spike_multiple_vs_baseline}x` : '—'} />
            <Field label="Chargeback ratio" value={pct(o.chargeback_ratio)} />
            <Field label="Category benchmark" value={pct(o.category_chargeback_benchmark)} />
            <Field label="Chargeback trend" value={o.chargeback_trend_3m} />
            <Field label="Refund rate (prior)" value={`${pct(o.refund_rate)} (${pct(o.refund_rate_prior_period)})`} />
            <Field label="New buyer ratio" value={pct(o.new_buyer_ratio)} />
            <Field label="Top buyer share" value={pct(o.top_buyer_share_of_volume)} />
            <Field label="Distinct buyers 30d" value={o.distinct_buyers_30d} />
            <Field label="Disputes 90d" value={o.dispute_count_90d} />
            <Field label="Dormant before spike" value={o.dormant_days_before_spike ? `${o.dormant_days_before_spike} days` : 'no'} />
            <Field label="Cross-border share" value={pct(o.cross_border_share)} />
            {context?.context_note && (
              <p className="mt-3 text-xs text-slate-400 leading-relaxed">{context.context_note}</p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Reasoner verdict"
            right={
              <button
                onClick={score}
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
                <div className="flex items-center gap-2">
                  <VerdictBadge verdict={v.verdict} />
                  <ActionBadge action={v.recommended_action} />
                  <span className="text-xs text-slate-500">confidence {pct(v.confidence)}</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-200">{v.reasoning}</p>
                <ul className="space-y-1">
                  {v.key_signals?.map((s, i) => (
                    <li key={i} className="text-xs text-slate-400 flex gap-2">
                      <span className="text-slate-600">•</span>{s}
                    </li>
                  ))}
                </ul>
                <div className="rounded bg-slate-900/60 p-3">
                  <div className="text-xs text-slate-500 mb-1">Draft message to merchant</div>
                  <p className="text-sm text-slate-300">{v.merchant_message}</p>
                </div>
                <div className="text-[11px] text-slate-600">
                  {v.model} · {v.latency_ms}ms
                </div>
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
                  {ACTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => act(a)}
                      disabled={!!busy}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50"
                    >
                      {busy === a ? '…' : a.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card title={`Recent transactions (${transactions?.length ?? 0})`}>
            <div className="max-h-56 overflow-y-auto">
              {(transactions ?? []).map((t) => (
                <div key={t.id} className="flex justify-between border-b border-slate-800/60 py-1.5 text-xs last:border-0">
                  <span className="text-slate-400">
                    {t.method}{t.is_cross_border ? ' · cross-border' : ''}
                  </span>
                  <span className="tabular-nums text-slate-300">{inr(t.amount)}</span>
                  <span className={t.status === 'captured' ? 'text-emerald-400' : t.status === 'declined' ? 'text-rose-400' : 'text-amber-400'}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
