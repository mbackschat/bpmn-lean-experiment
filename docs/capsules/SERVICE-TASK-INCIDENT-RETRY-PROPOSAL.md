# Service Task incident and retry proposal

## Status

Draft proposal awaiting context-cold review and owner approval. No profile, runtime, wire, CIB, Lean, Temporal, or Product 2 implementation is authorized by this document yet.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question

May one successor profile turn one explicit technical Service Task execution failure into a committed, publicly observable, retryable incident while preserving the complete existing effect occurrence and excluding Temporal retry attempts, CIB job identity, host exceptions, Product 2 state, and general BPMN service-fault meaning from semantic authority?

The recommendation is **yes, through a new CIB compatibility-overlay profile and one new semantic transition family**. This is the smallest complete first stage of M4. It makes one failure visible and operable without deriving an incident from Temporal Event History, Workflow failure, CIB identity, a missing effect, or platform persistence.

## Authority and forward-compatible boundary

BPMN 2.0.2 Clause 13.3.3 says a service fault interrupts the Activity and is treated as an error. This proposal does not claim a general BPMN service-fault account. It does not turn every thrown exception into BPMN Error, define WSDL faults, or broaden the existing exact-code boundary-Error capsule.

CIB Seven adds job retries and failed-job incidents outside bare BPMN execution. The proposed profile selects two separately classified compatibility facts:

- proposed [`CIB-EXT-0013`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0013-failed-job-service-task-incident-and-retry) for a failed async-before Service Task job reaching retries zero, exposing one public failed-job incident, and reopening when public Management Service sets the same job to one retry;
- proposed [`CIB-OP-0008`](../CIB-BPMN-RELATION-REGISTER.md#cib-op-0008-cib-failed-job-incident-mapped-to-a-semantic-effect-incident) for mapping CIB job/incident identity and retry count to one project-owned effect occurrence plus semantic incident generation.

The existing `CIB-EXT-0001`, `CIB-CFG-0002`, and success-only Service Task profile remain unchanged. The new profile is `cibseven-2.2.0-service-task-incident-draft`. It reuses the exact source bytes, checked graph, Semantic Process IL, effect descriptor, argument contract, mappings, BPMN Error route, Activity-local scope, and successful completion behavior of `cibseven-2.2.0-service-task-effect-draft`. Only the new profile admits technical failure and retry stimuli and the incident observation.

This restriction is forward-compatible. The runtime representation preserves the original effect occurrence and descriptor, so later fault classes may add another incident kind or result route without reinterpreting incidents already admitted by this profile. A later general BPMN service-fault capsule can choose a standard fault account without changing this explicitly CIB-owned incident kind.

## Failure classification

The following classes remain disjoint:

| Class | Meaning and owner |
|---|---|
| `success` effect result | Existing semantic Service Task completion |
| `bpmnError` effect result | Existing typed business-error delivery to the exact reviewed BPMN Error route |
| `technicalFailure` effect result | New profile-selected host report that requests a semantic incident; it contains no cause, message, stack, retry count, or host ID |
| `effectExecutionFailed` incident | New committed CIB compatibility-overlay state owned by the semantic core |
| CIB job attempts, retry count, job ID, incident ID, and exception message | Raw compatibility evidence only |
| Temporal Activity attempts, `ActivityFailure`, timeout, and `CancelledFailure` | Private transport and hosting facts only |
| Product 2 action reservation, submission, rejection, and indeterminate state | Deferred platform operational state only |

`technicalFailure` is a successful Activity transport result, not an Activity exception. A thrown, timed-out, cancelled, malformed, or exhausted Temporal Activity remains a host failure under the current policy. This prevents Temporal retry configuration from deciding when a semantic incident exists.

## Selected public and runtime contract

The new immutable public identity is:

```ts
type EffectIncidentId = DeepReadonly<{
  effectId: EffectOccurrenceId;
  generation: number;
}>;

type OpenEffectIncident = DeepReadonly<{
  kind: "effectExecutionFailed";
  id: EffectIncidentId;
  effect: OpenEffect;
}>;
```

`generation` is a positive JavaScript-safe integer. It starts at one for the first incident on one effect occurrence and increases monotonically on every later technical failure after retry. It is semantic ABA protection, not a CIB retry count or Temporal attempt number.

The new stimuli are:

```ts
type ReportEffectFailureStimulus = DeepReadonly<{
  kind: "reportEffectFailure";
  commandId: string;
  effectId: EffectOccurrenceId;
  generation: number;
}>;

type RetryIncidentStimulus = DeepReadonly<{
  kind: "retryIncident";
  commandId: string;
  incidentId: EffectIncidentId;
}>;
```

`reportEffectFailure` commits only for the exact live effect occurrence and exactly the next generation retained by that wait. It returns ordinary `committed`, because the result is resumable committed state rather than the terminal `semanticFailure` outcome used by the current scenario driver.

`retryIncident` is a caller interaction. It commits only for the exact live incident. It removes the incident and reopens the same effect occurrence. The caller supplies no scope identity, job ID, host failure, retry budget, replacement descriptor, or replacement arguments.

The runtime adds one private incident record containing the complete `SemanticEffectWait` plus generation. An active effect wait privately retains its latest incident generation even after retry. Moving between wait and incident never constructs or changes the effect occurrence.

## Stable semantic rules

### INCIDENT-REPORT-01

For a running Process with one exact active effect wait at generation `n - 1`, `reportEffectFailure` for the same occurrence and generation `n` atomically removes the open effect, creates one `effectExecutionFailed` incident containing the complete suspended wait, retains its Activity-local scope, and commits one command result. The Process remains running and ordinary internal closure does not advance.

### INCIDENT-OBSERVE-01

An incident state exposes one active wait of kind `incident`, one `openIncidents` item containing the exact public effect, no corresponding `openEffects` item, and one enabled `retryIncident` interaction. It exposes no host cause, attempt, retry budget, raw CIB identity, Temporal identity, transport key, or Product 2 action state.

### INCIDENT-RETRY-01

`retryIncident` for the exact live incident removes that incident and restores the same effect occurrence, owner, descriptor, arguments, output mappings, BPMN Error route, output place, Activity-local scope, and transport idempotency material. It does not increment the effect activation counter or produce a control token.

### INCIDENT-REFUSE-01

A wrong occurrence, wrong generation, zero or unsafe generation, stale incident, incident under an old profile, duplicate report, or retry while the effect is open rejects with exact state preservation. After generation two exists, every command for generation one remains stale even though the effect occurrence is unchanged.

### INCIDENT-SEPARATE-01

Existing successful and typed `bpmnError` results never create an incident. A technical failure never enters a BPMN Error route. Existing profiles reject `technicalFailure`, `reportEffectFailure`, and `retryIncident` and retain their current exhausted-Activity host failure.

## State and observation consequences

`ProcessStatus` remains `running` while an incident is open. `WaitKind` gains `incident`; `StateObservation` gains required `openIncidents`; `EnabledInteraction` gains `retryIncident`; and `ObservationRequestKind` gains `openIncidents` immediately after `openEffects`.

This is one pre-release atomic wire replacement. Every registered scenario gains `"openIncidents"` in the observation list, every state observation gains `openIncidents: []` when no incident is open, and all retained canonical and CIB result artifacts are regenerated through their explicit replacement mechanisms. The proposal does not claim old scenario or result bytes remain unchanged. Exact BPMN source, checked graph, Semantic Process program, profile-independent transition behavior, and Workflow history compatibility remain separate and unchanged unless the new profile is selected.

The new canonical observation is not optional or profile-shaped. A single stable public shape is easier to consume, compare, and evolve than a field whose presence depends on profile knowledge. The profile gate applies to the commands and reachable nonempty state, not to the empty collection's schema.

## CIB Seven mapping and phase-zero obligation

Pinned source inspection shows that `DefaultJobRetryCmd` decrements an async continuation job after public execution failure; `JobEntity.setRetries` creates a failed-job incident when retries cross from positive to zero and resolves it when retries cross from zero to positive. Public Management Service exposes job execution and retry reset; public Runtime Service exposes incident queries.

Before semantic production code, a Java phase-zero probe must deploy the exact existing Service Task BPMN and use an always-failing exact probe delegate. It must establish all of these against packaged CIB Seven `2.2.0` under `CIB-CFG-0001` and disabled automatic execution:

1. start exposes the same one executable async-before job with three retries and no incident;
2. three public `executeJob` calls fail, decrement retries `3 -> 2 -> 1 -> 0`, retain the same job and Process instance, and create exactly one public incident of type `failedJob` configured by that job;
3. `setJobRetries(jobId, 1)` removes the public incident and leaves the same executable job and Process instance;
4. one later public execution can complete through the exact success path without constructing another Process or job;
5. an independent retry-to-failure control returns to retries zero and exposes one incident again;
6. raw evidence retains job element, retries, executability, due-date presence, public incident type, and job/Process association, while canonical projection constructs only the semantic effect occurrence and generation.

The project semantic generation is adapter-decided. CIB raw job and incident identities do not become semantic identity. If public reset resolves a different incident scope, replaces the job, changes the Process identity, or requires a nonpublic API, stop for owner direction.

## Lean lane

The Lean lane is **proved**. A new `Incident.lean` module owns the declarative report and retry relations and the executable clauses. The conformance module proves:

- report relation existence and evaluator soundness for one exact effect wait;
- exact wait-to-incident projection and incident-to-wait restoration;
- preservation of effect occurrence, owner, descriptor, arguments, mappings, route, output, Activity-local bindings, logical time, and every activation counter;
- stale-generation and wrong-occurrence rejection with complete state identity;
- generation one then retry then generation two, with generation-one retry refusal;
- successful and `bpmnError` completion separation;
- strict JSON identity for the new state, stimuli, and observations.

The reusable ancestor-cancellation theorem is deferred to the separate incident-scoped Process cancellation capsule. This capsule adds incident cleanup to the existing generic subtree-cancellation owner and proves only the local preservation fact needed to prevent orphaned incidents or Activity-local scopes when an already-supported cancellation path selects their owner.

`BpmnSemantics/SemanticProcess/Execution.lean` is 583/600 nonblank lines with 17 lines of headroom, so current command admission must be extracted into a cohesive `CommandAdmission.lean` owner before this family adds clauses. This premise stops applying when a later mechanical measurement shows sufficient reviewed headroom or an already-completed cohesive extraction.

## Temporal hosting and refinement preflight

The durable wait and effect remain committed semantic Workflow state. The new profile's Activity returns the closed typed `technicalFailure` result with no payload when the test-owned handler deliberately reports a technical failure. The Activity completes successfully at the Temporal transport level. One Workflow loop then deterministically derives `reportEffectFailure(effect.id, nextGeneration)` from the committed effect wait and queues it through the existing semantic input mechanism.

`retryIncident` enters through one new Workflow Update. Its content-bound ID covers the complete nested incident identity. The Update waits for the semantic command result, exactly like current User Task completion. The Workflow loop is the only caller of `applyStimulus`. A committed retry only means the same semantic effect is open for execution again; it does not mean the external problem is resolved.

The new profile uses one Activity attempt for each semantic execution request. A typed technical failure is not retried by Temporal. An Activity throw, timeout, cancellation, malformed result, or Worker failure remains private and follows the existing host failure policy. The old success-only profile retains its two-attempt fail-after-mutation reconciliation and `BPMN_EFFECT_EXECUTION_EXHAUSTED` behavior.

No Signal, Timer, Child Workflow, Search Attribute, Memo, Workflow cancellation, Event History read, Visibility query, or platform persistence creates or repairs an incident. Query projects committed `openIncidents`. Replay reconstructs the same generation from recorded typed Activity results and accepted retry Updates.

Delivery is content-bound and deduplicated by the existing command-result ledger. Ordering remains the single Workflow input queue. A retry racing with another retry yields at most one semantic commit and one rejection in whichever deterministic queue order occurs. This capsule does not select direct retry-versus-cancel ordering because cancel is Stage 2.

The smallest live witness is: start the new profile, observe one open effect, receive one typed technical failure, observe generation-one incident, replace the Worker, retry by Update, observe the same effect occurrence open again, complete successfully, reconcile Query/Update/receipt/history, and replay. A second witness reports technical failure again after retry, observes generation two, and rejects generation-one retry. A mutation that uses Temporal attempt as semantic generation, replaces the effect occurrence on retry, deletes Activity-local state, or derives the incident from Workflow failure must fail.

## Cross-target schedule and evidence

Register two answer-free scenarios over the exact existing BPMN source:

1. technical failure, retry generation one, success;
2. technical failure, retry generation one, technical failure generation two.

Lean and the TypeScript core apply explicit `reportEffectFailure` and `retryIncident` stimuli. CIB realizes the first report through three public failed job executions and realizes retry through public Management Service retry reset. Temporal derives `reportEffectFailure` only from the typed Activity result and receives `retryIncident` through Update. No runner supplies a CIB job ID, incident ID, Temporal attempt, or expected canonical answer.

The CIB raw evidence gains incident snapshots. Each row retains only the public engine facts needed to prove job, incident type, configuration, retries, and Process association. Canonical projection refuses missing partners, duplicate incidents, wrong incident type, mismatched job association, nonzero retries with an incident, zero retries without an incident, and profile leakage. The existing raw retry count remains evidence and never becomes semantic generation.

## Rule-to-evidence matrix

| Rule | BPMN/profile | CIB Seven | Lean | TypeScript core | Temporal | Separating evidence |
|---|---|---|---|---|---|---|
| `INCIDENT-REPORT-01` | New CIB overlay profile, no BPMN conformance upgrade | retries zero plus one public failed-job incident | report relation and soundness | atomic wait-to-incident transition | typed Activity result queues report | missing-wait and delete-without-suspension mutations |
| `INCIDENT-OBSERVE-01` | `CIB-EXT-0013` public incident fact | independent raw job and incident queries | exact projection | `openIncidents` and incident wait | committed Query before/after Worker replacement | Workflow-failure, Event-History, and source-derived projection mutations |
| `INCIDENT-RETRY-01` | CIB public retry reset | incident removed and same job/Process retained | exact restoration theorem | same occurrence and transport material | content-bound Update and Activity re-execution | new-occurrence, changed-argument, and counter-increment mutations |
| `INCIDENT-REFUSE-01` | project command-admission rule | no semantic identity claim | stale-generation identity theorem | exact state preservation | retained Update result and replay | generation-one command against generation two |
| `INCIDENT-SEPARATE-01` | BPMN Error and CIB incident remain distinct | failed job does not become typed BPMN Error | constructor separation | profile-gated result and commands | old-profile exhaustion unchanged | technical-failure-to-boundary and business-error-to-incident mutations |

## Required, optional, and excluded functionality

Required:

- one successor profile composing the existing Service Task source and effect binding;
- one typed payload-free technical failure result admitted only by that profile;
- one committed effect incident collection, public projection, retry interaction, report stimulus, and retry stimulus;
- exact generation-based ABA refusal and full effect-wait restoration;
- strict TypeScript, Lean, Java, schema, artifact, differential, runnable, and Temporal consumers;
- packaged CIB phase-zero evidence, two answer-free scenarios, content-bound retained evidence, Worker replacement, Query, Update, history, replay, and mutation discrimination;
- a conditional semantic checkpoint review after the first green runtime/wire/Lean checkpoint and before CIB registration, differential registration, and live Temporal closure.

Optional only if it changes no semantic claim:

- an additional direct old-profile typed-failure refusal case;
- an additional Process restart or Worker replacement point while generation two is open.

Excluded:

- general BPMN service faults, WSDL operations, arbitrary Java exceptions, unmatched BPMN Error, compensation, escalation, Transaction, Event Sub-Process, multi-instance, external tasks, generalized job retry policy, or incident types beyond one failed effect;
- public exception message, stack, cause, CIB job/incident ID, retry count, Temporal Workflow/Run/Activity/attempt identity, transport key, or Product 2 action state;
- automatic retry, retry budget editing, due-date scheduling, retry time cycle, backoff, incident message editing, incident deletion, or arbitrary Management Service compatibility;
- Process cancellation, arbitrary scope selection, in-flight Activity cancellation, termination, pause, reset, or M5 transition/token/position publication;
- Product 2 APIs, authorization, audit, UI, cross-instance aggregation, or locator evolution.

## Versioning consequences

This is a pre-release atomic wire replacement across [scenario schema](../../contracts/schemas/scenario.schema.json), [canonical result schema](../../contracts/schemas/canonical-result.schema.json), [CIB evidence schema](../../contracts/schemas/cibseven-evidence.schema.json), TypeScript [public contract](../../packages/semantic-core/src/contract.ts), [runtime state](../../packages/semantic-core/src/semantic-process-state.ts), [stimulus admission](../../packages/semantic-core/src/stimulus.ts), [command admission](../../packages/semantic-core/src/semantic-command-admission.ts), [runtime evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts), [scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts), [scenario projection](../../packages/semantic-core/src/scenario.ts), [profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts), [checked profile shape](../../packages/semantic-core/src/checked-process-profile-shape.ts), [program profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts), [graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts), [scenario admission](../../packages/semantic-core/src/semantic-process-admission.ts), and [public exports](../../packages/semantic-core/src/index.ts).

Lean changes [public contract](../../BpmnSemantics/SemanticProcessContract.lean), [runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean), [execution](../../BpmnSemantics/SemanticProcess/Execution.lean), [scenario contract](../../BpmnSemantics/Scenario.lean), [profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean), [scope cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean), [strict scenario JSON](../../BpmnSemantics/SemanticProcessJson/Scenario.lean), and [JSON entry point](../../BpmnSemantics/SemanticProcessJsonMain.lean), with new cohesive command-admission, incident, and conformance owners. Checked source and Semantic Process lowering remain byte-identical for the reused BPMN and must be guarded by [effect artifact consistency](../../scripts/effect-operation-artifact-consistency.test.ts).

Temporal changes [protocol contracts](../../packages/temporal-adapter/protocol/src/contracts.ts), [lifecycle results](../../packages/temporal-adapter/protocol/src/lifecycle-results.ts), [command identity](../../packages/temporal-adapter/protocol/src/command-identity.ts), [effect transport](../../packages/temporal-adapter/protocol/src/effect-transport.ts), [wire validation](../../packages/temporal-adapter/workflow/src/workflow-wire-validation.ts), the [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts), and focused testkit owners. New protocol `failure-operations.ts`, Workflow `effect-execution-host.ts`, and `failure-operation-handlers.ts` own the new behavior so the crowded Workflow owner receives only delegation.

CIB changes [scenario protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java), [diagnostics protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java), [effect schedule](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibEffectExecutionSchedule.java), [effect probe](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEffectProbe.java), [effect projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEffectProjector.java), [command executor](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioCommandExecutor.java), [state projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java), [scenario runner](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java), and [phase-zero probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.java), with a new incident projector and a new focused phase-zero test owner.

Artifact and comparison changes [CIB evidence types](../../scripts/contract-cib-evidence.ts), [CIB projection](../../scripts/contract-cib-evidence-projection.ts), [effect projection](../../scripts/contract-effect-projection.ts), [artifact owner](../../scripts/contract-artifacts.ts), [artifact consistency](../../scripts/contract-artifact-consistency.ts), differential [pipeline types](../../packages/differential/test/pipeline-types.ts), [pipeline harness](../../packages/differential/test/pipeline-harness.ts), [pipeline targets](../../packages/differential/test/pipeline-targets.ts), [comparison](../../packages/differential/test/pipeline-comparison.ts), [catalog](../../packages/differential/test/pipeline-catalog.test.ts), and [pipeline](../../packages/differential/test/pipeline.test.ts), with a new `failure-operations-pipeline-cases.ts` rather than growing the family catalog body.

No immutable Temporal history support window has been approved. Existing retained history fixtures do not exist, so no patch or compatibility branch is added. Existing profiles remain behaviorally unchanged and replay under the rebuilt adapter. Approval of a durable baseline would require explicit version, rollback, old-Worker, and patch decisions.

### Owners this implementation grows

| Owner | Headroom |
|---|---:|
| [TypeScript public contract](../../packages/semantic-core/src/contract.ts) | 338 |
| [TypeScript runtime state](../../packages/semantic-core/src/semantic-process-state.ts) | 252 |
| [TypeScript stimuli](../../packages/semantic-core/src/stimulus.ts) | 216 |
| [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 302 |
| [TypeScript runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) | 233 |
| [TypeScript scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 484 |
| [TypeScript scenario](../../packages/semantic-core/src/scenario.ts) | 202 |
| [Lean public contract](../../BpmnSemantics/SemanticProcessContract.lean) | 118 |
| [Lean runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 157 |
| [Lean execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 17 |
| [Lean scenario contract](../../BpmnSemantics/Scenario.lean) | 383 |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 180 |
| [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 48 |
| [Java scenario runner](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | 13 |
| [CIB evidence projection](../../scripts/contract-cib-evidence-projection.ts) | 46 |
| [Differential family catalog](../../packages/differential/test/pipeline-cases.ts) | 12 |
| [Differential comparison](../../packages/differential/test/pipeline-comparison.ts) | 46 |
| [Differential catalog test](../../packages/differential/test/pipeline-catalog.test.ts) | 43 |
| [Temporal effect scenario execution](../../packages/temporal-adapter/testkit/src/effect-scenario-execution.ts) | 320 |
| [Temporal effect probe](../../packages/temporal-adapter/testkit/src/effect-probe.ts) | 365 |

The public contract receives only shared wire types; runtime state keeps the incident representation cohesive; stimuli receives only strict union admission; the runtime delegates incident transitions; scope cancellation adds incident cleanup at the shared root; and scenario receives projection only. Execution at 17 lines, the Java runner at 13, and the differential catalog at 12 require the named cohesive extractions before growth. The Workflow at 48, CIB evidence projection at 46, differential comparison at 46, and catalog test at 43 receive delegation only, with separate owners for new behavior. Each constraint stops applying when `node scripts/what-binds.ts` reports a different reviewed headroom. Every listed TypeScript owner currently has 20 or more guards and its package registry; Lean has six guards; Java has five guards and two registries. New files enter the nearest existing registry in the same change.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts), and [artifact projections](../../scripts/contract-artifact-projections.test.ts) | Reach every incident, generation, interaction, and empty old-profile arm and reject malformed or leaked facts. |
| [effect artifact consistency](../../scripts/effect-operation-artifact-consistency.test.ts) | Prove exact source, checked graph, Semantic Process program, effect occurrence, descriptor, mappings, route, and transport material are reused. |
| [CIB observation fidelity](../../scripts/cib-observation-fidelity.test.ts) | Bind every canonical incident path to independent raw job and incident facts and reject source-derived or expected-result substitution. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce cohesive owners, extraction premises, exhaustive variants, registries, and measured line limits. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Keep new semantic facts public, descriptive, strict, and independently buildable. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) and [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Register both answer-free schedules and catch occurrence, generation, state, and target substitution. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep Product 2, Temporal transport, CIB identity, and source details out of neutral incident meaning. |
| [document reviewability](../../scripts/document-reviewability.test.ts), [independent review policy](../../scripts/independent-review-policy.test.ts), and [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Keep the proposal, conditional checkpoint, receipts, owners, and immutable review routing complete. |
| [Markdown links](../../scripts/markdown-links.test.ts) and [normative references](../../scripts/normative-reference-resolution.test.ts) | Resolve every owner, relationship, guard, and normative basis. |

## Epistemic closure and cost boundary

The exact claim to establish is one technical effect execution failure becoming one committed CIB-profile incident that can reopen the same effect occurrence through one generation-bound command. It does not establish general BPMN fault semantics, automatic remediation, Process cancellation, or Product 2 operations.

The strongest common-mode risk is the project-owned mapping from a CIB job/incident lifecycle to a semantic effect occurrence and generation. CIB cannot independently derive either semantic identity. The fidelity boundary therefore keeps public CIB job, retry, incident type, configuration, and Process association visible as raw facts while the canonical projector independently constructs the neutral incident and refuses mismatches.

The nearest realistic wrong accounts are: exhausted Temporal retries define the incident; retry creates a new effect activation; a retry budget is mistaken for generation; the old incident can operate on a later failure; technical failure becomes BPMN Error; the suspended wait loses mappings, route, or Activity-local state; or a missing open effect is treated as incident evidence. Each has a direct adversarial case, theorem, seeded mutation, or history discriminator.

At closure, [the capsule cost ledger](../CAPSULE-COST-LEDGER.md) records the implementation baseline through the closure target and compares it with the existing Service Task effect capsule, the nearest completed increment changing the same source, runtime, CIB, Lean, differential, and Temporal layers.

## Stop conditions

Stop and return to research or owner direction if:

- the packaged CIB phase-zero probe cannot expose and reset one failed-job incident through public APIs while retaining the same job and Process;
- implementing the selected fact requires a raw CIB job or incident ID, retry count, host exception, Temporal attempt, or platform record in the semantic identity;
- Temporal must infer incident state from a thrown, timed-out, cancelled, or exhausted Activity rather than a typed profile-owned result;
- retry requires a new effect occurrence, changed descriptor/arguments/mappings/route/output, counter increment, or loss of Activity-local state;
- a general BPMN service-fault, arbitrary incident type, Process cancellation, in-flight cancellation, external task, Product 2 operation, or M5 projection becomes necessary;
- old profiles can accept the new result or stimuli, or their semantic behavior changes;
- the complete gate can pass only by weakening strict schemas, generation refusal, raw CIB fidelity, Worker replacement, replay, or a seeded mutation;
- the measured extractions cannot retain cohesive owners under the source-hygiene boundary.

## Owner decisions requested

Approval of this proposal settles all of these together:

1. Select `cibseven-2.2.0-service-task-incident-draft` as a successor to the existing success-only Service Task profile.
2. Classify the exact failed-job incident/retry lifecycle as `CIB-EXT-0013` and its mapping to effect occurrence plus semantic generation as `CIB-OP-0008`.
3. Add one payload-free `technicalFailure` effect result admitted only by the new profile, with thrown Temporal Activity failures remaining private host failures.
4. Add committed `effectExecutionFailed` incidents, required `openIncidents`, one incident wait kind, one retry interaction, report and retry stimuli, and generation-based ABA protection.
5. Restore the complete same effect wait on retry without a new activation, token, mapping, route, scope, or transport identity.
6. Use a proved Lean lane for report/retry soundness, preservation, stale-generation refusal, result separation, strict JSON, and existing-cancellation cleanup.
7. Require public CIB job and incident phase-zero evidence, two answer-free schedules, independent raw-to-canonical projection, Worker replacement, Update, Query, history, replay, and seeded mutations.
8. Apply one atomic pre-release observation/schema replacement while preserving exact BPMN source and checked/IL artifacts.
9. Keep Process cancellation for Stage 2 and Product 2 incident operations for Stage 3, each under its own reviewed proposal or capsule.
