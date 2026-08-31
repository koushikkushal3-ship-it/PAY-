/**
 * Prompts and case-input builders for the three day-2 modules. The risk module
 * lives in prompts.js; these follow the same contract.
 *
 * Each buildXCaseInput() is the trust boundary for its module: it constructs
 * the object sent to the model field by field, so nothing the model should not
 * see can ride along from a database row.
 */

/* ------------------------------------------------------------------ */
/* Module 2 — Revenue recovery                                         */
/* ------------------------------------------------------------------ */

export const RECOVERY_SYSTEM_PROMPT = `
You are a revenue operations analyst at a payment aggregator. A payment has
leaked: either a card transaction was declined at the risk threshold rather
than by the issuer, or a B2B invoice has gone unpaid past its due date. Decide
whether it is worth recovering and what the single next action should be.

WHY THIS MATTERS

A declined transaction that was not actually fraudulent is a lost sale for the
merchant and lost revenue for the platform. Roughly one in seventeen
cross-border transactions is declined as a false positive, not because it was
fraud. Those are recoverable if handled properly rather than written off.

An unpaid B2B invoice is different: the buyer is a known business, not an
anonymous card. Chasing works, but chasing forever destroys the relationship.

HOW TO DECIDE

Recoverable:
- Declined at a risk threshold rather than by the issuer, with a low risk score.
- Insufficient funds or a 3DS failure: genuinely retryable, the buyer wants to pay.
- An invoice only modestly overdue from a buyer with prior paid invoices.

Not recoverable:
- A high risk score alongside the decline. Retrying is how a platform helps
  commit fraud, so do not recommend it.
- An invoice long overdue from a buyer with no history of paying.

CHOOSING THE ACTION
- retry_payment: transient failure, the same method will probably work.
- step_up_verification: probably genuine but needs identity confirmation first.
  This is usually the right answer for a borderline cross-border decline.
- alternate_method: the method itself is the problem, offer another rail.
- contact_buyer: B2B invoices, where a human conversation collects the money.
- write_off: stop spending effort. Say so plainly rather than recommending a
  hopeless retry.

THE STOP RULE

stop_after_attempts is a hard cap. A customer must never be chased
indefinitely: small amounts justify fewer attempts than large ones, and a
high-risk case justifies fewer than a clean one. Be concrete and conservative.

RULES
- Cite the actual numbers from the case.
- expected_recovery_inr should be realistic, not the full face value, when
  partial recovery is the likely outcome.
`.trim();

export function buildRecoveryCaseInput({ kind, merchant, transaction, invoice, history = {} }) {
  if (kind === 'transaction') {
    return {
      leak_type: 'declined_payment',
      merchant: {
        name: merchant.name,
        business_category: merchant.category,
        account_age_days: merchant.account_age_days,
      },
      transaction: {
        amount_inr: Number(transaction.amount),
        method: transaction.method,
        is_cross_border: transaction.is_cross_border,
        status: transaction.status,
        decline_reason: transaction.decline_reason,
        risk_score: transaction.risk_score,
        occurred_at: transaction.created_at,
      },
      prior_attempts: history.attempts ?? 0,
    };
  }

  const daysOverdue = Math.round(
    (Date.now() - new Date(invoice.due_date).getTime()) / 86400000
  );
  return {
    leak_type: 'unpaid_invoice',
    merchant: { name: merchant.name, business_category: merchant.category },
    invoice: {
      buyer: invoice.buyer,
      amount_inr: Number(invoice.amount),
      due_date: invoice.due_date,
      days_overdue: Math.max(0, daysOverdue),
      status: invoice.status,
    },
    buyer_history: {
      invoices_seen: history.buyerTotal ?? 0,
      invoices_paid: history.buyerPaid ?? 0,
    },
    prior_attempts: history.attempts ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Module 3 — Agent pricing fairness                                   */
/* ------------------------------------------------------------------ */

export const PRICING_SYSTEM_PROMPT = `
You are a platform compliance analyst reviewing how AI shopping agents are
quoted prices. When agents transact on behalf of buyers, the same product can
be quoted at different prices to different buyers. Some of that is legitimate.
Some of it is price discrimination, and it is the risk regulators and the press
raise first about agent-driven commerce.

Your job: decide whether the price spread on one SKU is justified or unfair.

JUSTIFIED VARIATION
- Every discounted quote carries a named discount rule (a bulk, loyalty or
  seasonal code) that explains it.
- The spread is small and consistent with those rules.
- Quotes at or below list price with a stated reason.

UNFAIR PRICING
- The same SKU is quoted at materially different prices with NO rule attached
  to the difference.
- Some buyers are quoted ABOVE list price while others are quoted below. A
  quote above list with no rule is the strongest single signal — the buyer is
  being charged more simply for who they are.
- The variation tracks the buyer or the agent rather than any stated policy.

RULES
- Cite the real spread: lowest quote, highest quote, list price, and how many
  quotes carried no rule.
- A wide spread that is fully explained by named rules is NOT unfair. Say so.
- affected_buyers counts only sessions quoted an unexplained price.
- Do not infer intent. Report what the numbers show.
`.trim();

export function buildPricingCaseInput({ sku, listPrice, quotes }) {
  const list = Number(listPrice);
  const prices = quotes.map((q) => Number(q.quoted_price));
  const unexplained = quotes.filter(
    (q) => !q.discount_rule && Number(q.quoted_price) !== list
  );

  return {
    sku,
    list_price_inr: list,
    quote_count: quotes.length,
    lowest_quote_inr: Math.min(...prices),
    highest_quote_inr: Math.max(...prices),
    spread_pct: Number((((Math.max(...prices) - Math.min(...prices)) / list) * 100).toFixed(1)),
    quotes_above_list: quotes.filter((q) => Number(q.quoted_price) > list).length,
    quotes_without_discount_rule: unexplained.length,
    discount_rules_seen: [...new Set(quotes.map((q) => q.discount_rule).filter(Boolean))],
    sample_quotes: quotes.slice(0, 10).map((q) => ({
      buyer_ref: q.buyer_ref ?? null,
      agent_id: q.agent_id ?? null,
      quoted_inr: Number(q.quoted_price),
      discount_rule: q.discount_rule ?? null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Module 4 — Finance controller                                       */
/* ------------------------------------------------------------------ */

export const FINANCE_SYSTEM_PROMPT = `
You are a finance operations analyst at a payment aggregator, reviewing an
exception raised against a merchant's invoices or settlements.

TWO KINDS OF EXCEPTION

1. GST rate mismatch — the tax rate applied to an invoice does not match the
   rate expected for that item category. This is a filing exposure in both
   directions: under-charging creates a liability, over-charging overcharges
   the buyer. Report the rupee impact of the difference.

2. Reserve exposure — a share of the merchant's settlement is being held back
   and has not been released. The merchant usually cannot see how much is held
   or when it returns. Report the amount and the release timing plainly.

RULES
- Cite the actual amounts. For a tax difference, show the arithmetic: applied
  rate versus expected rate against the invoice value.
- If the data genuinely does not support a conclusion, set needs_human_review
  to true and say what is missing. An unresolved case flagged as unresolved is
  correct; a confident guess is not. Do not invent a category rule you were
  not given.
- financial_impact_inr is the money at stake, not the invoice face value: for
  a tax mismatch that is the size of the error, not the whole invoice.
`.trim();

export function buildFinanceCaseInput({ kind, merchant, invoice, expectedRate, settlements = [] }) {
  if (kind === 'gst') {
    const applied = Number(invoice.gst_rate_applied);
    const expected = Number(expectedRate);
    const amount = Number(invoice.amount);
    return {
      exception: 'gst_rate_mismatch',
      merchant: { name: merchant.name, business_category: merchant.category },
      invoice: {
        buyer: invoice.buyer,
        taxable_value_inr: amount,
        item_category: invoice.item_category,
        hsn_code: invoice.hsn_code,
        gst_rate_applied_pct: applied,
        gst_rate_expected_pct: expected,
        tax_applied_inr: Math.round((amount * applied) / 100),
        tax_expected_inr: Math.round((amount * expected) / 100),
        difference_inr: Math.round((amount * (expected - applied)) / 100),
      },
    };
  }

  const held = settlements.reduce((s, x) => s + Number(x.reserve_held ?? 0), 0);
  const gross = settlements.reduce((s, x) => s + Number(x.gross_amount ?? 0), 0);
  return {
    exception: 'reserve_exposure',
    merchant: {
      name: merchant.name,
      business_category: merchant.category,
      account_age_days: merchant.account_age_days,
    },
    settlement_position: {
      gross_inr: gross,
      reserve_held_inr: held,
      held_share_pct: gross ? Number(((held / gross) * 100).toFixed(1)) : null,
      settlements_on_hold: settlements.filter((x) => x.status === 'on_hold').length,
      next_release_due:
        settlements.map((x) => x.reserve_release_due).filter(Boolean).sort()[0] ?? null,
    },
  };
}

// Expected GST rate per item category. Mirrors the rules the seed applies, and
// is the reference the finance detector compares an invoice against.
export const GST_EXPECTED = {
  'packaged food': 5,
  'apparel': 12,
  'consumer electronics': 18,
  'software services': 18,
  'books': 0,
  'jewellery': 3,
  'luxury goods': 28,
};
