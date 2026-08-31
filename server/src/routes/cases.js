import { Router } from 'express';
import { db, writeAudit } from '../lib/db.js';
import { getModule, scoreCase } from '../detectors/index.js';

export const casesRouter = Router();

const ACTIONS = [
  'release', 'hold', 'request_documents', 'escalate', 'dismiss',
  'retry_payment', 'contact_buyer', 'write_off',
  'correct_filing', 'notify_merchant', 'schedule_release',
  'block_agent_pricing', 'require_disclosed_rule', 'monitor',
];

async function loadCase(id) {
  const { data, error } = await db.from('review_queue').select('*').eq('id', id).single();
  if (error) throw Object.assign(new Error('case not found'), { status: 404 });
  return data;
}

casesRouter.get('/cases/:id', async (req, res, next) => {
  try {
    const c = await loadCase(req.params.id);
    const mod = getModule(c.module);
    const { input, panels } = await mod.loadContext(c);

    const { data: actions } = await db
      .from('case_actions').select('*')
      .eq('case_id', c.id)
      .order('created_at', { ascending: false });

    res.json({
      case: c,
      module: { key: mod.key, label: mod.label },
      // Exactly what the model is shown, rendered in the UI so a reviewer can
      // see for themselves that no label or hint rides along in the prompt.
      context: input,
      panels,
      actions: actions ?? [],
    });
  } catch (err) {
    next(err);
  }
});

casesRouter.post('/cases/:id/reason', async (req, res, next) => {
  try {
    const c = await loadCase(req.params.id);
    const verdict = await scoreCase(c);

    await writeAudit({
      actor: 'reasoner',
      module: c.module,
      caseId: c.id,
      action: 'scored',
      reasoning: verdict.reasoning,
      outcome: `${verdict.verdict} (${verdict.recommended_action}), confidence ${verdict.confidence}`,
    });

    res.json({ verdict });
  } catch (err) {
    next(err);
  }
});

casesRouter.post('/cases/:id/action', async (req, res, next) => {
  try {
    const { action, note, actor = 'analyst' } = req.body ?? {};
    if (!ACTIONS.includes(action)) {
      return res.status(400).json({ error: `action must be one of ${ACTIONS.join(', ')}` });
    }

    const c = await loadCase(req.params.id);

    const { error: aErr } = await db.from('case_actions').insert({
      case_id: c.id, action, actor, note: note ?? null,
    });
    if (aErr) throw new Error(aErr.message);

    // Recovery actions are attempts against the underlying entity, and the
    // stop rule counts them, so they are recorded separately from the audit
    // trail rather than inferred from it later.
    if (c.module === 'recovery' && ['retry_payment', 'contact_buyer'].includes(action)) {
      const { count } = await db
        .from('recovery_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('entity_id', c.entity_id);

      const cap = Number(c.verdict?.stop_after_attempts ?? 3);
      const attemptNo = (count ?? 0) + 1;

      if (attemptNo > cap) {
        return res.status(409).json({
          error: `stop rule reached: ${count} attempts already made, cap is ${cap}`,
        });
      }

      await db.from('recovery_attempts').insert({
        case_id: c.id,
        entity_type: c.entity_type,
        entity_id: c.entity_id,
        attempt_no: attemptNo,
        channel: action === 'contact_buyer' ? 'email' : 'payment_rail',
        action_taken: action,
        outcome: 'pending',
        stopped_reason: attemptNo === cap ? 'final attempt under stop rule' : null,
      });
    }

    const { error: uErr } = await db
      .from('review_queue')
      .update({ status: action === 'dismiss' ? 'dismissed' : 'actioned' })
      .eq('id', c.id);
    if (uErr) throw new Error(uErr.message);

    await writeAudit({
      actor,
      module: c.module,
      caseId: c.id,
      action,
      reasoning: note ?? null,
      // Records whether the human agreed with the model, which is the thing
      // worth being able to audit later.
      outcome: c.verdict
        ? `model recommended ${c.verdict.recommended_action}; analyst chose ${action}`
        : `analyst chose ${action} with no model verdict on file`,
    });

    res.json({ ok: true, action });
  } catch (err) {
    next(err);
  }
});

casesRouter.get('/audit', async (_req, res, next) => {
  try {
    const { data, error } = await db
      .from('audit_log').select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    res.json({ entries: data });
  } catch (err) {
    next(err);
  }
});
