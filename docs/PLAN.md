# Plan

This file owns immediate execution order, blockers, current measured evidence, and the exact resume action. Durable decisions, implementation detail, semantic meaning, and test procedure belong in their linked owners. Completed work leaves this file after its current consequence has an owner; Git retains history.

## Current checkpoint

M0 through M6 and Horizons 1 and 2 are closed. The [production lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract) owns the retained Product 1 floor; [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) owns its current evidence boundary and deployment correction.

The non-binding [engine maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) names the closed Product 1 floor Engine `v0.1`, **Runnable MVP**, and Engine `v0.2`, **Minimum Useful Engine (MUE)**, as the current direction. The closure-reviewed [MUE Preview Alpha specification](MUE-PREVIEW-ALPHA-SPEC.md) is tagged at `phase/mue-preview-alpha`, and the closure-reviewed [MUE Preview Beta specification](MUE-PREVIEW-BETA-SPEC.md) is tagged at `phase/mue-preview-beta`. The owner selected bounded MUE acceptance on 2026-09-28; the seven RC capability boundaries below remain frozen.

### MUE Preview Beta critical path

`MUE-PREVIEW-BETA` is a delivery checkpoint, not an eighth content ID. Its exhaustive content gate is the seven rows below; each row names the smallest independently evidenced boundary Beta consumes.

| Content ID | State | Exact Beta boundary | Evidence or next-gate owner |
|---|---|---|---|
| `SEQUENTIAL-MULTI-INSTANCE` | `satisfied` | Closure-reviewed end-to-end vertical slice. | [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) |
| `INTERNAL-COMMUTATION` | `satisfied` | Approved first green final-implementation semantic checkpoint. | [Internal Commutation review receipt](INTERNAL-COMMUTATION-PROPOSAL.md#independent-cold-review-receipt) |
| `PARALLEL-MULTI-INSTANCE` | `satisfied` | Closure-reviewed end-to-end vertical slice. | [Parallel Multi-Instance specification](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) |
| `MECHANISM-MATURITY-EVIDENCE` | `satisfied` | Complete generated family evidence vector with no combined coverage claim. | [Mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) |
| `DATA-AND-TASK-MECHANISMS` | `satisfied` | Closure-reviewed direct Activity input and output vertical slices. | [Input specification](capsules/ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) and [output specification](capsules/ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md) |
| `EVENT-SUBSCRIPTIONS` | `satisfied` | Closure-reviewed Message key-correlation vertical slice across source, both semantic accounts, and Temporal. | [Message key-correlation specification](capsules/MESSAGE-KEY-CORRELATION-SPEC.md) |
| `COMPENSATION-TRANSACTIONS` | `satisfied` | First independently reviewed end-to-end compensation or Transaction vertical checkpoint. | [Compensation trigger and handler proposal](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#stage-boundary) |

`satisfied` means only that the exact Beta boundary in that row is green; it does not claim full MUE closure.

#### Risk-first execution bands

Unresolved concurrency, durability, cancellation, or retained-state risk in either unfinished Beta area outranks capability packaging and closure. Only its minimum contract, harness, gate, review, and documentation may precede the next risk band.

| Order | State | Band | Exit condition; deferred work |
|---|---|---|---|
| 1 | `satisfied` | Subscription population/concurrency | Barrier-linearized complete discovery, pending-registration exclusion, all-or-infrastructure fanout, result reservation, and settle-before-next order. |
| 2 | `satisfied` | Subscription delivery/recovery | Same-target response-loss recovery, contradiction quarantine without rematch, Worker replacement, and replay. |
| 3 | `satisfied` | Boundary-handler eligibility/lifetime | Implement the approved representation for exact ordinary/current Multi-Instance User Tasks, including zero-item identity, one-item-first all-success, and pre-commit capacity. Multi-Instance Sub-Processes remain excluded pending their multiplicity account. |
| 4 | `satisfied` | Event Sub-Process snapshots | Preserve complete Process/Sub-Process parent context, provisional per-instance snapshots, promotion, and exact failed/interrupted/cancelled purge before triggering. |
| 5 | `satisfied` | Compensation order/cancellation | Execute deterministic dependency-aware handlers, nested cancellation, and failure outcomes through the first semantic vertical checkpoint. |
| 6 | `satisfied` | Cross-Workflow durability | Compensation and correlation-ingress continuation, capacity, replacement, and replay have independently reviewed private checkpoints. |
| 7 | `satisfied` | Capability and evidence closure | Product 1, registered evidence, retained corpus/disclosure, Product 2, cost/reflection, clean complete gates, and independent closure review are green. Compensation breadth remains deferred after Beta. |
| 8 | `satisfied` | Beta integration | Compose the Product 2 preview, disclose limits, pass the clean complete gate and review, and tag Beta. |

Integration state: `satisfied`.

Every row is satisfied. The closure-reviewed [MUE Preview Beta integration specification](MUE-PREVIEW-BETA-SPEC.md) integrates the checkpoints into one coherent Product 2 preview and discloses every remaining limit. Its exact release acceptance and complete clean path-selected gate are green at closure target `361911b8`; the same isolated reviewer approved the row-evidence correction at `8bcd8746`, and the immutable local `phase/mue-preview-beta` tag records the checkpoint. The RC table below owns the subsequently closed implementation boundary. `H3-WORKLOAD-ISOLATION` remains Engine `v0.3`; `CONFORMANCE-CLOSURE`, Engine `v0.9`, and reserved Engine `v1.0` remain later conditional boundaries.

### MUE Release Candidate critical path

`MUE-RELEASE-CANDIDATE` is the integration and feature-freeze checkpoint, not an eighth content ID. The owner-selected MUE boundary is exactly the same seven content IDs as Beta, but an RC row closes its stated implementation boundary rather than accepting a representative checkpoint.

| Content ID | State | Exact RC closure boundary | Evidence or closure owner |
|---|---|---|---|
| `SEQUENTIAL-MULTI-INSTANCE` | `satisfied` | Retain the closure-reviewed collection-driven User Task profile, including ordered aggregation and outer-Timer interruption; no additional Multi-Instance host is selected for RC. | [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) |
| `INTERNAL-COMMUTATION` | `satisfied` | Close internal scheduling for the complete selected RC capability surface under the approved scope amendment, retaining exhaustive classifications, finite independent batches, canonical publication, private choice guarantees, and the existing Temporal admission boundary. Unresolved capability dependencies block RC closure. | [RC completion scope amendment](INTERNAL-COMMUTATION-PROPOSAL.md#rc-completion-scope-amendment) |
| `PARALLEL-MULTI-INSTANCE` | `satisfied` | Retain the closure-reviewed bounded parallel User Task profile, including all/first completion, cancellation, capacity, aggregation, and outer-Timer interruption; no additional Multi-Instance host is selected for RC. | [Parallel Multi-Instance specification](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) |
| `MECHANISM-MATURITY-EVIDENCE` | `satisfied` | Reconciled generated family vector, executable corpus union, requirement/CIB measures, and Product 2 disclosures; no combined support percentage. | [Mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) |
| `DATA-AND-TASK-MECHANISMS` | `satisfied` | Compose one required scalar direct input and output on the same User Task occurrence while retaining the implemented User Task and Service Task profiles; no new Task subclass is selected for RC. | [Composed Activity data specification](capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md) |
| `EVENT-SUBSCRIPTIONS` | `satisfied` | Close reusable Message/Timer subscription lifetime across the admitted catch and Activity-boundary loci, including repeatable non-interrupting paths, deterministic completion/trigger races, and exact scope cleanup. | [Repeatable subscription specification](capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md) |
| `COMPENSATION-TRANSACTIONS` | `satisfied` | Register the reviewed Compensation account as a public capability and close one bounded Transaction Sub-Process cancellation path through compensation and a Cancel Boundary Event. | [Public Compensation registration](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#public-registration-implementation) and [Transaction specification](capsules/TRANSACTION-CANCELLATION-SPEC.md) |

The completed risk-first sequence covers data lifetime, internal scheduling, subscription races and Compensation/Transaction cancellation. Ordered work now retains RC qualification after evidence reconciliation and feature freeze. The feature surface freezes only after all seven rows are `satisfied`; subsequent RC work may repair cross-family defects and evidence only, not add features. `H3-WORKLOAD-ISOLATION` stays in Engine `v0.3`, while `CONFORMANCE-CLOSURE` stays in Engine `v0.9`.

Integration state: `satisfied`.

The RC was published at `a637757c` under `phase/mue-release-candidate`; `91b759a1` retains the original qualification record and `9fb6705b` the closure-qualified semantic implementation. RC publication is complete; final MUE acceptance is not. The owner now authorizes one RC tag correction and guarded force push before CI completes, and will monitor the new run personally; this does not assert qualification success.

### MUE acceptance goal

Close Minimum Useful Engine acceptance for the frozen seven-capability RC scope: repair qualification and user-journey defects, demonstrate the complete supported journeys, reconcile exact-commit evidence and known limitations, and present the resulting boundary for explicit owner acceptance. After acceptance, record closure and create the immutable `engine/v0.2` milestone tag. Add no new capability or proof programme; reuse valid evidence and reserve complete verification for final integration.

## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

### External-review correction checklist

The six external reviews and correction audits are complete; the [cost ledger](CAPSULE-COST-LEDGER.md#repair-closure-costs) retains the repair evidence. No prior review finding is reopened by this acceptance cycle.

The selected scheduling and bounded Transaction accounts are independently closure-approved at `9fb6705b`; [scheduling receipts](INTERNAL-COMMUTATION-PROPOSAL.md#independent-cold-review-receipt) and the [Transaction receipt](capsules/TRANSACTION-CANCELLATION-SPEC.md#independent-cold-review-receipt) own their exact limits. Broader commutation, wider Compensation/Transaction combinations, unselected proof families, workload isolation and conformance expansion are outside this acceptance cycle.

1. `MUE-ACCEPTANCE` · **active** · Owner: [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints), [testing specification](TESTING-SPEC.md) · Maps: [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) · Action: Execute the acceptance priorities below; fix blockers within the frozen scope before final owner acceptance.
2. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Select later Process Execution work only after MUE acceptance; retain the adopted dependency, risk and practical-reach order.

| Priority | Task | Acceptance condition |
|---|---|---|
| P1 | Repair clean-checkout runtime qualification; inspect remaining CI verdicts. | Reproduce the build-output dependency in publication-schema fixtures, guard the class, pass the affected gates and the corrected runtime CI job. The owner-authorized RC tag correction precedes the CI verdict; qualification remains pending until green. |
| P2 | Validate supported user journeys using the [walkthrough](BPM-PLATFORM-BROWSER-WALKTHROUGH.md) and existing production-browser gates. | Discover and start a human process, claim/edit/complete its task, inspect outcome and Action history; retain navigation, disclosures, recovery and incident journeys. Human evaluation has no simulated participants. |
| P3 | Reconcile evidence, restrictions and final integrated qualification. | Every selected capability and advertised journey has applicable passing evidence; stale documentation is corrected; no failed, missing or in-progress gate is reported as acceptance. Reuse unchanged evidence and run missing release gates once. |
| P4 | Present the exact MUE acceptance boundary and record the decision. | Explicit owner acceptance closes all selected obligations before the immutable `engine/v0.2` tag. General BPMN conformance, production scale and package SemVer remain separate decisions. |

## Current evidence

- Closure qualification. Command: `./scripts/verify.sh` phases and the corrected registered pipeline. Status: `exit 0` for the accepted component commands. Date: `2026-09-26`. Commit: `9fb6705b`. Clean library, execution-check and runtime phases pass at `6229db87`; its nine preliminary pipeline parity commands pass before the final assertion fails. The single test-oracle correction passes the complete registered pipeline at `9fb6705b`, leaving all successful parent-phase inputs unchanged. Both independent second correction audits approve the composition; [the Transaction receipt](capsules/TRANSACTION-CANCELLATION-SPEC.md#independent-cold-review-receipt) and [cost ledger](CAPSULE-COST-LEDGER.md#transaction-closure-correction-and-cost-2026-09-26) retain exact targets, failures and limits.

- Published RC qualification inspection. Command: `gh run view 36366543661 --json jobs,status,conclusion`. Status: `exit 0` for inspection, not qualification. Date: `2026-09-28`. Commit: `a637757c`. [Runtime job](https://github.com/mbackschat/bpmn-lean-experiment/actions/runs/36366543661/job/108754023383) failed before package builds: publication-schema coverage imports a fixture that requires semantic-core build output. Lean was cancelled at the repository’s 30-minute cutoff after 524/692 jobs, losing its success-only cache. The runtime fixture repair is committed at `717da4a7`; the subsequent workflow correction adds recovery headroom and partial-cache saving. Dependency security, platform, PostgreSQL, showcase and UI workflows passed.

## Exact resume point

Active work ID: `MUE-ACCEPTANCE`.

Risk band: P1 clean-checkout runtime qualification.

Owner instruction, 2026-09-28: keep the RC feature scope frozen, prioritize bounded MUE acceptance, fix runtime CI and its cold-build timeout/cache mechanism, move the RC tag to the corrected latest commit, force-push once, and do not wait for CI completion. The owner will monitor CI; explicit MUE acceptance remains the final decision.

CPU constraint: root-owned Lean validation permits one process tree, one CPU, 3 GiB and no additional swap. Reuse valid warmed or hosted evidence; report CPU-intensive validation completion.

Next action: publish the guarded runtime and workflow corrections with the RC tag, then hand off CI monitoring to the owner. CI success is still required for P1 acceptance. Resume P2 and P3 after the verdict is known.

Oracle: clean-checkout runtime qualification succeeds; all seven capability rows remain unchanged; supported human journeys and final applicable gates pass with exact target evidence; disclosures retain limitations. Owner acceptance precedes the MUE tag.

Stop if qualification requires unreviewed semantic changes or weaker guarantees, or when the final owner acceptance decision is ready. Preserve stashes `f35bdd6b0424b2e3d5d06f101eb822bd285ab29e` and `76a2b017a630d23203ded482227382003f296f0b`.
