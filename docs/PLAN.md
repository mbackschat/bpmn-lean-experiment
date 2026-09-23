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
| `INTERNAL-COMMUTATION` | `active` | Close internal scheduling for the complete selected RC capability surface under the approved scope amendment, retaining exhaustive classifications, finite independent batches, canonical publication, private choice guarantees, and the existing Temporal admission boundary. Unresolved capability dependencies block RC closure. | [RC completion scope amendment](INTERNAL-COMMUTATION-PROPOSAL.md#rc-completion-scope-amendment) |
| `PARALLEL-MULTI-INSTANCE` | `satisfied` | Retain the closure-reviewed bounded parallel User Task profile, including all/first completion, cancellation, capacity, aggregation, and outer-Timer interruption; no additional Multi-Instance host is selected for RC. | [Parallel Multi-Instance specification](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) |
| `MECHANISM-MATURITY-EVIDENCE` | `queued` | After semantic freeze, reconcile the generated family vector, executable corpus union, requirement/CIB measures, and Product 2 disclosures without a combined support percentage. | [Mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) |
| `DATA-AND-TASK-MECHANISMS` | `satisfied` | Compose one required scalar direct input and output on the same User Task occurrence while retaining the implemented User Task and Service Task profiles; no new Task subclass is selected for RC. | [Composed Activity data specification](capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md) |
| `EVENT-SUBSCRIPTIONS` | `queued` | Close reusable Message/Timer subscription lifetime across the admitted catch and Activity-boundary loci, including repeatable non-interrupting paths, deterministic completion/trigger races, and exact scope cleanup. | [Requirement ledger](BPMN-REQUIREMENT-LEDGER.md) and [extensions research](research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) |
| `COMPENSATION-TRANSACTIONS` | `queued` | Register the reviewed Compensation account as a public capability and close one bounded Transaction Sub-Process cancellation path through compensation and a Cancel Boundary Event. | [Compensation requirement](BPMN-REQUIREMENT-LEDGER.md#reviewed-requirements) and [trigger account](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) |

Risk order is executable in Ordered work: data lifetime first, then internal scheduling, subscription races, Compensation/Transaction cancellation, evidence reconciliation and feature freeze, and RC qualification. The feature surface freezes only after all seven rows are `satisfied`; subsequent RC work may repair cross-family defects and evidence only, not add features. `H3-WORKLOAD-ISOLATION` stays in Engine `v0.3`, while `CONFORMANCE-CLOSURE` stays in Engine `v0.9`.

Integration state: `queued`.

Owner instruction on 2026-09-08 supersedes the earlier MUE push authorization: do not push without an explicit new instruction. Continue local implementation, commits, required reviews, and the applicable gates in [the three-level verification policy](TESTING-SPEC.md#three-level-verification-policy).

## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

### Pending regional trial

Owner decision, 2026-09-20: the regional checkpoint trial remains pending in the RC queue, outside the completed [architecture/workflow review follow-up](CAPSULE-COST-LEDGER.md#architecture-and-workflow-review-follow-up-2026-09-20). Its observations remain receipt span/union, contemporaneous repeat-work records, commit purpose, and unchanged assurance. Preserve complete gates, guarantees, and required semantic reviews; the review fixes do not establish trial success or change RC scope.

### External-review correction checklist

The six reviews supplied on 2026-09-05 and their correction audits are complete; the later [architecture/workflow review follow-up](CAPSULE-COST-LEDGER.md#architecture-and-workflow-review-follow-up-2026-09-20) has its own evidence and dispositions.

The closure-reviewed [seven-byte capacity correction](capsules/COMPENSATION-EMPTY-STATE-CAPACITY-REPAIR-SPEC.md) supplies the declaration minimum used by the closure-reviewed [initialization repair](capsules/RUNTIME-INITIALIZATION-ASSURANCE-REPAIR-SPEC.md). The unchanged empty-state theorem and actual committed-start guarantees remain intact; no general all-transition preservation theorem is claimed. The [cost ledger](CAPSULE-COST-LEDGER.md#repair-closure-costs) owns contiguous measurements and comparisons.

Within the dependency order below, prioritize high-risk work before packaging and acceptance work. Treat likely broad Lean changes—shared representations, quantified proof dependencies, and kernel-reduction consumers—as an explicit risk signal, and establish those checkpoints before lower-risk profile registration, corpus/disclosure, or UI integration.

The [ordinary snapshot arming and complete pipeline correspondence outcomes](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#independent-cold-review-receipt) are accepted. The [RC admission assessment](INTERNAL-COMMUTATION-PROPOSAL.md#rc-admission-dependency-assessment) excludes mixed composite arming only from the five retained restricted profiles; it preserves the unfinished bounded checkpoint and leaves future subscription/Transaction combinations unresolved. Next, establish the selected subscription capability's admission and reachable frontiers, then identify only the scheduling obligations those frontiers require before implementation. Compensation registration remains downstream of that risk-first assessment. Preserve every existing finite-batch, validity/projectability, canonical publication, refusal, rollback, replay, and Temporal-admission guarantee. No aggregate-invariant programme or further family-pair expansion is selected.

1. `INTERNAL-COMMUTATION` · **active** · Owner: [internal commutation proposal](INTERNAL-COMMUTATION-PROPOSAL.md), [Semantic Process internal scheduling](SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling), [Lean proof obligations](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Classify remaining obligations against current and selected future RC capabilities under the approved scope amendment, then close required complete outcomes with unchanged guarantees. Do not expand the family-pair matrix without an established RC dependency.
2. `EVENT-SUBSCRIPTIONS` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [extensions research](research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) · Action: Close the selected reusable Message/Timer subscription lifetime and deterministic completion/trigger race boundary.
3. `COMPENSATION-TRANSACTIONS` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [Compensation trigger account](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md) · Action: Register public Compensation, then close the bounded Transaction cancellation path without weakening cancellation, retry, replay, or failure evidence.
4. `MECHANISM-MATURITY-EVIDENCE` · **queued** · Owner: [mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) · Maps: [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md) · Action: Reconcile the independent evidence denominators and disclosures only after the semantic feature surface is frozen.
5. `MUE-RELEASE-CANDIDATE` · **queued** · Owner: [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints), [testing specification](TESTING-SPEC.md) · Maps: [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) · Action: Run cross-family stabilization, final evidence reconciliation, release qualification, independent closure review, and exact-head checkpoint tagging without adding features.
6. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Continue Process Execution closure by normative dependency, semantic risk, practical reach, and the adopted [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder).

## Current evidence

- Snapshot pipeline correspondence. Command: `./scripts/pnpm.sh run test:pre-push:verify`. Status: `exit 0`. Date: `2026-09-24`. Commit: `55cebd6fa18cbc38f5bc1eaefc10fdfda2b0fc8a`. Clean Product 1 integration passes the 36 private Compensation schedules, all 72 registered pipeline cases, and 83 replayed histories. The [review receipt](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#independent-cold-review-receipt) records independent approval and ten adversarial publication/observation checks. Public registration and broader admission remain open.
- Start-capacity assurance. Command: `fixed-3-GiB docker run … ./scripts/lake.sh build BpmnSemantics.CompensationSourceCompatibilityConformance`. Status: `exit 0` after three exact-bound OOM reproductions. Date: `2026-09-03`. Commit: `8ab3ba5f`. The final target completed in 15.00s at 2,324,123,648 cgroup bytes and 1,938,140 KiB RSS with every pressure/OOM counter zero. The [specification](capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-SPEC.md#lean-assurance-correction-after-the-hard-ceiling) retains the exact 3,221,225,472-byte failures, full chronology, and rejected limit/native-decision alternatives.

## Exact resume point

Active work ID: `INTERNAL-COMMUTATION`.

Risk band: RC internal scheduling; the six external reviews and composed Activity-data closure are complete.

Next action: use the [RC admission assessment](INTERNAL-COMMUTATION-PROPOSAL.md#rc-admission-dependency-assessment) to establish the selected Message/Timer subscription capability's exact admission and reachable frontiers, including repeatable non-interrupting paths, completion/trigger races, and scope cleanup. Record the required scheduling dependencies before production implementation; current-profile exclusions do not settle future subscription or Transaction compositions. Both snapshot arming and complete private scenario/publication correspondence are independently accepted. Preserve the unfinished bounded Sub-Process checkpoint and pending regional trial. Neither proof-architecture experiment is adopted; no further proof infrastructure is selected.

Accepted: [Timer-task arming](INTERNAL-COMMUTATION-PROPOSAL.md#timer-task-arming-outcome), the [standalone Activity-data arming](INTERNAL-COMMUTATION-PROPOSAL.md#standalone-activity-data-arming-outcome) and [exact Merge/private scheduling](INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome) outcomes; their [review receipt](INTERNAL-COMMUTATION-PROPOSAL.md#independent-cold-review-receipt) owns integration and resource evidence. Constructed scheduling witnesses establish no new profile reachability. Message child-scope exclusion and `AOO-RETAINED-BODY-01` remain unchanged.

Retain snapshot exclusion, predicate coverage, token multiplicity, the [3 GiB ceiling](CAPSULE-COST-LEDGER.md#package-wide-theorem-elaboration-memory-correction), and stashes `f35bdd6b0424b2e3d5d06f101eb822bd285ab29e` and `76a2b017a630d23203ded482227382003f296f0b`. Public/hosted scheduling, remaining families, and closure remain open.

Oracle: independent prepared operations preserve one another's complete preparation and commute in exact canonical RuntimeState and accepted publication; shared Process reads commute, conflicting writes and overlapping occurrence regions refuse batching, and a failed batch or schedule rolls back the complete command before publication.

Stop if a correction weakens runtime well-formedness, derives a footprint from successor-state differences, assumes intermediate preservation or final equality, hides an unclassified RuntimeState field or operation family, treats list order as semantic choice, admits scheduled Programs to Temporal, or broadens a semantic profile without its required review.
