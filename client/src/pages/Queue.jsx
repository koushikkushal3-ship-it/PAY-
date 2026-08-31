import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import CaseCard from '../components/CaseCard.jsx';

const MODULES = {
  risk: {
    title: 'Freeze Appeal Queue',
    blurb: 'Accounts an automated risk system already flagged. The question here is whether that flag was right — today there is no appeal path at all.',
    scan: () => api.scanRisk(),
  },
  recovery: {
    title: 'Recovery Queue',
    blurb: 'Borderline declines worth a second attempt, and unpaid B2B invoices. Consumer cart and subscription recovery is already handled elsewhere.',
    scan: null,
  },
  agent_audit: {
    title: 'Agent Pricing Audit',
    blurb: 'AI agents quoting the same SKU at different prices with no discount rule behind it.',
    scan: null,
  },
  finance: {
    title: 'Finance Exceptions',
    blurb: 'Rolling-reserve exposure with release dates, and invoices whose GST bucket looks wrong.',
    scan: null,
  },
};

export default function Queue() {
  const { module } = useParams();
  const config = MODULES[module] ?? MODULES.risk;

  const [cases, setCases] = useState([]);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCases(await api.queue(module, status));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [module, status]);

  useEffect(() => { load(); }, [load]);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      await config.scan();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{config.title}</h1>
          <p className="text-sm text-mute-400 mt-1 max-w-2xl">{config.blurb}</p>
        </div>
        {config.scan && (
          <button className="btn-primary shrink-0" onClick={runScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
        )}
      </div>

      <div className="flex gap-1">
        {['open', 'actioned', 'dismissed', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
              status === s ? 'bg-ink-600 text-slate-200' : 'text-mute-400 hover:bg-ink-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="panel p-4 text-sm text-red-400">{error}</div>}

      {loading ? (
        <div className="text-mute-400 text-sm">Loading…</div>
      ) : cases.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-mute-400 text-sm">
            No {status === 'all' ? '' : status} cases in this queue.
          </p>
          {config.scan && status === 'open' && (
            <p className="text-mute-400 text-xs mt-2">Run a scan to populate it.</p>
          )}
          {!config.scan && (
            <p className="text-mute-400 text-xs mt-2">This module lands on day 2.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => <CaseCard key={c.id} kase={c} />)}
        </div>
      )}
    </div>
  );
}
