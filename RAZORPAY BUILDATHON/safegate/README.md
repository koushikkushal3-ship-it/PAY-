# SafeGate — internal ops console for a payment aggregator

Built for the Razorpay Buildathon, **Open Track**.

## The problem

When an automated risk rule flags a merchant, that merchant's settlements stop. If the flag was
wrong, an honest business loses access to its own money and — going by what merchants publicly
report — there is *"no appeal process, no human you can call, you submit tickets and wait."*
Cross-border transactions are declined at roughly 6% for reasons that are described as
*"not fraud, just false positives."*

Fraud detection itself is a solved product. Deciding **whether a flag was correct** is not.

SafeGate is the console for the person on the other side of that flag: it reasons over the merchant's
actual case file, says whether the flag reflects genuine risk or is a false positive, explains why in
the merchant's own numbers, and recommends what to do about it.

## Why these problems and not the obvious ones

Checked against what already exists before choosing. Deliberately **not built**, because Razorpay
already ships them: Shield (fraud scoring, ~3000 signals/txn), Agent Studio's Dispute Responder,
the Subscription Recovery and Cart Abandonment agents, and Recon/Optimizer (1M records in 40 min).

Four gaps remained, one per Buildathon track:

| Track | Gap this fills |
|---|---|
| Risk Manager | Freeze / rolling-reserve false-positive release — no appeal path exists today |
| Revenue Recovery | False-decline recovery, and B2B unpaid-invoice recovery (existing agents are consumer-checkout and subscription only) |
| Agentic Commerce | Agent-driven pricing fairness — named as an open risk in the coverage of Razorpay's own Agent Studio launch |
| Finance Controller | Forward rolling-reserve exposure (Recon reports history, not what is held now and when it releases) |

## Status

**Day 1 complete — the Risk module is built end to end.** Recovery, agent audit, and finance land
on day 2 as additional detectors into the same pipeline.

## Architecture

Four modules, one pipeline. The pipeline is built once; each module is a thin detector that writes
into the same queue and is explained by the same reasoning layer.

```
detectors  ->  review_queue  ->  Gemini reasoner  ->  analyst console  ->  audit_log
(4 modules)    (shared)          (structured JSON)     (shared UI)         (shared)
```

- **Backend** — Node/Express, Supabase Postgres (service role, RLS on).
- **Reasoning** — Gemini in JSON mode with an explicit `responseSchema`, so a verdict is a validated
  shape, not text to be parsed hopefully. No trained ML model anywhere in the stack.
- **Frontend** — React + Vite.

### The one design decision worth calling out

`merchant_flags` carries both `ground_truth` and `is_holdout`. `buildRiskCaseInput()` in
`server/src/reasoner/prompts.js` is the trust boundary: it constructs the bundle sent to the model
field by field and **never copies the label in**. Holdout rows are excluded from the working queue
entirely. The console shows you the exact object the model received, so the absence of the label is
visible rather than claimed.

## Evidence

`npm run eval` replays every holdout case through the reasoner and scores it against labels it never
saw, reporting accuracy / precision / recall / F1 and a confusion matrix.

The same rows are also scored by a **naive volume rule** (`spike > 5x = freeze`) — the thing a
rules engine would do today. A number for the model alone would prove nothing; the comparison is the
point.

The dataset is built to make that comparison honest. Large volume spikes appear in **both** classes
(festival trade and marketing campaigns spike as hard as fraud does), and several genuine-risk
accounts spike only modestly while their chargeback ratio blows out. A volume threshold cannot do
well on this set, which is exactly why it is the baseline.

Headline metric: **of the flagged merchants who are actually legitimate, how many were correctly
cleared instead of left frozen.**

## What is real and what is synthetic

Stated plainly, because the distinction matters:

- **Synthetic**: all merchant, transaction and settlement data. No public dataset exists for
  merchant-account freeze false positives, and real merchant risk files are not obtainable.
  `scripts/seed.js` generates ten archetypes from documented fraud and legitimate-business patterns.
- **Real**: the reasoning, the evaluation, and the held-out scoring. The model genuinely does not see
  the labels, and the metrics are computed, not asserted.

## Setup

```bash
cd server && npm install
cd ../client && npm install
```

Fill `server/.env` (copy from `.env.example`):

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard, Project Settings > API > `service_role`
- `GEMINI_API_KEY` — https://aistudio.google.com/

Then:

```bash
cd server
npm run seed      # generate the dataset
npm run dev       # API on :5001
```

```bash
cd client && npm run dev    # UI on :5173
```

In the console: **Risk** tab, press **Run detector** to populate the queue, open a case, press
**Run reasoner**. The **Evidence** tab runs the holdout evaluation.

## Repository layout

```
server/
  src/reasoner/     gemini.js, prompts.js, schemas.js   <- the reasoning layer
  src/detectors/    risk.js                             <- day 2 adds three more here
  src/eval/         runEval.js                          <- holdout scoring + naive baseline
  src/routes/       queue.js, cases.js, metrics.js
  scripts/          seed.js, runEval.js
client/
  src/pages/        Queue, CaseDetail, Metrics, AuditLog
```

## Known limits

- Single-analyst tool; no auth yet (day 3).
- The reasoner is scored on ~18 holdout cases — enough to be indicative, not enough to be a
  production claim, and the README will not pretend otherwise.
- Gemini occasionally returns low-confidence verdicts on genuinely ambiguous cases. That is correct
  behaviour, and those cases route to `escalate` rather than a forced call.
