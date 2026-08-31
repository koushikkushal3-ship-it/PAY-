export function Card({ title, right, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-[#131a2e] ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <h2 className="text-sm font-medium text-slate-300">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function VerdictBadge({ verdict }) {
  if (!verdict) {
    return <span className="rounded px-2 py-0.5 text-xs bg-slate-800 text-slate-400">not scored</span>;
  }
  const risk = verdict === 'genuine_risk';
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        risk ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
      }`}
    >
      {risk ? 'genuine risk' : 'false positive'}
    </span>
  );
}

export function ActionBadge({ action }) {
  const tone = {
    // green: money or access flows back to the merchant
    release: 'bg-emerald-950 text-emerald-300',
    retry_payment: 'bg-emerald-950 text-emerald-300',
    schedule_release: 'bg-emerald-950 text-emerald-300',
    // amber: needs a step before it can resolve
    request_documents: 'bg-amber-950 text-amber-300',
    step_up_verification: 'bg-amber-950 text-amber-300',
    contact_buyer: 'bg-amber-950 text-amber-300',
    require_disclosed_rule: 'bg-amber-950 text-amber-300',
    correct_filing: 'bg-amber-950 text-amber-300',
    notify_merchant: 'bg-amber-950 text-amber-300',
    // red: restriction stays, or the money is gone
    hold: 'bg-rose-950 text-rose-300',
    write_off: 'bg-rose-950 text-rose-300',
    block_agent_pricing: 'bg-rose-950 text-rose-300',
    // violet: handed to a human
    escalate: 'bg-violet-950 text-violet-300',
    escalate_to_finance: 'bg-violet-950 text-violet-300',
  }[action] ?? 'bg-slate-800 text-slate-300';
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${tone}`}>
      {action?.replace(/_/g, ' ')}
    </span>
  );
}

export function Field({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="py-10 text-center text-sm text-slate-500">{children}</div>;
}
