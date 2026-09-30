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

The original `phase/mue-release-candidate` target was `4c6e7238`; `91b759a1` holds the qualification record and `9fb6705b` the qualified semantics. On 2026-09-28 the owner accepted disclosed intermittent native-runtime risk for RC, without accepting a root-cause fix or final MUE closure. The published distribution tag `v0.2.0-rc.1` remains fixed at `16c5b9f6`. On 2026-09-30 the owner directed another RC phase-tag realignment to the latest documentation commit, retaining that versioned distribution identity and the existing risk exception. Preview Alpha and Beta phase tags remain unchanged; no retrospective version tags are created.

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
| P3 | Qualify the versioned RC distribution and reconcile evidence, restrictions and final integrated qualification. | The image-only Compose bundle is executable on the selected desktop Docker paths, its browser shows the release version, and every advertised journey has applicable passing evidence; no failed, missing or in-progress gate is reported as acceptance. Reuse unchanged evidence and run missing release gates once. |
| P4 | Present the exact MUE acceptance boundary and record the decision. | Explicit owner acceptance closes all selected obligations before the immutable `engine/v0.2` tag. General BPMN conformance, production scale and package SemVer remain separate decisions. |

## Current evidence

- Runtime qualification. Command: `./scripts/pnpm.sh run test:pre-push`. Status: `exit 1`. Date: `2026-09-30`. Commit: `6dc643d3`, clean documentation checkpoint. Receipt: `/tmp/bpmn-readme-audience-6dc643d3-pre-push-host`. Infrastructure, Lean, semantic-core/importer and CIB/comparator checks passed; the concurrent Temporal testkit lane failed with a native child crash and a separate one-second VM initialization timeout. The [Node/V8 crash investigation](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#2026-09-30-documentation-checkpoint-recurrence) owns the report identity and unresolved causal boundaries. The earlier ordinary-settings package pass remains historical evidence, not closure. RC publication retains the owner-accepted exception; final MUE runtime acceptance remains open.

- Human and operational journeys. Command: `env PLAYWRIGHT_PREBUILT_WEB=true ./scripts/pnpm.sh --filter @bpmn-lean/showcase-mue-preview-alpha exec playwright test rc-showcase-journeys.spec.ts --grep "user host"`, plus affected browser/service gates. Status: `exit 0`. Date: `2026-09-28`. Commit: `6ce2310e` for human checks; grouped repairs in the worktree over `d2c65265`. Six human-host checks pass in `/tmp/mue-acceptance-human-6ce2310e`; twelve browser checks across the six repaired M1–M4 packages pass in `/tmp/mue-rc-browser-acceptance-final`; all four live service witnesses pass in `/tmp/mue-service-hosts-green`. Client-package, type and focused guards also pass. Worktree receipts name the parent HEAD, not clean-commit release qualification. Hosted CI remains owner-monitored.

## Exact resume point

Active work ID: `MUE-ACCEPTANCE`.

Risk band: P3 runtime qualification failures and evidence reconciliation; P1 CI verdict is owner-monitored.

Owner instruction, 2026-09-30: commit and push the README audience revision and realign the RC phase tag to the latest documentation checkpoint. Preserve the published `v0.2.0-rc.1` distribution identity. The frozen RC scope, Docker Desktop and Rancher Desktop dockerd/moby support, and owner-monitored CI remain unchanged; MUE acceptance is separate.

CPU constraint: root-owned Lean validation permits one process tree, one CPU, 3 GiB and no additional swap. Reuse valid warmed or hosted evidence; report CPU-intensive validation completion.

Next action: investigate the clean-commit native crash recurrence and separate direct-VM initialization timeout without weakening runtime settings or checks. Reconcile remaining MUE distribution-acceptance evidence against the published `v0.2.0-rc.1` bundle rather than moving its tag. A real Rancher Desktop smoke, hosted CI verdict, and [native crash cause](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md) remain open. Preserve the Alpha and Beta phase tags.

Oracle: clean-checkout runtime qualification succeeds; all seven capability rows remain unchanged; supported human journeys and final applicable gates pass with exact target evidence; disclosures retain limitations. Owner acceptance precedes the MUE tag.

Stop if qualification requires unreviewed semantic changes or weaker guarantees, or when the final owner acceptance decision is ready. Preserve stashes `f35bdd6b0424b2e3d5d06f101eb822bd285ab29e` and `76a2b017a630d23203ded482227382003f296f0b`.
