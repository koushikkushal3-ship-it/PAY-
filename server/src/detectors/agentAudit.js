import { db } from '../lib/db.js';
import { pricingVerdictSchema } from '../reasoner/schemas.js';
import {
  PRICING_SYSTEM_PROMPT,
  buildPricingCaseInput,
} from '../reasoner/promptsModules.js';

// A SKU is worth a compliance look when quotes diverge by more than this share
// of list price. Below it, ordinary rounding and small rules explain the noise.
const SPREAD_THRESHOLD_PCT = 8;

/**
 * Group agent quotes by SKU and raise a case for each SKU whose price spread
 * is wide enough to need explaining. The detector only measures the spread —
 * whether it is justified is the reasoner's call, since that depends on
 * whether a named discount rule accounts for it.
 *
 * The case is keyed on the SKU's first quote id, because review_queue.entity_id
 * is a uuid and a SKU string has no id of its own.
 */
export async function detect() {
  const quotes = await allQuotes();
  const bySku = new Map();
  for (const q of quotes) {
    if (!bySku.has(q.sku)) bySku.set(q.sku, []);
    bySku.get(q.sku).push(q);
  }

  const existing = await existingEntityIds('agent_audit');
  const rows = [];

  for (const [sku, group] of bySku) {
    if (group.length < 3) continue; // too few quotes to say anything

    const list = Number(group[0].list_price);
    const prices = group.map((q) => Number(q.quoted_price));
    const spreadPct = ((Math.max(...prices) - Math.min(...prices)) / list) * 100;
    if (spreadPct < SPREAD_THRESHOLD_PCT) continue;

    const anchor = group[0].id;
    if (existing.has(anchor)) continue;

    const unexplained = group.filter(
      (q) => !q.discount_rule && Number(q.quoted_price) !== list
    ).length;

    rows.push({
      module: 'agent_audit',
      entity_type: 'sku',
      entity_id: anchor,
      title: `${sku} — ${spreadPct.toFixed(0)}% price spread across ${group.length} agent quotes`,
      // Rank by how much of the spread is unexplained, not by spread alone.
      priority_score: Math.round(spreadPct * (1 + unexplained)),
      status: 'open',
    });
  }

  if (!rows.length) return { created: 0 };
  const { error } = await db.from('review_queue').insert(rows);
  if (error) throw new Error(`review_queue insert failed: ${error.message}`);
  return { created: rows.length };
}

export async function loadContext(caseRow) {
  const quotes = await allQuotes();
  const anchor = quotes.find((q) => q.id === caseRow.entity_id);
  if (!anchor) throw new Error('quote for this case no longer exists');

  const group = quotes.filter((q) => q.sku === anchor.sku);

  return {
    input: buildPricingCaseInput({
      sku: anchor.sku,
      listPrice: anchor.list_price,
      quotes: group,
    }),
    panels: { sku: anchor.sku, quotes: group },
  };
}

/** Quotes joined to their session, so buyer and agent travel with the price. */
async function allQuotes() {
  const { data, error } = await db
    .from('agent_quotes')
    .select('id, sku, quoted_price, list_price, discount_rule, quoted_at, session_id, agent_sessions(agent_id, buyer_ref)');
  if (error) throw new Error(`agent_quotes read failed: ${error.message}`);
  return (data ?? []).map((q) => ({
    ...q,
    agent_id: q.agent_sessions?.agent_id ?? null,
    buyer_ref: q.agent_sessions?.buyer_ref ?? null,
  }));
}

async function existingEntityIds(module) {
  const { data } = await db.from('review_queue').select('entity_id').eq('module', module);
  return new Set((data ?? []).map((r) => r.entity_id));
}

export default {
  key: 'agent_audit',
  label: 'Agent pricing audit',
  system: PRICING_SYSTEM_PROMPT,
  schema: pricingVerdictSchema,
  detect,
  loadContext,
};
