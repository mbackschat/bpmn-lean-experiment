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
| `INTERNAL-COMMUTATION` | `queued` | Close all operation and RuntimeState classifications, arbitrary finite independent frontiers, region footprints, canonical publication order, explicit scheduled choice, and Temporal admission. | [Internal Commutation proposal](INTERNAL-COMMUTATION-PROPOSAL.md) |
| `PARALLEL-MULTI-INSTANCE` | `satisfied` | Retain the closure-reviewed bounded parallel User Task profile, including all/first completion, cancellation, capacity, aggregation, and outer-Timer interruption; no additional Multi-Instance host is selected for RC. | [Parallel Multi-Instance specification](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) |
| `MECHANISM-MATURITY-EVIDENCE` | `queued` | After semantic freeze, reconcile the generated family vector, executable corpus union, requirement/CIB measures, and Product 2 disclosures without a combined support percentage. | [Mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) |
| `DATA-AND-TASK-MECHANISMS` | `active` | Compose one required scalar direct input and output on the same User Task occurrence while retaining the implemented User Task and Service Task profiles; no new Task subclass is selected for RC. | [Composed Activity data proposal](capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-PROPOSAL.md) |
| `EVENT-SUBSCRIPTIONS` | `queued` | Close reusable Message/Timer subscription lifetime across the admitted catch and Activity-boundary loci, including repeatable non-interrupting paths, deterministic completion/trigger races, and exact scope cleanup. | [Requirement ledger](BPMN-REQUIREMENT-LEDGER.md) and [extensions research](research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) |
| `COMPENSATION-TRANSACTIONS` | `queued` | Register the reviewed Compensation account as a public capability and close one bounded Transaction Sub-Process cancellation path through compensation and a Cancel Boundary Event. | [Compensation requirement](BPMN-REQUIREMENT-LEDGER.md#reviewed-requirements) and [trigger account](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) |

Risk order is executable in Ordered work: data lifetime first, then internal scheduling, subscription races, Compensation/Transaction cancellation, evidence reconciliation and feature freeze, and RC qualification. The feature surface freezes only after all seven rows are `satisfied`; subsequent RC work may repair cross-family defects and evidence only, not add features. `H3-WORKLOAD-ISOLATION` stays in Engine `v0.3`, while `CONFORMANCE-CLOSURE` stays in Engine `v0.9`.

Integration state: `queued`.

For the current MUE programme, the owner authorizes pushes at the triggers in [the three-level verification policy](TESTING-SPEC.md#three-level-verification-policy) after every selected pre-push entry point passes. This authorizes neither pushing an unverified target nor bypassing a required review or gate.


## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

### External-review correction checklist

Owner instruction on 2026-09-05: resolve the supplied six reviews before resuming RC implementation. `R1`–`R6` identify those reports. Confirm each finding against source; close defects with separating evidence and the required review. Intentional exclusions require an accurate contract, not new feature admission.

- [x] Validate and classify every finding; reconcile conflicting recommendations.
- [ ] Correct assurance and deployment overclaims (`R1`, `R2`, `R5`, `R6`).
- [x] Repair regional cancellation, quiescence, and Lean removal completeness (`R2`, `R6`).
- [x] Measure E1; remove demonstrated fixture-reduction amplification (`R4`).
- [ ] Close runtime-invariant binding and preservation gaps (`R1`, `R2`, `R6`).
- [x] Repair footprint, preparation, rollback, commutation, and publication guarantees (`R3`).
- [x] Correct Compensation dependency defects and disclose the bounded cancellation, ownership, and failure contract (`R6`).
- [ ] Repair Temporal deployment/recovery and complete omitted hosting checks (`R5`).
- [x] Bind source-order and fixture/scenario evidence independently for the reported fixtures (`R1`).
- [ ] Complete correction audits, consumer measurements, and full verification; then resume RC.

The [seven-byte capacity correction](capsules/COMPENSATION-EMPTY-STATE-CAPACITY-REPAIR-PROPOSAL.md) supplies the declaration minimum used by the closure-reviewed [initialization repair](capsules/RUNTIME-INITIALIZATION-ASSURANCE-REPAIR-SPEC.md). The unchanged empty-state theorem and actual committed-start guarantees passed complete Product 1 verification and initialization closure review at `64c524b7`. Comparative repair costs are recorded; capacity retains its own pending closure review, and no weaker aggregate is selected.

Within the dependency order below, prioritize high-risk work before packaging and acceptance work. Treat likely broad Lean changes—shared representations, quantified proof dependencies, and kernel-reduction consumers—as an explicit risk signal, and establish those checkpoints before lower-risk profile registration, corpus/disclosure, or UI integration.

1. `DATA-AND-TASK-MECHANISMS` · **active** · Owner: [composed Activity data proposal](capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-PROPOSAL.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Implement the bounded composed Activity input/output lifetime before any new Task subclass or host effect.
2. `INTERNAL-COMMUTATION` · **queued** · Owner: [internal commutation proposal](INTERNAL-COMMUTATION-PROPOSAL.md), [Semantic Process internal scheduling](SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling), [Lean proof obligations](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Generalize the proved exact-pair checkpoint into complete operation-family classification, arbitrary finite independent batches over disjoint semantic and region footprints, canonical state and publication order, and exact semantic input for genuinely observable choice.
3. `EVENT-SUBSCRIPTIONS` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [extensions research](research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) · Action: Close the selected reusable Message/Timer subscription lifetime and deterministic completion/trigger race boundary.
4. `COMPENSATION-TRANSACTIONS` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [Compensation trigger account](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md) · Action: Register public Compensation, then close the bounded Transaction cancellation path without weakening cancellation, retry, replay, or failure evidence.
5. `MECHANISM-MATURITY-EVIDENCE` · **queued** · Owner: [mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) · Maps: [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md) · Action: Reconcile the independent evidence denominators and disclosures only after the semantic feature surface is frozen.
6. `MUE-RELEASE-CANDIDATE` · **queued** · Owner: [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints), [testing specification](TESTING-SPEC.md) · Maps: [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) · Action: Run cross-family stabilization, final evidence reconciliation, release qualification, independent closure review, and exact-head checkpoint tagging without adding features.
7. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Continue Process Execution closure by normative dependency, semantic risk, practical reach, and the adopted [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder).

## Current evidence

- Retention and snapshot costs. Command: `docker run … ./scripts/lake.sh build <target>`. Status: `exit 0`. Date: `2026-09-01`. Commit: `cb7fd54e`, `6208f2e4`. Retention targets peak at 2,332,716 KiB; snapshot root closure is the sole new near-cap target at 2,929,256 KiB/33.59s, while current corrections have zero pressure/OOM events. Full measurements and acceptance chronology remain in the [snapshot incident](CAPSULE-COST-LEDGER.md#compensation-snapshot-resource-ceiling-incident), [continuation audit](CAPSULE-COST-LEDGER.md#parallel-metadata-and-cyclic-consumer-continuation), and [acceptance correction](CAPSULE-COST-LEDGER.md#snapshot-invariant-and-cgroup-acceptance-correction).
- Start-capacity assurance. Command: `fixed-3-GiB docker run … ./scripts/lake.sh build BpmnSemantics.CompensationSourceCompatibilityConformance`. Status: `exit 0` after three exact-bound OOM reproductions. Date: `2026-09-03`. Commit: `8ab3ba5f`. The final target completed in 15.00s at 2,324,123,648 cgroup bytes and 1,938,140 KiB RSS with every pressure/OOM counter zero. The [proposal](capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-PROPOSAL.md#lean-assurance-correction-after-the-hard-ceiling) retains the exact 3,221,225,472-byte failures, full chronology, and rejected limit/native-decision alternatives.

## Exact resume point

Active work ID: `DATA-AND-TASK-MECHANISMS`.

Risk band: external-review corrections; RC implementation is held.

Complete Product 1 verification passed at `64c524b7`. The [Temporal reconciliation](TEMPORAL-TEST-EVIDENCE-MAP.md#external-review-question-reconciliation), [runtime inventory](RUNTIME-STATE-INVARIANT-SPEC.md#collection-to-conjunct-inventory), and [Compensation contract](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) own the exact evidence and remaining limits.

Next action: settle the server-admitted-but-undelivered closing-Task Update case in the [evidence map](TEMPORAL-TEST-EVIDENCE-MAP.md#temporal-witness-and-mutation-inventory); complete [native deployment closure](TEMPORAL-WORKER-DEPLOYMENT-REPAIR-PROPOSAL.md#scope-review-and-closure), [capacity closure](capsules/COMPENSATION-EMPTY-STATE-CAPACITY-REPAIR-PROPOSAL.md#independent-cold-review-receipt), [start-data closure](capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-PROPOSAL.md#independent-cold-review-receipt), and the [composed Activity-data audit](capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-PROPOSAL.md#independent-cold-review-receipt). Their receipts own stage decisions.

Blockers: the session's agent-thread limit prevents further independent reviews; repeated host, IPv4, and container download failures block the pinned Docker smoke. Initialization alone reused its original reviewer. Resume in a fresh review session with package-download access; no self-approval or pin substitution.

Oracle: one User Task activation copies the required Process input into its occurrence-owned local scope, and one accepted completion atomically routes its required output to Process scope and disposes that same local scope across source, Lean, the semantic core, publication, and Temporal refinement.

Stop if a correction weakens `runtimeStateWellFormed`, admits a checked identity alias, leaves Lean and TypeScript value-domain behavior unequal, creates separate input/output lifetimes for one Activity occurrence, exposes speculative output, loses absence-versus-null, selects a new Task host or expression runtime, makes Temporal persistence semantic authority, or broadens beyond this one input/output proposition.
