import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase.js';
import Login from './pages/Login.jsx';
import Queue from './pages/Queue.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import Evidence from './pages/Evidence.jsx';
import AuditLog from './pages/AuditLog.jsx';

const NAV = [
  { to: '/queue/risk',        label: 'Risk',        hint: 'Freeze appeals' },
  { to: '/queue/recovery',    label: 'Recovery',    hint: 'Declines & invoices' },
  { to: '/queue/agent_audit', label: 'Agent Audit', hint: 'Pricing fairness' },
  { to: '/queue/finance',     label: 'Finance',     hint: 'Reserve & GST' },
  { to: '/evidence',          label: 'Evidence',    hint: 'Model metrics' },
  { to: '/audit',             label: 'Audit Log',   hint: 'Full trail' },
];

function Shell({ session, children }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-600 bg-ink-800/60 backdrop-blur sticky top-0 z-10">
        <div className="px-5 py-3 flex items-center gap-6">
          <div>
            <div className="font-semibold text-slate-100 leading-tight">Ops Console</div>
            <div className="text-[11px] text-mute-400">Internal · Trust, Recovery, Compliance, Finance</div>
          </div>

          <nav className="flex gap-1 flex-1 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                title={n.hint}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-brand/15 text-blue-300 border border-brand/30'
                      : 'text-mute-300 hover:bg-ink-700 border border-transparent'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 text-xs text-mute-400">
            <span className="hidden sm:inline">{session.user.email}</span>
            <button
              className="btn-ghost"
              onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-5">{children}</main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="min-h-screen grid place-items-center text-mute-400">Loading…</div>;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell session={session}>
      <Routes>
        <Route path="/queue/:module" element={<Queue />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/evidence" element={<Evidence />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/queue/risk" replace />} />
      </Routes>
    </Shell>
  );
}
