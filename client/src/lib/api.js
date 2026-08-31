import { supabase } from './supabase.js';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');

/**
 * Every call carries the Supabase access token; the backend re-verifies its
 * signature before touching data. A 401 here means the session expired, not
 * that the request was malformed.
 */
async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export const api = {
  queue:      (module, status = 'open') =>
                request(`/queue?module=${module}&status=${status}`),
  case:       (id) => request(`/cases/${id}`),
  act:        (id, action, note) =>
                request(`/cases/${id}/action`, {
                  method: 'POST',
                  body: JSON.stringify({ action, ...(note ? { note } : {}) }),
                }),
  scanRisk:   () => request('/risk/scan', { method: 'POST' }),
  metrics:    () => request('/risk/metrics'),
  auditLog:   (module) => request(`/audit-log${module ? `?module=${module}` : ''}`),
};
