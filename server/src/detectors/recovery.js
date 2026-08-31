import { db } from '../lib/db.js';
import { recoveryVerdictSchema } from '../reasoner/schemas.js';
import {
  RECOVERY_SYSTEM_PROMPT,
  buildRecoveryCaseInput,
} from '../reasoner/promptsModules.js';

/**
 * Two leak types feed one queue:
 *  - transactions declined at the risk threshold (the false-decline problem)
 *  - B2B invoices past their due date
 */
export async function detect() {
  const [{ data: txns, error: tErr }, { data: invoices, error: iErr }] = await Promise.all([
    db.from('transactions')
      .select('id, merchant_id, amount, status, decline_reason, risk_score')
      .in('status', ['declined', 'borderline']),
    db.from('invoices')
      .select('id, merchant_id, buyer, amount, due_date, status')
      .eq('status', 'overdue'),
  ]);
  if (tErr) throw new Error(tErr.message);
  if (iErr) throw new Error(iErr.message);

  // Only declines that look like a risk-threshold call are worth an analyst's
  // time. An issuer decline is the bank's decision, not something to recover.
  const recoverable = txns.filter(
    (t) => t.decline_reason !== 'issuer_declined' && Number(t.risk_score) < 0.75
  );

  const existing = await existingEntityIds('recovery');
  const merchants = await merchantNames([
    ...recoverable.map((t) => t.merchant_id),
    ...invoices.map((i) => i.merchant_id),
  ]);

  const rows = [
    ...recoverable
      .filter((t) => !existing.has(t.id))
      .map((t) => ({
        module: 'recovery',
        entity_type: 'transaction',
        entity_id: t.id,
        title: `${merchants.get(t.merchant_id) ?? 'Unknown'} — declined payment (${t.decline_reason})`,
        priority_score: Math.round(Number(t.amount) / 1000),
        status: 'open',
      })),
    ...invoices
      .filter((i) => !existing.has(i.id))
      .map((i) => ({
        module: 'recovery',
        entity_type: 'invoice',
        entity_id: i.id,
        title: `${merchants.get(i.merchant_id) ?? 'Unknown'} — unpaid invoice from ${i.buyer}`,
        priority_score: Math.round(Number(i.amount) / 1000),
        status: 'open',
      })),
  ];

  if (!rows.length) return { created: 0 };
  const { error } = await db.from('review_queue').insert(rows);
  if (error) throw new Error(`review_queue insert failed: ${error.message}`);
  return { created: rows.length };
}

export async function loadContext(caseRow) {
  const isTxn = caseRow.entity_type === 'transaction';
  const table = isTxn ? 'transactions' : 'invoices';

  const { data: entity, error } = await db
    .from(table).select('*').eq('id', caseRow.entity_id).single();
  if (error) throw new Error(error.message);

  const { data: merchant, error: mErr } = await db
    .from('merchants').select('*').eq('id', entity.merchant_id).single();
  if (mErr) throw new Error(mErr.message);

  // Attempts already made against this entity — the stop rule depends on it.
  const { data: attempts } = await db
    .from('recovery_attempts').select('*').eq('entity_id', caseRow.entity_id);

  const history = { attempts: attempts?.length ?? 0 };

  if (!isTxn) {
    const { data: buyerInvoices } = await db
      .from('invoices').select('status').eq('buyer', entity.buyer);
    history.buyerTotal = buyerInvoices?.length ?? 0;
    history.buyerPaid = buyerInvoices?.filter((i) => i.status === 'paid').length ?? 0;
  }

  return {
    input: buildRecoveryCaseInput({
      kind: isTxn ? 'transaction' : 'invoice',
      merchant,
      transaction: isTxn ? entity : undefined,
      invoice: isTxn ? undefined : entity,
      history,
    }),
    panels: { merchant, entity, attempts: attempts ?? [] },
  };
}

async function existingEntityIds(module) {
  const { data } = await db.from('review_queue').select('entity_id').eq('module', module);
  return new Set((data ?? []).map((r) => r.entity_id));
}

async function merchantNames(ids) {
  const { data } = await db.from('merchants').select('id, name').in('id', [...new Set(ids)]);
  return new Map((data ?? []).map((m) => [m.id, m.name]));
}

export default {
  key: 'recovery',
  label: 'Revenue recovery',
  system: RECOVERY_SYSTEM_PROMPT,
  schema: recoveryVerdictSchema,
  detect,
  loadContext,
};
