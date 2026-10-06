# Plan

This file owns execution order, blockers, current evidence and the exact resume action. Linked owners retain durable meaning and history.

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
| `MECHANISM-MATURITY-EVIDENCE` | `satisfied` | Complete generated family evidence vector with no combined coverage claim. | [Mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) |
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
| `MECHANISM-MATURITY-EVIDENCE` | `satisfied` | Reconciled generated family vector, executable corpus union, requirement/CIB measures, and Product 2 disclosures; no combined support percentage. | [Mechanism-maturity classifications](TESTING-SPEC.md#mechanism-maturity-classifications) |
| `DATA-AND-TASK-MECHANISMS` | `satisfied` | Compose one required scalar direct input and output on the same User Task occurrence while retaining the implemented User Task and Service Task profiles; no new Task subclass is selected for RC. | [Composed Activity data specification](capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md) |
| `EVENT-SUBSCRIPTIONS` | `satisfied` | Close reusable Message/Timer subscription lifetime across the admitted catch and Activity-boundary loci, including repeatable non-interrupting paths, deterministic completion/trigger races, and exact scope cleanup. | [Repeatable subscription specification](capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md) |
| `COMPENSATION-TRANSACTIONS` | `satisfied` | Register the reviewed Compensation account as a public capability and close one bounded Transaction Sub-Process cancellation path through compensation and a Cancel Boundary Event. | [Public Compensation registration](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#public-registration-implementation) and [Transaction specification](capsules/TRANSACTION-CANCELLATION-SPEC.md) |

The historical RC feature surface freezes only after all seven rows are `satisfied`. Its qualification permits stabilization; Practical CIB7 Coverage advances independently without rewriting RC evidence. `H3-WORKLOAD-ISOLATION` stays in Engine `v0.3`, while `CONFORMANCE-CLOSURE` stays in Engine `v0.9`.

Integration state: `satisfied`.

[The project tag policy](../CLAUDE.md#project-tags) and [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints) own the historical RC phase realignments. Preserve the published `v0.2.0-rc.1` distribution at `16c5b9f6`, Alpha/Beta tags, and the existing bounded native-runtime risk exception. MUE acceptance has not passed and is no longer a separate work item; no further tag move is authorized.

### Practical CIB7 Coverage goal

On 2026-10-03 the owner selected Practical CIB7 Coverage, superseding separate MUE acceptance. Reconfirmed 2026-10-04: MUE RC was sufficient; only Practical CIB7 Coverage is intended for showing and releasing. Review practical element depth and useful combinations within the [CIB7 implementation ceiling](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering). Both Multi-Instance Sub-Process forms remain required, with priority determined by that inventory.

| Added obligation | State | Acceptance boundary |
|---|---|---|
| `SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS` | `queued` | Collection-driven repeated subprocess work, per-instance identity/data isolation, completion and outer interruption; exact CIB-supported data behavior is selected in the proposal. |
| `PARALLEL-MULTI-INSTANCE-SUBPROCESS` | `queued` | Concurrent subprocess instances, completion accounting, selected early completion and cancellation; exact CIB-supported result handling is selected in the proposal. |

Acceptance covers source/Lean/TypeScript, applicable CIB evidence, Temporal refinement/replay and whole-model journeys across the reviewed practical inventory. No separate MUE gate or new version/tag is selected; preserve existing release evidence and unresolved failures.

## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

The [test-selection repair](../scripts/test-selection-coverage.ts) includes integration witnesses and direct gate commands. The previously orphaned RC shutdown witness is wired to opt-in manual showcase qualification; select it when the current delivery boundary requires that evidence.

### External-review correction checklist

The six external reviews and correction audits are complete; the [repair cost ledger](CAPSULE-COST-LEDGER.md#repair-closure-costs) retains their evidence. No finding is reopened.

1. `STRUCTURED-PROCESS-COMPOSITION` · **later** · Owner: [composition proposal](capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve the private checkpoint; hosting, registration and closure remain deferred.
2. `CALL-ACTIVITY-DATA-BOUNDARIES` · **later** · Owner: [Call data proposal](capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve approved scalar semantics and private recovery; registration is implemented, but independent public qualification failed and closure remains open.
3. `INTERRUPTING-MESSAGE-EVENT-SUBPROCESS` · **later** · Owner: [Message handler proposal](capsules/INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-PROPOSAL.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve the independently approved private checkpoint at `c2132704`; hosting, registration and closure remain deferred.
4. `CIB7-PRACTICAL-COVERAGE` · **active** · Owner: [Practical CIB7 Coverage inventory](PRACTICAL-CIB7-COVERAGE-TARGET.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve the independently approved [serial business-task checkpoint](capsules/SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md) at `c9427286`; preserve the independently approved [mixed-task branching/rework checkpoint](capsules/MIXED-TASK-CONTROL-FLOW-PROPOSAL.md) at `47f6f996`, corrected by `245962ad`; qualify hosting for the independently approved [business Error checkpoint](capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md) at `0156e9be` and its prerequisites. Business failure and both Multi-Instance Sub-Process forms remain required practical obligations.
5. `SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS` · **later** · Owner: [practical coverage goal](#practical-cib7-coverage-goal), [CIB scope ceiling](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Required practical scope; select the bounded account and implementation order through the coverage inventory.
6. `PARALLEL-MULTI-INSTANCE-SUBPROCESS` · **later** · Owner: [practical coverage goal](#practical-cib7-coverage-goal), [CIB scope ceiling](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Required practical scope; select the bounded account and implementation order through the coverage inventory.
7. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Audit remaining standards claims within the CIB7 implementation ceiling; no implementation beyond that ceiling is selected.

Owner direction on 2026-10-04 replaces semantics-only work and October 5 qualification deferrals with [balanced delivery](../CLAUDE.md#balance-semantic-breadth-and-usable-delivery), superseding earlier checkpoint timing deferrals. Qualify business Error prerequisites and recovery before another independent family. Preserve missing evidence; MUE acceptance stays superseded and release publication separate.

| Priority | Task | Acceptance condition |
|---|---|---|
| P1 | Close the existing serial/mixed business-task and Error increment. | Complete reusable public handler integration, atomic registration/corpus/disclosure, whole-process acceptance and independent closure. Preserve [runtime failures](TEMPORAL-DEFECTS-LEDGER.md); they block affected qualification, not independent delivery work. No broad runtime investigation. |
| P2 | Qualify the selected capability’s supported user journey using the [walkthrough](BPM-PLATFORM-BROWSER-WALKTHROUGH.md) and existing production-browser gates. | Discover and start a human process, claim/edit/complete its task, inspect outcome and Action history; retain navigation, disclosures, recovery and incident journeys. Human evaluation has no simulated participants. |
| P3 | Qualify distribution behavior needed by the selected journey; broader RC acceptance stays separate. | Image-only desktop Compose execution, visible release version and passing advertised journeys; reuse valid evidence and run missing gates. No failed, missing or running gate counts as acceptance. |
| P4 | Qualify Practical CIB7 Coverage when its reviewed inventory is complete. | Required variants and whole-model journeys pass applicable gates; restrictions remain explicit. Owner acceptance, release versioning and scale qualification stay separate decisions. |

## Current evidence

- Publication. Command: `git push origin HEAD:refs/heads/main`. Status: `exit 0`. Date: `2026-10-04`. Commit: `46632f02`. [Hosted security](https://github.com/mbackschat/bpmn-lean-experiment/actions/runs/37198813350) passes (`/tmp/dependency-security-hosted-46632f02`, separately asserted). GitHub bypassed pending `verify-complete`; qualification remains open. The approved private Error checkpoint stays local. Preserve TD-001 failure `/tmp/mue-prepush-3ee96954-v8-fixed-20261002` (`3ee96954`, Temporal 819/820).

- Published RC evaluation. Command: `env BPMN_EVALUATION_PROJECT_NAME=mue-acceptance-rc1-1d11abc0 /tmp/mue-acceptance-distribution-1d11abc0/deploy/evaluation/demo start`. Status: `exit 0` for restart; browser qualification incomplete. Date: `2026-10-01`. Commit: `16c5b9f6`, fixed distribution source. Receipt: `/tmp/mue-bundle-restart`; browser evidence: `/tmp/mue-acceptance-distribution-1d11abc0/browser-receipt.json`. Docker Desktop restarts without building/pulling, retaining claimed parallel work and its sibling. Playwright reaches human approval, request changes, parallel completion, incident Retry and Cancel, with terminal History and Action history. Earlier unavailable Work/execution/audit reads remain failures. The browser shows `0.2.0-rc.1`, which still contains the selection defect. Rancher smoke remains open by owner direction. Task containers stopped; volumes/images retained.

## Exact resume point

Active work ID: `CIB7-PRACTICAL-COVERAGE`.

Risk band: useful cross-family composition and practical CIB7 feature depth.

Last verification: Parallel MI data probes pass (`/tmp/parallel-mi-cib-data-final`, asserted). The [Message handler witness](capsules/INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-PROPOSAL.md#implementation-progress) passes three schedules; withdrawal after one completion fails at E1. Hosting remains unqualified. Complete functional gate `/tmp/session-functional-complete-temporal` remains failed, serial phase unrun.

Next action: same-reviewer audit of [occurrence corrections](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#reservation-batch-implementation). Review of `e810488f` required singleton issuance/ownership fixes; paired regressions, core suite and bounded Lean targets pass. Command traces, public admission and hosting remain open. Preserve approved bounds (`8735e851`, `d5e80971`, `1175808c`) and shelved raw-IL work. Defer unchanged rebuilds/runtime reruns, resource diagnosis, isolated proof expansion, upstream/Linux probes and CIB cleanup.


Advance practical semantics and usable capabilities together; no calendar qualification hold applies. Owner direction for this session until further notice: skip performance qualification, report skips, and retain functional timer outcomes, recovery and replay. Cold full-library resource investigation stays deferred under external CPU load. Lean remains one process tree, one CPU and 3 GiB without additional swap. Database selection remains [sequential SQLite versus concurrent PostgreSQL](TESTING-SPEC.md#three-level-verification-policy).

Oracle: the selected semantic account passes bounded Lean laws/checks and independent TypeScript discriminators; no hosted or CIB claim exceeds its own evidence. Practical coverage acceptance and push qualification remain open under the [defect ledger](TEMPORAL-DEFECTS-LEDGER.md).

Stop if the account contradicts normative evidence, requires an unapproved language/dependency or exceeds its bounded assurance scope. Preserve release tags and stashes `f35bdd6b0424b2e3d5d06f101eb822bd285ab29e` and `76a2b017a630d23203ded482227382003f296f0b`.
