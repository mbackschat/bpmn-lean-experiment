# User Task interaction semantic specification

## Status

**Implemented and evidence-closed draft specification for the bounded interaction slice on 2026-07-24; not an immutable compatibility profile.**

This project-owned semantic specification closes only the interaction boundary around the existing sequential `None Start Event → User Task → None End Event` model. It does not approve general human-task lifecycle semantics, people assignment, authorization, forms, variables, Search Attributes, a task inbox, multi-instance execution, or a broader CIB compatibility claim.

## Question

How can an application discover the exact active User Task of a known Process instance and submit a completion command through Temporal without treating Temporal messaging, Visibility, CIB-generated task IDs, or a UI read model as BPMN semantic authority?

## Source basis

BPMN 2.0.2 Clause 10.7.3 defines a User Task as human work assisted by software whose lifecycle is managed by a task manager, describes potential and actual ownership, and supplies optional rendering and implementation hooks. Clause 13.3.2 defines the shared Activity lifecycle, including activation, completion dependencies, and outgoing Sequence Flow activation. Clause 13.3.3 states that a User Task is distributed to its assigned person or group on activation and completes when the work has been done.

Those clauses require an execution-conforming runtime to manage the task and its completion, but they do not prescribe Temporal messaging, a global task-inbox consistency model, an authorization protocol, or a portable string encoding for a task occurrence.

The pinned CIB Seven `v2.2.0` public API exposes active tasks through `TaskService.createTaskQuery()`. The inherited `UserTaskTest.testTaskPropertiesNotNull` witness observes a non-null generated task ID, name, Process-instance ID, execution ID, Process-definition ID, task-definition key, and creation time. `TaskAssigneeTest.testTaskAssignee` discovers an assigned task, completes it through `TaskService.complete(task.getId())`, and observes Process completion. `TaskServiceTest.testCompleteTaskUnexistingTaskId` establishes that completing an unknown CIB task ID fails rather than advancing execution. The project-owned [bounded consistency probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConsistencyProbeTest.java) repeats that property at the project pin with a real generated ID after its task has completed.

CIB’s task ID is generated host identity. It is retained only in oracle diagnostics and in the local mapping needed to invoke `TaskService.complete`; it is not a canonical identity shared with Lean, TypeScript, or Temporal.

The [CIB–BPMN relationship register](../CIB-BPMN-RELATION-REGISTER.md) classifies the sequential lifecycle as `CIB-AGR-0001`, basic active-task discovery and completion as `CIB-AGR-0002`, host-task-to-semantic-task mapping as `CIB-OP-0001`, and the pinned oracle environment as `CIB-CFG-0001`. The current capsule has no candidate or confirmed CIB deviation.

## Semantic decision

The semantic core owns the User Task occurrence, its exact discoverable projection, and completion admission. Host transports expose that projection and deliver completion commands without becoming semantic authority.

```text
BPMN source and profile
          │
          ▼
profile-identified User Task definition in a Semantic Process program
          │
          ▼
semantic-core runtime creates one task occurrence
          │
          ├────────────► exact open-task projection
          │
          ◄──────────── structured completion command
```

The adopted Temporal Query/Update binding, replay path, and discovery boundary are owned by [the Temporal execution model](../research/TEMPORAL-EXECUTION-RESEARCH.md#initial-user-task-interaction-binding).

## Stable semantic rules and evidence

The identifiers below name the bounded propositions established by this capsule. They survive implementation and test renaming; changing a proposition materially requires a new identifier.

| Rule | Bounded proposition | Normative/profile basis | Lean | CIB Seven | TypeScript semantic core | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|---|---|
| `UTASK-ACTIVATE-01` | Activation in the admitted sequential model creates exactly one active occurrence `(Process instance, User Task element, activation 1)` | [Source basis](#source-basis) and the sequential draft profile | `start_reaches_single_user_task_wait` in [SequentialUserTask.lean](../../BpmnSemantics/SequentialUserTask.lean) | `calibratesTaskDiscoveryAndRejectsWrongActivationWithoutStateChange` in [CibSevenScenarioRunnerTest.java](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java) | Exact-occurrence and full-active-occurrence cases in [user-task-interaction.test.ts](../../packages/semantic-core/test/user-task-interaction.test.ts) | Complete interaction batch in [temporal-adapter.test.ts](../../packages/temporal-adapter/test/temporal-adapter.test.ts) | Activation `2` is not silently treated as the active occurrence |
| `UTASK-DISCOVER-01` | Committed waiting state projects the exact open task, admitted name, active lifecycle state, and command-ID-free enabled completion independently of future scenario commands | [Public task projection](#public-task-projection) | `waitingObservation` and the equal-pre-command-state witness in [UserTaskInteractionConformance.lean](../../BpmnSemantics/UserTaskInteractionConformance.lean) | Public `TaskService` query in [CibSevenScenarioRunnerTest.java](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java) | State-derived-interaction case in [user-task-interaction.test.ts](../../packages/semantic-core/test/user-task-interaction.test.ts) | Exact open-task Query in [temporal-adapter.test.ts](../../packages/temporal-adapter/test/temporal-adapter.test.ts) | Contract mutation changes observed activation `1` to `2`; successful and wrong-activation cases must have equal waiting projections |
| `UTASK-COMPLETE-01` | Completing the exact active occurrence commits, removes the open task, and completes the admitted Process | [Completion command](#completion-command) | `exact_task_completion_terminates` in [SequentialUserTask.lean](../../BpmnSemantics/SequentialUserTask.lean) | Exact completion in [CibSevenScenarioRunnerTest.java](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java) | Exact retained-result case in [user-task-interaction.test.ts](../../packages/semantic-core/test/user-task-interaction.test.ts) | Acknowledged completion Update plus live-history replay in [temporal-adapter.test.ts](../../packages/temporal-adapter/test/temporal-adapter.test.ts) | The live-history guard requires Update acceptance/completion and excludes Signal delivery |
| `UTASK-REFUSE-01` | A completion whose Process instance, element, or activation differs from the active occurrence is rejected with exact state preservation | [Completion command](#completion-command) and `CIB-OP-0001` | `task_identity_mismatch_is_rejected`, its wrong-activation corollary, and `element_id_alone_is_insufficient` in [SequentialUserTask.lean](../../BpmnSemantics/SequentialUserTask.lean) | Oracle mapping rejects the mismatch before CIB host completion in [CibSevenScenarioRunnerTest.java](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java) | Wrong-activation and full-occurrence cases in [user-task-interaction.test.ts](../../packages/semantic-core/test/user-task-interaction.test.ts) | Rejected wrong-activation Update in [temporal-adapter.test.ts](../../packages/temporal-adapter/test/temporal-adapter.test.ts) | Matching only the BPMN element ID is the checked non-law |
| `UTASK-REFUSE-02` | Repeating completion for an already completed occurrence under a distinct semantic command ID is rejected without reactivation | [Completion command](#completion-command) and `CIB-OP-0001` | `expectedStaleCompletionTrace` in [UserTaskInteractionConformance.lean](../../BpmnSemantics/UserTaskInteractionConformance.lean) | Oracle mapping finds no corresponding live CIB task and refuses before host completion in [CibSevenScenarioRunnerTest.java](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java); the adjacent consistency probe confirms CIB itself rejects a generated host task ID after completion | Stale-completion case in [user-task-interaction.test.ts](../../packages/semantic-core/test/user-task-interaction.test.ts) | Exact semantic rejection in the parallel live-sibling witness; the sequential Temporal case agrees through semantic completion and separately returns adapter-owned `processClosed` under an explicit post-terminal schedule | Completed-state preservation in the three semantic targets; live-sibling projection mutation and the unordered concurrent one-commit/one-rejection race |

The matrix indexes evidence; it does not merge the claims. A Lean theorem proves the selected Lean account, a CIB witness records finite oracle behavior, and the TypeScript and Temporal lanes remain independent implementation and refinement evidence.

## Oracle evidence fidelity

A CIB cell in the matrix above is not automatically engine evidence. The oracle adapter owns the `CIB-OP-0001` identity mapping, so some recorded values are computed by project code rather than observed from the engine. Reading four-target agreement as four independent accounts requires knowing which is which.

| Fidelity | Meaning |
|---|---|
| `engine-observed` | The recorded value is produced by pinned CIB Seven executing the admitted model through its public services |
| `adapter-derived` | CIB state is observed, but the recorded value is computed from it by the oracle adapter |
| `adapter-decided` | The recorded outcome is decided by the oracle adapter before or without consulting CIB |

| Rule | Engine-observed | Adapter-derived | Adapter-decided |
|---|---|---|---|
| `UTASK-ACTIVATE-01` | Exactly one live task exists after start, and its task-definition key and name | The activation ordinal `1` and the semantic Process-instance identity | — |
| `UTASK-DISCOVER-01` | Task presence, admitted name, and running Process status through `TaskService.createTaskQuery()` | Structured occurrence identity, wait multiplicity, and `enabledInteractions`, which are project projections rather than CIB concepts | — |
| `UTASK-COMPLETE-01` | `TaskService.complete` on the live task, wait removal, and Process completion | The semantic Process-instance identity in the resulting observation | — |
| `UTASK-REFUSE-01` | Element-ID mismatch, which reaches CIB as a task query returning no matching live task; state preservation after the refusal | — | Process-instance and **activation** mismatch, refused by the adapter before any CIB call |
| `UTASK-REFUSE-02` | Absence of a live CIB task after real completion, which is why the stale completion is refused | — | — |

The consequence is explicit: `UTASK-REFUSE-01` is the one rule whose activation clause the oracle lane cannot falsify, because the adapter implements the same ordinal rule that the capsule claims. Its wrong-activation agreement across CIB, Lean, the semantic core, and Temporal is therefore agreement with one project-authored rule, not four independent derivations of it. `UTASK-REFUSE-02` and `UTASK-COMPLETE-01` are engine-grounded, and `UTASK-ACTIVATE-01` is engine-grounded for task presence but not for ordinal allocation.

The generated-ID consistency probe strengthens only the adjacent host-identity premise used by `CIB-OP-0001`: pinned CIB refuses an ID that was genuine but is no longer live. It does not raise the activation clause of `UTASK-REFUSE-01` above `adapter-decided`, because no activation ordinal reaches CIB.

Repeated or simultaneous activation will require deriving the ordinal from CIB state rather than stamping the constant `1`; a history-count derivation is a candidate mechanism, not an approved one. That derivation needs its own `CIB-OP` entry, its own probe, and its own seeded mutation before any rule may claim engine-observed ordinal fidelity.

Fidelity labels remain owned by this capsule and are not duplicated into the internal pipeline report. The report is a gate input rather than a published claim artifact, and duplicating the classification there would create a second owner without strengthening the evidence. If pipeline results later become a public dashboard, paper artifact, or external compliance deliverable, machine-checkable per-cell provenance gains a concrete consumer and this decision must be revisited.

## Semantic task identity

The capsule uses a structured semantic identity rather than encoding multiple identity components into one delimiter-sensitive string:

```ts
interface UserTaskInstanceId {
  readonly processInstanceId: string;
  readonly elementId: string;
  readonly activation: number;
}
```

`processInstanceId` is the neutral semantic Process-instance identity supplied by the start command. `elementId` is the admitted BPMN User Task definition identity. `activation` is a one-based occurrence ordinal within that Process instance and User Task definition.

The sequential capsule creates exactly occurrence `1`. This proves why matching only `elementId` is insufficient without pretending that one task per element is a general BPMN invariant. Multi-instance execution, loops, and repeated activation remain outside the capsule.

The identity is semantic and serializable. CIB database task IDs, Temporal Workflow and Run IDs, Update IDs, and UI database keys remain host identities.

## Public task projection

The exact projection for an open task is:

```ts
enum UserTaskLifecycleState {
  Active = "active",
}

interface OpenUserTask {
  readonly id: UserTaskInstanceId;
  readonly name: string | null;
  readonly state: UserTaskLifecycleState;
}
```

The User Task name comes from the admitted BPMN source through the checked graph and current Semantic Process program. `null` distinguishes an omitted BPMN name from an invented display value. The task projection does not expose generated host IDs.

The canonical state observation reports `openUserTasks` and state-derived, command-ID-free `enabledInteractions`. It must not filter a scenario’s future scripted commands: the same admitted model and runtime state always produce the same canonical state projection.

## Completion command

The new semantic stimulus is:

```ts
interface CompleteUserTaskInstance {
  readonly kind: "completeUserTaskInstance";
  readonly commandId: string;
  readonly taskId: UserTaskInstanceId;
}
```

Completion commits only while that exact task occurrence is active. A wrong Process-instance ID, wrong BPMN element ID, wrong activation ordinal, or already completed occurrence is rejected with semantic state unchanged.

The semantic rejection rule applies only when the command reaches an addressable semantic Process. Under the [Temporal Process lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), a distinct command first addressed after terminal Workflow completion cannot reach the semantic core and is classified as adapter-owned `processClosed`. The sequential stale witness therefore keeps exact CIB Seven, Lean, and TypeScript semantic agreement while Temporal agrees on the prefix through completion and asserts `processClosed` separately. The parallel live-sibling witness in the [parallel capsule](PARALLEL-FORK-JOIN-SPEC.md) keeps another task active so all four targets exercise this same semantic rejection proposition.

The nearest checked non-law is: “matching the BPMN User Task element ID is sufficient for completion.” A witness with the correct element ID and wrong activation ordinal must be rejected.

Claiming, delegation, assignment, actor identity, authorization, completion variables, form submission, and task output mapping are excluded. Carrying an actor or variables without those semantics would create a misleading contract.

## IR and Lean consequence

The bounded XML compiler uses the CMOF-derived `FlowElement.name` property by preserving the optional BPMN User Task name through the checked graph and current Semantic Process program. This does not generalize the partial CMOF manifest or introduce a universal BPMN IL.

Lean keeps a small executable model separate from runtime instances. The model gains the reviewed User Task definition metadata; runtime state gains the semantic activation ordinal; observations gain the exact open-task projection for the new scenario.

The capsule must retain separate Lean claim lanes:

1. starting creates the exact active task occurrence;
2. matching full task-instance completion terminates the Process;
3. any mismatch in Process instance, BPMN element, or activation ordinal is rejected with state unchanged;
4. wrong activation is retained as a named corollary of that general identity law;
5. matching `elementId` alone is not sufficient, demonstrated by the same wrong-ordinal witness.

These theorems are properties of the Lean account. CIB correspondence and Temporal refinement remain separately tested.

## Declarative relation and executable evaluator

The Lean account defines `OperationStep` as the declarative relation for each Semantic Process operation and `ProgramStep` as the operation-identified relation over an admitted program. The executable `step` receives an explicit operation ID rather than selecting by collection order. The universal `step_sound` theorem proves that every state transition returned by `step` is admitted by `ProgramStep`; [SemanticProcessConformance.lean](../../BpmnSemantics/SemanticProcessConformance.lean) requires that bridge to elaborate.

The scenario runner uses bounded unique-only internal closure for the admitted sequential slice: exactly one enabled successor advances, none is stable, and multiple enabled successors report explicit ambiguity instead of inheriting operation-array order. External command admission remains separately implemented and protected by the exact completion and mismatch laws. Completeness of the evaluator with respect to the relation, full observational source-to-program-run preservation, TypeScript correspondence, and Temporal refinement are not proved by `step_sound`.

The parallel Lean witnesses pass operation IDs explicitly and prove final-state completion-order independence. Production parallel closure must preserve this boundary instead of encoding evaluator branch order as semantics.

## Runtime-only and synthetic construct inventory

| Construct | Classification and derivation | Why needed | Public projection | Lifecycle invariant |
|---|---|---|---|---|
| `ProcessControl` plus `initiationPending` | Project-owned semantic lifecycle derived from an accepted start and the generic `initiate`/`terminate` operations | Separate external start admission from internal initiation and completion without a topology-specific control-state enum | Projected only as the canonical Process status | One Process instance moves from not started to running; it becomes completed only after termination leaves no tokens, waits, or pending initiation |
| Flow-identified token multiset | Semantic runtime facts created and consumed by generic Semantic Process operations | Preserve Sequence-Flow provenance and multiplicity without reifying host executions | Hidden from this sequential capsule's canonical observation | Every operation consumes and produces exactly the reviewed named control-place multiplicities |
| `UserTaskWait(instanceId, task, activation, output)` | Semantic runtime occurrence derived when `awaitUserTask` consumes its input token | Distinguish the shared User Task definition from one active occurrence and retain the exact completion continuation | Projected as one active wait and one structured `OpenUserTask`; the continuation place is hidden | Exact Process instance, element, activation, and output identity are preserved until exact completion consumes the occurrence and produces one token |
| Per-task activation counter | Project-owned synthetic history summarized from prior `awaitUserTask` firings | Allocate a stable one-based semantic occurrence ordinal independently of host task IDs | Only the allocated ordinal appears in task identity | The counter increases exactly once for each admitted task activation and never decreases within the Process instance |
| Closure bound and ambiguity flags | Harness-only diagnostics derived by unique-only internal closure | Keep nontermination and undeclared scheduling choice separate from semantic outcomes | Excluded from canonical observations and command outcomes | Either closure reaches a stable state, reports bound exhaustion, or reports more than one enabled successor without choosing by collection order |
| CIB task ID, Temporal Workflow/Run/Update IDs, and UI keys | Host-runtime identity | Address host APIs, delivery, diagnostics, or read models | Excluded from semantic task identity and canonical observations | May correlate to a semantic occurrence locally but may not determine its BPMN meaning |

## Closure interpretation

The exact claim established by this capsule is bounded: for the one content-addressed sequential model and draft CIB Seven profile, the semantic task occurrence `(Instance_1, UserTask_Approve, 1)` is discoverable from committed state; completing that exact occurrence commits and completes the Process; wrong-activation and stale completions are rejected without changing committed state in Lean, the independent TypeScript semantic core, and the pinned CIB-backed oracle adapter; Temporal Query/Update hosting preserves the exact semantic prefix through completion, duplicate delivery, and replay, then classifies an explicitly post-terminal stale command as adapter-owned `processClosed`. Exact four-target stale semantic rejection is established separately while a live sibling keeps the parallel Process addressable.

The closest unsupported claim is repeated or simultaneous activation of the same BPMN User Task definition. The current model creates only activation `1`; the checked wrong-ordinal witness proves that element identity alone is insufficient, but it does not establish how ordinals are allocated across loops, multi-instance execution, nested scopes, migration, or Continue-As-New.

The principal common-mode risk is a shared interpretation or observation defect. All semantic targets could agree because the capsule omitted a relevant BPMN fact or because the canonical projection hid it. Answer-free scenarios, independent live CIB execution, a checked non-law, source/profile identities, the task-projection mutation, and live Temporal replay reduce that risk but do not eliminate it.

Two specific common-mode facts belong in this closure rather than in prose elsewhere. First, this capsule prescribes the synthetic control decomposition, so the Lean account and the TypeScript semantic core are independent transcriptions that check transcription defects, and they would reproduce an error in the prescribed account identically. Account-level independence for this capsule comes only from the normative review and from CIB evidence at the fidelity recorded above. Second, Lean now strictly decodes the pipeline-provided checked graph and Semantic Process program, independently recomputes canonical lowering, rejects inequality before evaluation, and echoes the accepted definition binding. This closes silent definition drift, but it does not prove the XML parser, full observational checked-source-to-program-run preservation, or correspondence of the other implementations.

The declarative relation and evaluator can also share the same incorrect transition account because they are authored in one Lean module. `step_sound` rejects evaluator behavior outside the relation; it does not prove that the relation is complete, sufficiently restrictive, or faithful to BPMN and the selected CIB profile. The normative/profile analysis, checked non-law, independent implementations, CIB evidence, and structurally distinct parallel capsule remain necessary.

The result supports continuing the architecture: Lean supplied a reusable full-occurrence rejection law and forced definition identity, runtime occurrence identity, command admission, and host identity apart; the TypeScript core remained independently executable; and Temporal added durable Query/Update transport without owning task semantics. It does not yet justify a general BPMN IR, a general Lean transport, a global task inbox, or any conformance claim.

## Separating witnesses

| Witness | Required result | Distinction protected |
|---|---|---|
| Start the sequential Process | One active task named `Approve` with identity `(Instance_1, UserTask_Approve, 1)` | Definition identity versus semantic occurrence identity |
| Complete that exact occurrence | Command committed; no open tasks; Process completed | Managed User Task completion |
| Correct element, wrong activation `2` | Command rejected; state unchanged | Element ID alone is insufficient |
| Correct task occurrence after completion under a new command ID | CIB Seven, Lean, and the core reject with completed state unchanged; Temporal preserves the completion prefix and returns `processClosed` for explicit post-terminal delivery | Semantic stale rejection remains distinct from adapter closure classification |
| Complete A while B remains active, then repeat A under a new command ID | All four targets reject the stale A occurrence while B remains open | Semantic stale rejection remains executable through ordinary live ingress |
| Mutate observed activation `1` to `2` | Differential comparison reports the exact task-projection disagreement | New evidence projection is mutation-sensitive |

## Explicit exclusions

- claiming, unclaiming, assignment, candidate users or groups, delegation, ownership, authorization, and identity-provider integration;
- forms, renderings, completion variables, data associations, and output mapping;
- due dates, priority, suspension, cancellation, escalation, and boundary Events;
- multiple or repeated User Task occurrences;
- Search Attributes, Visibility-based discovery, and a production task inbox;
- Continue-As-New and cross-Run command deduplication;
- a general BPMN executable IR, general source compiler, or BPMN conformance claim.
