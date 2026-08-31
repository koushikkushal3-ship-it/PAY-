import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { listCases, getCase, recordAction } from '../services/queue.service.js';

const router = Router();

const listQuery = z.object({
  module: z.enum(['risk', 'recovery', 'agent_audit', 'finance']).optional(),
  status: z.enum(['open', 'actioned', 'dismissed', 'all']).optional(),
});

router.get('/queue', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    res.json(await listCases(req.query));
  } catch (err) { next(err); }
});

router.get('/cases/:id', async (req, res, next) => {
  try {
    res.json(await getCase(req.params.id));
  } catch (err) { next(err); }
});

const actionBody = z.object({
  action: z.enum([
    'release', 'escalate', 'request_documents',   // risk
    'approve_recovery', 'dismiss',                // recovery
    'flag_agent',                                 // agent audit
    'acknowledge', 'correct',                     // finance
  ]),
  note: z.string().max(1000).optional(),
});

router.post('/cases/:id/action', validate(actionBody), async (req, res, next) => {
  try {
    res.json(await recordAction({
      caseId: req.params.id,
      action: req.body.action,
      note: req.body.note,
      actor: req.analyst.email,
    }));
  } catch (err) { next(err); }
});

export default router;
