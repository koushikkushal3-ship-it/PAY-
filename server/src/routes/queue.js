import { Router } from 'express';
import { db } from '../lib/db.js';
import { MODULES, MODULE_KEYS, getModule, detectAll } from '../detectors/index.js';

export const queueRouter = Router();

queueRouter.get('/queue', async (req, res, next) => {
  try {
    const module = req.query.module ?? 'risk';
    getModule(module); // validates, throws 400 on an unknown key
    const status = req.query.status ?? 'open';

    const { data, error } = await db
      .from('review_queue')
      .select('id, module, entity_type, entity_id, title, priority_score, status, verdict, created_at')
      .eq('module', module)
      .eq('status', status)
      .order('priority_score', { ascending: false });
    if (error) throw new Error(error.message);

    res.json({
      module,
      label: MODULES[module].label,
      count: data.length,
      cases: data.map((c) => ({
        ...c,
        // List view needs the headline only; the full verdict comes from the
        // case detail endpoint.
        verdict: c.verdict
          ? {
              verdict: c.verdict.verdict,
              confidence: c.verdict.confidence,
              recommended_action: c.verdict.recommended_action,
            }
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

queueRouter.get('/queue/summary', async (_req, res, next) => {
  try {
    const { data, error } = await db.from('review_queue').select('module, status, verdict');
    if (error) throw new Error(error.message);

    res.json({
      summary: MODULE_KEYS.map((m) => {
        const rows = data.filter((r) => r.module === m);
        return {
          module: m,
          label: MODULES[m].label,
          open: rows.filter((r) => r.status === 'open').length,
          actioned: rows.filter((r) => r.status === 'actioned').length,
          scored: rows.filter((r) => r.verdict).length,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

queueRouter.post('/detect', async (_req, res, next) => {
  try {
    res.json({ created: await detectAll() });
  } catch (err) {
    next(err);
  }
});

queueRouter.post('/detect/:module', async (req, res, next) => {
  try {
    res.json(await getModule(req.params.module).detect());
  } catch (err) {
    next(err);
  }
});
