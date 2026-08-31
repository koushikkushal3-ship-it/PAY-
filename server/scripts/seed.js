/**
 * Synthetic dataset for the Risk module.
 *
 * Design goal: the cases must be genuinely confusable. A large volume spike
 * appears in BOTH classes, and some genuine-risk accounts spike only modestly
 * while their chargeback ratio blows out. That is deliberate — if a naive
 * "spike > 5x means freeze" rule could score well on this set, the dataset
 * would be proving nothing about the reasoner.
 *
 * Every flag carries ground_truth, and ~40% are marked is_holdout. Holdout rows
 * never enter the review queue and their labels are never sent to the model.
 */
import { randomUUID } from 'node:crypto';

// Deterministic PRNG so a re-seed produces the same set and evaluation numbers
// stay comparable between runs.
let seedState = 20260905;
function rnd() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const round = (n, d = 2) => Number(n.toFixed(d));
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const CATEGORIES = {
  electronics: { mcc: '5732', benchmark: 0.009 },
  fashion: { mcc: '5651', benchmark: 0.007 },
  travel: { mcc: '4722', benchmark: 0.014 },
  education: { mcc: '8299', benchmark: 0.004 },
  saas: { mcc: '5817', benchmark: 0.005 },
  grocery: { mcc: '5411', benchmark: 0.003 },
  gaming: { mcc: '7994', benchmark: 0.018 },
  jewellery: { mcc: '5944', benchmark: 0.011 },
};

// Expected GST rate per item category. The finance detector flags invoices
// where the applied rate does not match, which is a real filing exposure.
const GST_RULES = {
  'packaged food': { rate: 5, hsn: '2106' },
  'apparel': { rate: 12, hsn: '6109' },
  'consumer electronics': { rate: 18, hsn: '8517' },
  'software services': { rate: 18, hsn: '9983' },
  'books': { rate: 0, hsn: '4901' },
  'jewellery': { rate: 3, hsn: '7113' },
  'luxury goods': { rate: 28, hsn: '7117' },
};

const BUYERS = [
  'Sundaram Retail Pvt Ltd', 'Orbit Logistics', 'Hexa Foods', 'Nandi Textiles',
  'Prakash Distributors', 'Lumen Interiors', 'Sagar Wholesale', 'Trident Corp',
];

// SKUs an AI shopping agent can request a price for.
const SKUS = [
  { sku: 'HDPHN-200', list: 2499 },
  { sku: 'LAPSTAND-11', list: 1299 },
  { sku: 'COFFEE-1KG', list: 899 },
  { sku: 'DESKLAMP-07', list: 1799 },
  { sku: 'BACKPACK-32L', list: 3299 },
  { sku: 'KEYBOARD-M4', list: 4599 },
];

const NAMES_LEGIT = [
  'Kavya Handlooms', 'Nirvaan Electronics', 'Bluepeak Travel', 'Studyloop Academy',
  'Trailmark SaaS', 'Ghar Grocers', 'Mithila Jewels', 'Verdant Organics',
  'Coastline Outfitters', 'Pixelforge Studios', 'Anand Book Depot', 'Sunra Solar',
  'Meridian Fitness', 'Chettinad Spices', 'Kalpataru Interiors',
];
const NAMES_RISKY = [
  'Zentrix Global Trade', 'QuickCart Deals', 'Nova Prime Retail', 'Elite Gadget Hub',
  'Sunrise Digital Ventures', 'Apex Value Store', 'Metro Bulk Traders',
  'Skyline Commerce Co', 'Prime Choice Mart', 'Vertex Online Sales',
];

/* ------------------------------------------------------------------ */
/* Archetypes                                                          */
/* ------------------------------------------------------------------ */

// ---- FALSE POSITIVES: real businesses caught by an automated rule ----

const falsePositives = [
  function festivalSpike() {
    const cat = pick(['fashion', 'jewellery', 'electronics', 'grocery']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(700, 2200)),
        kyc_status: 'verified',
        doc_completeness: 1.0,
        baseline_monthly_volume: Math.round(between(900000, 4500000)),
      },
      flag: { flag_type: 'reserve_hold', trigger: 'volume_spike' },
      signal: (m) => {
        const spike = round(between(4.5, 9.0), 1); // big spike, still legitimate
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(3.4, 6.1), 1),
          chargeback_ratio: round(bench * between(0.4, 0.85), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'flat',
          refund_rate: round(between(0.02, 0.05), 3),
          refund_rate_prior: round(between(0.02, 0.05), 3),
          new_buyer_ratio: round(between(0.45, 0.65), 2),
          top_buyer_share: round(between(0.02, 0.07), 3),
          distinct_buyers: Math.round(between(3200, 14000)),
          dispute_count_90d: Math.round(between(0, 4)),
          dormant_days: 0,
          cross_border_share: round(between(0, 0.08), 2),
          context_note:
            'Spike falls inside the Diwali retail window. Same merchant showed a comparable spike in the equivalent window last year.',
        };
      },
    };
  },

  function campaignLaunch() {
    const cat = pick(['saas', 'education', 'fashion']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(400, 1100)),
        kyc_status: 'verified',
        doc_completeness: 1.0,
        baseline_monthly_volume: Math.round(between(600000, 2600000)),
      },
      flag: { flag_type: 'review', trigger: 'volume_spike' },
      signal: (m) => {
        const spike = round(between(5.0, 11.0), 1);
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(4.0, 7.2), 1),
          chargeback_ratio: round(bench * between(0.5, 0.95), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'flat',
          refund_rate: round(between(0.03, 0.07), 3),
          refund_rate_prior: round(between(0.03, 0.06), 3),
          new_buyer_ratio: round(between(0.7, 0.85), 2), // high, but campaigns do that
          top_buyer_share: round(between(0.01, 0.04), 3),
          distinct_buyers: Math.round(between(2600, 9000)),
          dispute_count_90d: Math.round(between(0, 3)),
          dormant_days: 0,
          cross_border_share: round(between(0, 0.05), 2),
          context_note:
            'Merchant ran a paid acquisition campaign this month; traffic and volume rose together, refund rate unchanged.',
        };
      },
    };
  },

  function documentationGapOnly() {
    const cat = pick(['grocery', 'education', 'saas']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(1100, 2600)),
        kyc_status: 'pending',
        doc_completeness: round(between(0.6, 0.8), 2),
        baseline_monthly_volume: Math.round(between(500000, 2000000)),
      },
      flag: { flag_type: 'freeze', trigger: 'doc_gap' },
      signal: (m) => ({
        spike_multiple: round(between(0.9, 1.3), 2), // no spike at all
        volume_last_30d: Math.round(m.baseline_monthly_volume * between(0.9, 1.3)),
        z_score: round(between(0.1, 0.8), 1),
        chargeback_ratio: round(bench * between(0.2, 0.6), 4),
        category_benchmark: bench,
        chargeback_trend_3m: 'flat',
        refund_rate: round(between(0.01, 0.03), 3),
        refund_rate_prior: round(between(0.01, 0.03), 3),
        new_buyer_ratio: round(between(0.3, 0.5), 2),
        top_buyer_share: round(between(0.03, 0.08), 3),
        distinct_buyers: Math.round(between(1800, 6000)),
        dispute_count_90d: Math.round(between(0, 2)),
        dormant_days: 0,
        cross_border_share: 0,
        context_note:
          'GST registration certificate on file expired and has not been re-uploaded. All other documents current. No risk signal present.',
      }),
    };
  },

  function b2bBulkOrder() {
    const cat = pick(['electronics', 'grocery']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(800, 2000)),
        kyc_status: 'verified',
        doc_completeness: 1.0,
        baseline_monthly_volume: Math.round(between(1200000, 3800000)),
      },
      flag: { flag_type: 'reserve_hold', trigger: 'velocity' },
      signal: (m) => {
        const spike = round(between(3.2, 6.5), 1);
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(3.0, 5.0), 1),
          chargeback_ratio: round(bench * between(0.3, 0.7), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'flat',
          refund_rate: round(between(0.01, 0.03), 3),
          refund_rate_prior: round(between(0.01, 0.03), 3),
          new_buyer_ratio: round(between(0.2, 0.35), 2),
          top_buyer_share: round(between(0.55, 0.72), 2), // concentrated, but a known buyer
          distinct_buyers: Math.round(between(180, 600)),
          dispute_count_90d: 0,
          dormant_days: 0,
          cross_border_share: 0,
          context_note:
            'Single large order from a corporate buyer that has transacted with this merchant in 9 of the last 12 months. Concentration is expected for the B2B segment.',
        };
      },
    };
  },

  function crossBorderExpansion() {
    const cat = pick(['fashion', 'saas', 'electronics']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(600, 1500)),
        kyc_status: 'verified',
        doc_completeness: round(between(0.9, 1.0), 2),
        baseline_monthly_volume: Math.round(between(700000, 2400000)),
      },
      flag: { flag_type: 'review', trigger: 'chargeback_ratio' },
      signal: (m) => {
        const spike = round(between(2.0, 3.4), 1);
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(2.0, 3.2), 1),
          // Slightly elevated but still under benchmark: cross-border always is.
          chargeback_ratio: round(bench * between(0.85, 0.98), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'flat',
          refund_rate: round(between(0.04, 0.07), 3),
          refund_rate_prior: round(between(0.03, 0.06), 3),
          new_buyer_ratio: round(between(0.6, 0.78), 2),
          top_buyer_share: round(between(0.02, 0.06), 3),
          distinct_buyers: Math.round(between(1400, 5200)),
          dispute_count_90d: Math.round(between(1, 5)),
          dormant_days: 0,
          cross_border_share: round(between(0.35, 0.6), 2),
          context_note:
            'Merchant opened UAE and Singapore shipping this quarter. Chargeback ratio rose with the cross-border mix but remains below the category benchmark.',
        };
      },
    };
  },
];

// Deliberately ambiguous: a legitimate merchant whose chargeback ratio is
// genuinely ABOVE benchmark. Every easy tell points the wrong way, and only the
// direction of travel and the stated cause distinguish it from real risk. This
// archetype exists so the evaluation has cases that can actually be failed.
falsePositives.push(function stressedButLegitimate() {
  const cat = 'travel';
  const bench = CATEGORIES[cat].benchmark;
  return {
    category: cat,
    merchant: {
      account_age_days: Math.round(between(600, 1600)),
      kyc_status: 'verified',
      doc_completeness: 1.0,
      baseline_monthly_volume: Math.round(between(1000000, 3200000)),
    },
    flag: { flag_type: 'reserve_hold', trigger: 'chargeback_ratio' },
    signal: (m) => {
      const spike = round(between(1.4, 2.6), 1);
      return {
        spike_multiple: spike,
        volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
        z_score: round(between(1.2, 2.4), 1),
        // Above benchmark — the signal that usually means genuine risk.
        chargeback_ratio: round(bench * between(1.3, 1.9), 4),
        category_benchmark: bench,
        // But falling, not rising: the underlying cause is being fixed.
        chargeback_trend_3m: 'falling',
        refund_rate: round(between(0.09, 0.15), 3),
        refund_rate_prior: round(between(0.1, 0.17), 3),
        new_buyer_ratio: round(between(0.4, 0.6), 2),
        top_buyer_share: round(between(0.02, 0.06), 3),
        distinct_buyers: Math.round(between(2400, 7000)),
        dispute_count_90d: Math.round(between(30, 70)),
        dormant_days: 0,
        cross_border_share: round(between(0.2, 0.45), 2),
        ambiguous: true,
        context_note:
          'Disputes trace to a partner airline cancelling a route in March; the merchant refunded affected bookings directly and dispute volume has fallen each month since. Chargeback ratio remains above the category benchmark but is trending down.',
      };
    },
  };
});

// ---- GENUINE RISK: the flag is correct ----

const genuineRisks = [
  function velocityFraud() {
    const cat = pick(['electronics', 'gaming']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(9, 45)),
        kyc_status: 'incomplete',
        doc_completeness: round(between(0.2, 0.45), 2),
        baseline_monthly_volume: Math.round(between(60000, 250000)),
      },
      flag: { flag_type: 'freeze', trigger: 'velocity' },
      signal: (m) => {
        const spike = round(between(12, 30), 1);
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(8, 15), 1),
          chargeback_ratio: round(bench * between(4, 8), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'rising',
          refund_rate: round(between(0.08, 0.16), 3),
          refund_rate_prior: round(between(0.02, 0.04), 3),
          new_buyer_ratio: round(between(0.93, 0.99), 2),
          top_buyer_share: round(between(0.03, 0.09), 3),
          distinct_buyers: Math.round(between(400, 1800)),
          dispute_count_90d: Math.round(between(18, 60)),
          dormant_days: 0,
          cross_border_share: round(between(0.4, 0.8), 2),
          context_note: null,
        };
      },
    };
  },

  function chargebackBlowout() {
    const cat = pick(['travel', 'gaming', 'electronics']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(300, 900)),
        kyc_status: 'verified',
        doc_completeness: round(between(0.8, 1.0), 2),
        baseline_monthly_volume: Math.round(between(800000, 3000000)),
      },
      flag: { flag_type: 'reserve_hold', trigger: 'chargeback_ratio' },
      signal: (m) => {
        // Modest spike — a volume rule would miss this one entirely.
        const spike = round(between(1.1, 2.4), 1);
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(0.6, 2.0), 1),
          chargeback_ratio: round(bench * between(3.5, 6.5), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'rising',
          refund_rate: round(between(0.06, 0.12), 3),
          refund_rate_prior: round(between(0.03, 0.05), 3),
          new_buyer_ratio: round(between(0.5, 0.7), 2),
          top_buyer_share: round(between(0.03, 0.1), 3),
          distinct_buyers: Math.round(between(1500, 6000)),
          dispute_count_90d: Math.round(between(40, 130)),
          dormant_days: 0,
          cross_border_share: round(between(0.1, 0.4), 2),
          context_note:
            'Merchant states delivery delays caused the disputes. Dispute volume has risen for three consecutive months.',
        };
      },
    };
  },

  function transactionLaundering() {
    return {
      category: 'education',
      merchant: {
        account_age_days: Math.round(between(60, 220)),
        kyc_status: 'verified',
        doc_completeness: round(between(0.7, 0.95), 2),
        baseline_monthly_volume: Math.round(between(200000, 900000)),
      },
      flag: { flag_type: 'freeze', trigger: 'manual' },
      signal: (m) => {
        const spike = round(between(3.0, 7.0), 1);
        const bench = CATEGORIES.education.benchmark;
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(3.0, 5.5), 1),
          chargeback_ratio: round(bench * between(2.5, 5.0), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'rising',
          refund_rate: round(between(0.05, 0.1), 3),
          refund_rate_prior: round(between(0.02, 0.04), 3),
          new_buyer_ratio: round(between(0.8, 0.95), 2),
          top_buyer_share: round(between(0.1, 0.25), 2),
          distinct_buyers: Math.round(between(300, 1200)),
          dispute_count_90d: Math.round(between(15, 45)),
          dormant_days: 0,
          cross_border_share: round(between(0.3, 0.7), 2),
          // The tell: MCC says education, the basket says something else.
          item_categories: ['gift cards', 'consumer electronics', 'prepaid vouchers'],
          context_note:
            'Registered as an online tutoring service. Item descriptors on settled transactions do not match the registered category.',
        };
      },
    };
  },

  function bustOut() {
    const cat = pick(['electronics', 'jewellery']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(400, 1000)),
        kyc_status: 'verified',
        doc_completeness: 1.0,
        baseline_monthly_volume: Math.round(between(150000, 600000)),
      },
      flag: { flag_type: 'freeze', trigger: 'volume_spike' },
      signal: (m) => {
        const spike = round(between(18, 40), 1);
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(10, 18), 1),
          chargeback_ratio: round(bench * between(2.0, 4.0), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'rising',
          // The tell: refunds explode alongside volume — funds in, funds out.
          refund_rate: round(between(0.35, 0.55), 3),
          refund_rate_prior: round(between(0.01, 0.03), 3),
          new_buyer_ratio: round(between(0.85, 0.97), 2),
          top_buyer_share: round(between(0.15, 0.35), 2),
          distinct_buyers: Math.round(between(200, 900)),
          dispute_count_90d: Math.round(between(10, 40)),
          dormant_days: Math.round(between(120, 260)),
          cross_border_share: round(between(0.2, 0.6), 2),
          context_note:
            'Account was effectively dormant for the preceding two quarters before this month.',
        };
      },
    };
  },

  function youngAccountDocGapCombo() {
    const cat = pick(['gaming', 'travel']);
    const bench = CATEGORIES[cat].benchmark;
    return {
      category: cat,
      merchant: {
        account_age_days: Math.round(between(20, 70)),
        kyc_status: 'incomplete',
        doc_completeness: round(between(0.3, 0.55), 2),
        baseline_monthly_volume: Math.round(between(100000, 400000)),
      },
      flag: { flag_type: 'freeze', trigger: 'doc_gap' },
      signal: (m) => {
        const spike = round(between(4.0, 9.0), 1);
        return {
          spike_multiple: spike,
          volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
          z_score: round(between(4.0, 7.0), 1),
          chargeback_ratio: round(bench * between(2.2, 4.5), 4),
          category_benchmark: bench,
          chargeback_trend_3m: 'rising',
          refund_rate: round(between(0.1, 0.2), 3),
          refund_rate_prior: round(between(0.04, 0.08), 3),
          new_buyer_ratio: round(between(0.88, 0.97), 2),
          top_buyer_share: round(between(0.05, 0.15), 2),
          distinct_buyers: Math.round(between(300, 1400)),
          dispute_count_90d: Math.round(between(12, 40)),
          dormant_days: 0,
          cross_border_share: round(between(0.3, 0.7), 2),
          context_note:
            'Bank account details were changed twice since onboarding. Beneficial ownership declaration is outstanding.',
        };
      },
    };
  },
];

/* ------------------------------------------------------------------ */

// The mirror of stressedButLegitimate: a fraudulent account that has done the
// paperwork and waited. Nothing screams, and the case has to be made from the
// combination — refunds climbing, volume concentrating on one new counterparty,
// cross-border share rising — rather than from any single number.
genuineRisks.push(function patientFraud() {
  const cat = pick(['electronics', 'fashion']);
  const bench = CATEGORIES[cat].benchmark;
  return {
    category: cat,
    merchant: {
      account_age_days: Math.round(between(380, 800)),
      kyc_status: 'verified',
      doc_completeness: 1.0,
      baseline_monthly_volume: Math.round(between(700000, 2200000)),
    },
    flag: { flag_type: 'review', trigger: 'velocity' },
    signal: (m) => {
      const spike = round(between(2.2, 3.6), 1);
      return {
        spike_multiple: spike,
        volume_last_30d: Math.round(m.baseline_monthly_volume * spike),
        z_score: round(between(2.0, 3.4), 1),
        // Only just above benchmark: not the blowout that gives fraud away.
        chargeback_ratio: round(bench * between(1.2, 1.7), 4),
        category_benchmark: bench,
        chargeback_trend_3m: 'rising',
        // The tell, and it is quiet: refunds roughly tripled.
        refund_rate: round(between(0.16, 0.24), 3),
        refund_rate_prior: round(between(0.04, 0.07), 3),
        new_buyer_ratio: round(between(0.6, 0.75), 2),
        // Volume concentrating on one counterparty that has no history.
        top_buyer_share: round(between(0.38, 0.55), 2),
        distinct_buyers: Math.round(between(700, 2200)),
        dispute_count_90d: Math.round(between(8, 22)),
        dormant_days: 0,
        cross_border_share: round(between(0.45, 0.75), 2),
        ambiguous: true,
        context_note:
          'Merchant attributes the increase to a new wholesale buyer onboarded last month. That buyer now accounts for most of the volume and has no prior transaction history on the platform.',
      };
    },
  };
});

function buildCase(kind, index) {
  const factory = kind === 'false_positive'
    ? falsePositives[index % falsePositives.length]
    : genuineRisks[index % genuineRisks.length];
  const spec = factory();

  const namePool = kind === 'false_positive' ? NAMES_LEGIT : NAMES_RISKY;
  const merchant = {
    // Generated here rather than read back after insert, so the same dataset
    // can be written straight to Postgres or emitted as SQL.
    id: randomUUID(),
    name: `${namePool[index % namePool.length]}${index >= namePool.length ? ` ${Math.floor(index / namePool.length) + 1}` : ''}`,
    category: spec.category,
    mcc: CATEGORIES[spec.category].mcc,
    onboarded_at: daysAgo(spec.merchant.account_age_days),
    ...spec.merchant,
  };

  const signal = spec.signal(merchant);
  // Money actually stuck behind the flag — this drives queue ordering.
  signal.value_at_risk = Math.round(signal.volume_last_30d * between(0.25, 0.6));

  return {
    merchant,
    flag: {
      ...spec.flag,
      triggered_at: daysAgo(between(0.5, 9)),
      signal,
      ground_truth: kind,
    },
  };
}

/**
 * Build the whole dataset in memory. Merchant ids are generated here, so rows
 * can be written directly to Postgres or rendered as SQL without a read-back.
 */
export function buildDataset({ perClass = 22 } = {}) {
  const cases = [];
  for (let i = 0; i < perClass; i += 1) {
    cases.push(buildCase('false_positive', i));
    cases.push(buildCase('genuine_risk', i));
  }

  const merchants = cases.map((c) => c.merchant);

  // Stratified holdout: both classes appear in the eval set and in the queue.
  let fpSeen = 0;
  let grSeen = 0;
  const flags = cases.map((c) => {
    const isFp = c.flag.ground_truth === 'false_positive';
    const n = isFp ? fpSeen++ : grSeen++;
    return {
      id: randomUUID(),
      merchant_id: c.merchant.id,
      ...c.flag,
      is_holdout: n % 5 < 2, // ~40%
    };
  });

  const transactions = [];
  cases.forEach((c) => {
    const count = Math.round(between(6, 14));
    for (let k = 0; k < count; k += 1) {
      const roll = rnd();
      const status = roll < 0.16 ? 'borderline' : roll < 0.32 ? 'declined' : 'captured';
      transactions.push({
        id: randomUUID(),
        merchant_id: c.merchant.id,
        amount: Math.round(between(400, 45000)),
        currency: 'INR',
        is_cross_border: rnd() < (c.flag.signal.cross_border_share ?? 0),
        method: pick(['card', 'upi', 'netbanking', 'wallet']),
        status,
        decline_reason: status === 'captured' ? null
          : pick(['issuer_declined', 'risk_threshold', 'insufficient_funds', '3ds_failed']),
        risk_score: round(between(0.05, 0.95), 2),
        created_at: daysAgo(between(0.2, 28)),
      });
    }
  });

  const settlements = cases.map((c) => {
    const gross = c.flag.signal.value_at_risk;
    return {
      id: randomUUID(),
      merchant_id: c.merchant.id,
      gross_amount: gross,
      fees: Math.round(gross * 0.02),
      reserve_held: c.flag.flag_type === 'review' ? 0 : Math.round(gross * between(0.3, 1.0)),
      reserve_release_due: new Date(Date.now() + between(5, 120) * 86400000)
        .toISOString().slice(0, 10),
      settled_at: null,
      status: c.flag.flag_type === 'review' ? 'pending' : 'on_hold',
    };
  });

  // ---- B2B invoices: unpaid receivables + GST bucket errors ----
  const invoices = [];
  const gstCategories = Object.keys(GST_RULES);
  cases.forEach((c) => {
    const count = Math.round(between(0, 4));
    for (let k = 0; k < count; k += 1) {
      const category = pick(gstCategories);
      const correct = GST_RULES[category];
      // ~18% carry a wrong rate — the thing the finance detector must catch.
      const wrongRate = rnd() < 0.18;
      const applied = wrongRate
        ? pick(Object.values(GST_RULES).map((g) => g.rate).filter((r) => r !== correct.rate))
        : correct.rate;

      const dueInDays = between(-75, 40); // negative = already overdue
      const overdue = dueInDays < 0;
      const paid = !overdue && rnd() < 0.55;

      invoices.push({
        id: randomUUID(),
        merchant_id: c.merchant.id,
        buyer: pick(BUYERS),
        amount: Math.round(between(25000, 900000)),
        gst_rate_applied: applied,
        hsn_code: correct.hsn,
        item_category: category,
        due_date: new Date(Date.now() + dueInDays * 86400000).toISOString().slice(0, 10),
        paid_at: paid ? daysAgo(between(1, 20)) : null,
        status: paid ? 'paid' : overdue ? 'overdue' : 'unpaid',
      });
    }
  });

  // ---- Agent shopping sessions: fair vs discriminatory pricing ----
  // Two SKUs are deliberately quoted at materially different prices with no
  // discount rule behind the difference; the rest vary only where a named rule
  // explains it.
  const unfairSkus = new Set([SKUS[0].sku, SKUS[3].sku]);
  const agentSessions = [];
  const agentQuotes = [];
  for (let i = 0; i < 26; i += 1) {
    const session = {
      id: randomUUID(),
      agent_id: `agent-${pick(['alpha', 'beta', 'gamma', 'delta'])}`,
      buyer_ref: `buyer-${Math.round(between(1000, 9999))}`,
      started_at: daysAgo(between(0.2, 21)),
    };
    agentSessions.push(session);

    for (const item of SKUS.filter(() => rnd() < 0.5)) {
      const unfair = unfairSkus.has(item.sku);
      // Fair: either list price, or a discount with a rule naming the reason.
      // Unfair: price moves per session with nothing justifying it.
      const hasRule = !unfair && rnd() < 0.4;
      const factor = unfair
        ? between(0.78, 1.32)
        : hasRule ? between(0.85, 0.95) : 1;

      agentQuotes.push({
        id: randomUUID(),
        session_id: session.id,
        sku: item.sku,
        quoted_price: Math.round(item.list * factor),
        list_price: item.list,
        discount_rule: hasRule ? pick(['BULK10', 'LOYALTY5', 'FESTIVE15']) : null,
        quoted_at: session.started_at,
      });
    }
  }

  return { merchants, flags, transactions, settlements, invoices, agentSessions, agentQuotes };
}

export const WIPE_ORDER = [
  'audit_log', 'case_actions', 'recovery_attempts', 'review_queue',
  'agent_quotes', 'agent_sessions', 'invoices', 'settlements',
  'transactions', 'merchant_flags', 'merchants',
];

async function main() {
  // Imported lazily: emitting SQL must not require database credentials.
  const { db } = await import('../src/lib/db.js');

  console.log('Wiping existing rows...');
  for (const table of WIPE_ORDER) {
    const { error } = await db.from(table).delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`wipe ${table} failed: ${error.message}`);
  }

  const data = buildDataset();

  for (const [table, rows] of [
    ['merchants', data.merchants],
    ['merchant_flags', data.flags],
    ['transactions', data.transactions],
    ['settlements', data.settlements],
    ['invoices', data.invoices],
    ['agent_sessions', data.agentSessions],
    ['agent_quotes', data.agentQuotes],
  ]) {
    const { error } = await db.from(table).insert(rows);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
    console.log(`  ${table.padEnd(16)} ${rows.length}`);
  }

  summarise(data);
}

export function summarise(d) {
  const { merchants, flags, transactions, settlements, invoices = [], agentQuotes = [] } = d;
  const holdout = flags.filter((f) => f.is_holdout).length;
  console.log('');
  console.log('Seed complete.');
  console.log(`  merchants     ${merchants.length}`);
  console.log(`  flags         ${flags.length}  (${holdout} holdout / ${flags.length - holdout} queue)`);
  console.log(`  ground truth  ${flags.filter((f) => f.ground_truth === 'genuine_risk').length} genuine_risk, ${flags.filter((f) => f.ground_truth === 'false_positive').length} false_positive`);
  console.log(`  transactions  ${transactions.length}`);
  console.log(`  settlements   ${settlements.length}`);
  console.log(`  invoices      ${invoices.length}  (${invoices.filter((i) => i.status === 'overdue').length} overdue)`);
  console.log(`  agent quotes  ${agentQuotes.length}`);
}

// Only run against the database when invoked directly.
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
