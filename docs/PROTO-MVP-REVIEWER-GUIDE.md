# BPMN Lean Experiment — Proto-MVP Reviewer's Guide

## Status

**Maintained reviewer summary and navigational aid.**

> [!IMPORTANT]
> This file is a reviewer-oriented summary, not the authority for implementation status, semantic meaning, evidence, or sequencing. For exact current truth, use [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), the applicable [semantic capsule](capsules/README.md), [TESTING-SPEC.md](TESTING-SPEC.md), and [PLAN.md](PLAN.md).

## Scope and sources

This guide deliberately summarizes the current bounded feature and hosting surface so a reviewer can orient quickly, then routes each claim to its authoritative owner. The summary is redundant by design and must be updated when its owning implementation or evidence changes.

| What you want | Where it lives |
|---|---|
| Exact implemented and absent surfaces, with every count | [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) |
| The executable demonstration and its actual case, mutation, and replay results | [complete differential/refinement pipeline](TESTING-SPEC.md#complete-differentialrefinement-pipeline) |
| Current checkpoint, ordered work, and the outstanding mechanism queue | [PLAN.md](PLAN.md) |
| Mission, authority model, layering, and independence boundary | [PROJECT-DESIGN.md](PROJECT-DESIGN.md) |
| The governed review protocol, verdict contract, and receipts | [TESTING-SPEC.md](TESTING-SPEC.md#independent-cold-review-gate) |
| Architecture explanation, feasibility assessment, and an informal reviewer checklist | the separate [assessment record](https://github.com/mbackschat/bpmn-lean-experiment-assessment) |

The assessment record is explanatory and evaluative, maintained against a named commit of this tree, and **not authoritative**: the project documents above own every claim.

## Coverage at a glance

“Implemented” below means exact profile-selected source admission plus executable Lean and TypeScript behavior and Temporal refinement for the bounded shapes named here. It does not mean arbitrary placement, repetition, nesting, or composition of the BPMN element. CIB evidence is a separate column because several standards profiles deliberately have no CIB target.

| BPMN element or mechanism | Implemented extent | CIB Seven extent |
|---|---|---|
| Process lifecycle, None Start/End Events, Sequence Flows, and [User Tasks](capsules/USER-TASK-INTERACTION-SPEC.md) | One private executable Process with exact active-occurrence discovery, completion, wrong-occurrence refusal, stale refusal, and canonical waiting/completed observations. No assignment, authorization, forms, task inbox, or general human-resource semantics. | CIB Seven `2.2.0` supplies bounded agreement for the sequential lifecycle and public task discovery/completion under `CIB-AGR-0001`, `CIB-AGR-0002`, and host-identity mapping `CIB-OP-0001`. |
| [Process-start and User Task completion data](capsules/PROCESS-START-DATA-SPEC.md) | Canonical string/null Process variables are installed at start and atomically created, replaced, preserved, or set to null by exact User Task completion. No general BPMN Data Associations, deletion, nested values, or form model. | CIB Seven `2.2.0` supplies the selected public start-map and completion-map extensions `CIB-EXT-0006` and `CIB-EXT-0005`. |
| [Parallel Gateways](capsules/PARALLEL-FORK-JOIN-SPEC.md) | One balanced two-branch fork/join with two distinct User Tasks, either completion order, per-incoming-Sequence-Flow synchronization, excess-token preservation, and live-sibling stale refusal. | CIB Seven `2.2.0` agrees on the balanced witness under `CIB-AGR-0003`; there is no broad parallel-compatibility profile. Duplicate arrivals through one incoming Flow remain candidate deviation `CIB-DEV-0001`, while the project keeps the normative per-flow rule. |
| [Intermediate Catch Timer](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) | One exact literal `PT1S` normal-flow wait with occurrence identity, logical deadline, exact-deadline firing, refusal guards, plus one linear Timer/User Task composition in either mechanism order. No other durations, dates, cycles, repetitions, or general timer composition. | CIB Seven `2.2.0` supplies controlled-clock evidence for the isolated `PT1S` lifecycle under `CIB-AGR-0004`; the Timer/User Task composition is standards-only and makes no CIB composition claim. |
| [Intermediate Catch Message](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) and [Receive Task](capsules/RECEIVE-TASK-MESSAGE-SPEC.md) | One payload-free operation-addressed Catch Event and one payload-free direct-Message, non-instantiating Receive Task, each with exact subscription identity, delivery, wrong/stale refusal, and single consumption. No payload, buffering, key/global correlation, modeled throw, Message Flow, or general routing. | CIB is deliberately absent for the Catch Event. CIB Seven `2.2.0` supplies bounded public-subscription agreement for the direct-Message Receive Task under `CIB-AGR-0009` and identity mapping `CIB-OP-0005`. |
| [Exclusive Gateway](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) | One divergent two-condition-plus-default shape using the project-owned total Simple Boolean v1 language, XML Sequence Flow declaration order, first-true selection, and default fallback. No XPath, production JUEL, arbitrary conditions, or other topology. | CIB Seven `2.0.0` calibrates first-true/default behavior and declaration order under bounded JUEL evidence (`CIB-AGR-0006`, `CIB-INT-0001`), but does not establish the project language's truth results; the JUEL production lane remains unimplemented. |
| [Inclusive Gateway](capsules/INCLUSIVE-GATEWAY-SPEC.md) | One structured two-condition-plus-default split and paired join that selects every true branch and synchronizes exactly that occurrence-owned subset. Four standards-only cases cover one true, both orders, and default. | No Inclusive-specific CIB relationship or execution lane is claimed. |
| [Event-Based Gateway](capsules/EVENT-BASED-GATEWAY-SPEC.md) | One non-instantiating two-arm race between an operation-addressed Message catch and exact `PT1S` Timer catch, with atomic arming, explicit winner, loser withdrawal, wrong/stale refusal, and both winner directions. | No Event-Based Gateway CIB relationship or execution lane is claimed. |
| [Service Task effects](capsules/SERVICE-TASK-EFFECT-SPEC.md) | One profile-registered payload-free effect descriptor with committed intent, exact successful completion, full-identity refusal, retry reconciliation, typed exhaustion, and separate effect observation. No arbitrary delegates, external-task protocol, incident semantics, or general faults. | CIB Seven `2.2.0` supplies the exact delegate-expression/async-before host realization `CIB-EXT-0001` under `CIB-CFG-0002`; CIB does not independently expose the project's semantic effect-intent state or transport identity. |
| [Data mapping](capsules/CREATE-DOCUMENT-DATA-SPEC.md) and [boundary Error](capsules/BOUNDARY-ERROR-SPEC.md) | One exact successful CreateDocument-style input/local-output/Process-output mapping and one exact-code interrupting Service Task boundary Error with typed business result, nullable local patch, caught-path mapping, cleanup, and boundary continuation. | CIB Seven `2.0.0` supplies exact target-shaped host evidence under `CIB-AGR-0005`, `CIB-EXT-0002`–`0004`, and `CIB-OP-0002`–`0003`. These are bounded synchronous host relations, not general mapping, delegate, rollback, or Error compatibility. |
| [Embedded Sub-Processes](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) and [Error propagation](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) | One child scope level with two concurrent User Tasks, exact quiescent completion, one parent continuation, and one direct exact-code Error End propagation path with regional child cancellation and outer recovery. No arbitrary nesting, Event Sub-Processes, catch-all/ancestor search, transactions, or compensation. | CIB Seven `2.2.0` supplies bounded ordinary completion and exact propagation agreement under `CIB-AGR-0007` and `CIB-AGR-0008`; stale interrupted host-task refusal reuses `CIB-OP-0001`. |
| [Call Activity](capsules/CALL-ACTIVITY-SPEC.md) | One namespace-qualified in-document called Process with distinct semantic instance identity, empty data boundary, one called User Task, normal quiescent exactly-once return, and caller continuation. No imports, version/tenant resolution, mappings, recursion, repetition, cancellation, or exceptional completion. | No Call Activity-specific CIB relationship or execution lane is claimed. |

The complete catalog currently contains 28 answer-free cases. The closed reviewer checkpoint runs two isolated Temporal executions for each case and replays 30 live histories; [the complete pipeline](TESTING-SPEC.md#complete-differentialrefinement-pipeline) derives those cases and target sets from the guarded artifact catalogs rather than from this table.

## Temporal mapping at a glance

The adapter hosts one admitted Semantic Process program in a generic TypeScript Workflow. BPMN meaning and runtime state remain in the pure semantic core; Temporal contributes durable input delivery, waiting, effect execution, state persistence, result recovery, and replay.

| Semantic surface | Temporal mapping and current extent |
|---|---|
| Process lifecycle and identity | Semantic admission and a separate host-capability check run before Workflow creation. One Workflow ID is content-derived from the root semantic Process address; the Workflow stores core state, completes when the core is terminal and accepted handlers drain, returns a completed receipt, recovers retained exact Update results, and distinguishes adapter-owned `processClosed`/`processUnknown` from semantic rejection. |
| User Tasks | An active User Task is core-owned waiting state exposed through Query. Completion arrives through a content-bound acknowledged Update containing the complete semantic occurrence and submitted string/null patch; the core alone validates and commits it. The MVP dummy actor's thinking delay is outside the Process Workflow, so it is neither BPMN time nor a Temporal Process timer, and a Worker or actor restart leaves the task durably waiting. |
| Timers | A committed core `openTimers` entry causes the Workflow to schedule the exact remaining Temporal Timer and derive the semantic firing command when it wakes; callers never inject `fireTimer` into the Workflow. Evidence covers Worker absence at the due boundary, exact Timer history, completion, replay, and a timer-bypass mutation. |
| Messages and Receive Tasks | Well-formed delivery uses a payload-free Signal. The Signal handler validates and queues input; only the main loop calls the core. A durable result ledger plus Query and terminal receipt recover outcomes, exact duplicates coalesce, conflicting identity is recorded, and wrong channel or stale delivery reaches the core as semantic rejection. There is no payload or cross-Workflow correlation/routing layer. |
| Service Tasks, mappings, and business Error | A committed `openEffects` intent produces one non-local Activity request derived only from semantic definition and state. Activities use a bounded retry policy; completion is content-bound and reconciles a lost acknowledgement. Success or a successful typed BPMN business-Error result returns to the core, which owns mapping, cleanup, and route selection; Activity failure/exhaustion remains an adapter failure. |
| Pure gateways and embedded scopes | Exclusive and Inclusive selection, Parallel synchronization, embedded-scope completion, and direct-parent Error propagation execute as internal core closure inside the same Workflow. They create no evaluator Activity, Child Workflow, or Temporal cancellation event; regional cancellation is semantic state change. |
| Event-Based Gateway | The exact Message/`PT1S` race combines passive Signal readiness with one cancellable Temporal Timer. The core commits the winner and removes the loser. If both become ready in one Workflow activation and the host cannot provide a portable order, the adapter fails closed before semantic advancement instead of inventing BPMN priority. |
| Call Activity | The caller and one called semantic Process instance live in the same root Workflow. Called User Task completion reuses the ordinary Update ingress while keeping called task identity distinct from the root Workflow address; return is core-owned and no Temporal Child Workflow is created. |
| Durability evidence | Focused tests cover exact retries, duplicate delivery, accepted-result recovery, Worker replacement across every host-driven mechanism, Query/Update/receipt reconciliation, seeded host-bypass mutations, replay, and cleanup. The adapter still excludes production history compatibility, Continue-As-New, host cancellation/repair, global task discovery, and concurrent host-driven waits beyond the exact Event-Based Gateway race. |

## Who this guide is for

Reviewers and stakeholders who need to decide whether the project has established a credible semantic and durable-execution architecture, whether its available capabilities match its evidence, and whether the remaining work can safely reuse the current foundations. It assumes familiarity with BPMN concepts but not with Lean or Temporal internals.

A useful review answers four questions separately:

1. Is each selected BPMN meaning normatively defensible and honestly bounded?
2. Does the Lean account express that meaning and establish useful laws rather than only fixture equality?
3. Does the TypeScript core independently transcribe the selected account without importing host or vendor behavior?
4. Does the Temporal adapter preserve the core's public outcomes under durability, retry, restart, and replay rather than defining BPMN meaning itself?

## Suggested review route

For a management and architecture review:

1. Read [PROJECT-DESIGN.md](PROJECT-DESIGN.md), especially the layered architecture, authority model, Lean rationale, and independence boundary.
2. Read [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) for the exact implemented and absent surfaces.
3. Read the [Proto-MVP milestone](PLAN.md#reviewer-proto-mvp-milestone) and current checkpoint in [PLAN.md](PLAN.md).
4. Use the [capsule registry](capsules/README.md) to inspect the specifications governing any capability you probe; the representative walkthrough is owned by the [Call Activity specification](capsules/CALL-ACTIVITY-SPEC.md).
5. Inspect the complete target and mutation requirements in [TESTING-SPEC.md](TESTING-SPEC.md#complete-differentialrefinement-pipeline).

For an executable review from the repository root:

```bash
./scripts/doctor.sh verify
env CI=true ./scripts/pnpm.sh run test:infrastructure
env CI=true ./scripts/pnpm.sh run test:pipeline
```

The pipeline starts a disposable local Temporal server and therefore requires the environment's normal host port-binding authorization. Under known external CPU contention, an explicitly declared `BPMN_PIPELINE_WARM_BUDGET_MS` override may establish correctness but must not replace the default uncontended performance baseline.

For a complete release-style development gate:

```bash
./scripts/verify.sh
```

Reviewers should run focused semantic or adapter gates first when investigating a static finding, then run the complete wrapper once after corrections are integrated. Repeating full gates in every implementation or review lane wastes time and CPU without increasing independence.

## Repository map for deeper inspection

| Concern | Primary owner |
|---|---|
| Mission and architecture | [PROJECT-DESIGN.md](PROJECT-DESIGN.md) |
| Current implementation and absences | [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) |
| Current sequence and resume point | [PLAN.md](PLAN.md) |
| BPMN requirement dispositions | [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md) |
| Shared checked graph and IL | [SEMANTIC-PROCESS-IL-SPEC.md](SEMANTIC-PROCESS-IL-SPEC.md) and [`semantic-process-contract.ts`](../packages/semantic-core/src/semantic-process-contract.ts) |
| Topology-independent admission and profile capability | [PROFILE-PARAMETERIZED-ADMISSION-SPEC.md](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) |
| Lean semantics | [`BpmnSemantics/SemanticProcess`](../BpmnSemantics/SemanticProcess) |
| TypeScript semantic core | [`packages/semantic-core`](../packages/semantic-core) |
| BPMN ingestion | [`packages/bpmn-source`](../packages/bpmn-source) and [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md) |
| Temporal lifecycle | [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) and [`packages/temporal-adapter`](../packages/temporal-adapter) |
| Runnable product command | [RUNNABLE-TEMPORAL-MVP-SPEC.md](RUNNABLE-TEMPORAL-MVP-SPEC.md) |
| Differential comparison | [`packages/differential`](../packages/differential) |
| Profiles and answer-free scenarios | [`profiles`](../profiles) and [`scenarios`](../scenarios) |
| Wire schemas | [`contracts`](../contracts) |
| CIB classifications | [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md) |
| Test and review protocol | [TESTING-SPEC.md](TESTING-SPEC.md) |
| Commit-bounded capsule cost | [CAPSULE-COST-LEDGER.md](CAPSULE-COST-LEDGER.md) |

## What a positive review may and may not conclude

A positive review may approve **the demonstrated architecture and the exact implemented slices**. It may not infer general BPMN execution, broad CIB compatibility, Process Execution conformance, or production readiness.

Breadth remains profile-bounded, the requirement denominator is not exhaustive, and several evidence lanes share the TypeScript source producer. [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) states each of those boundaries exactly; this guide does not restate them.
