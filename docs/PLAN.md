# Plan

Execution order and resume state live here; linked owners retain contracts.

## Current checkpoint

M0 through M6 and Horizons 1 and 2 are closed. The [production lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract) owns the retained Product 1 floor; [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) owns its current evidence boundary and deployment correction.

The sole delivery target is [Practical CIB7 Coverage](PROJECT-DESIGN.md#practical-cib7-coverage); the [maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) retains historical labels. [Alpha](MUE-PREVIEW-ALPHA-SPEC.md) and [Beta](MUE-PREVIEW-BETA-SPEC.md) retain their `phase/mue-preview-alpha` and `phase/mue-preview-beta` tags. The seven RC boundaries remain historical evidence; the practical coverage goal below owns selected scope.

### MUE Preview Beta critical path

`MUE-PREVIEW-BETA` is a delivery checkpoint, not an eighth content ID. Its exhaustive content gate is the seven rows below; each row names the smallest independently evidenced boundary Beta consumes.

| Content ID | State | Exact Beta boundary | Evidence or next-gate owner |
|---|---|---|---|
| `SEQUENTIAL-MULTI-INSTANCE` | `satisfied` | Closure-reviewed end-to-end vertical slice. | [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) |
| `INTERNAL-COMMUTATION` | `satisfied` | Approved first green final-implementation semantic checkpoint. | [Internal Commutation review receipt](INTERNAL-COMMUTATION-PROPOSAL.md#independent-cold-review-receipt) |
| `PARALLEL-MULTI-INSTANCE` | `satisfied` | Closure-reviewed end-to-end vertical slice. | [Parallel Multi-Instance specification](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) |
| `MECHANISM-MATURITY-EVIDENCE` | `satisfied` | Complete generated family evidence vector with no combined coverage claim. | [Mechanism-maturity classifications](SEMANTIC-VERIFICATION-POLICY.md#mechanism-maturity-classifications) |
| `DATA-AND-TASK-MECHANISMS` | `satisfied` | Closure-reviewed direct Activity input and output vertical slices. | [Input specification](capsules/ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) and [output specification](capsules/ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md) |
| `EVENT-SUBSCRIPTIONS` | `satisfied` | Closure-reviewed Message key-correlation vertical slice across source, both semantic accounts, and Temporal. | [Message key-correlation specification](capsules/MESSAGE-KEY-CORRELATION-SPEC.md) |
| `COMPENSATION-TRANSACTIONS` | `satisfied` | First independently reviewed end-to-end compensation or Transaction vertical checkpoint. | [Compensation trigger and handler proposal](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#stage-boundary) |

`satisfied` means only that the exact Beta boundary in that row is green; it does not claim full MUE closure.

#### Risk-first execution bands

These closed bands retain the Beta evidence boundary; [the integration specification](MUE-PREVIEW-BETA-SPEC.md) owns their closure.

| Order | State | Band | Exit condition; deferred work |
|---|---|---|---|
| 1 | `satisfied` | Subscription population/concurrency | Barrier-linearized complete discovery, pending-registration exclusion, all-or-infrastructure fanout, result reservation, and settle-before-next order. |
| 2 | `satisfied` | Subscription delivery/recovery | Same-target response-loss recovery, contradiction quarantine without rematch, Worker replacement, and replay. |
| 3 | `satisfied` | Boundary-handler eligibility/lifetime | Exact ordinary/current Multi-Instance User Task eligibility, zero-item identity, all-success priority and capacity; no Multi-Instance Sub-Process retention. |
| 4 | `satisfied` | Event Sub-Process snapshots | Preserve complete Process/Sub-Process parent context, provisional per-instance snapshots, promotion, and exact failed/interrupted/cancelled purge before triggering. |
| 5 | `satisfied` | Compensation order/cancellation | Execute deterministic dependency-aware handlers, nested cancellation, and failure outcomes through the first semantic vertical checkpoint. |
| 6 | `satisfied` | Cross-Workflow durability | Compensation and correlation-ingress continuation, capacity, replacement, and replay have independently reviewed private checkpoints. |
| 7 | `satisfied` | Capability and evidence closure | Registered evidence, corpus/disclosure, Product 2, cost and independent closure; broader Compensation deferred. |
| 8 | `satisfied` | Beta integration | Compose the Product 2 preview, disclose limits, pass the clean complete gate and review, and tag Beta. |

Integration state: `satisfied`.

[Beta closure](MUE-PREVIEW-BETA-SPEC.md) owns the immutable checkpoint; RC closes the boundaries below.

### MUE Release Candidate critical path

`MUE-RELEASE-CANDIDATE` freezes the historical seven content IDs below; it is not an eighth content ID. Practical coverage is separate.

| Content ID | State | Exact RC closure boundary | Evidence or closure owner |
|---|---|---|---|
| `SEQUENTIAL-MULTI-INSTANCE` | `satisfied` | Retain the closure-reviewed collection-driven User Task profile, including ordered aggregation and outer-Timer interruption; no additional Multi-Instance host is selected for RC. | [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) |
| `INTERNAL-COMMUTATION` | `satisfied` | Close internal scheduling for the complete selected RC capability surface under the approved scope amendment, retaining exhaustive classifications, finite independent batches, canonical publication, private choice guarantees, and the existing Temporal admission boundary. Unresolved capability dependencies block RC closure. | [RC completion scope amendment](INTERNAL-COMMUTATION-PROPOSAL.md#rc-completion-scope-amendment) |
| `PARALLEL-MULTI-INSTANCE` | `satisfied` | Retain the closure-reviewed bounded parallel User Task profile, including all/first completion, cancellation, capacity, aggregation, and outer-Timer interruption; no additional Multi-Instance host is selected for RC. | [Parallel Multi-Instance specification](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) |
| `MECHANISM-MATURITY-EVIDENCE` | `satisfied` | Reconciled generated family vector, executable corpus union, requirement/CIB measures, and Product 2 disclosures; no combined support percentage. | [Mechanism-maturity classifications](SEMANTIC-VERIFICATION-POLICY.md#mechanism-maturity-classifications) |
| `DATA-AND-TASK-MECHANISMS` | `satisfied` | Compose one required scalar direct input and output on the same User Task occurrence while retaining the implemented User Task and Service Task profiles; no new Task subclass is selected for RC. | [Composed Activity data specification](capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md) |
| `EVENT-SUBSCRIPTIONS` | `satisfied` | Close reusable Message/Timer subscription lifetime across the admitted catch and Activity-boundary loci, including repeatable non-interrupting paths, deterministic completion/trigger races, and exact scope cleanup. | [Repeatable subscription specification](capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md) |
| `COMPENSATION-TRANSACTIONS` | `satisfied` | Register the reviewed Compensation account as a public capability and close one bounded Transaction Sub-Process cancellation path through compensation and a Cancel Boundary Event. | [Public Compensation registration](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#public-registration-implementation) and [Transaction specification](capsules/TRANSACTION-CANCELLATION-SPEC.md) |

The historical RC feature surface freezes only after all seven rows are `satisfied`. Its qualification permits stabilization; Practical CIB7 Coverage advances independently without rewriting RC evidence. `H3-WORKLOAD-ISOLATION` stays in Engine `v0.3`, while `CONFORMANCE-CLOSURE` stays in Engine `v0.9`.

Integration state: `satisfied`.

[The project tag policy](../CLAUDE.md#project-tags) and [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints) own the historical RC phase realignments. Preserve the published `v0.2.0-rc.1` distribution at `16c5b9f6`, Alpha/Beta tags, and the existing bounded native-runtime risk exception. MUE acceptance has not passed and is no longer a separate work item; no further tag move is authorized.

### Practical CIB7 Coverage goal

The owner selected Practical CIB7 Coverage on 2026-10-03, superseding separate MUE acceptance, and reconfirmed on 2026-10-04. MUE RC was sufficient; Practical CIB7 Coverage alone governs showing and releasing. Review depth and combinations within the [CIB7 ceiling](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering). Both Multi-Instance Sub-Process forms remain required; the inventory determines priority.

| Added obligation | State | Acceptance boundary |
|---|---|---|
| `SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS` | `queued` | Collection-driven repeated subprocess work, per-instance identity/data isolation, completion and outer interruption; exact CIB-supported data behavior is selected in the proposal. |
| `PARALLEL-MULTI-INSTANCE-SUBPROCESS` | `queued` | Concurrent subprocess instances, completion accounting, selected early completion and cancellation; exact CIB-supported result handling is selected in the proposal. |

Acceptance covers source/Lean/TypeScript, CIB evidence, Temporal refinement/replay and whole-model journeys across the reviewed inventory. No separate MUE gate or new version/tag; preserve release evidence and failures.

## Ordered work

Exactly one stable work ID is active. Required maps govern routing.

### External-review correction checklist

The six external reviews/audits are complete; [evidence](capsule-costs/REVIEW-AND-WORKFLOW-LEDGER.md#repair-closure-costs) is retained. No finding is reopened.

1. `STRUCTURED-PROCESS-COMPOSITION` · **later** · Owner: [composition proposal](capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve the private checkpoint; hosting, registration and closure remain deferred.
2. `CALL-ACTIVITY-DATA-BOUNDARIES` · **later** · Owner: [Call data proposal](capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve approved scalar semantics and private recovery; registration is implemented, but independent public qualification failed and closure remains open.
3. `INTERRUPTING-MESSAGE-EVENT-SUBPROCESS` · **later** · Owner: [Message handler proposal](capsules/INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-PROPOSAL.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve the independently approved private checkpoint at `c2132704`; hosting, registration and closure remain deferred.
4. `CIB7-PRACTICAL-COVERAGE` · **active** · Owner: [Practical CIB7 Coverage inventory](PRACTICAL-CIB7-COVERAGE-TARGET.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: prioritize the owner-directed [assurance architecture repair](ASSURANCE-ARCHITECTURE-REPAIR-PROPOSAL.md) across Lean, TypeScript and causal guidelines/scripts. Preserve delivery checkpoint `2f38e92d` and the [parallel MI proof/acceptance boundary](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#entry-and-retirement-publication-checkpoint); both MI Sub-Process forms remain required.
5. `SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS` · **later** · Owner: [practical coverage goal](#practical-cib7-coverage-goal), [CIB scope ceiling](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Required practical scope; select the bounded account and implementation order through the coverage inventory.
6. `PARALLEL-MULTI-INSTANCE-SUBPROCESS` · **later** · Owner: [practical coverage goal](#practical-cib7-coverage-goal), [CIB scope ceiling](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Resume bounded parallel MI command closure after the selected business-task delivery gate; public closure remains open.
7. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Audit remaining standards claims within the CIB7 implementation ceiling; no implementation beyond that ceiling is selected.

[Balanced delivery](../CLAUDE.md#balance-semantic-breadth-and-usable-delivery) governs these batches; preserve failed evidence and the runtime-investigation hold. MUE acceptance stays superseded.

### Scheduled delivery batches

Owner-directed sequence (2026-10-09), within the [practical inventory](PRACTICAL-CIB7-COVERAGE-TARGET.md).

| Order | Outcome | Shared mechanism and exit |
|---|---|---|
| At qualification | Publish the approved security fix. | Runtime qualification blocks push; continue selected business delivery. Qualify clean HEAD before the authorized push. |
| At closure | Bind qualified delivery evidence. | Reporting `55d70e57` extends tracker/baseline `500c0af1`; [selected variants](PRACTICAL-CIB7-COVERAGE-TARGET.md#selected-behavioral-variants). Binding/drift checks pass; record qualified bindings at closure. Total remaining stays unknown until denominator review. |
| 1 | Close serial/mixed-task/business Error delivery. | Govern shared public overlay retention/start, candidate-group/string-form metadata and configured handlers; then installed-runtime, whole-model and independent closure evidence. |
| 2 | Close existing scope/Call and both MI Sub-Process slices. | Shared reachable ownership, data isolation, cancellation and publication; resumption/stable-wait guarantees, hosting/replay and public registration. |
| 3 | Extend business data/expressions. | Shared typed values, collections, scoped visibility, mappings and predicates. |
| 4 | Complete task/control/source breadth. | Plain/Manual, Send, Script, Rule, remaining gateway compositions and Link/interoperability; reuse effect/control contracts. |
| 5 | Complete event breadth. | Timer/Message loci and payloads, Signal/Conditional, Error/Escalation; shared subscription lifetime, eligibility and scoped handlers. |
| 6 | Extend Compensation/Transactions. | Targeting, repeated/MI retention, handler outcomes and Cancel propagation through shared retention/cancellation. |
| 7 | Qualify the integrated target. | Cross-family journeys, disclosures, production browser and distribution gates; owner acceptance. Release/version/scale decisions remain separate. |

Reuse reviewed models/evidence; retain review/resource limits. MEDIUM implements, HIGH accepts. Report progression only when requested.

## Current evidence

- Push qualification. Command: `./scripts/verify.sh runtime`. Status: `exit 1`. Date: `2026-10-09`. Commit: `d187fad4`. `/tmp/publication-runtime-d187fad4-20261009` passes infrastructure, source/core, CIB and port-free Temporal checks; live Temporal reports 398/399 with the repeatable-subscription child failing. Retained `node-crash.ips` records V8 GC SIGSEGV at `0xe`, consistent with [TD-003](TEMPORAL-DEFECTS-LEDGER.md#td-003-native-v8-garbage-collection-crash). Security audit passes with approved `source-map-js@1.2.2`; [published failure](https://github.com/mbackschat/bpmn-lean-experiment/actions/runs/37927827922) still checks `46632f02`. Push remains unqualified; retain TD-001 `/tmp/mue-prepush-3ee96954-v8-fixed-20261002`.

- Published RC evaluation. Command: `env BPMN_EVALUATION_PROJECT_NAME=mue-acceptance-rc1-1d11abc0 /tmp/mue-acceptance-distribution-1d11abc0/deploy/evaluation/demo start`. Status: `exit 0` for restart; browser qualification incomplete. Date: `2026-10-01`. Commit: `16c5b9f6`, fixed distribution source. Receipt: `/tmp/mue-bundle-restart`; browser evidence: `/tmp/mue-acceptance-distribution-1d11abc0/browser-receipt.json`. Docker Desktop restarts without building/pulling, retaining claimed parallel work and its sibling. Playwright reaches human approval, request changes, parallel completion, incident Retry and Cancel, with terminal History and Action history. Earlier unavailable Work/execution/audit reads remain failures. The browser shows `0.2.0-rc.1`, which still contains the selection defect. Rancher smoke remains open by owner direction. Task containers stopped; volumes/images retained.

## Exact resume point

Active work ID: `CIB7-PRACTICAL-COVERAGE`.

Current task: finish the evolving [whole-codebase assurance proposal](ASSURANCE-ARCHITECTURE-REPAIR-PROPOSAL.md) before further implementation, as directed by the owner. Lean, affected TypeScript and causal guidelines/scripts remain in scope.

Current result: the [proposal](ASSURANCE-ARCHITECTURE-REPAIR-PROPOSAL.md) records verified findings AA-01 to AA-26, area dispositions and the rows an approved revision authorizes; its [receipt](ASSURANCE-ARCHITECTURE-REPAIR-PROPOSAL.md#independent-cold-review-receipt) owns review state.

Next action: AA-21 with AA-12's Lean part, then AA-25; commit AA-07's pending red test with its fix; one cold checkpoint review for all three. Then AA-05, AA-26 and the AA-18 ordering part. Done: AA-14 to AA-17, AA-24, Amendment 1, AA-12 script/TypeScript part. Owner-deferred: AA-03/04/08/09/19/22, AA-18 family extension. Residuals: endpoint fuel derivation, per-consumer batch walks, AA-24's 23-hypothesis search. Held: AA-11/AA-13/AA-20/AA-23. One MEDIUM agent at a time; batch reviews (tight budget).

Last verification: full Lean library `/tmp/aa17-full-library-20261010` (854 jobs, exit 0, tree of `dd60ed91`); focused script guards green per commit.

Unresolved: remaining assessment amendments; PMIS resumption, stable-wait and complete publication; testkit batch 13; hosted qualification under TD-001/TD-002. Preserve [SDK defects](TEMPORAL-DEFECTS-LEDGER.md): no SDK work, private rebuilds, performance or cold-library investigations.

Oracle: document guards and independent proposal review; subsequent implementation requires actual composed guarantees under the proposal and [PMIS command checkpoint](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#entry-and-retirement-publication-checkpoint).

Stop if implementation crosses a boundary the approved revision does not authorize.

Resource limits remain one Lean tree, one CPU/3 GiB, no extra swap. Preserve release tags, all stashes (including `f35bdd6b`, `76a2b017` and pending PMIS sources `9a443912`) and checkpoint `2f38e92d`.
