import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Queue from './pages/Queue.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import Metrics from './pages/Metrics.jsx';
import AuditLog from './pages/AuditLog.jsx';

const tab = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm ${
    isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
  }`;

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-[#0e1426]">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center gap-6">
          <div>
            <div className="font-semibold tracking-tight">SafeGate</div>
            <div className="text-xs text-slate-500">Internal ops console</div>
          </div>
          <nav className="flex gap-1">
            <NavLink to="/queue/risk" className={tab}>Risk</NavLink>
            <NavLink to="/queue/recovery" className={tab}>Recovery</NavLink>
            <NavLink to="/queue/agent_audit" className={tab}>Agent audit</NavLink>
            <NavLink to="/queue/finance" className={tab}>Finance</NavLink>
            <span className="w-px bg-slate-800 mx-2" />
            <NavLink to="/metrics" className={tab}>Evidence</NavLink>
            <NavLink to="/audit" className={tab}>Audit log</NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/queue/risk" replace />} />
          <Route path="/queue/:module" element={<Queue />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/audit" element={<AuditLog />} />
        </Routes>
      </main>
    </div>
  );
}
