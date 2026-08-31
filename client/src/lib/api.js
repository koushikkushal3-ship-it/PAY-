async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body;
}

export const api = {
  health: () => request('/health'),
  queue: (module) => request(`/queue?module=${module}`),
  queueSummary: () => request('/queue/summary'),
  detectRisk: () => request('/detect/risk', { method: 'POST' }),
  case: (id) => request(`/cases/${id}`),
  reason: (id) => request(`/cases/${id}/reason`, { method: 'POST' }),
  action: (id, action, note) =>
    request(`/cases/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    }),
  metrics: () => request('/metrics'),
  runEval: () => request('/eval/run', { method: 'POST' }),
  audit: () => request('/audit'),
};

export const inr = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const pct = (n) => (n == null ? '—' : `${(Number(n) * 100).toFixed(1)}%`);
