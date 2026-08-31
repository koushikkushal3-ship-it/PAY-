# SafeGate — internal ops console for a payment aggregator

Built for the Razorpay Buildathon, **Open Track**.

## The problem

When an automated risk rule flags a merchant, that merchant's settlements stop. If the flag was
wrong, an honest business loses access to its own money and — going by what merchants publicly
report — there is *"no appeal process, no human you can call, you submit tickets and wait."*
Cross-border transactions are declined at roughly 6% for reasons described as
*"not fraud, just false positives."*

Fraud detection is a solved product. Deciding **whether a flag was correct** is not.

SafeGate is the console for the person on the other side of that flag. It reasons over a case file,
says whether the flag reflects genuine risk or a false positive, explains why in the merchant's own
numbers, and recommends what to do.

## Why these four problems

Checked against what Razorpay already ships before choosing. Deliberately **not built**, because
they already exist: Shield (fraud scoring, ~3000 signals per transaction), Agent Studio's Dispute
Responder, the Subscription Recovery and Cart Abandonment agents, and Recon/Optimizer (a million
records in 40 minutes).

Four gaps remained, one per Buildathon track:

| Track | Gap this fills |
|---|---|
| Risk Manager | Freeze and rolling-reserve false positives — no appeal path exists today |
| Revenue Recovery | Declines the platform itself caused, and B2B invoices (existing agents cover consumer checkout and subscriptions) |
| Agentic Commerce | Agent-driven pricing fairness — named as an open risk in coverage of Razorpay's own Agent Studio launch |
| Finance Controller | Forward reserve exposure and GST bucket errors (Recon reports settlement history, not what is held now) |

## Architecture

Four modules, one pipeline:

```
detectors  ->  review_queue  ->  Gemini reasoner  ->  analyst console  ->  audit_log
(4 modules)    (shared)          (structured JSON)     (shared UI)         (shared)
```

Every module implements the same interface — `detect()`, `loadContext()`, a system prompt and a
response schema — registered in [`server/src/detectors/index.js`](server/src/detectors/index.js).
The routes carry no per-module branching: adding a module means adding a file, not editing a handler.

- **Backend** — Node/Express, Supabase Postgres (service role, RLS on).
- **Reasoning** — Gemini in JSON mode with an explicit `responseSchema`, so a verdict is a validated
  shape rather than text to be parsed hopefully. No trained ML model anywhere in the stack.
- **Frontend** — React + Vite.

### The modules

**Risk** — merchant accounts frozen or reserve-held. Decides genuine risk vs false positive and
recommends release, document request, hold or escalation.

**Recovery** — payments the platform itself declined at its risk threshold, plus overdue B2B
invoices. A case reaches the queue only when automated handling has already failed and judgment
changes the outcome: `insufficient_funds` and `3ds_failed` are excluded because a retry resolves
them. The model sets a `stop_after_attempts` cap and **the server enforces it** — an action past the
cap returns 409 rather than chasing a customer indefinitely.

**Agent audit** — groups AI-agent price quotes by SKU and raises a case where the spread exceeds 8%
of list. Ranks by *unexplained* spread, so a wide but rule-backed spread sorts below a narrow
unexplained one.

**Finance** — GST rates that do not match the expected rate for an item category, and merchants with
more than 40% of settlement held in reserve. The schema carries `needs_human_review`, so an
unresolved case is flagged unresolved rather than guessed.

### The design decision worth calling out

`merchant_flags` carries both `ground_truth` and `is_holdout`. Each module's `build*CaseInput()` is
the trust boundary: it constructs the object sent to the model field by field and **never copies the
label in**. Holdout rows are excluded from the working queue entirely.

The console renders that exact object on every case detail screen, so the absence of a label is
visible rather than claimed.

## Evidence

`npm run eval` replays every holdout case through the reasoner and scores it against labels it never
saw — accuracy, precision, recall, F1 and a confusion matrix.

The same rows are scored by a **naive volume rule** (`spike > 5x = freeze`), the thing a rules engine
does today. A number for the model alone would prove nothing; the comparison is the point, and both
run over the identical set so the denominators match.

The dataset is built to make that comparison honest. Large volume spikes appear in **both** classes —
festival trade and marketing campaigns spike as hard as fraud does — and several genuine-risk
accounts spike only modestly while their chargeback ratio blows out. A volume threshold cannot do
well here, which is exactly why it is the baseline.

Headline metric: **of the flagged merchants who are actually legitimate, how many were correctly
cleared instead of left frozen.**

## What is real and what is synthetic

- **Synthetic**: all merchant, transaction, invoice, settlement and agent-quote data. No public
  dataset exists for merchant-account freeze false positives, and real merchant risk files are not
  obtainable. [`server/scripts/seed.js`](server/scripts/seed.js) generates ten archetypes from
  documented fraud and legitimate-business patterns.
- **Real**: the reasoning, the evaluation, and the held-out scoring. The model genuinely does not
  see the labels, and the metrics are computed rather than asserted.

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
cd client && npm run dev    # UI on :5174
```

In the console, press **Run detector** on any tab to populate its queue, open a case, then **Run
reasoner**. The **Evidence** tab runs the holdout evaluation.

## Repository layout

```
server/
  src/reasoner/     gemini.js, prompts.js, promptsModules.js, schemas.js
  src/detectors/    index.js (registry), risk, recovery, agentAudit, finance
  src/eval/         runEval.js — holdout scoring and the naive baseline
  src/routes/       queue.js, cases.js, metrics.js
  scripts/          seed.js, runEval.js, emitSql.js
client/
  src/pages/        Queue, CaseDetail, Metrics, AuditLog
```

## Known limits

- Single-analyst tool; no auth. Everything runs server-side against the service role.
- The reasoner is scored on 20 holdout cases — indicative, not a production claim.
- The risk archetypes give clean, non-contradictory signals, so a legitimate merchant reads as
  legitimate on every axis at once. Real freeze cases are ambiguous, which is why they need a human
  in the first place. The evaluation numbers should be read with that in mind.
- Gemini's free tier rate-limits at roughly 15 requests per minute; the eval paces itself and backs
  off on a 429, but a large holdout set will be slow.
