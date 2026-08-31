import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import VerdictBadge from '../components/VerdictBadge.jsx';

// Which actions each module offers. The backend validates this list again —
// the UI narrowing it is convenience, not the control.
const ACTIONS = {
  risk: [
    { key: 'release',           label: 'Release',        cls: 'btn-ok' },
    { key: 'request_documents', label: 'Request docs',   cls: 'btn-ghost' },
    { key: 'escalate',          label: 'Escalate',       cls: 'btn-danger' },
  ],
  recovery: [
    { key: 'approve_recovery',  label: 'Approve recovery', cls: 'btn-ok' },
    { key: 'dismiss',           label: 'Dismiss',          cls: 'btn-ghost' },
  ],
  agent_audit: [
    { key: 'flag_agent',        label: 'Flag agent',     cls: 'btn-danger' },
    { key: 'dismiss',           label: 'Dismiss',        cls: 'btn-ghost' },
  ],
  finance: [
    { key: 'acknowledge',       label: 'Acknowledge',    cls: 'btn-ghost' },
    { key: 'correct',           label: 'Mark corrected', cls: 'btn-ok' },
  ],
};

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-slate-200 mt-0.5 font-mono break-words">{String(value)}</div>
    </div>
  );
}

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [kase, setKase] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.case(id).then(setKase).catch((e) => setError(e.message));
  }, [id]);

  async function act(action) {
    setBusy(true);
    setError(null);
    try {
      await api.act(id, action, note.trim() || undefined);
      navigate(`/queue/${kase.module}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (error && !kase) return <div className="panel p-4 text-sm text-red-400 max-w-3xl mx-auto">{error}</div>;
  if (!kase) return <div className="text-mute-400 text-sm">Loading…</div>;

  const v = kase.verdict ?? {};
  const reasoning = v.reasoning ?? v.rationale ?? v.summary ?? null;
  const actions = ACTIONS[kase.module] ?? [];
  const merchant = kase.context?.merchant;
  const record = kase.context?.record;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to={`/queue/${kase.module}`} className="text-xs text-mute-400 hover:text-slate-300">
        ← Back to queue
      </Link>

      <div className="panel p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold text-slate-100">{kase.title}</h1>
          <VerdictBadge verdict={v} confidence={v.confidence} />
        </div>

        {reasoning && (
          <div>
            <div className="label mb-1.5">Reasoning</div>
            <p className="text-sm text-slate-300 leading-relaxed">{reasoning}</p>
          </div>
        )}

        {v.key_factors?.length > 0 && (
          <div>
            <div className="label mb-1.5">Key factors</div>
            <ul className="space-y-1">
              {v.key_factors.map((f, i) => (
                <li key={i} className="text-sm text-mute-300 flex gap-2">
                  <span className="text-mute-400">·</span>{f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {v.message_draft && (
          <div>
            <div className="label mb-1.5">Drafted message</div>
            <pre className="text-sm text-slate-300 bg-ink-900 border border-ink-600 rounded p-3
                            whitespace-pre-wrap font-sans leading-relaxed">{v.message_draft}</pre>
          </div>
        )}

        {v.risk_note && (
          <div>
            <div className="label mb-1.5">Watch</div>
            <p className="text-sm text-amber-300/90">{v.risk_note}</p>
          </div>
        )}
      </div>

      {(merchant || record) && (
        <div className="panel p-5">
          <div className="label mb-3">Case data</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {merchant && (
              <>
                <Field label="Merchant"      value={merchant.name} />
                <Field label="Category"      value={merchant.category} />
                <Field label="Account age"   value={`${merchant.account_age_days} days`} />
                <Field label="KYC"           value={merchant.kyc_status} />
                <Field label="Docs complete" value={`${Math.round(merchant.doc_completeness * 100)}%`} />
                <Field label="Baseline/mo"   value={`₹${Number(merchant.baseline_monthly_volume).toLocaleString('en-IN')}`} />
              </>
            )}
            {record?.signal && Object.entries(record.signal).map(([k, val]) => (
              <Field key={k} label={k.replace(/_/g, ' ')} value={val} />
            ))}
          </div>
        </div>
      )}

      {kase.actions?.length > 0 && (
        <div className="panel p-5">
          <div className="label mb-3">History</div>
          <div className="space-y-2">
            {kase.actions.map((a) => (
              <div key={a.id} className="text-sm flex gap-3">
                <span className="text-slate-300">{a.action.replace(/_/g, ' ')}</span>
                <span className="text-mute-400">by {a.actor}</span>
                {a.note && <span className="text-mute-400 italic">“{a.note}”</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {kase.status === 'open' ? (
        <div className="panel p-5 space-y-3">
          <div className="label">Decision</div>
          <textarea
            rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the audit trail…"
            className="w-full bg-ink-900 border border-ink-500 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:border-brand resize-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            {actions.map((a) => (
              <button key={a.key} className={a.cls} disabled={busy} onClick={() => act(a.key)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel p-4 text-sm text-mute-400">
          Case {kase.status}. Recorded in the audit log.
        </div>
      )}
    </div>
  );
}
