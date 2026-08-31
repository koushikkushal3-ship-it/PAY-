import { Router } from 'express';
import { db, writeAudit } from '../lib/db.js';
import { scoreFlag } from '../detectors/risk.js';
import { buildRiskCaseInput } from '../reasoner/prompts.js';

export const casesRouter = Router();

const ACTIONS = ['release', 'hold', 'request_documents', 'escalate', 'dismiss'];

async function loadCase(id) {
  const { data: c, error } = await db
    .from('review_queue')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw Object.assign(new Error(`case not found`), { status: 404 });
  return c;
}

casesRouter.get('/cases/:id', async (req, res, next) => {
  try {
    const c = await loadCase(req.params.id);

    if (c.module !== 'risk') {
      return res.json({ case: c, context: null });
    }

    const { data: flag, error: fErr } = await db
      .from('merchant_flags')
      .select('id, merchant_id, flag_type, trigger, signal, triggered_at')
      .eq('id', c.entity_id)
      .single();
    if (fErr) throw new Error(fErr.message);

    const { data: merchant, error: mErr } = await db
      .from('merchants')
      .select('*')
      .eq('id', flag.merchant_id)
      .single();
    if (mErr) throw new Error(mErr.message);

    const [{ data: txns }, { data: settlements }, { data: actions }] = await Promise.all([
      db.from('transactions').select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })
        .limit(12),
      db.from('settlements').select('*').eq('merchant_id', merchant.id),
      db.from('case_actions').select('*')
        .eq('case_id', c.id)
        .order('created_at', { ascending: false }),
    ]);

    res.json({
      case: c,
      // Exactly what the model is shown — displayed in the UI so a reviewer can
      // see there is no hidden label in the prompt.
      context: buildRiskCaseInput({ merchant, flag }),
      merchant,
      transactions: txns ?? [],
      settlements: settlements ?? [],
      actions: actions ?? [],
    });
  } catch (err) {
    next(err);
  }
});

casesRouter.post('/cases/:id/reason', async (req, res, next) => {
  try {
    const c = await loadCase(req.params.id);
    if (c.module !== 'risk') {
      return res.status(400).json({ error: 'only the risk module is wired up so far' });
    }

    const { verdict } = await scoreFlag(c.entity_id, { persistTo: c.id });

    await writeAudit({
      actor: 'reasoner',
      module: 'risk',
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
      case_id: c.id,
      action,
      actor,
      note: note ?? null,
    });
    if (aErr) throw new Error(aErr.message);

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
      // Recorded so the trail shows whether the human agreed with the model.
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
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    res.json({ entries: data });
  } catch (err) {
    next(err);
  }
});
