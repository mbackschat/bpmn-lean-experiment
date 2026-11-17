# Plan

Delivery order, budgets and the resume point. The [rewrite-2 proposal](REWRITE-2-PROPOSAL.md) owns the disclosure, the design (KD, AD, HD and PD items), the promise register and the calibration this plan budgets from; the [kernel architecture](kernel/ARCHITECTURE-SPEC.md) owns the guardrails and the definition of done; the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) owns each row's acceptance; the [kernel status map](kernel/KERNEL-STATUS-MAP.md) owns what is implemented and open per row. This file and the status map change only at a milestone or track closure, or at a stop.

## Goal

The goal is Product 2: the BPM platform, deployed and used by a third party on their own BPMN models, on the engine (owner, 2026-11-17). [Practical CIB7 Coverage](PRACTICAL-CIB7-COVERAGE-TARGET.md), accepted on 2026-11-14, was a milestone toward it. Scope is settled in the documents the [owner intents](OWNER-INTENTS-REGISTER.md) list; this plan selects what is built and when, never what is in scope. Published tags stay as they are, `v0.2.0-rc.1` at `16c5b9f6`; no new version, tag or tag move is selected.

## Order gates

- The core shape (K0) passes the KD7 guards before any feature is moved onto it, and every open row maps onto it.
- Parity (K2) equals the current kernel on every retained scenario, population scenario, committed publication and admission decision, except the designated changes below, each with its own red/green witness. A mismatch is classified (kernel defect, current-kernel defect, designated change), never absorbed by adjusting the baseline.
- The State laws are re-established (K4) before P6 (K5) starts. K5 starts with its costliest obligation (the E-units and settle-agreement), so its calibration is re-checked first.
- A track's fill starts only when its row fixtures, scenarios and CIB evidence exist, so rows turn red to green against an answer fixed before the code. Agreement between Lean and TypeScript is a transcription check, never evidence of meaning.
- A stage an owner item blocks does not start; independent stages continue. The blocked part of a stage is named in its row.
- **Stop conditions.** A stage that has used a quarter of its budget with less than a sixth of its exit done (1.5× the projected rate) stops and is reported to the owner with the boundary reached and the next decision. A stage that misses its budget stops, is recorded for the owner, and work continues on the next independent stage. A budget is never renewed silently.

## Budgets

Every budget is raw agent time measured by a calibration spike (the [proposal's calibration](REWRITE-2-PROPOSAL.md#calibration-checkpoint-3)), times a delivery factor measured from history, in active hours.

- **Delivery factor (measured 2026-11-17 from git).** The first rewrite (`ffa9ed391..b176b25fe`, 2026-11-08 to 11-14) inserted about 88,600 lines over 821 commits in 119 active clock-hours with parallel agents, about 745 lines per active hour, including reviews, hosted cycles and fix rounds. Spike rates were about 27–30 proved Lean lines per minute and about 100 TypeScript lines per minute, so raw spike time converts to delivered time at about **×2.5 for Lean** and **×8 for TypeScript**. Where a spike did not split its time between the two, the budget shows both ends. Method limits: gross insertions; a port of known designs; any hour with a commit counts as active.
- **Production factor.** A rate measured on a prototype model rather than the real kernel is multiplied by ×3.0 first (spike T4c, per unit at an unchanged line rate).
- **Day equivalence.** 119 active hours spanned 7 calendar days, about 17 active hours per day with up to three agents.
- **Unmeasured.** A budget with an unmeasured part carries the mark and its reason; the stop condition covers it.

## Mechanism tracks, then rows

Rewrite-2 is delivered as stages, each a mechanism track in the sense of [CLAUDE.md](../CLAUDE.md#delivery): one combined review of meaning and structure per stage, which also approves the rows it closes. K stages are sequential; A, H and P start after K2 and run beside K3–K6, up to three tracks at a time on disjoint files.

| Stage | Content (design items) | Depends on | Exit | Raw (source) | Budget, active hours | Unmeasured or blocked |
|---|---|---|---|---|---|---|
| K0 core shape | structural keys, issue log and commit-time numbering, compaction, pruned counter map with the ghost issue history, `Std.ExtTreeMap` state, fuel-free scope readers, KD7 guards, T13's removal of internal fields from the publication (KD1, KD2′, KD7, PD2's engine half) | — | KD7 guards green; the 53 units read only structural keys; `atCommit_eq_sequential` holds for the real log | Lean 2.5–2.9 h: KD1 move 1.3 h (T4c), history restatement 0.5–0.9 h (T4e), readers 0.3 h (T4c rate, transfer), publication fields 0.2 h (T12); TypeScript about 0.5 h (transfer: equal to the executable Lean share, as T2 and T9b measured) | 10–11 | the compaction re-key lemma over about 60 positions (unmeasured); the Signal receiver-order surrogate (open design risk, KD1); the new KD7 guards (transfer from T2b, 1.1 min per guard edit) |
| K1 TypeScript pair and scenarios | the TypeScript transcription of K0 module by module, kernel unit suite, runner | K0 | both kernels agree on every unit case and scenario | inside K0's TypeScript figure | inside K0 | the TypeScript share beyond the executable move (T4a's ×5–10 never measured) |
| K2 parity | every retained scenario, population scenario, publication and admission decision against the current kernel | K1 | equal, or a classified designated change with its witness | — | 8 | **unmeasured**: transfer from W0.2's budget of 2 days, which the first rewrite met; triage time depends on mismatches |
| K3 closure as units | the closure as a choice among enabled units with register-fixed priorities, idle, finish and re-offer as enabledness conditions, #120's register entry (KD3) | K2 | the 11 order variants of T7T8 agree on every scenario where CIB evidence decides, and the register records the order | TypeScript 0.55 h (T7T8); Lean executable transfer 0.55 h | 6 | the Lean executable (transfer); the L1 and L2 arguments move to K5 |
| K4 State laws | the `Laws.State` subtree over structural identities (KD6) | K3 | every former State law proved, no `sorry` | 2 h (T5, real subtree) | 5–8 | the doubling for changed feature bodies (T5's own mark) |
| K5 concurrency (P6) | footprint-soundness lemmas (KD2′), the declarative walk and its checker (KD4), the origin invariant U1, the 12 E-units, the ghost provenance pairing with its 7 `Account` bridges (KD8), settle-agreement L0–L2, `SchedulesAgree` (KD5) | K4 | `SchedulesAgree` proved for the registered hooks under `Laws.Flow.Apart`; lane review approves | 12.2–14.0 h: footprints 3.2 (T4c), walk and checker 2.3 (T4b), U1 2.0 (T4c), E-units 2.4 (T4c, ×3 included), ghost core 1.5–2.5 (T4e, ×3 included), pairing 0.25–0.5 (T4d), bridges 0.5–0.75 (T4e) | 31–35 | the L1 re-offer and L2 finish arguments; the assembly of `SchedulesAgree` from the pieces; the U1 mechanisms that need freshness invariants (T4c's list) |
| K6 witness-only laws | the eight law families proved against the registered hooks (T8) | K4 | each family proved or disclosed with its reason | 0.5 h (T7T8, `Laws.Correlation` rate) | 1.5 | `Subscriptions.Rules` and the rules stated over a start's result |
| A1 reader closure | the containment walk and classification table for all metamodel types (AD6), the Activiti alias (T44), admission closed against BPMN validity and CIB deployment errors with the variant-matrix guard (AD7) | K2 | the completeness guard passes for all 121 concrete types; the 307 probes each admit with a row or refuse with a code | TypeScript 1.5–2.5 h (T43); AD7 refusal rules at T1b's 3–17 min per item | 15–25 | the semantic choice and register entry per inert row; DI and `Documentation` rows |
| A2 breadth | the inert tier (AD1), every refusal reported (AD2), the breadth rows with their IL fields (AD3) | A1 | the 109-model census admits the counts T1a projects, per tier | about 2 h for the measured classes (T1b) | 5–16 | about 7 items that add state or runtime, 7–28 h raw (**unmeasured**); OD1 blocks the `class` and `delegateExpression` binding rows; one hosted evidence replay per profile change (HD5) |
| A3 value domain | Double, then negative Integer and Date, each arm its own closure (AD4) | K2 | each arm end to end in both kernels, Java's string forms exact, ripple green | 2.5 h (T2, T2b) | 6–20 | about 17 Java oracle sites, about 40 spec and register units, corpus and hosted evidence; OD3 blocks the raised bounds |
| A4 runtime gaps | the dynamic-only codes classified (AD5), the codes whose reading exists resolved, the single-scenario CIB probe procedure | K3 | every dynamic-only code classified; the four cheap codes resolved red/green | about 1 h for 4 codes (T9b) | 3–8 | 6 codes need CIB witnesses, 1 a new option, 4 cross-feature compensation-context state (**costly, unmeasured**), 3 mechanism gaps (job model, closure order); cold interpretation reviews |
| H1 effect contract | the public effect package, per-protocol queues, idempotency key, retries to incidents, the four effect-boundary defects (HD1, T47) | K2 | the example Worker type-checks importing only the public package; memory-host tests green; hosted queue routing green | TypeScript 3–4 h (T11) | 24–32 | queue routing, retries and timeouts on a real server (hosted); OD1 blocks the binding tokens `expression` and `topic` |
| H2 population ingress | registry shards with a spread by chain digest, serialized commands, the watermark Timer ledger, the compact registry, paged lookups (HD2, T48) | K2 | the 95 population scenarios agree; a host test reaches each stated capacity and its code | TypeScript 0.5–1 h (T15) plus the compact registry about 2 h (transfer) | 20–24 | throughput, Update limits and replay CPU (hosted, OD4); OD14 blocks the identity bound and shard rows |
| H3 engine API and host gaps | general cancellation as an input, queueing beyond 32 pending Activities, the start-lifecycle deadlines, Signal and Conditional entry points, DMN resources, variable commands (HD3, HD4) | K2 | each gap end to end on the memory host; hosted lane green | 1.25–1.5 h engine side (T17) | 10–12 | the Product 2 operator surfaces (historically about 4 days each, `c818dec47`); OD11 blocks the queueing rows |
| P1 platform contracts | per-request identity and authorization ports (PD1), the public publication schema with decoders and the held state (PD2), the profile digest and capability mapping (PD3), the agreement test over Operate's projection (PD4) | H1 | PD4 green on every scenario, single-instance and population, with history completeness | about 3 h (T12 measured 55 min of it) | 24 | history completeness; the held-state interpretation review; hosted PostgreSQL; OD6 blocks the `formData` form kind |
| P2 operating at scale | change-driven publication and incremental read models (PD6), halts that suspend visibly (PD7), the generator-driven differential (PD8) | P1 | Work, Incidents and Metrics beyond 100 instances on the hosted lane; a halted instance visible as suspended | PD6 and PD7 about 2 h coding (T27); PD8 generator 1.5 h measured for 7 families plus about 2.8 h for 13 more (T40, transfer) | 16 for PD6 and PD7; 35 for PD8 | shared-mode volume (about 5,000 lines at T27's rate); OD12 blocks the rollover hold; OD5 blocks the Timer-start activation (PD9); OD13 blocks the two operator capabilities |
| P3 documentation | adopter guides and API reference (PD5); the document verdicts of the proposal | P1 | each guide exercised against the example Worker | — | 8 | **unmeasured**: transfer from this preparation's own writing rate |
| R release gate | the five persisted-history approvals (OD7), Worker versioning, the replay-fixture lane | everything above | owner approvals recorded | — | — | OD7 |

Totals, from the rows above: K0–K6 about 62–70 active hours; A about 29–69; H about 54–68; P about 83; together about 228–290 active hours, 13–17 days at the first rewrite's pace. The largest single stage, K5 (P6), is about 31–35 hours, about a quarter of the first rewrite's 119 hours, against P6's never-measured 23–33 agent-day design estimate. Unmeasured parts are not in these totals; each is named in its row and covered by the stop condition.

Designated behavior changes at K2: a never-issued key below a removed subtree reads stale (`interrupted-before-wait`) instead of failing an invariant (`lost_case`, KD1); a held activity is published as held, not active, after its interpretation review (PD2). The join keeps its public firing choice; only internal keys change (T4c).

## Rewrite versus targeted fixes

Both options keep the IL, the evaluator, Decision, Correlation, Starts, admission apart from its concurrency walk, the rule-only laws, the host and the platform, so stages A, H, P and R are the same under both. Both pay, from the same spikes: the footprint lemmas (3.2 h raw), the walk and checker (2.3 h), U1 (2.0 h), the E-units (2.4 h), the ghost pairing and bridges (2.25–3.75 h), settle-agreement and its unmeasured L1 and L2 arguments, and the law families.

| | Rewrite (KD1, KD3) | Targeted fix (option B) |
|---|---|---|
| Only this side pays, measured | the key move 1.3 h (T4c); the issue-history restatement 0.5–0.9 h (T4e); the State-law re-proof about 2 h (T5); the closure as units 0.55 h TypeScript (T7T8). About 4.4–4.8 h raw, about 11–12 active hours | per-hook equivariance about 1.4 min per hook, 53 units about 1.2 h raw (T4f); commutation of the firing blocks that identity order permutes, 16 min and 506 lines for the simplest of about 8–10 (batch kind × firing kind) cases, 2.1–2.7 h raw (T4g); renaming the called-instance strings in about 31 readers, 1.3–1.8 h raw (T4g); the lane restated over full-state `Sim` and composed over inputs, proved (T4g). At least 4.6–5.7 h raw, at least 11.5–14 active hours |
| Only this side pays, unmeasured | the compaction re-key lemma over about 60 positions; the Lean executable of the closure as units; the Signal receiver-order surrogate (KD1's open risk). All three are local to the core | the costlier firing cases (with outputs, which re-enter `offerWrites`; interrupting; Event Sub-Process starts; compensation-recording triggers; conditioned outflow; compensation handler begins); `Reorder` congruence for each of 53 units, known to fail for parked arrivals (T4f); a block relation carrying provenance, because an Event Sub-Process start's queued `.begin` forms a second permuted block that `absorb` does not take up (`Step.lean:224-229`, `Feature/Subscriptions.lean:398`); the freshness invariant behind each issuing hook. These cross Subscriptions, Step, Flow, Data and Compensation |
| Class of the remaining risk | local to the new core | a cross-feature commutation proof, the class P6's design table underestimated 6–11× |

**Reading.** On measured cost the two are even: the rewrite's extra is about 4.4–4.8 h raw, the targeted fix's at least 4.6–5.7 h raw, both about 11–14 active hours, under a tenth of the plan. They differ in what stays unmeasured. The rewrite's remainder sits in the core it builds. The targeted fix's remainder is a cross-feature commutation over permuted firing blocks, of which spike T4g proved only the simplest case, plus a congruence that already fails for one slot (`parked`) and a block relation that needs the ghost provenance KD8 introduces anyway. A hybrid that keeps the counter but sorts the three order-by-identity hooks by a schedule-independent key needs that key to be structural down to the scope chain, which is KD1. **Recommendation: the rewrite of the core (KD1, KD3).** It is not chosen for a measured saving, which does not exist. It is chosen because it removes, by construction, the one cost class this project has repeatedly mispriced, and it does so at an equal measured price. What would reverse it: a measured costlier firing case under 20 min with no provenance in the block relation, which would make the targeted fix's remainder local too.

## Owner-blocked work

Each item waits for the owner with the proposal's recommendation ([recommendations](REWRITE-2-PROPOSAL.md#recommendations-awaiting-the-owner)); implementation covers only what none of them blocks.

| Item | Blocks |
|---|---|
| OD1 binding registry | A2's `class` and `delegateExpression` rows; H1's `expression` and `topic` tokens |
| OD2 promise restatements | the KD7 guard for hook defaults per field class (K0 builds the others); the review-checklist and engineering-policy moves; the `Value` exception |
| OD3 ratified bounds | A3's and H's raised value, state and Run bounds |
| OD5 Timer-start activation | PD9 in P2 |
| OD6 forms | P1's `formData` form kind |
| OD7 persisted-history approvals | R |
| OD10 typed footprints | nothing: KD2′ is the default |
| OD11 queueing consequences | H3's queueing rows |
| OD12 rollover hold | PD6's hold in P2 |
| OD13 operator capabilities | the two capabilities in P2 |
| OD14 identity bound and shard rows | H2's identity bound and shard capacity rows |

## Proof wave

Closed on 2026-11-16 (P0–P5, P7, P8) at code head `bca882990`, with P6's `SchedulesAgree` open and disclosed; its history is in the [kernel status map](kernel/KERNEL-STATUS-MAP.md#open-proof-lanes) and the [proof-wave reconciliation record](PRACTICAL-CIB7-COVERAGE-TARGET.md#proof-wave-reconciliation-record). Its rules (one `Laws` module per executable module, no proof-motivated executable code, no `decide` of `Step`, a lane review per lane, a law never weakened) carry into K4–K6. P6 resumes as K5.

## W0: the kernel

Closed on 2026-11-14: the first rewrite delivered the modular kernel (W0.0–W0.4), the mechanism tracks M1–M12 and integration, and the owner accepted Practical CIB7 Coverage ([PC-ACCEPT-02](PRACTICAL-CIB7-COVERAGE-TARGET.md#pc-accept-02-acceptance-record)). It is the calibration source for this plan's delivery factor.

## Verification cadence

Locally: the kernel build of touched modules, the kernel runner, TypeScript type checks and unit tests, and the fast guard suite ([local loop](kernel/ENGINEERING-POLICY.md#local-loop)). Docker, the Temporal server, PostgreSQL, browsers, the CIB oracle suites and other long-running lanes run in hosted CI on the pushed branch, once per stage, which is also the landing gate; a hosted failure is reproduced locally only by its narrowest command. CIB evidence for new scenarios and each profile change is produced in one batched hosted run per stage (HD5).

## Delegation

HIGH stage agents author kernel feature, admission and laws modules in Lean and their TypeScript pairs on disjoint files, and run only narrow builds of their own modules under the shared project lock; an agent that finds the lock held waits and retries. MEDIUM agents build against an exact contract a deterministic check settles (fixtures, scenarios, models, the reader's classification rows, documentation sweeps); LOW agents execute fully specified procedures. The root alone accepts shape edits, runs full builds, the full runner and every hosted lane, and integrates.

## Landed stages

| Stage | Landed | Elapsed against budget | Stalls | Design risks found |
|---|---|---|---|---|

## Exact resume point

Active work: rewrite-2, Product 2 as the goal (owner direction, 2026-11-17).

Current task: the rewrite-2 preparation is complete when this plan and the [proposal](REWRITE-2-PROPOSAL.md) pass one cold HIGH review, which replaces the owner's approval (owner direction, 2026-11-17); its required changes get at most one audit. Practical CIB7 Coverage stays accepted (2026-11-14); the [post-acceptance reconciliation record](PRACTICAL-CIB7-COVERAGE-TARGET.md#post-acceptance-reconciliation-record) covers the fixes since.

Next action: on the review's green light, K0.

Owner items: OD1–OD3, OD5–OD7, OD10–OD14, each with a recommendation in the proposal; none blocks K0.

Oracle: the guardrails, both kernels and the retained CIB evidence on every scenario.

Stop if the path requires SDK work, a new dependency, a workaround, a scope change, a restated or removed architecture promise or a raised ratified bound without the owner's approval.
