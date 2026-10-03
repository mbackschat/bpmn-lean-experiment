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

Every Beta row is satisfied; [the integration specification](MUE-PREVIEW-BETA-SPEC.md) owns closure and the immutable `phase/mue-preview-beta` checkpoint. The RC table below owns the subsequently closed implementation boundary.

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

[The project tag policy](../CLAUDE.md#project-tags) and [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints) own the historical RC phase realignments. Preserve the published `v0.2.0-rc.1` distribution at `16c5b9f6`, Alpha/Beta tags, and the existing bounded native-runtime risk exception. Final MUE acceptance remains open; no further tag move is authorized.

### MUE acceptance goal

Close Minimum Useful Engine acceptance for the frozen seven-capability RC scope: repair qualification and user-journey defects, demonstrate the complete supported journeys, reconcile exact-commit evidence and known limitations, and present the resulting boundary for explicit owner acceptance. After acceptance, record closure and create the immutable `engine/v0.2` milestone tag. Add no new capability or proof programme; reuse valid evidence and reserve complete verification for final integration.

## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

### External-review correction checklist

The six external reviews and correction audits are complete; the [repair cost ledger](CAPSULE-COST-LEDGER.md#repair-closure-costs) retains their evidence. No finding is reopened.

1. `STRUCTURED-PROCESS-COMPOSITION` · **later** · Owner: [composition proposal](capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Preserve the approved private semantic checkpoint and reconciled execution evidence. Hosting, public registration and capsule closure remain deferred under the owner-selected semantics window.
2. `CALL-ACTIVITY-DATA-BOUNDARIES` · **active** · Owner: [Call data proposal](capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Review and implement explicit scalar input/output mappings for one statically bound in-document Call Activity with normal return; recursion, repeated calls and deployment/version resolution remain excluded.
3. `INTERRUPTING-MESSAGE-EVENT-SUBPROCESS` · **queued** · Owner: [subscription specification](capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [semantic families](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), [semantic invariants](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Review and implement one scope-wide Message trigger that interrupts ordinary application work and starts one withdrawal handler; non-interrupting and repeated handlers remain excluded.
4. `MUE-ACCEPTANCE` · **later** · Owner: [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints), [testing specification](TESTING-SPEC.md) · Maps: [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) · Action: Reconsider runtime adoption, browser journeys and distribution qualification no earlier than 2026-10-05; resume only after reprioritization. Retain failed and missing gates.
5. `CONFORMANCE-CLOSURE` · **later** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) · Action: Retain the adopted dependency, risk and practical-reach order for remaining Process Execution work after the three owner-selected increments.

The owner selected semantics-only work through at least 2026-10-05. Semantics remains active beyond that date unless reprioritized; no automatic switch to runtime adoption, Linux qualification, browser journeys or distribution work occurs. The three post-MUE increments remain outside the frozen seven-capability acceptance boundary. Each needs normative and independent account review, a bounded Lean lane and Temporal preflight; live hosting qualification remains open. Prioritize BPMN requirements, semantic risk and pinned CIB Seven 2.2.0 reach, keeping compatibility claims separately evidenced. The non-material queue correction uses plan/RC guards to permit ordered semantic advancement while rejecting skipped predecessors, multiple active items, omitted capabilities and premature acceptance; the frozen denominator stays closed.

| Priority | Task | Acceptance condition |
|---|---|---|
| P1 | Deferred at least until 2026-10-05: close the runtime mechanisms tracked in the [defect ledger](TEMPORAL-DEFECTS-LEDGER.md). | Retain the passing clean-checkout CI evidence; demonstrate corrections for Query loss during eviction, Transaction descriptor-digest rejection, native V8 faults and direct-VM initialization timeout without weaker assertions or unapproved workarounds. |
| P2 | Deferred at least until 2026-10-05: validate supported user journeys using the [walkthrough](BPM-PLATFORM-BROWSER-WALKTHROUGH.md) and existing production-browser gates. | Discover and start a human process, claim/edit/complete its task, inspect outcome and Action history; retain navigation, disclosures, recovery and incident journeys. Human evaluation has no simulated participants. |
| P3 | Deferred at least until 2026-10-05: qualify the versioned RC distribution and reconcile evidence, restrictions and final integrated qualification. | The image-only Compose bundle is executable on the selected desktop Docker paths, its browser shows the release version, and every advertised journey has applicable passing evidence; no failed, missing or in-progress gate is reported as acceptance. Reuse unchanged evidence and run missing release gates once. |
| P4 | Present the exact MUE acceptance boundary and record the decision. | Explicit owner acceptance closes all selected obligations before the immutable `engine/v0.2` tag. General BPMN conformance, production scale and package SemVer remain separate decisions. |

## Current evidence

- Push qualification. Command: `env CI=true ./scripts/pnpm.sh run test:pre-push`, approved V8-fixed Node. Status: `exit 1`. Date: `2026-10-02`. Commit: `3ee96954`, clean target. Receipt: `/tmp/mue-prepush-3ee96954-v8-fixed-20261002`, separately asserted. Temporal: 819/820; PMI E1 read `unavailable` follows TD-001's eviction warning. Security, infrastructure and Lean pass; pipeline/platform/PostgreSQL/showcase/UI lanes unrun. No retry or push.

- Published RC evaluation. Command: `env BPMN_EVALUATION_PROJECT_NAME=mue-acceptance-rc1-1d11abc0 /tmp/mue-acceptance-distribution-1d11abc0/deploy/evaluation/demo start`. Status: `exit 0` for restart; browser qualification incomplete. Date: `2026-10-01`. Commit: `16c5b9f6`, fixed distribution source. Receipt: `/tmp/mue-bundle-restart`; browser evidence: `/tmp/mue-acceptance-distribution-1d11abc0/browser-receipt.json`. Docker Desktop restarts without building/pulling, retaining claimed parallel work and its sibling. Playwright reaches human approval, request changes, parallel completion, incident Retry and Cancel, with terminal History and Action history. Earlier unavailable Work/execution/audit reads remain failures. The browser shows `0.2.0-rc.1`, which still contains the selection defect. Rancher smoke remains open by owner direction. Task containers stopped; volumes/images retained.

## Exact resume point

Active work ID: `CALL-ACTIVITY-DATA-BOUNDARIES`.

Risk band: per-instance data scope and explicit caller/callee mappings in independent Lean/TypeScript accounts.

Last verification: `./scripts/lake.sh test` passes 705 jobs; [private execution evidence](capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md#private-execution-evidence) records the comparison gates.

Next action: implement the independently approved [Call data proposal](capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md), beginning with cohesive proof-owner extraction if needed, then typed endpoints and isolated Process interfaces under red/green gates. Retain [composition closure obligations](capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md#private-rule-to-evidence-reconciliation).

Keep semantics active; reconsider deferred work no earlier than 2026-10-05, without an automatic switch. Local performance tests stay skipped under external CPU load. Lean remains one process tree, one CPU and 3 GiB without additional swap. Database selection remains [sequential SQLite versus concurrent PostgreSQL](TESTING-SPEC.md#three-level-verification-policy).

Oracle: the selected semantic account passes bounded Lean laws/checks and independent TypeScript discriminators; no hosted or CIB claim exceeds its own evidence. Final MUE acceptance and push qualification remain open under the [defect ledger](TEMPORAL-DEFECTS-LEDGER.md).

Stop if the account contradicts normative evidence, requires an unapproved language/dependency or exceeds its bounded assurance scope. Preserve release tags and stashes `f35bdd6b0424b2e3d5d06f101eb822bd285ab29e` and `76a2b017a630d23203ded482227382003f296f0b`.
