# Ops Console

An internal review console for a payment aggregator's own staff — Trust & Safety, Recovery Ops,
Agent Platform Compliance and Finance Ops — built for the **Razorpay Buildathon (Open track)**.

Four queues, one shared pattern: **a ranked case list → a case with an AI verdict and its reasoning →
a one-click analyst decision → an append-only audit trail.**

---

## Why these four problems and not the obvious ones

Razorpay ships fast, and most of the obvious buildathon ideas are already live products. Building
those would mean submitting a worse copy of something the panel's own company runs. So the first step
was checking what already exists:

| Already shipped | What it does |
|---|---|
| **Shield** | Fraud scoring, ~3,000 behavioural signals per transaction, 100+ ML rules |
| **Agent Studio — Dispute Responder** | Auto-fetches evidence and responds to chargebacks |
| **Agent Studio — Subscription Recovery** | Smart retry logic plus personalised voice nudges |
| **Agent Studio — Cart Abandonment Recovery** | Voice call plus a payment link |
| **Recon / Optimizer** | Multi-gateway settlement reconciliation, 1M records in ~40 minutes |

All of the above are out of scope by design. What's left are four gaps with no product behind them:

**1 · A flagged account has no appeal path.** Shield decides *whether to flag*. Nothing decides
whether the flag was *right*. Merchant accounts reported the experience as
*"no appeal process, no human you can call, you submit tickets and wait"* — and roughly **6% of
cross-border declines are false positives**, not fraud. → **Freeze Appeal Engine**

**2 · Recovery is consumer-shaped.** Agent Studio recovers abandoned carts and churned subscriptions.
A borderline-declined transaction is simply lost, and a B2B invoice on net-30 terms has no recovery
loop at all. → **False-Decline + B2B Invoice Recovery**

**3 · Agent pricing has no fairness check.** The press coverage of Razorpay's own Agent Studio launch
was headlined *"Promise, Gaps, Risks"*, naming AI-driven dark patterns and price discrimination as
open questions. → **Agent Pricing Auditor**

**4 · Reconciliation looks backwards.** Recon tells you what already settled. Nothing tells a merchant
how much of their money is held in rolling reserve right now and when it comes back — and nothing
checks whether the GST bucket on an invoice is plausible. → **Reserve Forecast + GST Check**

---

## The centerpiece: Freeze Appeal Engine

The other three modules are detectors. This one is the argument.

Given an account an automated system has already frozen or reserve-held, it reasons over the full case
— volume history, documentation status, chargeback ratio, account age, cross-border share — and
returns `genuine_risk` or `false_positive`, with a confidence, the specific factors that drove it, and
a recommended action (`release` / `escalate` / `request_documents`).

The reasoning is deliberately **asymmetric about error cost**, because the two mistakes are not
equally expensive: wrongly freezing a legitimate merchant costs a customer and real reputational
damage, while wrongly releasing a fraudulent one costs one review cycle — escalation keeps a human in
the loop either way. On genuinely balanced evidence it leans toward release and says so.

### How "it works" is proven

An LLM asserting a verdict proves nothing on its own. So:

- **A held-out labelled slice.** The seed script generates every flagged account from one of eight
  named profiles (`seasonal_spike`, `card_testing`, `chargeback_bleed`, …) with a known label, and
  holds ~40% of them back. Those rows are never queued and never worked.
- **A leak assertion that aborts the run.** Before any prompt is sent, the built context is serialised
  and scanned for `ground_truth`, `is_holdout` and the generator's own profile name. If any of them
  appear, evaluation throws rather than reporting an inflated score. (This caught a real leak during
  the build — the seed script tags each signal with its profile name for diagnostics, which gives the
  answer away.)
- **A baseline it has to beat.** "78% accurate" is meaningless alone, so the naive rule any engineer
  writes first — *flag anything that spiked more than 3×* — is scored on the same rows.

The dataset is built so that rule is genuinely mediocre: several `false_positive` profiles carry large
spikes (a festive-season apparel merchant), and two `genuine_risk` profiles carry unremarkable volume
(`chargeback_bleed`, `card_testing`) precisely so a volume threshold misses them.

Results are computed live on the **Evidence** page — accuracy, precision, recall, F1, a confusion
matrix labelled in plain language, per-profile accuracy so a weakness is diagnosable, and every
individual held-out prediction.

---

## Architecture

```
client/   React + Vite + Tailwind + Recharts
server/   Node + Express + Zod
          ├── services/   one per module + shared queue/audit
          ├── prompts/    six system instructions
          └── evaluation/ hold-out replay + leak assertion + baseline
Supabase  Postgres + Auth, RLS on every table
Gemini    responseSchema JSON mode, called only from the backend
```

**One queue table, four detectors.** A module is just something that writes a case into
`review_queue`. That's why four tracks fit in three days — the queue, case view, action bar and audit
trail were built once, against the hardest module, then reused.

**Deterministic-first.** Any number that can be computed in code *is*: reserve totals, price variance,
days overdue, volume multiples. Gemini reasons about those numbers and explains them — it never
produces one. The `reserveNarrative` prompt says so explicitly.

**Six AI calls, all structured.** Every call uses `responseSchema` JSON mode and is parsed before use,
so a malformed response fails loudly instead of flowing into a case verdict.

| Call | Module | Returns |
|---|---|---|
| `freezeVerdict` | Risk | `label`, `confidence`, `reasoning`, `recommended_action`, `key_factors` |
| `declineRecovery` | Recovery | `recoverable`, `path`, `rationale` |
| `invoiceDunning` | Recovery | `message_draft`, `channel`, `should_escalate`, `rationale` |
| `pricingFairness` | Agent Audit | `unfair`, `pattern`, `rationale` |
| `gstAnomaly` | Finance | `expected_bucket`, `mismatch`, `rationale` |
| `reserveNarrative` | Finance | `summary`, `risk_note` |

### Security

This is a payments-adjacent submission, so the basics are not optional:

- Every Supabase JWT is **re-verified server-side** before any data is touched — a frontend holding a
  session proves nothing.
- **RLS on every table.** Analysts get read-only access; all writes go through the backend's
  service-role client. `merchant_flags` is the exception: it carries the evaluation answer key, so
  direct read access is denied outright and the backend strips `ground_truth` before serving it.
- Zod validation on every request body and query.
- Rate limiting, with a tighter budget on scan endpoints since they fan out into model calls.
- Every prompt states that its payload is untrusted data, never instructions — merchant names and
  invoice lines are user-controlled strings.
- `audit_log` is append-only by construction. There is no update or delete helper.

---

## What's real and what's simulated

Stated plainly, because overselling this would be the easiest thing to catch in a panel round:

| Real | Simulated |
|---|---|
| The reasoning — every verdict is a live Gemini call | The data — merchants, flags, transactions, settlements, invoices and agent quotes all come from `scripts/seed.js` |
| The evaluation — live replay against held-out labels, with a leak assertion and a baseline | No Razorpay API is called. No real payment or merchant data is used anywhere |
| The security posture — JWT verification, RLS, validation, rate limiting | The "automated risk system" upstream is assumed, not built — Shield already exists |

The synthetic dataset exists because the specific problem here — *was this flag a false positive?* —
has no public labelled dataset. Rather than hand-wave it, the generator builds each case from a named,
documented profile so the evaluation measures something real and a failure is diagnosable.

---

## Setup

### 1. Supabase

Create a project, run [`server/supabase/schema.sql`](server/supabase/schema.sql) in the SQL editor,
then from **Project Settings → API** copy the project URL, the `service_role` key and the JWT secret.

### 2. Backend

```bash
cd server
cp .env.example .env    # fill SUPABASE_*, GEMINI_API_KEY
npm install
npm run seed            # generates the synthetic dataset + hold-out split
npm run dev
```

### 3. Frontend

```bash
cd client
cp .env.example .env    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (both public)
npm install
npm run dev
```

Open http://localhost:5173, create an analyst account, then **Run scan** on the Risk queue and
**Run evaluation** on the Evidence page.

### Verify it end to end

```bash
cd server && npm run evaluate
```

Prints the hold-out metrics, the baseline comparison and the per-profile breakdown to the terminal —
the same numbers the Evidence page renders.
