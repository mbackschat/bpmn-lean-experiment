# Plan

This file owns immediate execution order, blockers, current measured evidence, and the exact resume action. Durable decisions, implementation detail, semantic meaning, and test procedure belong in their linked owners. Completed work leaves this file after its current consequence has an owner; Git retains history.

## Current checkpoint

M0 through M6 and Horizons 1 and 2 are closed. Horizon 2 Product 1 Workflow-chain production enrollment, handle-free start, content-bound recovery, closed v1 terminal receipts, private paired E1/E2 traversal, every approved capacity row, stop-the-world Worker deployment admission, and forced Intermediate Catch Message, Intermediate Catch Timer, and Service Task effect rollover are implemented under the [production lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract) and [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md). The complete gate passed at `c2f9a5d`; the same isolated reviewer approved the opaque Schedule-locator and cost-attribution correction at `5b9e028`. Those corrections changed hosting/API representation and persistence only, leaving the registered BPMN/CIB accounts, semantic-core traces, replay evidence, and published locator meaning unchanged.

The non-binding [engine maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) names the closed Product 1 floor Engine `v0.1`, **Runnable MVP**, and Engine `v0.2`, **Minimum Useful Engine (MUE)**, as the current direction. The closure-reviewed [MUE Preview Alpha specification](MUE-PREVIEW-ALPHA-SPEC.md) is tagged at `phase/mue-preview-alpha`. Beta follows the selected [delivery ladder](PROJECT-DESIGN.md#mue-delivery-checkpoints), [breadth and risk ordering](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering), and [showcase acceptance model](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder).

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
| 8 | `active` | Beta integration | Compose the Product 2 preview, disclose limits, pass the clean complete gate and review, and tag Beta. |

Integration state: `active`.

Every row is satisfied. The owner-approved [MUE Preview Beta integration proposal](MUE-PREVIEW-BETA-PROPOSAL.md) now integrates the checkpoints into one coherent Product 2 preview and discloses every remaining limit. Its exact release acceptance and complete clean path-selected gate are green at `b7ac924d`; closure review and the immutable local checkpoint tag remain. After Beta, content IDs with broader work return to the queue for full MUE closure. `H3-WORKLOAD-ISOLATION` remains Engine `v0.3`; `CONFORMANCE-CLOSURE`, Engine `v0.9`, and reserved Engine `v1.0` remain later conditional boundaries.

For the current MUE programme, the owner authorizes pushes at the triggers in [the three-level verification policy](TESTING-SPEC.md#three-level-verification-policy) after every selected pre-push entry point passes. This authorizes neither pushing an unverified target nor bypassing a required review or gate.

The [runtime-state identity bound](RUNTIME-STATE-INVARIANT-SPEC.md#layer-1-lifecycle-and-structure) and Activity-family issuing discipline supply the published outer-identity premises. User Task, Timer, and Activity identities are bounded; Message, Effect, Event race, Call, ordinary Scope, general preservation, and issuing disciplines outside Activity remain open without weakening this slice.

The owner-approved [internal commutation account](INTERNAL-COMMUTATION-PROPOSAL.md) has passed its first green final-implementation semantic checkpoint. The Semantic Process Program requires the closed `InternalSchedulingMode`, and every existing source lowerer emits `rejectObservableChoice`. The TypeScript core retains the proved exact-pair rule and atomically executes a complete finite frontier of ordinary User Task, Message, Timer, and effect arming operations when every unordered pre-state footprint pair is independent; it refuses a batch that exceeds remaining fuel before mutation and rolls a disappearing member back to the pre-batch state. Lean defines the same complete-frontier classifier and a three-User-Task discriminator whose six permutations reach one raw state. Both semantic accounts now classify every operation family and RuntimeState field under the proposal's exact cross-language mapping; the proposal-derived guard rejects independent additions and classification drift. The census enables no transition and defines no footprint. The context-cold reviewer approved correction target `fb998985` with no remaining findings, and the clean complete gate passed at `9bbc99e5`. Scheduled-choice consumption, region footprints, remaining operation-family preparations, the arbitrary-batch theorem, and Temporal scheduled-mode admission remain unimplemented. This checkpoint changes Program representation but adds no BPMN source shape, admitted profile, public command, or host capability.


## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

All seven exact Beta content boundaries are independently green. The private Compensation durability checkpoint is independently closure-reviewed at `b951330c` after correction `dfae0d9f`; registration, public Compensation capability, corpus, and Product 2 remain deferred after Beta. The [Message payload catch specification](capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md) is implemented, independently closure-reviewed, evidence-closed, and graduated at clean complete-gate target `0c34aace`. `DATA-AND-TASK-MECHANISMS` and broader Internal Commutation return after Beta.

The [Message key-correlation specification](capsules/MESSAGE-KEY-CORRELATION-SPEC.md) is implemented and independently closure-reviewed at target `a4acf21d` after correction `21697824`. The correction replaces an incomplete textual occurrence count with an AST-derived census of all direct and scheduled production Process-start constructors plus four independent host-input deletion mutations. Its exact standards-only profile, source/checked/IL preservation, independent Lean/core population contract, cross-Workflow Temporal recovery, target-free public operation, retained corpus/disclosure, and production Product 2 journey close the seventh Beta content boundary without claiming broader Message correlation.

The [interrupting Activity boundary Message specification](capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md) is implemented, independently closure-reviewed, evidence-closed, and graduated. Its registered standards-only profile, both answer-free winner schedules, exact Lean/core/Temporal agreement with `cib: null`, retained model and corpus map, Product 2 disclosure, and both stale-loser witnesses cover the bounded account. The closure correction excludes ledger-suppressed Message callbacks from semantic races while preserving genuine exact Signal/Update coalescence failure; the same reviewer approved that correction and the complete clean-target pre-push gate passed at `af3712c5`.

1. `MUE-PREVIEW-BETA` · **active** · Owner: [engine maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Obtain governed closure review for the clean integrated preview, graduate its specification, and create the immutable local Beta tag.
2. `DATA-AND-TASK-MECHANISMS` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [minimal engine research](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Broaden standard data lifetime and mappings before selecting executable Task profiles and host effects.
3. `INTERNAL-COMMUTATION` · **queued** · Owner: [internal commutation proposal](INTERNAL-COMMUTATION-PROPOSAL.md), [Semantic Process internal scheduling](SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling), [Lean proof obligations](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Generalize the proved exact-pair checkpoint into complete operation-family classification, arbitrary finite independent batches over disjoint semantic and region footprints, canonical state and publication order, and exact semantic input for genuinely observable choice.
4. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Continue Process Execution closure by normative dependency, semantic risk, practical reach, and the adopted [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder).

## Current evidence

- Retention and snapshot costs. Command: `docker run … ./scripts/lake.sh build <target>`. Status: `exit 0`. Date: `2026-09-01`. Commit: `cb7fd54e`, `6208f2e4`. Retention targets peak at 2,332,716 KiB; snapshot root closure is the sole new near-cap target at 2,929,256 KiB/33.59s, while current corrections have zero pressure/OOM events. Full measurements and acceptance chronology remain in the [snapshot incident](CAPSULE-COST-LEDGER.md#compensation-snapshot-resource-ceiling-incident), [continuation audit](CAPSULE-COST-LEDGER.md#parallel-metadata-and-cyclic-consumer-continuation), and [acceptance correction](CAPSULE-COST-LEDGER.md#snapshot-invariant-and-cgroup-acceptance-correction).
- Start-capacity assurance. Command: `fixed-3-GiB docker run … ./scripts/lake.sh build BpmnSemantics.CompensationSourceCompatibilityConformance`. Status: `exit 0` after three exact-bound OOM reproductions. Date: `2026-09-03`. Commit: `8ab3ba5f`. The final target completed in 15.00s at 2,324,123,648 cgroup bytes and 1,938,140 KiB RSS with every pressure/OOM counter zero. The [proposal](capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-PROPOSAL.md#lean-assurance-correction-after-the-hard-ceiling) retains the exact 3,221,225,472-byte failures, full chronology, and rejected limit/native-decision alternatives.

## Exact resume point

Active work ID: `MUE-PREVIEW-BETA`.

Risk band: Beta integration.

Checkpoint: all seven exact Beta content boundaries are independently green, and the Product 2 integration at `b7ac924d` presents them in their required order without changing the executable-capability denominator. The exact Beta release acceptance and complete clean path-selected pre-push boundary are green. This satisfies only the seven Beta boundary rows, not full closure of the underlying content families.

Next action: rerun the exact release acceptance and clean path-selected complete gate on the immutable closure-ready target, obtain cold closure review for the [MUE Preview Beta proposal](MUE-PREVIEW-BETA-PROPOSAL.md), graduate it, then create the immutable local Beta tag.

Oracle: Product 2 presents exactly the seven reviewed Beta boundaries, preserves separate BPMN, CIB, and platform denominators, reuses the existing real-Temporal journeys, discloses checkpoint-only and deferred breadth, and reaches a clean complete gate, governed review, and immutable tag without turning Beta integration into new semantic evidence.

Stop if integration selects new BPMN meaning, combines coverage denominators, treats a checkpoint as full content-family closure, exposes host identity, hides an open limit, or creates the Beta tag before the clean complete gate and review are green.
