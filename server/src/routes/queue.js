import { Router } from 'express';
import { db } from '../lib/db.js';
import { detectRiskCases } from '../detectors/risk.js';

export const queueRouter = Router();

const MODULES = ['risk', 'recovery', 'agent_audit', 'finance'];

queueRouter.get('/queue', async (req, res, next) => {
  try {
    const module = req.query.module ?? 'risk';
    if (!MODULES.includes(module)) {
      return res.status(400).json({ error: `module must be one of ${MODULES.join(', ')}` });
    }
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
      count: data.length,
      cases: data.map((c) => ({
        ...c,
        // Only the summary fields the list needs; the full verdict comes from
        // the case detail endpoint.
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

    const summary = MODULES.map((m) => {
      const rows = data.filter((r) => r.module === m);
      return {
        module: m,
        open: rows.filter((r) => r.status === 'open').length,
        actioned: rows.filter((r) => r.status === 'actioned').length,
        scored: rows.filter((r) => r.verdict).length,
      };
    });
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

// Runs the detectors that populate the queue. Day 1: risk only.
queueRouter.post('/detect/risk', async (_req, res, next) => {
  try {
    const result = await detectRiskCases();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
