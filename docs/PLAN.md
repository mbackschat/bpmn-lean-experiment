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
4. `CIB7-PRACTICAL-COVERAGE` · **active** · Owner: [Practical CIB7 Coverage inventory](PRACTICAL-CIB7-COVERAGE-TARGET.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Qualify usable delivery of approved [serial](capsules/SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md) `c9427286`, [mixed-task](capsules/MIXED-TASK-CONTROL-FLOW-PROPOSAL.md) `47f6f996`/`245962ad` and [business Error](capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md) `0156e9be`: current recovery/replay, public registration and whole-process acceptance. Preserve the [parallel MI checkpoint and proof gaps](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#entry-and-retirement-publication-checkpoint); both MI Sub-Process forms remain required.
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

Current task: finish public-delivery acceptance, hosted qualification and security publication.

Current result: owner authorized this [delivery](BUSINESS-PROCESS-PUBLIC-DELIVERY-PROPOSAL.md) checkpoint on 2026-10-10 despite outstanding qualification. Three Node 26 invoice journeys and duplicate-name/overlay rejection pass. Checkpoint audit `9133ea7b` remains approved; complete hosted qualification and independent closure remain open.

Last verification: `/tmp/cib7-delivery-web-complete-20261010` passes 178 tests; `/tmp/cib7-delivery-browser-negatives-wide-20261010` passes four browser checks. Node 26 V8, infrastructure, platform, core/source/differential and Docker pass. `/tmp/node26-migration-20261009/temporal` fails hosted publication Queries and held PMIS admission; serial checks pass. Retain CIB/PostgreSQL evidence and Error/native/Lean failures.

Next action: fix Query/admission failures before independent closure and publication, as owner-directed on 2026-10-10. The private SDK binary is missing; evidence archives contain no replacement. Preserve PMIS stash `9a443912db9ea02a5d4f362aa4cbf02b192004ce` and eight hashes in `/tmp/business-publication-20261009/pending-pmis-sha256.json`. No model switches or metadata-only commit.

Proof hold: [parallel MI publication](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#entry-and-retirement-publication-checkpoint) derives open occurrences; current-position composition remains open. `/tmp/pmis-runtime-position-owned-8-20261009` fails at issuer ordinal closure and absent reached consumer. Start/static bindings elaborate; entry, native/reserved steps, ingress, retirement and existing reachability composition remain. Pending sources are stashed for qualification; no helper commit.

Unresolved: resumption admission, stable-wait existence, complete E1/E2 publication, combined Lean/Temporal qualification, testkit batch 13, zero-item MI publication and SIGSEGV/query failures. Owner-directed fixes reopen only the blocking Query/admission work; unrelated runtime/performance/cold-library investigations remain held. Serialize bounded verification without per-job approval. One Lean tree, one CPU/3 GiB, no extra swap.

Oracle: exact public deployment/start, occurrence-bound Work completion, full-state/E1/E2 agreement and replay.

Stop if correction weakens guarantees or broadens scope.

Preserve release tags and stashes `f35bdd6b0424b2e3d5d06f101eb822bd285ab29e` and `76a2b017a630d23203ded482227382003f296f0b`.
