# Plan

This file owns immediate execution order, blockers, current measured evidence, and the exact resume action. Durable decisions, implementation detail, semantic meaning, and test procedure belong in their linked owners. Completed work leaves this file after its current consequence has an owner; Git retains history.

## Current checkpoint

M0 through M6 and Horizons 1 and 2 are closed. The [production lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract) owns the retained Product 1 floor; [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) owns its current evidence boundary and deployment correction.

The non-binding [engine maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) names the closed Product 1 floor Engine `v0.1`, **Runnable MVP**, and Engine `v0.2`, **Minimum Useful Engine (MUE)**, as the current direction. The closure-reviewed [MUE Preview Alpha specification](MUE-PREVIEW-ALPHA-SPEC.md) is tagged at `phase/mue-preview-alpha`, and the closure-reviewed [MUE Preview Beta specification](MUE-PREVIEW-BETA-SPEC.md) is tagged at `phase/mue-preview-beta`. The sequence now returns to the selected [breadth and risk ordering](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering) toward the later [showcase acceptance milestones](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder).

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

Every row is satisfied. The closure-reviewed [MUE Preview Beta integration specification](MUE-PREVIEW-BETA-SPEC.md) integrates the checkpoints into one coherent Product 2 preview and discloses every remaining limit. Its exact release acceptance and complete clean path-selected gate are green at closure target `361911b8`; the same isolated reviewer approved the row-evidence correction at `8bcd8746`, and the immutable local `phase/mue-preview-beta` tag records the checkpoint. Content IDs with broader work now return to the queue for full MUE closure. `H3-WORKLOAD-ISOLATION` remains Engine `v0.3`; `CONFORMANCE-CLOSURE`, Engine `v0.9`, and reserved Engine `v1.0` remain later conditional boundaries.

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

Integration state: `active`.

All seven selected content boundaries are satisfied. The feature surface is frozen at the closure-qualified implementation `9fb6705b`; no new capability is selected. The immutable local `phase/mue-release-candidate` tag is the completion record after final integration gates and review. This is not Engine `v0.2` release approval, general BPMN conformance, or publication authorization. The receipt/graduation and freeze increment is non-material under the [review gate](TESTING-SPEC.md#independent-cold-review-gate): it records accepted boundaries without changing their meaning, admission or guarantees. Existing plan, review-receipt, link, maturity and corpus guards cover the integration records.

Owner instruction on 2026-09-08 supersedes the earlier MUE push authorization: do not push without an explicit new instruction. Continue local implementation, commits, required reviews, and the applicable gates in [the three-level verification policy](TESTING-SPEC.md#three-level-verification-policy).

## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

### Regional trial disposition

The regional trial observations are complete. The [recorded disposition](CAPSULE-COST-LEDGER.md#regional-workflow-trial-disposition-2026-09-26) retains unchanged assurance but establishes no productivity or elapsed-time gain. Qualification and selected-capability closure remain separate obligations.

### External-review correction checklist

The six reviews supplied on 2026-09-05 and their correction audits are complete; the later [architecture/workflow review follow-up](CAPSULE-COST-LEDGER.md#architecture-and-workflow-review-follow-up-2026-09-20) has its own evidence and dispositions.

The closure-reviewed [seven-byte capacity correction](capsules/COMPENSATION-EMPTY-STATE-CAPACITY-REPAIR-SPEC.md) supplies the declaration minimum used by the closure-reviewed [initialization repair](capsules/RUNTIME-INITIALIZATION-ASSURANCE-REPAIR-SPEC.md). The unchanged empty-state theorem and actual committed-start guarantees remain intact; no general all-transition preservation theorem is claimed. The [cost ledger](CAPSULE-COST-LEDGER.md#repair-closure-costs) owns contiguous measurements and comparisons.

Within the dependency order below, prioritize high-risk work before packaging and acceptance work. Treat likely broad Lean changes—shared representations, quantified proof dependencies, and kernel-reduction consumers—as an explicit risk signal, and establish those checkpoints before lower-risk profile registration, corpus/disclosure, or UI integration.

The selected scheduling amendment and bounded Transaction cancellation are independently closure-approved at `9fb6705b`; [their receipts](INTERNAL-COMMUTATION-PROPOSAL.md#independent-cold-review-receipt) and the [Transaction specification](capsules/TRANSACTION-CANCELLATION-SPEC.md#independent-cold-review-receipt) own the exact scope. The generated maturity vector, capability/corpus union, requirement/CIB measures and About restrictions are reconciled by their existing executable guards. The unfinished broader commutation proposal, wider Compensation/Transaction combinations and unselected proof families remain outside RC.

1. `MUE-RELEASE-CANDIDATE` · **active** · Owner: [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints), [testing specification](TESTING-SPEC.md) · Maps: [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) · Action: The immutable `phase/mue-release-candidate` tag targets `91b759a1356fbc7c9fd8698f8785ba87b4ec5419`. Complete the subsequent owner-requested UI evaluation fixes: typed URL navigation and browser history, neutral copy and layout, focused platform gates, and architecture documentation. Keep the tag unchanged; discuss the full-MUE plan before selecting later capabilities.
2. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Continue Process Execution closure by normative dependency, semantic risk, practical reach, and the adopted [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder) after owner selection.

## Current evidence

- Closure qualification. Command: `./scripts/verify.sh` phases and the corrected registered pipeline. Status: `exit 0` for the accepted component commands. Date: `2026-09-26`. Commit: `9fb6705b`. Clean library, execution-check and runtime phases pass at `6229db87`; its nine preliminary pipeline parity commands pass before the final assertion fails. The single test-oracle correction passes the complete registered pipeline at `9fb6705b`, leaving all successful parent-phase inputs unchanged. Both independent second correction audits approve the composition; [the Transaction receipt](capsules/TRANSACTION-CANCELLATION-SPEC.md#independent-cold-review-receipt) and [cost ledger](CAPSULE-COST-LEDGER.md#transaction-closure-correction-and-cost-2026-09-26) retain exact targets, failures and limits.

- Evidence reconciliation. Command: `./scripts/pnpm.sh run test:infrastructure`. Status: `exit 0`. Date: `2026-09-26`. Commit: `6229db87`. The infrastructure gate checks the generated family vector, separate requirement/CIB denominators and executable whole-model union. Product 2 consumes canonical capability restrictions, including bounded Transaction/Cancel support, without a new Transaction browser-catalog claim. Final Product 2, PostgreSQL, showcase and browser gates remain the integrated qualification boundary.

## Exact resume point

Active work ID: `MUE-RELEASE-CANDIDATE`.

Risk band: Post-tag UI evaluation corrections.

Owner instruction, 2026-09-26: continue autonomously; use affected-package checks and reserve complete verification for integrated qualification.

Latest owner sequence: finish RC with useful runnable UI showcases describing business purpose, BPMN elements, supported extent and evidence; tag RC, then prepare a full-MUE plan for discussion before implementation. The seven engine content IDs remain unchanged.

CPU constraint: root-owned Lean validation permits one process tree, one CPU, 3 GiB and no additional swap. Reuse warmed dependencies; report CPU-intensive validation completion.

Next action: evaluate the completed UI and diagram corrections in a restarted `demo:rc`. The six previously failing diagrams now generate exact-source-bound presentation with recursive coverage, and all twelve prepared RC definitions render in the live browser witness. The completed UI fixes are recorded at `ae442725`; the [information architecture acceptance](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md#acceptance) owns package, browser and visual evidence. The [diagram decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md#selected-generator) owns presentation-only coverage and exclusions. Keep the local RC tag fixed, preserve the separate full-MUE planning discussion, and do not push or declare Engine `v0.2` released.

Oracle: direct links and browser history restore exact public views, malformed selections stay nonactionable, drafts and uncertain actions retain their existing guarantees, copy and layout regressions pass, and the production bundle remains below its existing size boundary. The seven RC rows and immutable phase tag are unchanged.

Stop if qualification exposes unreviewed semantics or weaker guarantees. Preserve stashes `f35bdd6b0424b2e3d5d06f101eb822bd285ab29e` and `76a2b017a630d23203ded482227382003f296f0b`.
