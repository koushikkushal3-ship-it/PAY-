# Five-minute pitch — SafeGate

Numbers below are from the run recorded in `server/eval-results.json`. Re-run
`npm run eval` before recording and update anything that moves.

---

## 0:00 — The problem (45s)

> Razorpay already has excellent fraud detection. Shield scores about three
> thousand signals per transaction.
>
> This isn't about catching fraud. It's about what happens when that system is
> wrong.
>
> When a merchant gets flagged, their settlements stop. If the flag was a false
> positive, an honest business loses access to its own money. Here's what
> merchants say about that experience: *"no appeal process, no human you can
> call, you submit tickets and wait."*
>
> Roughly six percent of cross-border transactions are declined as false
> positives — not fraud, just a system that isn't sure.
>
> Detecting fraud is solved. Deciding whether a flag was **correct** is not.

## 0:45 — Why these four problems (30s)

> Before building anything I checked what Razorpay already ships. Shield,
> Agent Studio's Dispute Responder, the Subscription Recovery and Cart
> Abandonment agents, Recon doing a million records in forty minutes.
>
> I deliberately built none of those. What was left was four gaps, one per
> track — and the anchor is the one with no product at all: there is no appeal
> path for a wrongly frozen merchant.

## 1:15 — The build (45s)

*Show the console, click across the four tabs.*

> Four modules, one pipeline. Detectors raise cases into a shared queue, one
> reasoning layer explains them, one audit trail records every decision.
>
> Every module implements the same interface, so the routes have no
> per-module branching. Adding a fifth module is a new file, not a handler edit.
>
> The reasoning is Gemini in JSON mode against an explicit schema — a verdict
> is a validated shape, not text I hope to parse. No trained model anywhere.

## 2:00 — One case, end to end (60s)

*Open a risk case. Point at the left panel first.*

> This panel is the exact object sent to the model. Not a summary — the actual
> input. I show it because the credibility of everything else depends on there
> being no hidden label in that prompt.

*Click Run reasoner.*

> Verdict, confidence, the signals it used, and a draft message to the
> merchant. Notice it cites real numbers: chargeback ratio against the category
> benchmark, refund rate against the prior period.
>
> And the recommendation is one of four actions an analyst can actually take —
> including "request documents" when it's a paperwork problem rather than a
> risk problem. That case shouldn't be a freeze at all.

## 3:00 — The evidence (75s)

*Open the Evidence tab.*

> Twenty held-out cases. They never enter the working queue and their labels
> are never in the prompt.
>
> The reasoner: **100% accuracy**. The naive volume rule a rules engine uses
> today: **60%**.
>
> The comparison matters more than my number. Both run over the identical
> cases — I had a bug where they didn't, and fixed it, because different
> denominators make the comparison meaningless.
>
> The line that matters: of ten flagged merchants who were actually
> legitimate, the reasoner cleared **all ten**. The volume rule left **three
> wrongly frozen**.
>
> That works because the dataset is built to defeat a volume threshold. Big
> spikes appear in both classes — festival trade spikes as hard as fraud —
> and some fraudulent accounts barely spike at all while their chargebacks
> blow out.

*Scroll to Calibration.*

> Then the honest part. A hundred percent says as much about my dataset as my
> system, so I added archetypes designed to conflict: a legitimate merchant
> whose chargebacks are genuinely above benchmark, and a fraudster with clean
> paperwork and a modest spike.
>
> It got those right too — but confidence dropped from **95.6% to 88%**. It's
> less sure exactly where the evidence conflicts. That's the property I
> actually want, because those are the cases that should reach a human.

## 4:15 — Limits, then close (45s)

> What I'd say to a reviewer before they ask:
>
> The data is synthetic. No public dataset exists for merchant freeze false
> positives. The reasoning and the evaluation are real; the merchants are not,
> and the README says so.
>
> Twenty holdout cases is indicative, not a production claim.
>
> And I have no failure cases. I'm not presenting that as robustness — a
> harder dataset would produce them, and the next thing I'd build is the one
> that does.
>
> What's real: four working modules, a stop rule the server enforces rather
> than suggests, an audit trail across every decision, and an evaluation that
> compares itself to the thing it's meant to replace.
>
> Not a demo that looks nice. Evidence that it works, and a plain account of
> where it doesn't.

---

## Demo checklist

- [ ] `npm run seed`, then **Run detector** on all four tabs
- [ ] Pre-score two or three cases so the demo isn't waiting on the API
- [ ] Leave one case unscored to run live
- [ ] Confirm `npm run eval` has been run recently — Evidence reads the file
- [ ] Check the Gemini free tier hasn't rate-limited before recording
- [ ] Client is on **:5174**, API on **:5001**

## Questions to expect

**"Why not fine-tune a model?"**
The bottleneck isn't classification, it's explanation an analyst can act on and
a merchant can be told. A classifier gives a score; this gives reasoning that
cites the merchant's own numbers, plus a draft message to send them.

**"How do I know the model isn't seeing the label?"**
`buildRiskCaseInput()` constructs the input field by field — it never copies
`ground_truth` or `is_holdout`. Holdout rows are excluded from the queue
entirely. The case screen renders that exact object, so you can check rather
than trust me.

**"100% is suspicious."**
Agreed, and I say so before you do. It reflects a dataset where signals agree
with each other. The calibration split is the more useful number.

**"What happens at real volume?"**
It doesn't score everything — detectors triage first, and the queue is ranked
by money at stake. The recovery module went from 121 cases to 57 by excluding
anything an automated retry already handles.

**"What would you build next?"**
A harder dataset that produces real failures, then auth and rate limiting,
which I cut deliberately for a single-analyst tool.
