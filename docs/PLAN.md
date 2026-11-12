# Plan

Delivery order, budgets and the resume point. The [kernel architecture](kernel/ARCHITECTURE-SPEC.md) owns the design, the guardrails and the definition of done; the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) owns each row's acceptance; the [kernel status map](kernel/KERNEL-STATUS-MAP.md) owns what is implemented and open per row. This file and the status map change only at a milestone or track closure, or at a stop.

## Goal

The sole delivery target is [Practical CIB7 Coverage](PRACTICAL-CIB7-COVERAGE-TARGET.md), bounded by CIB Seven `2.2.0`. Retain the [Product 1 floor](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) and the historical [Alpha](MUE-PREVIEW-ALPHA-SPEC.md) and [Beta](MUE-PREVIEW-BETA-SPEC.md) boundaries; MUE acceptance is superseded without claiming it passed. Preserve published tags, `v0.2.0-rc.1` at `16c5b9f6`; no new version, tag or tag move is selected.

## Order gates

Order gates bind alongside the day budgets, because a budget of days cannot fire on work that takes hours. Nothing builds on a kernel shape until guards 17 to 21 pass on it and every open row maps onto it. A track's fill starts only when its row fixtures, scenarios and CIB evidence exist, so rows turn red to green against an answer fixed before the code. Agreement between Lean and TypeScript is a transcription check, never evidence of meaning.

## W0: the kernel

| Milestone | Content | Exit | Budget |
|---|---|---|---|
| W0.0 | process reset: `CLAUDE.md` rewritten, process and document guards deleted | fast suite green | 0.5 day |
| W0.1 | module skeleton, guards, vocabulary schema, row traceability map and fixtures, state slots, a vertical slice (Start, User Task, Exclusive Gateway, End) through every layer, retargeted `lake.sh` | every row fixture decodes; measurement plan passes; architecture checkpoint approves | 1 day |
| W0.2 | Lean kernel parity against the frozen old evaluators, largest profiles first | every scenario, population scenario, admission decision and committed publication equals the baseline or carries a classified mismatch; the inflation probe passes | 2 days |
| W0.3a | TypeScript kernel transcribed from the Lean executable modules | differential agreement on every scenario | 1 day, parallel to W0.2's second day |
| W0.3b | contracts re-cut, generic Temporal host, engine API, CIB runner options, platform types and history view | hosted CI green, including the Temporal witnesses | 3 days |
| W0.4 | old library, core, adapter code, guards and documents deleted after extraction; the proposal graduated to the [kernel architecture](kernel/ARCHITECTURE-SPEC.md) | complete hosted verification green; land on `main` | 0.5 day |

W0 budget: seven days from approval (168 hours); with the tracks and integration, about 14 calendar days from approval to Practical CIB7 Coverage acceptance, before the proof wave. The parity baseline (the old evaluators' results, bound to each scenario's digest and never given to a runner) was deleted with the old stack at W0.4; each parity mismatch was classified as a kernel defect, an old-evaluator defect or a lifted refusal owned by a track, and the baseline was never adjusted.

## After W0

In order, each before the next starts:

1. Profile consolidation, closed with W0 (`3a10a909`): one BPMN 2.0.2 standards profile, one cumulative CIB Seven 2.2.0 profile and its scope-chain variant ([profiles](kernel/ARCHITECTURE-SPEC.md#profiles)); the CIB 2.0.0 profiles retired into 2.2.0 and every retained CIB result was regenerated on 2.2.0. The abnormal-scope refusals resolved under CIB-INT-0007; Sub-Process-level Data Objects as declared items pass to PC-DATA-04, the default expression language to PC-DATA-07 and Send Task implementations to M3.
2. Scenario and evidence batch, closed (`5f170b34`): open-row witnesses for M1–M9 under `scenarios/open-rows/`, CIB Seven `2.2.0` evidence for 709 scenarios from one batched hosted run, and the [disagreement ledger](../packages/differential/test/cib-disagreement-ledger.json) classifying all 530 kernel disagreements under their open rows or `CIB-LIM-0004` and `CIB-LIM-0005`. Witnesses the CIB runner cannot yet run carry no evidence, and each track realizes its own before its fill: Decimal, List, Map, Double and negative Integer values and the condition languages (M2); delivery payloads, correlation and name-based delivery (PC-HUM-03, PC-MESSAGE-01, PC-MESSAGE-08); numbering of parallel Multi-Instance continuations and hosts and of cycle successors (M5, M6); a timer due at arming (PC-TIMER-01); starts of processes without a None Start and every population scenario, whose witnesses are held outside the repository (M8); overlay effect bindings of registered scenarios. The CIB projection orders ties by engine identifiers, reproducibly since every scenario starts from the boot identifiers, but outside the canonical contract: same-named local variables in the root list (PC-DATA-04), candidate users (PC-HUM-02) and parallel Multi-Instance inputs (M5). CIB itself orders compensation handlers whose subscriptions share one instant by the hash order of their identifiers, so a frozen-clock compensation witness gives a reproducible but arbitrary handler order (M9). The kernel reader admits XSD-invalid documents (an `operationRef` attribute, misordered artifacts), which the BPMN 2.0.2 XSD forbids; verification now XSD-validates registered models, and the reader's own check belongs to the admission work of M1.
3. Pilot rows, closed on 2026-11-10 (`336a99ea`): PC-ERROR-01 and PC-AUTO-02 done; PC-MI-02 a slice whose cardinality generation form waits for M2's core JUEL level and whose per-instance argument and result values belong to PC-MI-10's mapping surface.
4. Mechanism tracks M1–M9, then the integration track.

## Mechanism tracks, then rows

The mechanism tracks run in parallel, up to three at a time, each by its own HIGH agent on its own feature, admission, laws and TypeScript modules, with the root integrating, accepting shape edits, running full builds and reviewing. A track ends when its mechanism and its rows' scenarios are green. Every open or held row appears once:

| Track | Rows |
|---|---|
| M1 flow and gateways | PC-CF-02, PC-CF-03, PC-CF-04, PC-CF-05, PC-CF-06, PC-CF-07, PC-CF-08, PC-BASIC-01, PC-BASIC-02, PC-BASIC-03, PC-BASIC-04, PC-HUM-05 |
| M2 data and expressions | PC-DATA-02, PC-DATA-03, PC-DATA-04, PC-DATA-05, PC-DATA-06, PC-DATA-07, PC-DATA-08, PC-DATA-09 |
| M3 work and effects | PC-HUM-01, PC-HUM-02, PC-HUM-03, PC-HUM-06, PC-AUTO-01, PC-AUTO-02, PC-AUTO-03, PC-AUTO-04, PC-AUTO-05, PC-AUTO-06, PC-AUTO-07, PC-AUTO-08 |
| M4 scopes | PC-SCOPE-01, PC-SCOPE-02, PC-SCOPE-06, PC-SCOPE-07, PC-TERMINATE-01, PC-TERMINATE-02 |
| M5 Multi-Instance | PC-MI-01 to PC-MI-12 |
| M6 subscriptions | PC-TIMER-01, PC-TIMER-02, PC-TIMER-03, PC-TIMER-05, PC-TIMER-06, PC-TIMER-07, PC-TIMER-08, PC-MESSAGE-01, PC-MESSAGE-03, PC-MESSAGE-04, PC-MESSAGE-05, PC-MESSAGE-06, PC-MESSAGE-07, PC-SIGNAL-03, PC-CONDITION-01, PC-CONDITION-03, PC-CONDITION-04, PC-CONDITION-05 |
| M7 throw and propagation | PC-ERROR-01, PC-ERROR-02, PC-ERROR-03, PC-ESCALATION-01, PC-ESCALATION-02, PC-ESCALATION-03, PC-MESSAGE-09, PC-SIGNAL-01 |
| M8 population | PC-TIMER-04, PC-MESSAGE-02, PC-MESSAGE-08, PC-SIGNAL-02, PC-SIGNAL-04, PC-CONDITION-02, PC-SCOPE-03 |
| M9 compensation and Transaction | PC-COMPENSATION-01 to PC-COMPENSATION-05, PC-TX-01, PC-TX-02, PC-TX-03 |
| I integration | PC-DELIVERY-01 (held), PC-JOURNEY-01 to PC-JOURNEY-07, PC-QUALIFY-01 to PC-QUALIFY-10 (PC-QUALIFY-03 held), PC-ACCEPT-01, PC-ACCEPT-02 |

M2 opens with the core JUEL level; rows in other tracks whose acceptance needs its expressions close after their level ([evaluation](kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step)), and every other row proceeds on Simple Boolean.

Budgets: M1–M9 five days across three parallel tracks; integration and qualification two days; the proof wave follows acceptance. Each track reports elapsed time against its budget. A missed budget is reported to the owner at once with the boundary reached and the next decision; it is never renewed silently.

## Verification cadence

Locally: the kernel build of touched modules, the kernel runner, TypeScript type checks and unit tests, and the fast guard suite ([local loop](kernel/ENGINEERING-POLICY.md#local-loop)). Docker, the Temporal server, PostgreSQL, browsers, the CIB oracle suites and other long-running lanes run in hosted CI on the pushed branch, once per milestone or track, which is also the landing gate; a hosted failure is reproduced locally only by its narrowest command. CIB evidence for new scenarios is produced in one batched hosted run per track.

## Delegation

HIGH track agents author kernel feature, admission and laws modules in Lean and their TypeScript pairs on disjoint files, and run only narrow builds of their own modules (`./scripts/lake.sh build Kernel.Feature.<F>`, `Kernel.Laws.<F>` and `Kernel.Run` for their own scenarios) under the shared project lock; an agent that finds the lock held waits and retries. The root alone accepts shape edits, runs full builds, the full runner and every hosted lane, and integrates. Agents never run heavy lanes. Workers on scenarios and models stay MEDIUM. The guards, the architecture checkpoint and the track review replace the old rule that only the root writes Lean.

## Exact resume point

Active work: Practical CIB7 Coverage, through the [kernel architecture](kernel/ARCHITECTURE-SPEC.md) (owner direction 2026-11-08).

Current task: track M12, PC-CONDITION-03 and -04 through an explicit choice input for simultaneously true Conditional items ([#117](https://github.com/mbackschat/bpmn-lean-experiment/issues/117)), then the integration track, step 4 of the [after-W0 sequence](#after-w0); 92 of 115 rows are done. The pilot rows closed on 2026-11-10 (`336a99ea`): PC-ERROR-01 and PC-AUTO-02 done, PC-MI-02 a slice. Wave 1 closed eight rows on 2026-11-10 against retained CIB evidence (receipt `c07dc2e3`): PC-CF-06, PC-BASIC-04, PC-HUM-05, PC-DATA-03, PC-DATA-04, PC-HUM-06, PC-AUTO-07 and PC-AUTO-08. Wave 2 (M4, M5, M7) landed on 2026-11-10 (`19abb5ab`); M4's review closed PC-SCOPE-02, -06, -07 and PC-TERMINATE-01, M5's closed PC-MI-02 and M7's closed PC-ESCALATION-01 and, once its R1 landed, PC-ERROR-02 (2026-11-11). The M6 track review closed eight rows on 2026-11-11: PC-TIMER-01, -02, -05, -07, PC-MESSAGE-05, -07, PC-CONDITION-01 and -05; and PC-TIMER-06 and PC-MESSAGE-04 once CIB-EXT-0038 and the split witnesses met the review's conditions; its other eight rows stay open, PC-CONDITION-03 on CIB's arbitrary gateway arm order ([#79](https://github.com/mbackschat/bpmn-lean-experiment/issues/79)). The M8 track review closed seven rows on 2026-11-11 once its required changes landed (population-scoped instance Workflow IDs, a host refusal for cross-deployment Calls, four normative texts): PC-TIMER-04, PC-MESSAGE-02, -08, PC-SIGNAL-02, -04, PC-SCOPE-03 and PC-CONDITION-02. The M9 track review closed six rows on 2026-11-12 once its required changes landed (no handler begun by a run an interrupting catcher drops, handler order along Sequence Flow paths through Gateways and intermediate Events, one account of what an element writes, each Multi-Instance instance's own item in its snapshot, Cancel Ends among the throws that refuse implicit compensation, a handler read from its `isForCompensation` mark, three register entries for the remaining CIB differences): PC-COMPENSATION-01, -03, -05, PC-TX-01, -02 and -03; PC-COMPENSATION-02 and -04 stay open ([#103](https://github.com/mbackschat/bpmn-lean-experiment/issues/103), [#104](https://github.com/mbackschat/bpmn-lean-experiment/issues/104)). The M10 track review closed eighteen rows on 2026-11-12 once its required changes landed (synchronous Send Tasks inside CIB-EXT-0023, every M10 disagreement owned, evidence the register still called pending retired): PC-CF-03, -04, -05, -07, -08, PC-BASIC-02, PC-SCOPE-01, PC-TERMINATE-02, PC-DATA-02, -05, -06, -07, -08, -09 and PC-AUTO-01, -03, -04 and -05; PC-BASIC-03 closes with the final accepted cohort, and PC-AUTO-06 waits for a durable-scheduling Script witness on the Temporal host and the Multi-Instance body context. The M11 track review closed twenty-seven rows on 2026-11-12 once its required changes, two further CIB evidence retakes and a green hosted Temporal lane landed: PC-MI-01, -03 to -12, PC-HUM-01, -03, PC-TIMER-03, -08, PC-MESSAGE-01, -03, -06, -09, PC-SIGNAL-01, -03, PC-ERROR-03, PC-ESCALATION-02, -03, PC-COMPENSATION-02, -04 and PC-AUTO-06; PC-CONDITION-03 and -04 stay open, since their acceptance covers two Conditional items true at one evaluation, which the kernel refuses until a choice input exists.

Deliverable after W0: the [after-W0 sequence](#after-w0), then mechanism tracks M1–M9 and the integration track.

Acceptance blockers: PC-DELIVERY-01 and PC-QUALIFY-03 stay held until re-qualified against the generic Temporal host ([owner decision](kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path)).

Owner items: none open; the owner packet (proof wave, JUEL levels, Script runtime, decision engine, Cron dialect, the two holds) was decided on 2026-11-08.

Effort budget: W0's 168 hours from approval; the tracks five days across three in parallel, integration two days.

Next action: track M12, an interpretation item and its cold review for the choice input of simultaneously true Conditional items before one shape commit, then PC-CONDITION-03 and -04 against their [retained witnesses](../scenarios/open-rows/) and the entries they own in the [disagreement ledger](../packages/differential/test/cib-disagreement-ledger.json); then the integration track, with PC-BASIC-03 closing on the final accepted cohort.

Oracle: the guardrails, both kernels and the retained CIB evidence on every scenario.

Stop if the path requires SDK work or a new dependency without the owner's approval.
