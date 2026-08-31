# Razorpay Buildathon — Full Plan & Architecture

**Submission track:** Open Track
**Project name:** SafeGate — Razorpay Internal Ops Console
**Build window:** 3 days
**AI approach:** LLM reasoning (Gemini, structured JSON output). No trained ML model, no scikit-learn.
**Deadline:** 2026-09-05

---

## 1. What this is, in one sentence

An internal operations console for Razorpay's own risk, recovery, compliance, and finance teams that
uses LLM reasoning to triage the four categories of case they work through by hand every day — built
specifically on gaps Razorpay does *not* already have a product for.

---

## 2. Why these four ideas (the gaps)

Verified against Razorpay's live products before choosing. Already shipped and therefore **out of
scope**: Shield (fraud, ~3000 signals/txn), Agent Studio's Dispute Responder, Subscription Recovery
Agent, Cart Abandonment Recovery Agent, and Recon/Optimizer (1M records / 40 min reconciliation).

| # | Gap | Evidence it is unsolved |
|---|-----|------------------------|
| 1 | Account-freeze / rolling-reserve false-positive release | "No appeal process, no human you can call, you submit tickets and wait." Cross-border falsely declined ~6% of the time — "not fraud, just false positives" |
| 2 | Agent Studio pricing fairness / dark-pattern governance | Razorpay's own launch coverage titled "Promise, Gaps, Risks" — price discrimination named unresolved |
| 3 | Rolling-reserve forward exposure visibility | Recon shows historical matching only; nothing forecasts how much money is held now and when it releases |
| 4 | B2B unpaid-invoice recovery | Agent Studio recovery agents are consumer checkout + subscription only; B2B receivables uncovered |

Sources:
- https://razorpay.com/blog/what-to-do-when-your-payment-gateway-account-is-frozen/
- https://www.xflowpay.com/blog/razorpay-review
- https://www.medianama.com/2026/03/223-razorpay-launches-ai-agent-studio-questions-loom-dark-patterns-price-discrimination/
- https://razorpay.com/blog/single-view-recon/
- https://razorpay.com/agent-studio/

---

## 3. The four modules (one per Razorpay track)

### Module 1 — Risk Manager: Freeze & Reserve Appeal Engine  *(the AI centerpiece)*

Takes a merchant account that has been flagged/frozen, feeds its full case context to Gemini, and gets
back a structured verdict: **GENUINE_RISK** or **FALSE_POSITIVE**, with confidence, reasoning, and a
recommended action (hold / release / request-documents / escalate).

Case context sent to the model:
- 90-day volume history + z-score of the spike that triggered the flag
- Account age, KYC/documentation completeness
- Chargeback ratio vs. category benchmark
- Refund rate, dispute history
- Business category and seasonality note (e.g. festival spike, campaign launch)

### Module 2 — Revenue Recovery: False-Decline + B2B Invoice Recovery

- **False-decline recovery** — a borderline transaction (not clearly fraud, not clearly clean) gets a
  recovery path recommendation instead of a hard decline: step-up verification, alternate payment
  method, or retry window.
- **B2B invoice recovery** — unpaid net-30/60 invoices get a graded follow-up plan with a stop-rule so
  the same invoice never loops endlessly.

### Module 3 — Agentic Commerce: Pricing-Fairness Auditor

Replays simulated AI-agent shopping sessions (agent asks for price, creates order, completes checkout)
and flags cases where the same SKU was quoted materially different prices across sessions with no
legitimate discount rule behind it. Gemini writes the explanation of *why* a case looks like price
discrimination vs. a valid promotion.

### Module 4 — Finance Controller: Reserve Exposure Forecast + GST Bucket Check

- **Rolling-reserve exposure forecast** — how much of a merchant's settlement is held right now, and a
  release-date projection, so a hold never arrives as a surprise.
- **GST/HSN bucket check** — flags invoices where the applied tax rate looks wrong for the item
  category, with a plain-English note per flagged invoice.

---

## 4. The unifying architecture

All four modules are **adapters into one shared pipeline**. This is what makes 4 tracks fit in 3 days —
build the pipeline once, plug four detectors into it.

```
              Synthetic data seeder
   merchants / transactions / invoices /
      settlements / agent_sessions
                    |
    +---------+-----+-----+-----------+
    |         |           |           |
  Risk    Recovery    Agent-audit  Finance      <- 4 DETECTORS (thin adapters)
 detector  detector    detector    detector
    |         |           |           |
    +---------+-----+-----+-----------+
                    |
              review_queue                      <- ONE shared case table
        (module, entity, severity, value)
                    |
             Gemini Reasoner                    <- ONE shared reasoning layer
      structured JSON: verdict + why + action      (per-module prompt template)
                    |
             Analyst Console                    <- ONE shared UI
        queue / case / approve / release
                    |
                audit_log                       <- ONE shared trail
```

---

## 5. Tech stack (list)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite | Fast, known, no SSR complexity needed |
| Styling | Tailwind CSS | Speed |
| Charts | Recharts | Evidence tab (confusion matrix, forecasts) |
| Backend | Node.js + Express | One language across the app, fast to build |
| AI | Google Gemini API, JSON mode (`responseSchema`) | Structured verdicts, not free text. Server-side only |
| Database | Supabase Postgres | Free tier, hosted, RLS built in |
| Auth | Supabase Auth (email/password) | Single internal-analyst login, no custom auth code |
| Validation | Zod | Every API input validated |
| Seeding | Node script (`seed.js`) with `faker` | Synthetic data with deliberately injected cases |
| Deploy | Vercel (client) + Render (server) | Free tiers |

**Explicitly NOT used:** Python, scikit-learn, FastAPI, any trained model, any external ML service.

---

## 6. Database schema (list of tables)

| Table | Purpose | Key columns |
|---|---|---|
| `merchants` | Merchant accounts under review | id, name, category, account_age_days, kyc_complete, avg_monthly_volume, chargeback_ratio, status |
| `transactions` | Payment attempts incl. borderline/declined | id, merchant_id, amount, currency, is_cross_border, decline_reason, risk_band, created_at |
| `invoices` | B2B receivables | id, merchant_id, buyer_name, amount, due_date, paid_at, gst_rate, hsn_code, item_category |
| `settlements` | Settlement + reserve holding history | id, merchant_id, gross_amount, reserve_held, reserve_release_date, settled_at |
| `agent_sessions` | Simulated AI-agent shopping sessions | id, agent_id, sku, quoted_price, base_price, discount_rule_applied, created_at |
| `review_queue` | **Shared** case table, all 4 modules | id, module, entity_type, entity_id, severity, value_at_risk, status, created_at |
| `case_verdicts` | Gemini output per case | id, case_id, verdict, confidence, reasoning, recommended_action, model_version |
| `audit_log` | **Shared** immutable trail | id, case_id, actor, module, action, reasoning, outcome, created_at |
| `eval_labels` | Held-out ground truth for scoring | id, entity_id, true_label |

Row Level Security on every table.

---

## 7. API endpoints (list)

### Queue & cases
- `GET  /api/queue?module=risk|recovery|agent|finance` — ranked case list (severity x value_at_risk)
- `GET  /api/cases/:id` — full case detail + context bundle
- `POST /api/cases/:id/reason` — run the Gemini reasoner, store verdict
- `POST /api/cases/:id/action` — analyst action (release / hold / escalate / request-docs), writes audit_log

### Module-specific
- `POST /api/risk/score` — freeze-risk verdict for a merchant
- `GET  /api/recovery/false-declines` — borderline declines + recommended recovery path
- `GET  /api/recovery/invoices` — unpaid B2B invoices + graded follow-up plan
- `GET  /api/agent/pricing-audit` — flagged unfair-pricing sessions
- `GET  /api/finance/reserve-forecast/:merchantId` — held amount + projected release schedule
- `GET  /api/finance/gst-anomalies` — invoices with suspect tax buckets

### Evidence
- `GET  /api/metrics` — held-out evaluation: agreement rate, precision, recall, F1, confusion matrix
- `POST /api/eval/run` — replay the held-out labeled set through the reasoner

### Ops
- `POST /api/seed` — regenerate synthetic dataset (dev only)

---

## 8. Screens (list)

1. **Login** — Supabase Auth
2. **Queue** — four tabs (Risk / Recovery / Agent Audit / Finance), each a ranked case list with
   severity chip, value at risk, and age
3. **Case detail** — context panel (left), Gemini verdict + reasoning + recommended action (right),
   action buttons (Release / Hold / Escalate / Request docs)
4. **Reserve forecast** — per-merchant chart: held amount over time + projected release dates
5. **Pricing audit** — SKU price-spread chart across agent sessions, flagged outliers highlighted
6. **Evidence / Metrics** — confusion matrix, precision/recall/F1, agreement rate, sample of
   correctly- and incorrectly-judged cases
7. **Audit log** — full immutable trail, filterable by module and actor

---

## 9. The evidence story (what proves it works)

The Buildathon bar asks for evidence, not a nice demo. This project produces:

| Module | Evidence produced |
|---|---|
| Risk Manager | Agreement rate + precision/recall/F1 + confusion matrix against a **held-out labeled set never shown to the prompts** |
| Revenue Recovery | Recovered value across a batch run + proof the stop-rule actually halts |
| Agentic Commerce | Flags the injected unfair-pricing case, does **not** flag the legitimately-discounted one |
| Finance Controller | Reserve forecast computed from real holding rules (not hardcoded) + GST mismatch caught |
| Cross-module | Every case + action lands in one readable `audit_log` |

**Honest framing in the README:** all data is synthetic (no public dataset exists for merchant-freeze
false positives), the held-out slice is genuinely held out, and the LLM's limits are stated plainly.

---

## 10. Repository layout

```
safegate/
  README.md                     # problem, gaps + sources, real vs synthetic, setup
  ARCHITECTURE.md               # this document, trimmed
  client/
    src/
      pages/                    # Login, Queue, CaseDetail, Metrics, AuditLog
      components/               # QueueTable, VerdictPanel, ContextPanel, charts
      lib/                      # supabase client, api client
      App.jsx
    package.json
  server/
    src/
      detectors/                # risk.js, recovery.js, agent.js, finance.js
      reasoner/                 # gemini.js, prompts/, schemas/
      routes/                   # queue, cases, modules, metrics
      middleware/               # auth, validation, rate-limit
      eval/                     # runEval.js, metrics.js
    scripts/seed.js             # synthetic data generator
    supabase/schema.sql
    package.json
```

---

## 11. Three-day build order

### Day 1 — Foundation + the AI centerpiece
- [ ] Supabase project, run `schema.sql`, RLS on every table
- [ ] `seed.js` — generate merchants/transactions/invoices/settlements/agent_sessions with
      **deliberately injected** genuine-risk cases, explainable-spike cases, unfair-priced sessions,
      GST mismatches
- [ ] Hold out a labeled slice into `eval_labels`, never used in any prompt
- [ ] Gemini reasoner with structured `responseSchema` (verdict, confidence, reasoning, action)
- [ ] Risk detector, `review_queue`, `/api/cases/:id/reason` working end to end
- [ ] Queue + case-detail UI against Module 1 only

### Day 2 — The other three modules
- [ ] Recovery detector (false-declines + B2B invoices + stop-rule)
- [ ] Agent pricing-fairness detector (price-spread stats + Gemini explanation)
- [ ] Finance detector (reserve forecast + GST bucket check)
- [ ] All three plugged into the same queue/case/action pipeline
- [ ] Four tabs live in the console

### Day 3 — Evidence, polish, submit
- [ ] `runEval.js` — replay held-out set, compute agreement/precision/recall/F1
- [ ] Metrics screen with confusion matrix + charts
- [ ] Reserve forecast chart, pricing audit chart
- [ ] README + architecture write-up (with gap sources cited)
- [ ] Record 5-minute pitch video
- [ ] Push public repo, submit form **with buffer before the deadline**

---

## 12. Five-part pitch structure (for the video)

1. **The gap** — Razorpay already has Shield, Recon, and Agent Studio. Here are four things they don't
   have, with sources.
2. **The build** — one console, four detectors, one reasoning layer, one audit trail.
3. **The evidence** — held-out evaluation numbers on screen, not a cherry-picked demo.
4. **The walkthrough** — one real case released in each of the four queues.
5. **The honesty** — what's synthetic and why, what the LLM gets wrong, what I'd build next.

---

## 13. Submission checklist

- [ ] Public GitHub repository
- [ ] 5-minute pitch video
- [ ] Short architecture write-up
- [ ] Track selected: **Open Track**
- [ ] Project name, objectives, GitHub URL, pitch, challenges faced — form fields ready
- [ ] Individual submission (own code, own build, defensible in the panel round)
