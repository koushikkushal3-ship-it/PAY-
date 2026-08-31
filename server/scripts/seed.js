import 'dotenv/config';
import { db } from '../src/lib/supabase.js';

/**
 * Synthetic data generator.
 *
 * The evaluation is only worth something if the cases are genuinely hard. Two
 * rules shape everything below:
 *
 *  1. Volume spike alone must NOT separate the classes. Plenty of the
 *     false_positive merchants have large spikes (a seasonal category, a
 *     marketing push); plenty of genuine_risk ones look moderate on volume but
 *     carry a bad chargeback ratio. That's what makes the naive
 *     volume-threshold baseline mediocre, and what the model has to actually
 *     reason past.
 *  2. Every case is drawn from a named profile below, so a failure is
 *     diagnosable — "it misses card-testing cases" beats "accuracy 0.71".
 *
 * Deterministic RNG so a re-seed reproduces the same dataset and the metrics
 * are comparable run to run.
 */

let seed = 20260831;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (lo, hi) => lo + rnd() * (hi - lo);
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

const CATEGORIES = [
  { category: 'apparel',      mcc: '5651', seasonal: true },
  { category: 'electronics',  mcc: '5732', seasonal: false },
  { category: 'grocery',      mcc: '5411', seasonal: false },
  { category: 'travel',       mcc: '4722', seasonal: true },
  { category: 'saas',         mcc: '7372', seasonal: false },
  { category: 'edtech',       mcc: '8299', seasonal: true },
  { category: 'jewellery',    mcc: '5944', seasonal: true },
  { category: 'food_delivery',mcc: '5812', seasonal: false },
];

const NAMES = [
  'Kadam Textiles', 'Nimbus Electronics', 'Saffron Grocers', 'Voyager Trips',
  'Beacon Analytics', 'Vidya Learning', 'Meera Jewels', 'Tiffin Box',
  'Anand Traders', 'Coastal Cotton', 'PixelForge Labs', 'GreenLeaf Organics',
  'Skyline Holidays', 'CloudLedger', 'ScholarPath', 'Rasa Foods',
  'Urban Threads', 'Volt Devices', 'DailyBasket', 'Wanderly',
  'StackMetrics', 'EduNova', 'Aurum Designs', 'SpiceRoute Kitchen',
  'Bharat Weaves', 'CircuitCity IN', 'FarmFresh Direct', 'TripKarma',
  'DataMint', 'LearnLoop', 'Zarina Gold', 'CurryClub',
  'Mango Apparel', 'Nova Gadgets', 'PantryPro', 'HimalayaTours',
  'MetricBase', 'SkillBridge', 'Ratna Jewellers', 'ThaliExpress',
];

/**
 * Case profiles. `label` is the ground truth the evaluator scores against —
 * it is never shown to the model.
 */
const PROFILES = {
  // ---- false positives: the flag fired, but the business is fine -----------
  seasonal_spike: {
    label: 'false_positive',
    trigger: 'volume_spike',
    build: () => ({
      accountAge: intBetween(500, 1600),
      kyc: 'verified',
      docs: between(0.9, 1.0),
      spike: between(3.2, 6.5),          // big spike — the naive rule flags this
      chargebackRatio: between(0.001, 0.006),
      declineRate: between(0.02, 0.06),
      note: 'festive season',
    }),
  },
  growth_ramp: {
    label: 'false_positive',
    trigger: 'volume_spike',
    build: () => ({
      accountAge: intBetween(180, 420),
      kyc: 'verified',
      docs: between(0.85, 1.0),
      spike: between(2.4, 4.0),
      chargebackRatio: between(0.002, 0.008),
      declineRate: between(0.03, 0.07),
      note: 'sustained month-on-month growth',
    }),
  },
  paperwork_gap: {
    label: 'false_positive',
    trigger: 'doc_gap',
    build: () => ({
      accountAge: intBetween(300, 1200),
      kyc: 'pending',
      docs: between(0.35, 0.6),          // the gap is admin, not fraud
      spike: between(0.9, 1.4),
      chargebackRatio: between(0.001, 0.005),
      declineRate: between(0.02, 0.05),
      note: 'GST certificate expired, trading normally',
    }),
  },
  cross_border_noise: {
    label: 'false_positive',
    trigger: 'velocity',
    build: () => ({
      accountAge: intBetween(400, 1400),
      kyc: 'verified',
      docs: between(0.8, 1.0),
      spike: between(1.3, 2.2),
      chargebackRatio: between(0.003, 0.009),
      declineRate: between(0.14, 0.22),  // high declines, but it's issuer noise
      crossBorderHeavy: true,
      note: 'international customer base, issuer-side declines',
    }),
  },

  // ---- genuine risk -------------------------------------------------------
  new_account_burst: {
    label: 'genuine_risk',
    trigger: 'volume_spike',
    build: () => ({
      accountAge: intBetween(6, 45),     // brand new, immediately at scale
      kyc: 'incomplete',
      docs: between(0.2, 0.5),
      spike: between(4.0, 12.0),
      chargebackRatio: between(0.02, 0.05),
      declineRate: between(0.12, 0.25),
      note: 'high volume within weeks of onboarding',
    }),
  },
  chargeback_bleed: {
    label: 'genuine_risk',
    trigger: 'chargeback_ratio',
    build: () => ({
      accountAge: intBetween(120, 700),
      kyc: 'verified',
      docs: between(0.6, 0.95),
      spike: between(1.0, 1.8),          // modest volume — naive rule MISSES this
      chargebackRatio: between(0.025, 0.06),
      declineRate: between(0.08, 0.15),
      note: 'chargeback ratio above card-network monitoring threshold',
    }),
  },
  card_testing: {
    label: 'genuine_risk',
    trigger: 'velocity',
    build: () => ({
      accountAge: intBetween(20, 200),
      kyc: 'pending',
      docs: between(0.3, 0.7),
      spike: between(1.1, 2.0),          // low value, high count — also missed
      chargebackRatio: between(0.015, 0.04),
      declineRate: between(0.45, 0.7),   // the tell: most attempts fail
      cardTesting: true,
      note: 'high-frequency low-value attempts, majority declined',
    }),
  },
  layered_risk: {
    label: 'genuine_risk',
    trigger: 'volume_spike',
    build: () => ({
      accountAge: intBetween(60, 300),
      kyc: 'incomplete',
      docs: between(0.25, 0.55),
      spike: between(3.5, 8.0),
      chargebackRatio: between(0.018, 0.045),
      declineRate: between(0.18, 0.3),
      note: 'spike, thin documentation and rising disputes together',
    }),
  },
};

const PROFILE_PLAN = [
  ...Array(7).fill('seasonal_spike'),
  ...Array(6).fill('growth_ramp'),
  ...Array(6).fill('paperwork_gap'),
  ...Array(5).fill('cross_border_noise'),
  ...Array(6).fill('new_account_burst'),
  ...Array(7).fill('chargeback_bleed'),
  ...Array(6).fill('card_testing'),
  ...Array(5).fill('layered_risk'),
]; // 48 flagged merchants

async function wipe() {
  // Child tables first — FKs cascade, but being explicit keeps re-seeds clean.
  for (const t of [
    'recovery_attempts', 'case_actions', 'audit_log', 'review_queue',
    'agent_quotes', 'agent_sessions', 'invoices', 'settlements',
    'transactions', 'merchant_flags', 'merchants',
  ]) {
    await db.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }
}

async function main() {
  console.log('Wiping existing rows…');
  await wipe();

  const merchants = [];
  const flags = [];
  const transactions = [];
  const settlements = [];
  const invoices = [];

  // Shuffle so holdout selection isn't correlated with profile order.
  const plan = [...PROFILE_PLAN].sort(() => rnd() - 0.5);

  plan.forEach((profileName, i) => {
    const profile = PROFILES[profileName];
    const p = profile.build();
    const cat = pick(CATEGORIES);
    const merchantId = crypto.randomUUID();
    const baseline = Math.round(between(150000, 2500000));

    merchants.push({
      id: merchantId,
      name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ' II' : ''}`,
      mcc: cat.mcc,
      category: cat.category,
      onboarded_at: daysAgo(p.accountAge),
      account_age_days: p.accountAge,
      kyc_status: p.kyc,
      doc_completeness: Number(p.docs.toFixed(2)),
      baseline_monthly_volume: baseline,
    });

    // Last 20% of the set is held out for evaluation and never queued.
    const isHoldout = i >= Math.floor(plan.length * 0.6);

    flags.push({
      id: crypto.randomUUID(),
      merchant_id: merchantId,
      flag_type: pick(['freeze', 'reserve_hold', 'review']),
      trigger: profile.trigger,
      triggered_at: daysAgo(intBetween(1, 14)),
      signal: {
        chargeback_ratio_90d: Number(p.chargebackRatio.toFixed(4)),
        spike_multiple_observed: Number(p.spike.toFixed(2)),
        automated_note: p.note,
        profile: profileName, // diagnostic only — stripped before prompting
      },
      ground_truth: profile.label,
      is_holdout: isHoldout,
    });

    // Transactions consistent with the profile, so computeStats() produces
    // numbers that actually agree with the signal the flag carries.
    const txnCount = p.cardTesting ? intBetween(180, 320) : intBetween(40, 120);
    const targetVolume = baseline * p.spike;
    const avgTicket = p.cardTesting ? between(20, 90) : targetVolume / (txnCount * (1 - p.declineRate));

    for (let t = 0; t < txnCount; t++) {
      const declined = rnd() < p.declineRate;
      transactions.push({
        merchant_id: merchantId,
        amount: Number(Math.max(10, avgTicket * between(0.5, 1.6)).toFixed(2)),
        currency: 'INR',
        is_cross_border: p.crossBorderHeavy ? rnd() < 0.7 : rnd() < 0.15,
        method: pick(['card', 'upi', 'netbanking', 'wallet']),
        status: declined ? (rnd() < 0.45 ? 'borderline' : 'declined') : 'captured',
        decline_reason: declined
          ? pick(['issuer_declined', 'risk_threshold', 'insufficient_funds', 'do_not_honour'])
          : null,
        risk_score: Number(between(0.05, 0.95).toFixed(3)),
        created_at: daysAgo(intBetween(1, 60)),
      });
    }

    // Settlements — some with reserve held, for the Finance module.
    for (let s = 0; s < intBetween(3, 8); s++) {
      const gross = Number(between(40000, 900000).toFixed(2));
      const onHold = rnd() < 0.35;
      settlements.push({
        merchant_id: merchantId,
        gross_amount: gross,
        fees: Number((gross * 0.02).toFixed(2)),
        reserve_held: onHold ? Number((gross * between(0.05, 0.2)).toFixed(2)) : 0,
        reserve_release_due: onHold
          ? new Date(Date.now() + intBetween(5, 90) * 864e5).toISOString().slice(0, 10)
          : null,
        settled_at: onHold ? null : daysAgo(intBetween(1, 45)),
        status: onHold ? 'on_hold' : 'settled',
      });
    }

    // B2B invoices — a mix of paid, unpaid and overdue, plus deliberate
    // GST-bucket errors for the Finance module to catch.
    const GST_BY_CATEGORY = {
      apparel: 5, electronics: 18, grocery: 5, travel: 5,
      saas: 18, edtech: 18, jewellery: 3, food_delivery: 5,
    };
    for (let v = 0; v < intBetween(2, 5); v++) {
      const correct = GST_BY_CATEGORY[cat.category] ?? 18;
      const wrong = rnd() < 0.25;
      const dueDays = intBetween(-45, 30);
      invoices.push({
        merchant_id: merchantId,
        buyer: `${pick(['Orbit', 'Kestrel', 'Lumen', 'Prakash', 'Vertex', 'Sable'])} ${pick(['Industries', 'Pvt Ltd', 'Retail', 'Systems'])}`,
        amount: Number(between(25000, 600000).toFixed(2)),
        gst_rate_applied: wrong ? pick([0, 5, 12, 18, 28].filter((r) => r !== correct)) : correct,
        hsn_code: String(intBetween(1000, 9999)),
        item_category: cat.category,
        due_date: new Date(Date.now() - dueDays * 864e5).toISOString().slice(0, 10),
        paid_at: dueDays < 0 || rnd() < 0.5 ? daysAgo(intBetween(1, 30)) : null,
        status: dueDays > 21 ? 'overdue' : dueDays > 0 ? 'unpaid' : 'paid',
      });
    }
  });

  // Agent sessions and quotes for the Agentic Commerce module. Most SKUs are
  // priced consistently; a few carry a deliberate unexplained spread, and a few
  // carry a large spread that a recorded discount rule fully explains — the
  // fairness checker has to tell those two apart.
  const SKUS = ['SKU-AURA-100', 'SKU-BOLT-220', 'SKU-CEDR-340', 'SKU-DUNE-410', 'SKU-ECHO-505', 'SKU-FLUX-610'];
  const UNFAIR = new Set(['SKU-BOLT-220', 'SKU-ECHO-505']);
  const DISCOUNTED = new Set(['SKU-CEDR-340']);
  const sessions = [];
  const quotes = [];

  for (let s = 0; s < 40; s++) {
    const sessionId = crypto.randomUUID();
    sessions.push({
      id: sessionId,
      agent_id: pick(['agent-alpha', 'agent-bravo', 'agent-charlie']),
      buyer_ref: `buyer-${intBetween(1000, 9999)}`,
      started_at: daysAgo(intBetween(1, 21)),
    });

    for (const sku of SKUS) {
      if (rnd() > 0.55) continue;
      const list = 1000 + SKUS.indexOf(sku) * 350;
      let quoted = list;
      let rule = null;

      if (UNFAIR.has(sku)) {
        quoted = list * between(0.82, 1.24);       // unexplained spread
      } else if (DISCOUNTED.has(sku) && rnd() < 0.5) {
        quoted = list * 0.85;                       // explained spread
        rule = 'BULK10_LOYALTY_TIER2';
      } else {
        quoted = list * between(0.99, 1.01);        // consistent
      }

      quotes.push({
        session_id: sessionId,
        sku,
        quoted_price: Number(quoted.toFixed(2)),
        list_price: list,
        discount_rule: rule,
        quoted_at: daysAgo(intBetween(1, 21)),
      });
    }
  }

  const insert = async (table, rows) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).insert(rows.slice(i, i + 500));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    console.log(`  ${table.padEnd(18)} ${rows.length}`);
  };

  console.log('Inserting…');
  await insert('merchants', merchants);
  await insert('merchant_flags', flags);
  await insert('transactions', transactions);
  await insert('settlements', settlements);
  await insert('invoices', invoices);
  await insert('agent_sessions', sessions);
  await insert('agent_quotes', quotes);

  const holdout = flags.filter((f) => f.is_holdout);
  console.log(`
Flags: ${flags.length} total — ${flags.length - holdout.length} workable, ${holdout.length} held out for evaluation.
Class balance (holdout): ${holdout.filter((f) => f.ground_truth === 'genuine_risk').length} genuine_risk / ${holdout.filter((f) => f.ground_truth === 'false_positive').length} false_positive
Done.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
