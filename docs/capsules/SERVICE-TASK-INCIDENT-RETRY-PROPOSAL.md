# Service Task incident and retry proposal

## Status

Redesigned draft awaiting a new context-cold proposal review and owner approval. The first proposal target `8be7e5f` was rejected because its Activity transport, artifact versioning, CIB configuration, generation domain, owner inventory, and Stage 1 cancellation boundaries were not jointly implementable. Test-only packaged-CIB research is complete; no profile, runtime, wire, Lean, differential, Temporal, or Product 2 implementation is authorized yet.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The superseded first proposal target `8be7e5f` received an isolated `fork-turns-none` review with verdict `reject`. This redesign changes the public transport boundary and artifact strategy, so it requires a new context-cold review rather than a warm correction audit.

## Question

May one successor profile turn one explicit technical Service Task execution result into a committed, publicly observable incident, permit one exact retry of the same effect occurrence, and expose a second failure as a non-retryable generation-two incident while keeping Temporal attempts, CIB job identity, host exceptions, Product 2 state, cancellation, and general BPMN service-fault meaning outside this capsule?

The recommendation is **yes, through one bounded CIB compatibility-overlay profile and one incident transition family**. This is the smallest complete first stage of M4. It makes a failure visible and permits one controlled retry without deriving semantic state from Temporal Event History, Workflow failure, a missing effect, CIB identity, or platform persistence.

## Authority and forward-compatible boundary

BPMN 2.0.2 Clause 13.3.3 describes a service fault as interrupting the Activity and being treated as an error. This proposal does not claim that general account. It does not turn a thrown exception into BPMN Error, define WSDL faults, or broaden the existing exact-code boundary-Error capsule.

CIB Seven adds job retries and failed-job incidents outside bare BPMN execution. The new profile `cibseven-2.2.0-service-task-incident-draft` selects:

- proposed [`CIB-EXT-0013`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0013-failed-job-service-task-incident-and-retry) for the failed async-before Service Task job, its public `failedJob` incident, and public retry reset;
- proposed [`CIB-OP-0008`](../CIB-BPMN-RELATION-REGISTER.md#cib-op-0008-cib-failed-job-incident-mapped-to-a-semantic-effect-incident) for mapping raw CIB job and incident facts to a project-owned effect occurrence and bounded semantic generation;
- proposed `CIB-CFG-0008` for `createIncidentOnFailedJobEnabled = true`, independently separated from the disabled setting by the packaged-engine phase-zero probe.

The profile composes the existing `CIB-EXT-0001` Service Task binding and `CIB-CFG-0002` manual job-release configuration. It references the exact existing BPMN source path and produces the same structural checked graph and Semantic Process IL content. Checked graphs and IL programs are generated artifacts registered by pipeline cases, not retained JSON files. A structural-equivalence guard erases only `identity.semanticProfile` before comparing the predecessor and successor generated values; every other field must remain exactly equal.

This restriction is forward-compatible. The runtime retains the original effect occurrence and descriptor, so a later general BPMN fault account or another reviewed incident kind can add a distinct result route without reinterpreting this CIB-owned incident.

## Failure and transport classification

The semantic result remains unchanged:

```ts
type EffectExecutionResult =
  | { kind: "success"; localPatch: VariableBinding[] }
  | { kind: "bpmnError"; code: string; message: string | null; localPatch: VariableBinding[] };
```

`completeEffect` continues to accept only that semantic union. Technical failure belongs to a separate Temporal transport union:

```ts
type EffectActivityExecutionResult =
  | { kind: "semantic"; result: EffectExecutionResult }
  | { kind: "technicalFailure" };
```

Existing Activity success and `bpmnError` payload bytes remain unchanged. The new profile may return the payload-free `technicalFailure` arm. The Workflow must convert that arm to `reportEffectFailure` and must never pass it to `completeEffect`. Existing profiles reject the arm at host admission. A thrown, timed-out, cancelled, malformed, or exhausted Activity remains host failure and creates no semantic incident.

The following classes remain disjoint:

| Class | Meaning and owner |
|---|---|
| `success` or `bpmnError` | Existing semantic effect completion |
| `technicalFailure` | Transport-only successful Activity result, admitted only for the successor profile |
| `effectExecutionFailed` | Committed semantic state under the successor CIB overlay |
| CIB job attempts, retry count, IDs, and exception text | Raw compatibility evidence only |
| Temporal attempts, `ActivityFailure`, timeout, and cancellation | Private hosting facts only |
| Product 2 action state | Deferred platform state only |

## Selected semantic contract

```ts
type EffectIncidentId = DeepReadonly<{
  effectId: EffectOccurrenceId;
  generation: 1 | 2;
}>;

type OpenEffectIncident = DeepReadonly<{
  kind: "effectExecutionFailed";
  id: EffectIncidentId;
  effect: OpenEffect;
}>;

type ReportEffectFailureStimulus = DeepReadonly<{
  kind: "reportEffectFailure";
  commandId: string;
  effectId: EffectOccurrenceId;
  generation: 1 | 2;
}>;

type RetryIncidentStimulus = DeepReadonly<{
  kind: "retryIncident";
  commandId: string;
  incidentId: EffectIncidentId;
}>;
```

An effect wait privately retains `latestIncidentGeneration: 0 | 1`. The first report must name generation 1. Retrying generation 1 restores the same effect wait and retains latest generation 1. A later report must name generation 2. Generation 2 has no retry interaction and every retry against it rejects. Because no later report can become eligible, the bounded domain is total and agrees with Lean without an integer-overflow case.

The Workflow-generated report command ID is exactly:

```text
report-effect-failure-sha256:<sha256(canonicalTypedTupleEncoding([
  "reportEffectFailure",
  [processInstanceId, elementId, activation],
  generation
]))>
```

The report is host-produced, not a caller Update. Its explicit stimulus remains in the neutral scenario wire so Lean, TypeScript, CIB projection, and Temporal can compare one command schedule.

## Stable semantic rules

### INCIDENT-REPORT-01

For a running Process with one exact live effect wait, generation 1 commits only when `latestIncidentGeneration` is 0, and generation 2 commits only when it is 1 after the one admitted retry. The command atomically removes the open effect and stores the complete suspended wait in one `effectExecutionFailed` incident. Process status remains running and internal closure does not advance.

### INCIDENT-OBSERVE-01

Every `StateObservation` contains required `openIncidents`. An incident state exposes one incident active wait and one exact public incident, exposes no corresponding open effect, and exposes one retry interaction only for generation 1. It exposes no host cause, attempt, retry budget, raw CIB identity, Temporal identity, transport key, or Product 2 state.

### INCIDENT-RETRY-01

The exact generation-1 retry removes the incident and restores the same effect occurrence, owner, descriptor, arguments, output mappings, BPMN Error route, output place, Activity-local scope, and transport idempotency material. It does not increment an activation counter or create a token. Generation 2 is observable and non-retryable.

### INCIDENT-REFUSE-01

A wrong occurrence, wrong generation, duplicate report, stale incident, retry while the effect is open, generation-2 retry, or either command under an old profile rejects with exact state preservation. Two different retry command IDs queued for generation 1 are distinct semantic commands: the first eligible command commits and the second rejects in deterministic queue order.

### INCIDENT-SEPARATE-01

Existing success and typed `bpmnError` results never create an incident. A technical failure never enters a BPMN Error route and can never appear inside `completeEffect`. Existing profiles retain their current two-attempt Activity policy and exhausted-host-failure behavior.

## State and artifact versioning

`WaitKind` gains `incident`, `StateObservation` gains required `openIncidents`, and `EnabledInteraction` gains `retryIncident`. `ObservationRequestKind` does **not** change. Like the existing required `openMessageSubscriptions` field, `openIncidents` is part of every state projection while scenario and profile observation-request lists keep their exact bytes.

This is one pre-release canonical-result replacement. Every retained canonical state gains `openIncidents: []`, and retained CIB evidence envelopes replace only their canonical result arm as needed. Existing profile JSON, scenario JSON, raw old-profile producer facts, and BPMN source remain byte-identical. The successor pipeline cases produce new checked and IL values whose structural content is exactly the predecessor content modulo semantic-profile identity.

No parallel legacy schema is added. The public state shape, strict TypeScript decoder, strict Lean JSON decoder, CIB protocol, differential comparison, Temporal Query, and every retained result advance atomically.

## CIB Seven phase-zero evidence and mapping

The committed [phase-zero probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) is pre-approval research evidence only. It uses the exact existing Service Task BPMN plus a test-owned mode-controlled delegate and proves:

1. with `createIncidentOnFailedJobEnabled = true`, three failed public job executions preserve the same job and Process while retries move `3 -> 2 -> 1 -> 0`;
2. retries zero exposes exactly one public self-rooted `failedJob` incident configured by that job and attached to the selected Service Task;
3. `setJobRetries(jobId, 1)` removes the incident and preserves the same job and Process;
4. another failure creates a new raw incident, then another reset plus an explicit handler-mode switch lets the same job complete successfully;
5. with the exact configuration disabled, the same retries-zero state exposes no incident.

The successor profile adds machine-readable `environment.createIncidentOnFailedJobEnabled: true`; the semantic-profile schema permits that field only as an optional CIB-environment property, so existing profile bytes remain unchanged. The CIB runner explicitly applies it for the successor profile instead of relying on a default.

Raw incident evidence retains the public job ID, retries, executability, due-date presence, Process and element associations, incident ID and type, configuration job ID, and self-rooted cause/root IDs. Canonical projection requires exactly one matching retries-zero job and incident partner, then constructs only `EffectIncidentId { effectId, generation }`. It refuses the disabled configuration, missing or duplicate partners, wrong type, wrong job configuration, wrong Process or element, nonzero retries with an incident, zero retries without an incident, and old-profile leakage.

## Lean lane

The Lean lane is **proved**. A new `Incident.lean` module owns the report/retry relations and executable clauses. A new conformance module proves:

- report relation existence and evaluator soundness for generation 1 and generation 2;
- exact wait-to-incident projection and one exact incident-to-wait restoration;
- preservation of effect occurrence, owner, descriptor, arguments, mappings, route, output, Activity-local bindings, logical time, and every activation counter;
- wrong-occurrence, stale-generation, and generation-2 retry refusal with complete state identity;
- success and `bpmnError` separation;
- strict JSON identity for the state, stimuli, interaction, and observations.

Lean represents the generation as `Nat` but profile admission accepts only 1 or 2 and permits retry only for 1. No cancellation theorem or incident-cleanup rule belongs to this capsule. `Execution.lean` is already near its reviewed size boundary, so existing command admission must move to a cohesive `CommandAdmission.lean` owner before the new family delegates from execution.

## Temporal hosting and refinement preflight

The durable effect wait remains committed Workflow state. `workflows.ts` owns two proxies for the same Activity type: the existing profiles select `maximumAttempts: 2`, while the successor profile selects `maximumAttempts: 1`. A guard proves the selection is exact and that every old profile retains two attempts.

The Activity returns `EffectActivityExecutionResult`. The Workflow validates the result against the selected profile. Existing semantic arms create the unchanged `completeEffect` stimulus. A successor-profile `technicalFailure` creates the exact deterministic `reportEffectFailure` stimulus. The single Workflow input loop remains the only caller of `applyStimulus`.

Retry uses Workflow Update name `bpmn-retry-effect-incident`, argument tuple `[RetryIncidentStimulus]`, and result `CommandOutcome`. The Temporal Update ID remains `contentBoundUpdateId(stimulus)`, whose canonical encoding includes the full stimulus, including caller command ID and complete nested incident identity. An exact same Update ID reuses Temporal's retained result. Two distinct command IDs are two Updates; deterministic Workflow queue order lets at most one commit against generation 1 and the other receives semantic rejection.

No Signal, Timer, Child Workflow, Search Attribute, Memo, Workflow cancellation, Event History read, Visibility query, or platform persistence creates or repairs an incident. Query projects committed `openIncidents`. Replay reconstructs the same generations from recorded transport results and accepted retry Updates.

The smallest live witness starts the successor profile, observes one open effect, receives technical failure, observes generation 1, replaces the Worker, retries through Update, observes the same effect occurrence, then completes successfully and replays. The second witness reaches generation 2 after the retry, proves no retry interaction, rejects generation-2 retry, and replays. Mutations using Temporal attempt as generation, forwarding technical failure to `completeEffect`, replacing the effect occurrence, losing Activity-local state, exposing retry at generation 2, or deriving incident state from Workflow failure must fail.

## Cross-target scenarios and evidence

Register two answer-free scenarios that both reference the existing `scenarios/service-task-effect/process.bpmn` source path without copying it:

1. technical failure generation 1, retry generation 1, success;
2. technical failure generation 1, retry generation 1, technical failure generation 2, rejected generation-2 retry.

Lean and the TypeScript core consume explicit report and retry stimuli. CIB realizes one report through public failed job executions and retry through public retry reset. Temporal derives report only from the transport-only Activity result and accepts retry only by Update. No target receives raw CIB identity, Temporal attempt, or expected canonical answer.

| Rule | Profile/CIB | Lean | TypeScript | Temporal | Separating evidence |
|---|---|---|---|---|---|
| `INCIDENT-REPORT-01` | enabled-setting failed-job incident | report relation | atomic wait suspension | transport result queues report | disabled-setting and delete-without-suspension mutations |
| `INCIDENT-OBSERVE-01` | independent raw job/incident queries | exact projection | required `openIncidents` | committed Query | Workflow-failure and missing-effect projection mutations |
| `INCIDENT-RETRY-01` | reset removes incident, same job/Process | exact restoration | same occurrence and counters | content-bound Update | new-occurrence and lost-local-state mutations |
| `INCIDENT-REFUSE-01` | bounded adapter generation | identity theorems | exact preservation | retained Update and queue race | generation-2 and two-command race cases |
| `INCIDENT-SEPARATE-01` | failed job is not BPMN Error | constructor separation | unchanged complete-effect union | separate transport decoder | technical-failure-to-complete and business-error-to-incident mutations |

## Required, optional, and excluded functionality

Required:

- one successor profile, one exact configured failed-job incident kind, one transport-only technical failure arm, and one report/retry transition family;
- generation 1 retryable, generation 2 observable and non-retryable;
- required `openIncidents` state projection with unchanged observation-request lists;
- new successor pipeline cases and structural checked/IL equivalence modulo profile identity;
- strict TypeScript, Lean, Java, schema, artifact, differential, runnable, and Temporal consumers;
- packaged phase-zero evidence, two answer-free scenarios, content-bound raw evidence, Worker replacement, Update, Query, history, replay, and mutation discrimination;
- a conditional semantic checkpoint review after the first green runtime/wire/Lean checkpoint and before CIB registration, differential registration, and live Temporal closure.

Optional only if it changes no claim:

- an additional direct old-profile transport-failure refusal;
- an additional Worker replacement point while generation 2 is open.

Excluded:

- general BPMN service faults, WSDL operations, arbitrary exceptions, unmatched BPMN Error, compensation, escalation, Transaction, Event Sub-Process, multi-instance, external tasks, generalized retry policy, or incident kinds beyond this failed effect;
- public exception message, stack, cause, CIB job/incident ID, retry count, Temporal Workflow/Run/Activity/attempt identity, transport key, or Product 2 state;
- retrying generation 2, editing retry budgets, due-date scheduling, retry cycles, backoff, incident editing/deletion, or arbitrary Management Service compatibility;
- Process or scope cancellation, in-flight Activity cancellation, termination, pause, reset, M5 transition/token/position publication, Product 2 APIs, authorization, audit, UI, or cross-instance aggregation.

## Versioning consequences

The implementation changes the strict state/stimulus/result wire, semantic runtime, profile catalog/admission, Lean contract/runtime/JSON, CIB protocol/evidence, differential artifacts, and Temporal transport/Update/Query. It does not change BPMN source admission, checked node variants, Semantic Process operations, lowering, existing profile files, existing scenario files, or cancellation owners.

The strict schema change is owned by the [scenario schema](../../contracts/schemas/scenario.schema.json), [CIB evidence schema](../../contracts/schemas/cibseven-evidence.schema.json), [semantic profile schema](../../contracts/schemas/semantic-profile.schema.json), and [schema registry](../../contracts/README.md). The six-line [canonical result schema](../../contracts/schemas/canonical-result.schema.json) remains unchanged because it delegates to the scenario result definition. The checked-process and Semantic Process schemas remain unchanged.

The successor profile adds its profile and README, and the two new answer-free schedules share the existing `scenarios/service-task-effect/process.bpmn` source. All twenty retained CIB evidence files replace only canonical states to add `openIncidents: []`; their raw producer observations remain exact. The two current A12 evidence files receive the same canonical field, while frozen legacy A12 evidence is normalized only at the current-versus-legacy comparison boundary.

The following mechanically measured existing owners grow. Each TypeScript owner carries its package or script guard set and nearest README registry; every Lean owner has six guards; every Java owner has five guards plus both CIB runner registries. The stated number is remaining headroom under the 600-nonblank-line review boundary.

### Owners this implementation grows

#### TypeScript semantic and artifact owners

| Owner | Headroom |
|---|---:|
| [Public contract](../../packages/semantic-core/src/contract.ts) | 338 |
| [Runtime state](../../packages/semantic-core/src/semantic-process-state.ts) | 252 |
| [Wait construction](../../packages/semantic-core/src/semantic-process-wait-runtime.ts) | 455 |
| [Stimuli](../../packages/semantic-core/src/stimulus.ts) | 216 |
| [Command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 302 |
| [Semantic runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) | 233 |
| [Scenario projection](../../packages/semantic-core/src/scenario.ts) | 202 |
| [Profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts) | 552 |
| [Checked profile shape](../../packages/semantic-core/src/checked-process-profile-shape.ts) | 369 |
| [Program profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts) | 356 |
| [Graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 534 |
| [Semantic admission](../../packages/semantic-core/src/semantic-process-admission.ts) | 249 |
| [Profile value domain](../../packages/semantic-core/src/semantic-profile-value-domain.ts) | 526 |
| [Semantic exports](../../packages/semantic-core/src/index.ts) | 558 |
| [Contract artifact cases](../../scripts/contract-artifact-cases.ts) | 369 |
| [Contract artifact owner](../../scripts/contract-artifacts.ts) | 98 |
| [Contract artifact fixtures](../../scripts/contract-artifact-test-fixtures.ts) | 77 |
| [CIB evidence contract](../../scripts/contract-cib-evidence.ts) | 499 |
| [CIB evidence projection](../../scripts/contract-cib-evidence-projection.ts) | 46 |
| [Effect projection](../../scripts/contract-effect-projection.ts) | 517 |
| [Artifact consistency](../../scripts/contract-artifact-consistency.ts) | 50 |
| [CIB evidence replacement](../../scripts/replace-cibseven-evidence.ts) | 276 |
| [A12 evidence reader](../../scripts/a12-adoption-evidence.ts) | 261 |
| [A12 evidence replacement](../../scripts/replace-a12-adoption-evidence.ts) | 534 |

Add cohesive `semantic-process-incident-runtime.ts`, `service-task-incident-retry.test.ts`, `contract-cib-incident-projection.ts`, `contract-incident-artifact-test-fixtures.ts`, `contract-incident-artifact-projections.test.ts`, and `service-task-incident-profile-consistency.ts` owners. Do not add incident projection to the 46-line-headroom general CIB projector or new cases to the 14-line-headroom general projection test. Existing semantic fixture owners change only where they construct an effect wait or exact state observation.

#### Lean owners

| Owner | Headroom |
|---|---:|
| [Scenario wire](../../BpmnSemantics/Scenario.lean) | 383 |
| [Runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 157 |
| [Execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 17 |
| [Profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 180 |
| [Scenario projection](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 286 |
| [Strict scenario JSON](../../BpmnSemantics/SemanticProcessJson/Scenario.lean) | 485 |
| [JSON entry point](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 287 |
| [Semantic umbrella](../../BpmnSemantics/SemanticProcess.lean) | 570 |
| [JSON conformance](../../BpmnSemantics/SemanticProcessJsonConformance.lean) | 425 |
| [Conformance entry point](../../BpmnSemantics/ConformanceMain.lean) | 582 |

Before adding incident delegation, move external command admission from `Execution.lean` into a new `SemanticProcess/CommandAdmission.lean`. New `SemanticProcess/Incident.lean` and `ServiceTaskIncidentRetryConformance.lean` owners contain the report/retry account and its proofs. The runtime structure may default `openIncidents` to an empty list for legacy Lean fixtures, but strict JSON must require and emit the field. No cancellation module changes.

#### Temporal owners

| Owner | Headroom |
|---|---:|
| [Effect protocol contract](../../packages/temporal-adapter/protocol/src/effect-contract.ts) | 582 |
| [Semantic effect transport](../../packages/temporal-adapter/protocol/src/effect-transport.ts) | 460 |
| [Protocol contracts](../../packages/temporal-adapter/protocol/src/contracts.ts) | 418 |
| [Command identity](../../packages/temporal-adapter/protocol/src/command-identity.ts) | 434 |
| [Lifecycle results](../../packages/temporal-adapter/protocol/src/lifecycle-results.ts) | 447 |
| [Protocol exports](../../packages/temporal-adapter/protocol/src/index.ts) | 587 |
| [Workflow entry points](../../packages/temporal-adapter/workflow/src/workflows.ts) | 561 |
| [Workflow wire validation](../../packages/temporal-adapter/workflow/src/workflow-wire-validation.ts) | 513 |
| [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 48 |
| [Workflow exports](../../packages/temporal-adapter/workflow/src/index.ts) | 590 |
| [Process client](../../packages/temporal-adapter/client/src/process-client.ts) | 135 |
| [Client exports](../../packages/temporal-adapter/client/src/index.ts) | 598 |
| [Runner effect Activities](../../packages/temporal-adapter/runner/src/host-effect-activities.ts) | 551 |
| [Effect probe](../../packages/temporal-adapter/testkit/src/effect-probe.ts) | 365 |
| [Effect scenario execution](../../packages/temporal-adapter/testkit/src/effect-scenario-execution.ts) | 320 |
| [Boundary-Error scenario execution](../../packages/temporal-adapter/testkit/src/mapped-boundary-error-scenario-execution.ts) | 434 |
| [Effect mutation Workflow](../../packages/temporal-adapter/testkit/src/effect-bypass-mutation-workflows.ts) | 542 |
| [Testkit runner](../../packages/temporal-adapter/testkit/src/runner.ts) | 152 |
| [Testkit runner support](../../packages/temporal-adapter/testkit/src/runner-support.ts) | 179 |
| [Stimulus sequencing](../../packages/temporal-adapter/testkit/src/scenario-stimulus-sequencing.ts) | 557 |
| [Test contracts](../../packages/temporal-adapter/testkit/src/test-contracts.ts) | 486 |
| [Harness evidence](../../packages/temporal-adapter/testkit/src/harness-evidence.ts) | 181 |
| [History evidence](../../packages/temporal-adapter/testkit/src/history-evidence-decoding.ts) | 312 |
| [Worker host](../../packages/temporal-adapter/testkit/src/temporal-worker-host.ts) | 355 |
| [Testkit exports](../../packages/temporal-adapter/testkit/src/index.ts) | 584 |

Add outer Activity-result and incident-operation protocol owners, process-command Update and incident client owners, plus focused policy and live Temporal test owners. Extract Activity-result handling to `effect-execution-host.ts`, proxy selection to `effect-activity-policy.ts`, retry Update handling to `incident-update-handler.ts`, and shared retained-Update lookup before changing the 48-line-headroom Workflow or copying the client mechanism. The existing semantic `effect-transport.ts` remains semantic-only, and the 30-line-headroom `effect-transport.test.ts` does not grow.

#### CIB and differential owners

| Owner | Headroom |
|---|---:|
| [Scenario protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | 154 |
| [Interaction protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioInteractionProtocol.java) | 573 |
| [Diagnostics protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java) | 420 |
| [Active-wait projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenActiveWaitProjector.java) | 538 |
| [Effect probe](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEffectProbe.java) | 558 |
| [Command executor](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioCommandExecutor.java) | 411 |
| [State projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java) | 316 |
| [Scenario runner](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | 13 |
| [Differential cases](../../packages/differential/test/pipeline-cases.ts) | 12 |
| [Differential types](../../packages/differential/test/pipeline-types.ts) | 405 |
| [CIB targets](../../packages/differential/test/pipeline-cib-targets.ts) | 471 |
| [Target support](../../packages/differential/test/pipeline-target-support.ts) | 533 |
| [Pipeline targets](../../packages/differential/test/pipeline-targets.ts) | 121 |
| [Pipeline harness](../../packages/differential/test/pipeline-harness.ts) | 345 |
| [Pipeline comparison](../../packages/differential/test/pipeline-comparison.ts) | 46 |
| [Pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | 43 |
| [Pipeline execution](../../packages/differential/test/pipeline.test.ts) | 120 |

Add separate incident protocol, CIB engine factory, incident projector, and incident command executor owners. Extract engine/configuration construction from the 13-line-headroom Java runner before selecting the profile. Add separate incident pipeline cases, comparison, and focused test owners; the 12-line-headroom case catalog receives only registration, while the 46-line-headroom comparator delegates raw incident fidelity.

The implementation also updates the relevant focused test fixtures, all strict canonical result files, the new profile and scenario registries, [CIB relationship register](../CIB-BPMN-RELATION-REGISTER.md), [implementation map](../IMPLEMENTATION-MAP.md), [plan](../PLAN.md), [testing specification](../TESTING-SPEC.md), [Temporal lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [Temporal research](../research/TEMPORAL-EXECUTION-RESEARCH.md), capsule and package registries, and this proposal. The [capsule cost ledger](../CAPSULE-COST-LEDGER.md) changes only at closure.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts), and [artifact projections](../../scripts/contract-artifact-projections.test.ts) | Reach every incident/generation arm, replace canonical result artifacts, and preserve old profile/scenario/raw evidence bytes. |
| [effect artifact consistency](../../scripts/effect-operation-artifact-consistency.test.ts) | Prove exact source and structural checked/IL equivalence modulo successor profile identity. |
| [CIB observation fidelity](../../scripts/cib-observation-fidelity.test.ts) | Bind canonical incidents to independent configured raw job and incident facts. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce cohesive owners, extractions, registries, and line limits. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Keep incident facts public, descriptive, strict, and independently buildable. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) and [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Register both answer-free schedules and catch target substitution. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep transport, CIB identity, Product 2, and cancellation outside neutral incident meaning. |
| [review policy](../../scripts/independent-review-policy.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and [review packet](../../scripts/semantic-review-packet.test.ts) | Keep review routing, receipts, owners, and checkpoint boundary complete. |

## Epistemic closure and cost boundary

The claim to establish is one configured technical effect failure becoming one committed CIB-profile incident, one retry reopening the exact effect occurrence, and a second failure becoming a non-retryable generation-two incident. It does not establish general BPMN fault meaning, Process cancellation, automatic remediation, or Product 2 operations.

The strongest common-mode risk is the project-owned mapping from a raw CIB job/incident lifecycle to semantic effect identity and generation. The phase-zero probe closes the public engine lifecycle and configuration discriminator, but CIB still cannot derive the semantic occurrence or generation. Raw facts therefore remain independently visible while canonical projection constructs and checks the neutral identity.

The nearest wrong accounts are: Activity transport failure enters `completeEffect`; Temporal attempt defines generation; retry creates a new activation; generation 2 remains retryable; old profile/scenario bytes change; or missing open effect is treated as incident evidence. Each has a direct rejection, structural guard, theorem, mutation, or history discriminator.

At closure, [the capsule cost ledger](../CAPSULE-COST-LEDGER.md) records the implementation range and compares it with the existing Service Task effect capsule.

## Stop conditions

Stop and return to research or owner direction if:

- the successor profile cannot pin and independently observe configured failed-job incident creation;
- semantic identity requires raw CIB identity, retry count, exception data, Temporal attempt, or platform state;
- technical failure must enter `completeEffect` or an Activity exception must define incident state;
- retry changes the effect occurrence, descriptor, arguments, mappings, route, output, counters, or Activity-local state;
- generation 2 must become retryable or an unbounded generation domain becomes necessary;
- Process cancellation, in-flight cancellation, external-task behavior, Product 2 operations, or M5 projection becomes necessary;
- existing profile, scenario, source, and raw-producer bytes cannot remain exact, or generated checked/IL structure cannot remain equal modulo profile identity;
- the full gate can pass only by weakening schemas, raw CIB fidelity, Worker replacement, replay, or a seeded mutation.

## Owner decisions requested

Approval settles these together:

1. Select `cibseven-2.2.0-service-task-incident-draft` as a configured successor to the success-only Service Task profile.
2. Select `CIB-EXT-0013`, `CIB-OP-0008`, and configured failed-job incident creation under proposed `CIB-CFG-0008`.
3. Keep semantic `EffectExecutionResult` unchanged and add a separate transport-only technical failure arm.
4. Add committed incidents, required `openIncidents`, incident waits, generation-1 retry, report/retry stimuli, and generation-2 non-retryability.
5. Preserve exact old profile, scenario, source, and raw-producer bytes while replacing canonical result shapes and adding successor pipeline artifacts equal modulo profile identity.
6. Use a proved Lean lane and per-profile one-attempt versus two-attempt Temporal proxy selection.
7. Require configured phase-zero evidence, two answer-free schedules, raw-to-canonical CIB fidelity, Worker replacement, Update, Query, history, replay, and mutations.
8. Keep every cancellation fact for Stage 2 and every Product 2 incident operation for Stage 3.
