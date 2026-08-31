import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Service-role client: this is an internal ops tool, the server is the only
// thing that talks to the database. RLS stays on so nothing is reachable with
// the anon key by accident.
export const db = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function writeAudit({ actor, module, caseId, action, reasoning, outcome }) {
  const { error } = await db.from('audit_log').insert({
    actor,
    module,
    case_id: caseId ?? null,
    action,
    reasoning: reasoning ?? null,
    outcome: outcome ?? null,
  });
  if (error) throw new Error(`audit_log insert failed: ${error.message}`);
}
