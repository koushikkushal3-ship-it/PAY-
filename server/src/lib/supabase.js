import { createClient } from '@supabase/supabase-js';

// Service-role client. Every write in this app goes through here — RLS grants
// analysts read-only access, so the backend is the only path that can create a
// case, record an action, or append to the audit log.
export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
