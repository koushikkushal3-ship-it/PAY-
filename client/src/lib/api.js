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
  detect: (module) => request(`/detect/${module}`, { method: 'POST' }),
  detectAll: () => request('/detect', { method: 'POST' }),
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

/** snake_case_key -> "Snake case key", for rendering arbitrary context objects. */
export const humanise = (key) =>
  key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Render a leaf value readably without guessing units. */
export function formatValue(key, value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (typeof value === 'number') {
    if (/_inr$|_inr_|amount|value_at_risk|volume/.test(key)) return inr(value);
    if (/_pct$/.test(key)) return `${value}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }
  return String(value);
}

/** Actions offered per module, matching what the server accepts. */
export const MODULE_ACTIONS = {
  risk: ['release', 'request_documents', 'hold', 'escalate'],
  recovery: ['retry_payment', 'contact_buyer', 'write_off', 'escalate'],
  agent_audit: ['block_agent_pricing', 'require_disclosed_rule', 'monitor', 'dismiss'],
  finance: ['correct_filing', 'notify_merchant', 'schedule_release', 'escalate'],
};
