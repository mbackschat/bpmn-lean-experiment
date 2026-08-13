# Service Task incident-scoped Process cancellation proposal

## Status

**Proposal review and owner approval are complete; immutable first-green semantic checkpoint `41eea4c041ba230657f031cf99f39d30e96f573a` is reached and blocks downstream evidence until independent review.** Context-cold review of immutable target `d03f5285a9e16852e2d08da6da29864275e75c6b` returned `APPROVE WITH REQUIRED EDITS`; the same reviewer approved bounded correction `4505dbf1f893d24ee282b89a5fdef0a37d1b920e` with no retained finding. On 2026-08-13, the owner explicitly approved this proposal and all eight decisions in [Decisions requested from the owner](#decisions-requested-from-the-owner). The checkpoint implements the strict wire and schema, TypeScript and Lean root-cancellation transitions, cancelled public observation, and additive Temporal Update and terminal receipt. CIB execution and projection, registered artifacts, differential execution, and live Temporal refinement remain unimplemented and paused. This proposal selects one successor CIB compatibility profile and one incident-gated external root Process cancellation command. It does not select general BPMN cancellation, arbitrary in-flight cancellation, Transaction Cancel, compensation, modeled Terminate behavior, Temporal Workflow cancellation, or Product 2 operations.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `d03f5285a9e16852e2d08da6da29864275e75c6b` | `fork-turns-none` | `approve-with-required-edits` | `4505dbf1f893d24ee282b89a5fdef0a37d1b920e` |
| Semantic checkpoint | `41eea4c041ba230657f031cf99f39d30e96f573a` | `not-recorded` | `pending` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question and recommendation

Should one successor profile let a caller cancel the exact hosting root Process only while addressing its exact published generation-1 Service Task incident, atomically remove the root's live execution region, preserve committed Process data and monotonic history, and close with a typed cancelled receipt?

**Recommendation: yes.** Select a new profile-scoped `cancelIncidentProcess` command and publish its eligibility beside the incident. The command gives M4 an exact recovery operation without widening BPMN meaning or accepting an arbitrary Process kill API. The semantic core derives the unique root and owns the terminal state; CIB supplies a separately classified compatibility observation, Temporal only transports the command durably, and Product 2 remains a later consumer.

## Authority and forward-compatible boundary

BPMN 2.0.2 Clause 10.5.1 distinguishes termination, which immediately ends active work without compensation or Event handling, from cancellation, which may compensate successfully completed Sub-Process work and roll back a Transaction. Clause 10.5.7 includes cancellation lifecycle states. Cancel End and Cancel Boundary Events are Transaction-only, while Clause 13.2 separately defines ordinary completion and modeled Terminate End abnormal termination.

This proposal selects none of those modeled entry mechanisms. It defines an extra-model CIB-profile operator command that is available only for one exact published incident on the hosting root. Reusing the project's destructive subtree cleanup is forward-compatible only as a final cleanup primitive. A later standard BPMN cancellation account must perform its compensation, rollback, or Event behavior before cleanup, while modeled Terminate and interrupting Events keep their existing entry rules.

The successor profile is `cibseven-2.2.0-service-task-incident-cancellation-draft`. Its executable Program shape is identical to `cibseven-2.2.0-service-task-incident-draft` modulo semantic-profile identity and it reuses the exact [`service-task-effect` BPMN source](../../scenarios/service-task-effect/process.bpmn), checked graph, and Semantic Process IL. The profile artifact additionally admits the one canonical string Process-start binding used to discriminate committed-data preservation, so the profile itself is not byte-identical to Stage 1. It adds no BPMN source key, checked node, lowering rule, or IL operation.

The profile selects:

- `CIB-EXT-0014`, public external deletion of the selected incident-bearing root Process;
- `CIB-OP-0009`, mapping exact public root and incident identity to private CIB deletion and externally terminated history;
- `CIB-EXT-0006` for the exact string Process-start binding whose preservation the cancellation witness checks;
- the existing `CIB-EXT-0001`, `CIB-EXT-0013`, `CIB-OP-0008`, `CIB-CFG-0001`, `CIB-CFG-0002`, and `CIB-CFG-0008` relationships that own the underlying effect, incident, runner, and configured-oracle facts.

No CIB job, incident, execution, delete-reason, or historic database identity enters the semantic wire.

## Public contract

```ts
enum StimulusKind {
  // existing members remain byte-identical
  CancelIncidentProcess = "cancelIncidentProcess",
}

type CancelIncidentProcessStimulus = DeepReadonly<{
  kind: StimulusKind.CancelIncidentProcess;
  commandId: string;
  processInstanceId: string;
  incidentId: EffectIncidentId;
}>;

type CancelIncidentProcessInteraction = DeepReadonly<{
  kind: StimulusKind.CancelIncidentProcess;
  processInstanceId: string;
  incidentId: EffectIncidentId;
}>;

enum ProcessStatus {
  // existing members remain byte-identical
  Cancelled = "cancelled",
}

enum ControlStateKind {
  // existing members remain byte-identical
  Cancelled = "cancelled",
}
```

The wire is closed. It carries no scope occurrence, owner, reason, compensation flag, retry count, force flag, or host identity. Strict decoding rejects any such extra field. The duplicated Process identity is intentional address material: `processInstanceId`, `incidentId.effectId.processInstanceId`, and the running control identity must all be equal before a command can commit.

The terminal adapter contract is additive:

```ts
interface CancelledProcessReceipt {
  readonly definition: SemanticProcessIdentity;
  readonly processId: string;
  readonly processInstanceId: string;
  readonly finalState: StateObservation & {
    readonly status: ProcessStatus.Cancelled;
  };
  readonly messageDeliveryRecords: MessageDeliveryRecord[];
}

type TerminalProcessReceipt =
  | CompletedProcessReceipt
  | CancelledProcessReceipt;
```

`CompletedProcessReceipt` retains its exact existing shape and bytes. The Workflow result and `ProcessCommandResultKind.ProcessClosed.receipt` widen only to `TerminalProcessReceipt`. The cancellation Update itself returns the unchanged semantic `CommandOutcome.Committed`; the receipt describes subsequent host closure.

## Selected semantic algorithm

### ICANCEL-ADMIT-01

Before dispatch, require the exact successor profile and its exact reviewed Program shape, `Running` control, `initiationPending = false`, valid generation-1 incident associations, and the exact published cancellation stimulus. Every old profile, including the Stage 1 incident profile, rejects cancellation with exact state preservation. The Stage 1 profile continues to report and retry its incident unchanged.

### ICANCEL-ROOT-01

Require `stimulus.processInstanceId = state.control.instanceId` and `stimulus.incidentId.effectId.processInstanceId = state.control.instanceId`. Derive exactly one root occurrence satisfying both `parent = null` and `id.processInstanceId = state.control.instanceId`. Do not choose the first parentless occurrence and do not accept caller-supplied scope or owner data. Require exactly one live incident with the submitted identity and require its owner to belong to the derived root region.

### ICANCEL-COMMIT-01

Extend the shared scope-subtree cleanup relation so it removes every live owner in the root region, including tokens, ordinary waits, effect waits, effect incidents and their suspended waits, selected branch sets, event races, transitive called-Process regions, called-process ownership links, scope occurrences, and Activity-local variables owned by either an open or incident-suspended effect. Invoke that relation exactly once for the derived root and set control to `Cancelled(instanceId)`.

The transition preserves the complete Process-variable binding list, every activation high-water counter, `endOccurrences`, and logical time exactly. It emits no token, End occurrence, compensation, Event handler, output mapping, or internal closure step. The Process becomes terminal with `initiationPending = false`, empty live work, empty incidents, and no enabled interactions.

### ICANCEL-REFUSE-01

A wrong root identity, wrong or stale incident, duplicate cancellation, cancelled or completed state, malformed association, `initiationPending = true`, caller-supplied extra owner, incident-free state, or command under another profile rejects with exact state identity. A pending initiation is malformed for this command and is never repaired during cancellation. Deleting only the incident while leaving its root running is not a valid transition.

### ICANCEL-ORDER-01

Retry and cancellation are two distinct external semantic inputs. Canonical `enabledInteractions` family order remains User Task completion, Message delivery, incident Retry, then incident Cancel; adding Cancel preserves the complete Stage 1 ordering prefix. Swapping the simultaneously published Retry and Cancel entries is a strict projection and JSON-identity failure. Publication order grants neither command scheduling priority. Deterministic queue order is the explicit scheduler choice. If cancellation commits first, retry rejects against the terminal state. If retry commits first, cancellation rejects because the submitted incident is stale and the Process remains running with the reopened effect. The capsule does not claim confluence across those two orders.

## Runtime and observation consequences

The runtime gains typed `Cancelled(instanceId)`. `StateObservation.status` gains `cancelled`, and `EnabledInteraction` gains the exact cancellation interaction only for one eligible incident under the successor profile. `ObservationRequestKind` does not change.

A cancelled observation contains the preserved Process variables and logical time, with empty active waits, open tasks, Message subscriptions, timers, effects, incidents, and enabled interactions. The private terminal runtime has `initiationPending = false`. Activation counters and End history remain private state and are checked directly in TypeScript and Lean rather than projected as new public fields.

The unique-root and cleanup invariants apply to the complete runtime state. A malformed extra parentless occurrence, an incident outside the selected root, a duplicate incident, or an incident-owned Activity-local binding outside the cleanup region makes the command inadmissible rather than allowing partial cleanup.

## CIB Seven phase-zero evidence and mapping

The extended [`CibSevenServiceTaskIncidentPhaseZeroProbeTest`](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) is research evidence and does not itself register the profile. With `createIncidentOnFailedJobEnabled = true`, it starts the exact Service Task Process with committed string variable `preserved = "before-cancel"`, drives the async job from retries three to zero, requires one matching `failedJob` incident, and calls:

```java
runtimeService.deleteProcessInstance(processInstanceId, "owner-requested", false, true);
```

The probe establishes that live Process, job, incident, execution, and task counts become zero; one historic Process remains with state `EXTERNALLY_TERMINATED`; and the committed Process variable remains readable from history. Its existing successful control now also requires historic state `COMPLETED`, so runtime absence alone cannot be projected as cancellation.

The registered CIB evidence adds successor-only raw historic-state diagnostics bound to the command after which they were observed. Canonical projection requires the existing exact job/incident partners before deletion and the exact externally terminated historic root afterward. It uses the scenario's stable semantic Process identity and never exports raw CIB identity or delete reason. Existing CIB evidence files and old raw producer arms remain byte-identical.

## Lean lane

The Lean lane is **proved**. A new `IncidentCancellation.lean` module owns the declarative cancellation relation and executable evaluator. A new conformance module proves:

- exact evaluator soundness against the relation;
- unique-root derivation from the submitted public identity;
- complete removal of every represented live owner in the selected root and transitive called regions;
- exact preservation of Process variables, activation counters, End history, and logical time;
- terminal cancelled projection with `initiationPending = false`, no live work, and no enabled interaction;
- exact state preservation for wrong root, wrong/stale incident, old profile, malformed association including `initiationPending = true`, and terminal-state refusal;
- the two specified retry/cancel queue orders without claiming order independence;
- strict JSON identity for the new stimulus, interaction, status, state, and receipt-relevant projection.

`ScopeCancellation.lean` must gain incident-aware cleanup before the new transition delegates to it. `Execution.lean` has only 131 lines of reviewed headroom, so it receives only a narrow delegation arm; the new relation and proofs stay in their cohesive owners.

## Temporal hosting and refinement preflight

The cancellation stimulus arrives through Update name `bpmn-cancel-incident-process`. The adapter derives the Update ID through the existing canonical content-bound encoding of every stimulus field. A handler validates transport shape, enqueues the exact stimulus, and waits for the single semantic input loop; only that loop invokes `applyStimulus` and changes semantic state.

The exact Stage 1 incident profile and the exact cancellation successor select the same one-attempt incident Activity/report policy. Every unrelated profile retains the legacy Activity policy and exact prior result bytes. A focused policy oracle must prove that both incident profiles can turn the first typed technical failure into `reportEffectFailure`, while the Service Task effect profile and every other registered non-incident profile still reject that transport arm as unsupported.

After a committed cancellation, the Workflow drains already accepted handlers and returns `CancelledProcessReceipt` through ordinary Workflow completion. It does not request Temporal Workflow cancellation or termination, create a Cancellation Scope as semantic authority, cancel an Activity, inspect Event History, or derive cancellation from Workflow absence. The incident state has no in-flight Activity.

An exact Update retry recovers the retained semantic result before terminal classification. A distinct later command returns `processClosed` with the cancelled receipt. Worker replacement between incident publication and cancellation must preserve Query state, accepted-result recovery, terminal receipt, and replay. The retained history must contain Update acceptance/completion and Workflow completion, with no Workflow cancellation-request, cancellation, or termination Event family.

The nearest adapter counterexamples are native Workflow cancellation, returning ordinary completed state, closing before the accepted Update result is durable, classifying a cancelled receipt as unknown, and bypassing the semantic core to delete the incident. Each receives a direct history, client, or mutation discriminator.

## Cross-target scenario and evidence

Register one answer-free scenario over the unchanged Service Task source and the new profile:

1. start with `preserved = "before-cancel"`;
2. report literal generation-1 failure;
3. cancel the exact root through the exact published incident identity.

Lean and TypeScript consume explicit report and cancellation stimuli. CIB realizes report through the configured failed job and cancellation through public root deletion. Temporal derives report from the transport-only result and accepts cancellation by Update. No target receives expected output, raw CIB identity, Temporal identity, or a caller-selected root scope.

| Rule | CIB/profile | Lean | TypeScript | Temporal | Separating evidence |
|---|---|---|---|---|---|
| `ICANCEL-ADMIT-01` | exact successor and incident partners | profile/program admission theorem | strict gate before dispatch | successor shares the exact Stage 1 incident Activity/report policy, then profile-aware Update | old-profile, pending-initiation, and extra-owner-field refusal |
| `ICANCEL-ROOT-01` | raw root linked privately | unique-root theorem | identity-first root selection | hosting address plus semantic identity | substituted nested/root identity and duplicate-parentless mutations |
| `ICANCEL-COMMIT-01` | runtime cleanup plus externally terminated history | cleanup and preservation theorem | one shared subtree removal | ordinary terminal completion | incident-only deletion, variable/counter loss, and completed-status mutations |
| `ICANCEL-REFUSE-01` | missing partner refuses projection | state-identity theorems | exact unchanged state | retained-result-first resolution | stale incident, terminal retry, and target-substitution cases |
| `ICANCEL-ORDER-01` | one selected schedule only | both ordered evaluations plus exact Retry-before-Cancel projection | both ordered tests plus strict swapped-interaction rejection | queue-order live test | swapped canonical entries, winner-priority, or confluent-result mutation |

The complete differential case compares the public cancellation trace across CIB, Lean, TypeScript, and Temporal. TypeScript and Lean separately compare private counters and full runtime preservation. The live Temporal witness stops the Worker at the incident, submits cancellation around Worker replacement, recovers the same Update result, validates the cancelled receipt, submits one distinct later command for `processClosed`, inspects Event families, replays, and includes a host-cancel mutation.

## Required, optional, and excluded functionality

Required:

- one successor profile and one closed incident-gated root cancellation command;
- one published cancellation interaction carrying exact root and incident identity;
- typed cancelled semantic state, public status, terminal receipt, and post-closure classification;
- incident-aware shared root/called-tree cleanup with exact Process-data and monotonic-history preservation;
- configured CIB phase-zero and registered raw evidence, proved Lean, independent TypeScript, four-target differential, Worker replacement, retained Update, history, mutation, and replay evidence.

Optional only if it changes no claim:

- another Worker replacement point after Update acceptance;
- another wrong-root strict-decoder fixture.

Excluded:

- general BPMN cancellation, Transaction Cancel, compensation, rollback, Event Sub-Process handling, interrupting Event behavior, modeled Terminate End reinterpretation, multi-instance cancellation, arbitrary Process deletion, caller-selected nested scope, or a reason field;
- incident retry and cancellation in one atomic command, automatic remediation, a second incident, editing retry policy, CIB retry counts or causes;
- Temporal Workflow cancellation, termination, reset, pause, Activity cancellation, Event History-derived semantics, Search Attributes, or Visibility authority;
- Product 2 incident aggregation, authorization, audit, HTTP, UI, or operator action state.

## Versioning consequences

This is one additive pre-release profile and strict-wire replacement. Existing profile, scenario, BPMN source, checked graph, IL, canonical result, CIB evidence, semantic result, completed receipt, and retained history bytes remain exact. The new profile adds string Process-start data and cancellation capabilities while reusing the predecessor's executable Program shape. The new enum members force exhaustive consumers to compile against the new domain, but old cases produce their prior bytes.

Core owners include [`contract.ts`](../../packages/semantic-core/src/contract.ts) at 293/600, [`stimulus.ts`](../../packages/semantic-core/src/stimulus.ts) at 430/600, [`scenario.ts`](../../packages/semantic-core/src/scenario.ts) at 449/600, [`semantic-command-admission.ts`](../../packages/semantic-core/src/semantic-command-admission.ts) at 320/600, [`semantic-process-scope-cancellation.ts`](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) at 116/600, and [`semantic-process-call-runtime.ts`](../../packages/semantic-core/src/semantic-process-call-runtime.ts) at 312/600. New cohesive owners are `packages/semantic-core/src/semantic-process-incident-cancellation.ts` and its focused test.

Lean owners include [`RuntimeState.lean`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) at 452/600, [`CommandAdmission.lean`](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) at 170/600, [`ScopeCancellation.lean`](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) at 96/600, [`Execution.lean`](../../BpmnSemantics/SemanticProcess/Execution.lean) at 469/600, and [`SemanticProcessJsonMain.lean`](../../BpmnSemantics/SemanticProcessJsonMain.lean) at 370/600. New cohesive owners are `BpmnSemantics/SemanticProcess/IncidentCancellation.lean` and `BpmnSemantics/ServiceTaskIncidentCancellationConformance.lean`.

The Temporal Workflow implementation is [`workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) at 560/600 and must first extract terminal-state detection and receipt construction to `terminal-process-receipt.ts`; the cancellation Update belongs in `incident-cancellation-update-handler.ts`. [`effect-activity-policy.ts`](../../packages/temporal-adapter/workflow/src/effect-activity-policy.ts) at 28/600 must admit the exact cancellation successor beside the exact Stage 1 incident profile without widening any unrelated profile. The focused oracle remains [`service-task-incident-hosting.test.ts`](../../packages/temporal-adapter/testkit/test/service-task-incident-hosting.test.ts) at 141/600 and must prove both incident profiles select the same report path while all registered non-incident profiles retain their prior policy. New evidence must not grow [`harness-evidence.ts`](../../packages/temporal-adapter/testkit/src/harness-evidence.ts) beyond its current 500/600 owner.

The CIB engine runner [`CibSevenEngineScenarioRunner.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEngineScenarioRunner.java) is 584/600 and must first extract scenario/resource validation into `CibSevenScenarioValidator.java`. Cancellation execution and terminal projection belong in `CibSevenIncidentCancellationCommandExecutor.java` and `CibSevenProcessTerminationProjector.java`.

Crowded artifact and differential aggregators receive only delegation: [`contract-artifact-projections.test.ts`](../../scripts/contract-artifact-projections.test.ts) is 590/600, [`contract-cib-evidence-projection.ts`](../../scripts/contract-cib-evidence-projection.ts) is 584/600, [`pipeline-cases.ts`](../../packages/differential/test/pipeline-cases.ts) is 592/600, and [`pipeline-comparison.ts`](../../packages/differential/test/pipeline-comparison.ts) is 564/600. New cancellation artifact, CIB projection, differential case, comparison, and focused test owners hold the new logic.

The scenario schema, profile/scenario/evidence registries, Java protocol and JSON owners, strict Lean decoder, Temporal protocol/client/testkit, exhaustive status readers, package indexes, and documentation owners advance atomically. `node scripts/what-binds.ts` reports 20 guards plus the semantic-core or Temporal registry for TypeScript owners, six guards for Lean semantic owners, and five guards plus both runner registries for Java owners.

### Owners this implementation grows

These headroom values are the exact `node scripts/what-binds.ts` measurements at proposal time. New owners inherit their parent tree's guards and registry obligations and therefore do not appear as nonexistent links in this pre-implementation table.

| Owner | Headroom |
|---|---:|
| [`packages/semantic-core/src/contract.ts`](../../packages/semantic-core/src/contract.ts) | 292 |
| [`packages/semantic-core/src/stimulus.ts`](../../packages/semantic-core/src/stimulus.ts) | 150 |
| [`packages/semantic-core/src/semantic-process-state.ts`](../../packages/semantic-core/src/semantic-process-state.ts) | 234 |
| [`packages/semantic-core/src/semantic-process-scope-cancellation.ts`](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 476 |
| [`packages/semantic-core/src/semantic-process-call-runtime.ts`](../../packages/semantic-core/src/semantic-process-call-runtime.ts) | 258 |
| [`packages/semantic-core/src/semantic-process-incident-validation.ts`](../../packages/semantic-core/src/semantic-process-incident-validation.ts) | 497 |
| [`packages/semantic-core/src/semantic-command-admission.ts`](../../packages/semantic-core/src/semantic-command-admission.ts) | 271 |
| [`packages/semantic-core/src/semantic-process-admission.ts`](../../packages/semantic-core/src/semantic-process-admission.ts) | 243 |
| [`packages/semantic-core/src/semantic-process-runtime.ts`](../../packages/semantic-core/src/semantic-process-runtime.ts) | 219 |
| [`packages/semantic-core/src/scenario.ts`](../../packages/semantic-core/src/scenario.ts) | 124 |
| [`packages/semantic-core/src/semantic-profile-catalog.ts`](../../packages/semantic-core/src/semantic-profile-catalog.ts) | 545 |
| [`packages/semantic-core/src/semantic-profile-value-domain.ts`](../../packages/semantic-core/src/semantic-profile-value-domain.ts) | 516 |
| [`packages/semantic-core/src/semantic-process-profile.ts`](../../packages/semantic-core/src/semantic-process-profile.ts) | 449 |
| [`packages/semantic-core/src/checked-process-profile-shape.ts`](../../packages/semantic-core/src/checked-process-profile-shape.ts) | 365 |
| [`packages/semantic-core/src/semantic-program-profile-shape.ts`](../../packages/semantic-core/src/semantic-program-profile-shape.ts) | 352 |
| [`packages/semantic-core/src/semantic-process-graph-policy.ts`](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 530 |
| [`packages/semantic-core/src/index.ts`](../../packages/semantic-core/src/index.ts) | 556 |
| [`BpmnSemantics/Scenario.lean`](../../BpmnSemantics/Scenario.lean) | 350 |
| [`BpmnSemantics/SemanticProcess/RuntimeState.lean`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 147 |
| [`BpmnSemantics/SemanticProcess/ScopeCancellation.lean`](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 498 |
| [`BpmnSemantics/SemanticProcess/CommandAdmission.lean`](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 405 |
| [`BpmnSemantics/SemanticProcess/Execution.lean`](../../BpmnSemantics/SemanticProcess/Execution.lean) | 131 |
| [`BpmnSemantics/SemanticProcess/Scenario.lean`](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 232 |
| [`BpmnSemantics/SemanticProcess/Incident.lean`](../../BpmnSemantics/SemanticProcess/Incident.lean) | 450 |
| [`BpmnSemantics/SemanticProcess/ProfileAdmission.lean`](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 161 |
| [`BpmnSemantics/SemanticProcessJson/Scenario.lean`](../../BpmnSemantics/SemanticProcessJson/Scenario.lean) | 452 |
| [`BpmnSemantics/SemanticProcessJsonMain.lean`](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 218 |
| [`scripts/contract-artifacts.ts`](../../scripts/contract-artifacts.ts) | 88 |
| [`scripts/contract-artifact-cases.ts`](../../scripts/contract-artifact-cases.ts) | 365 |
| [`scripts/contract-artifact-projections.test.ts`](../../scripts/contract-artifact-projections.test.ts) | 5 |
| [`scripts/contract-cib-evidence.ts`](../../scripts/contract-cib-evidence.ts) | 475 |
| [`scripts/contract-cib-evidence-projection.ts`](../../scripts/contract-cib-evidence-projection.ts) | 16 |
| [`scripts/contract-cib-incident-projection.ts`](../../scripts/contract-cib-incident-projection.ts) | 465 |
| [`scripts/contract-cib-incident-projection.test.ts`](../../scripts/contract-cib-incident-projection.test.ts) | 465 |
| [`scripts/contract-incident-artifact-case.ts`](../../scripts/contract-incident-artifact-case.ts) | 591 |
| [`scripts/contract-incident-artifact-test-fixtures.ts`](../../scripts/contract-incident-artifact-test-fixtures.ts) | 585 |
| [`scripts/service-task-incident-contract-schema.test.ts`](../../scripts/service-task-incident-contract-schema.test.ts) | 445 |
| [`scripts/service-task-incident-profile-consistency.ts`](../../scripts/service-task-incident-profile-consistency.ts) | 416 |
| [`scripts/service-task-incident-profile-consistency.test.ts`](../../scripts/service-task-incident-profile-consistency.test.ts) | 484 |
| [`scripts/replace-cibseven-evidence.ts`](../../scripts/replace-cibseven-evidence.ts) | 250 |
| [`packages/differential/test/pipeline-cases.ts`](../../packages/differential/test/pipeline-cases.ts) | 8 |
| [`packages/differential/test/pipeline-comparison.ts`](../../packages/differential/test/pipeline-comparison.ts) | 36 |
| [`packages/differential/test/pipeline-cib-targets.ts`](../../packages/differential/test/pipeline-cib-targets.ts) | 445 |
| [`packages/differential/test/pipeline-types.ts`](../../packages/differential/test/pipeline-types.ts) | 404 |
| [`packages/differential/test/pipeline.test.ts`](../../packages/differential/test/pipeline.test.ts) | 114 |
| [`packages/differential/test/pipeline-catalog.test.ts`](../../packages/differential/test/pipeline-catalog.test.ts) | 43 |
| [`packages/temporal-adapter/protocol/src/command-identity.ts`](../../packages/temporal-adapter/protocol/src/command-identity.ts) | 400 |
| [`packages/temporal-adapter/protocol/src/contracts.ts`](../../packages/temporal-adapter/protocol/src/contracts.ts) | 406 |
| [`packages/temporal-adapter/protocol/src/lifecycle-results.ts`](../../packages/temporal-adapter/protocol/src/lifecycle-results.ts) | 416 |
| [`packages/temporal-adapter/protocol/src/incident-operation.ts`](../../packages/temporal-adapter/protocol/src/incident-operation.ts) | 553 |
| [`packages/temporal-adapter/client/src/incident-client.ts`](../../packages/temporal-adapter/client/src/incident-client.ts) | 465 |
| [`packages/temporal-adapter/client/src/semantic-update-client.ts`](../../packages/temporal-adapter/client/src/semantic-update-client.ts) | 534 |
| [`packages/temporal-adapter/client/src/process-client.ts`](../../packages/temporal-adapter/client/src/process-client.ts) | 166 |
| [`packages/temporal-adapter/client/src/process-work-client.ts`](../../packages/temporal-adapter/client/src/process-work-client.ts) | 385 |
| [`packages/temporal-adapter/workflow/src/effect-activity-policy.ts`](../../packages/temporal-adapter/workflow/src/effect-activity-policy.ts) | 567 |
| [`packages/temporal-adapter/workflow/src/workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 33 |
| [`packages/temporal-adapter/workflow/src/workflows.ts`](../../packages/temporal-adapter/workflow/src/workflows.ts) | 575 |
| [`packages/temporal-adapter/runner/src/host-interaction-driver.ts`](../../packages/temporal-adapter/runner/src/host-interaction-driver.ts) | 235 |
| [`packages/temporal-adapter/testkit/test/service-task-incident-hosting.test.ts`](../../packages/temporal-adapter/testkit/test/service-task-incident-hosting.test.ts) | 459 |
| [`packages/temporal-adapter/testkit/src/incident-scenario-execution.ts`](../../packages/temporal-adapter/testkit/src/incident-scenario-execution.ts) | 261 |
| [`packages/temporal-adapter/testkit/src/runner.ts`](../../packages/temporal-adapter/testkit/src/runner.ts) | 98 |
| [`packages/temporal-adapter/testkit/src/harness-evidence.ts`](../../packages/temporal-adapter/testkit/src/harness-evidence.ts) | 100 |
| [`packages/temporal-adapter/testkit/src/test-contracts.ts`](../../packages/temporal-adapter/testkit/src/test-contracts.ts) | 467 |
| [`packages/temporal-adapter/testkit/src/runner-support.ts`](../../packages/temporal-adapter/testkit/src/runner-support.ts) | 152 |
| [`packages/temporal-adapter/testkit/src/history-evidence-decoding.ts`](../../packages/temporal-adapter/testkit/src/history-evidence-decoding.ts) | 307 |
| [`packages/temporal-adapter/testkit/src/mutation-probes.ts`](../../packages/temporal-adapter/testkit/src/mutation-probes.ts) | 338 |
| [`packages/temporal-adapter/testkit/src/temporal-worker-host.ts`](../../packages/temporal-adapter/testkit/src/temporal-worker-host.ts) | 345 |
| [`packages/temporal-adapter/testkit/test/temporal-history-facts.ts`](../../packages/temporal-adapter/testkit/test/temporal-history-facts.ts) | 284 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | 109 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioInteractionProtocol.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioInteractionProtocol.java) | 565 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | 539 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEngineScenarioRunner.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEngineScenarioRunner.java) | 16 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java) | 277 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenIncidentProjector.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenIncidentProjector.java) | 475 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenIncidentCommandExecutor.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenIncidentCommandExecutor.java) | 488 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java) | 387 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibStateQueryEvidence.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibStateQueryEvidence.java) | 545 |
| [`runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioJson.java`](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioJson.java) | 558 |

## Guards and review boundary

| Guard or oracle | Obligation |
|---|---|
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [artifact projection](../../scripts/contract-artifact-projections.test.ts), and [CIB fidelity](../../scripts/cib-observation-fidelity.test.ts) | Reach the new stimulus, interaction, cancelled state, receipt, and raw historic-state projection while preserving old artifacts. |
| [effect artifact consistency](../../scripts/effect-operation-artifact-consistency.test.ts) | Prove unchanged source and checked/IL structure modulo successor profile identity. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Keep the new relation, evaluator, and preservation/refusal facts public and independently buildable. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) and [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Register the answer-free four-target cancellation schedule and reject target substitution. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep native cancellation, raw CIB identity, and Product 2 outside semantic authority. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce the named extractions, cohesive owners, registries, and reviewed line limits. |
| [review policy](../../scripts/independent-review-policy.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and [review packet](../../scripts/semantic-review-packet.test.ts) | Require context-cold proposal review, a conditional semantic checkpoint, and closure review. |

The implementation is material because it changes the strict stimulus and status wire, runtime terminal state, enabled interactions, CIB mapping, Lean proof boundary, Temporal terminal receipt, and refinement claim. It requires a context-cold proposal review before owner approval, a semantic checkpoint after the first green wire/runtime/receipt checkpoint, and cold closure unless the exact approved checkpoint reviewer qualifies for hash-bound warm continuity.

## Epistemic closure and cost boundary

The exact claim is that one public generation-1 incident makes one hosting-root cancellation command eligible; committing it removes the complete live root region, preserves committed Process data and monotonic history, exposes typed cancellation, and closes durably without native Temporal cancellation. It does not establish general cancellation, compensation, arbitrary deletion, or Product 2 operations.

The strongest common-mode risk is that all project targets could agree on an invented cancellation state while CIB merely deletes runtime data. The raw CIB lane therefore retains both the externally terminated historic state and committed historic variable, and the successful control distinguishes normal completion. CIB still does not derive the project's occurrence identity, cleanup representation, or counters; those remain separately proved and implemented.

The nearest realistic wrong accounts are selecting the first parentless occurrence, accepting a caller-supplied nested scope, deleting only the incident, erasing Process variables or counters, reusing ordinary completed state, mapping runtime absence to cancellation, invoking Temporal cancellation, losing an accepted result at closure, or pretending retry/cancel order is confluent. Each has a direct strict-decoder, semantic, raw-CIB, history, or mutation discriminator.

Closure records the commit-bounded cost in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md) against the Stage 1 incident capsule and the Terminate End capsule, which changed the nearest runtime and cancellation owners.

## Stop conditions

Stop and return to research, redesign, or owner direction if:

- a unique root cannot be derived from valid state without caller-supplied scope identity;
- shared cleanup cannot remove incident and called-tree owners symmetrically in Lean and TypeScript without changing already admitted behavior;
- the pinned CIB probe fails cleanup, externally terminated history, or committed-variable preservation;
- ordinary Temporal completion cannot retain a cancelled receipt and accepted Update result without changing old receipt bytes or replay;
- retry/cancel concurrency requires hidden priority rather than explicit queue order;
- implementation requires BPMN source, checked graph, or IL changes, native Temporal cancellation, Product 2 state, arbitrary in-flight cancellation, compensation, Transaction semantics, a second incident, or host retry facts;
- old-profile artifacts or histories must change rather than remain additive and byte-stable;
- the proved Lean lane cannot establish exact cleanup, preservation, and refusal identity within its declared bound.

## Decisions requested from the owner

Recommendation: approve the complete selected account after context-cold review. The reasons are that it publishes the exact future Product 2 eligibility fact at the engine boundary, reuses one existing cleanup mechanism without conflating its entry semantics, preserves old profile bytes, and has a direct CIB and Temporal discriminator.

Approval would select:

1. `cibseven-2.2.0-service-task-incident-cancellation-draft` as a successor to the Stage 1 incident profile.
2. `cancelIncidentProcess { commandId, processInstanceId, incidentId }` with no caller-supplied scope, owner, reason, or force flag.
3. One published cancellation interaction carrying the exact root Process identity and incident identity.
4. Typed `cancelled` runtime/public state and an additive cancelled terminal receipt, distinct from completed.
5. Root cleanup with exact Process-variable, counter, End-history, and logical-time preservation.
6. `CIB-EXT-0014` and `CIB-OP-0009` under the already selected CIB incident configuration.
7. A proved Lean lane and the four-target evidence strategy above.
8. Product 2 incident operations remaining Stage 3.
