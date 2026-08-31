import { db } from '../lib/db.js';
import { financeVerdictSchema } from '../reasoner/schemas.js';
import {
  FINANCE_SYSTEM_PROMPT,
  buildFinanceCaseInput,
  GST_EXPECTED,
} from '../reasoner/promptsModules.js';

// Only surface a reserve position once it is a material share of settlement.
// Every merchant has some reserve; that alone is not an exception.
const RESERVE_SHARE_THRESHOLD = 0.4;

/**
 * Two exception types:
 *  - invoices whose applied GST rate does not match the category's expected rate
 *  - merchants with an outsized share of settlement held in reserve
 */
export async function detect() {
  const [{ data: invoices, error: iErr }, { data: settlements, error: sErr }] =
    await Promise.all([
      db.from('invoices').select('id, merchant_id, amount, gst_rate_applied, item_category'),
      db.from('settlements').select('id, merchant_id, gross_amount, reserve_held, status'),
    ]);
  if (iErr) throw new Error(iErr.message);
  if (sErr) throw new Error(sErr.message);

  const existing = await existingEntityIds('finance');
  const merchants = await merchantNames([
    ...invoices.map((i) => i.merchant_id),
    ...settlements.map((s) => s.merchant_id),
  ]);
  const rows = [];

  // --- GST rate mismatches ---
  for (const inv of invoices) {
    const expected = GST_EXPECTED[inv.item_category];
    // An unknown category is not a mismatch — we have no rule to compare to.
    if (expected === undefined) continue;
    if (Number(inv.gst_rate_applied) === expected) continue;
    if (existing.has(inv.id)) continue;

    const impact = Math.abs(
      (Number(inv.amount) * (expected - Number(inv.gst_rate_applied))) / 100
    );
    rows.push({
      module: 'finance',
      entity_type: 'invoice',
      entity_id: inv.id,
      title: `${merchants.get(inv.merchant_id) ?? 'Unknown'} — GST ${inv.gst_rate_applied}% applied, ${expected}% expected (${inv.item_category})`,
      priority_score: Math.round(impact / 1000),
      status: 'open',
    });
  }

  // --- Reserve exposure, aggregated per merchant ---
  const byMerchant = new Map();
  for (const s of settlements) {
    const agg = byMerchant.get(s.merchant_id) ?? { gross: 0, held: 0, anchor: s.id };
    agg.gross += Number(s.gross_amount ?? 0);
    agg.held += Number(s.reserve_held ?? 0);
    byMerchant.set(s.merchant_id, agg);
  }

  for (const [merchantId, agg] of byMerchant) {
    if (!agg.gross || agg.held / agg.gross < RESERVE_SHARE_THRESHOLD) continue;
    if (existing.has(agg.anchor)) continue;

    rows.push({
      module: 'finance',
      entity_type: 'settlement',
      entity_id: agg.anchor,
      title: `${merchants.get(merchantId) ?? 'Unknown'} — ${Math.round((agg.held / agg.gross) * 100)}% of settlement held in reserve`,
      priority_score: Math.round(agg.held / 1000),
      status: 'open',
    });
  }

  if (!rows.length) return { created: 0 };
  const { error } = await db.from('review_queue').insert(rows);
  if (error) throw new Error(`review_queue insert failed: ${error.message}`);
  return { created: rows.length };
}

export async function loadContext(caseRow) {
  if (caseRow.entity_type === 'invoice') {
    const { data: invoice, error } = await db
      .from('invoices').select('*').eq('id', caseRow.entity_id).single();
    if (error) throw new Error(error.message);

    const { data: merchant } = await db
      .from('merchants').select('*').eq('id', invoice.merchant_id).single();

    return {
      input: buildFinanceCaseInput({
        kind: 'gst',
        merchant,
        invoice,
        expectedRate: GST_EXPECTED[invoice.item_category],
      }),
      panels: { merchant, invoice },
    };
  }

  const { data: anchor, error } = await db
    .from('settlements').select('*').eq('id', caseRow.entity_id).single();
  if (error) throw new Error(error.message);

  const [{ data: merchant }, { data: settlements }] = await Promise.all([
    db.from('merchants').select('*').eq('id', anchor.merchant_id).single(),
    db.from('settlements').select('*').eq('merchant_id', anchor.merchant_id),
  ]);

  return {
    input: buildFinanceCaseInput({ kind: 'reserve', merchant, settlements: settlements ?? [] }),
    panels: { merchant, settlements: settlements ?? [] },
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
  key: 'finance',
  label: 'Finance exceptions',
  system: FINANCE_SYSTEM_PROMPT,
  schema: financeVerdictSchema,
  detect,
  loadContext,
};
