# User Task completion-data specification

## Status

**Implemented and evidence-closed draft specification on 2026-07-31; not an immutable compatibility profile.**

## Question

For the existing exact User Task occurrence, how should an executable CIB Seven compatibility profile expose selected form input and apply simulated user-entered string/null values on completion without claiming general BPMN data association, form, or human-resource semantics?

## Layer ownership

The BPMN User Task lifecycle and exact occurrence admission remain owned by the [implemented User Task interaction specification](USER-TASK-INTERACTION-SPEC.md). BPMN 2.0.2 does not define `TaskService.complete(taskId, variables)` or a universal form-submission-to-Process-variable rule.

This specification adds the selected CIB Seven `2.2.0` public-service extension [`CIB-EXT-0005`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0005--public-user-task-completion-installs-submitted-process-variables) over the existing BPMN lifecycle. The [Temporal engine runner](../RUNNABLE-TEMPORAL-MVP-SPEC.md) is its first concrete host consumer. The simulated actor, delay, CLI, and response configuration are adapter/product facts and do not enter Lean or the semantic core.

## Data contract

The implemented contract reuses the closed string/null Process-variable domain and extends the exact User Task completion stimulus atomically with a canonical submitted patch:

```ts
type UserTaskCompletionValue =
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "null" }>;

type UserTaskCompletionBinding = Readonly<{
  name: string;
  value: UserTaskCompletionValue;
}>;

interface CompleteUserTaskInstance {
  readonly kind: "completeUserTaskInstance";
  readonly commandId: string;
  readonly taskId: UserTaskInstanceId;
  readonly submittedValues: readonly UserTaskCompletionBinding[];
}
```

Binding names are nonempty, unique, and canonically ordered by Unicode scalar value. The empty patch remains valid and represents the existing no-data completion. Unknown fields, duplicate names, unsafe encodings, unsupported value variants, and noncanonical order are boundary failures rather than semantic commands.

The exact engine-runner open-task detail pairs the existing `OpenUserTask` with a caller-selected projection of committed Process variables. Field selection is host configuration and does not become task-definition metadata or canonical semantic state. Values are read from the same committed Process scope that the semantic core projects publicly; private Activity-local variables remain invisible.

## Stable rules and evidence

| Rule | Proposition | Layer |
|---|---|---|
| `UTDATA-READ-01` | A known active User Task can be paired with an exact caller-selected projection of the current committed Process string/null variables without changing semantic state. | Adapter projection over core-owned Process state |
| `UTDATA-COMPLETE-01` | Completing the exact active occurrence with a valid canonical patch atomically merges that patch into Process scope before outgoing internal closure, removes the task wait, and continues control flow. | Selected CIB compatibility overlay implemented by the semantic core |
| `UTDATA-REFUSE-01` | An occurrence mismatch or stale completion rejects with the complete Process state, including variables, unchanged; no patch is installed. | Existing BPMN task-admission rule specialized to the widened command |
| `UTDATA-OBSERVE-01` | A committed patch is visible only through the ordinary canonical Process-variable projection and subsequent semantic consumers; host form, actor, and timer facts remain absent. | Shared observation boundary |

| Rule | Lean | CIB Seven | TypeScript semantic core | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|
| `UTDATA-READ-01` | Process scope remains distinct from Activity-local scope in [Data.lean](../../BpmnSemantics/SemanticProcess/Data.lean) | The phase-zero probe reads public task variables before completion | Canonical Process projection and the exact completion fixture | `bpmn-user-task-detail` pairs the complete active occurrence with only caller-selected committed Process bindings | Activity-local bindings remain outside canonical variables |
| `UTDATA-COMPLETE-01` | `exact_completion_merges_process_bindings` in [UserTaskCompletionDataConformance.lean](../../BpmnSemantics/UserTaskCompletionDataConformance.lean) | Retained `TaskService.complete(taskId, variables)` evidence records create, replace, present null, and preservation | Exact merge and scenario cases in [user-task-interaction.test.ts](../../packages/semantic-core/test/user-task-interaction.test.ts) | Exact Update payload, receipt variables, replay, and command identity in [temporal-adapter.test.ts](../../packages/temporal-adapter/testkit/test/temporal-adapter.test.ts) | Reusing a command ID with different patch content reaches the identity-conflict guard |
| `UTDATA-REFUSE-01` | `mismatched_completion_preserves_all_scoped_variables` quantifies over complete scoped variables | Wrong-activation and stale retained cases record no submitted write | Wrong occurrence preserves the exact state including Process and Activity-local variables | Rejected Update or closed-Process result cannot install its patch | Wrong-activation and stale scenarios submit discriminating values that remain absent or unchanged |
| `UTDATA-OBSERVE-01` | The completed observation exposes only merged Process bindings | Retained raw history-backed Process-variable snapshots bind canonical final variables | Scenario projection exposes the same canonical bindings | Query trace and completed receipt agree | The raw-variable projection mutation and completion-data Workflow bypass both fail |

The merge rule replaces an existing binding with the submitted value and creates an absent binding. Explicit null remains distinct from absence. No deletion operation, nested value, coercion, expression evaluation, output mapping, field validation, or task-local variable scope is introduced.

## Phase-zero CIB Seven evidence

The Java-21 [packaged-engine probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskCompletionDataPhaseZeroProbeTest.java) completed under pinned CIB Seven `2.2.0` and `CIB-CFG-0001`. Its project-authored Model API fixture has two sequential User Tasks so the public continuation state remains observable before final completion.

The first task's `TaskService.getVariables(taskId)` returns the complete initial Process map. `TaskService.complete(taskId, variables)` creates an absent string binding, overwrites an existing string, preserves an unrelated binding, and retains an explicit null as a present Process variable. The following User Task observes the complete merged map immediately after the completion command, and the audit-history variable query retains the same map after final Process completion. A no-data completion control preserves the initial map. Unknown and already completed generated task IDs throw `ProcessEngineException`; public runtime-variable and active-task observations remain unchanged, so neither refused call applies its supplied values.

The relationship register classifies that public completion protocol as selected extension [`CIB-EXT-0005`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0005--public-user-task-completion-installs-submitted-process-variables), not BPMN data-association or form semantics. The observed present-null result selects the implemented closed string/null patch without reopening the value domain.

## Semantic Process and runtime consequence

No checked BPMN node, Semantic Process operation, or source admission shape changes. `awaitUserTask` already identifies the exact task occurrence and continuation, and Process string/null bindings already exist. This capsule widens only the completion stimulus and its state transition under the current `cibseven-2.2.0-user-task-process-data-draft` profile capability.

That absence of a new operation does not waive the targeted preservation gate. Lean and TypeScript check that submitted data cannot change which operation is enabled before completion commits, the quantified Lean mismatch law preserves arbitrary complete scoped variables, and exact completion closes below the current internal-step limit without ambiguity.

## Temporal hosting and refinement

- Durable ingress remains the content-bound `bpmn-complete-user-task` Update; every submitted binding participates in the canonical Update ID.
- The validator checks transport shape only. One main Workflow loop applies the widened semantic stimulus and no handler mutates Process variables.
- The Update completes only after the patch and outgoing closure commit or the exact refusal result is recorded.
- Exact duplicate delivery returns the first result without applying the patch twice. Reuse of one semantic command ID with a different patch must reach the existing identity-conflict boundary rather than alias the first Update.
- Query may return the committed Process variables and open task for the known Workflow. It does not expose speculative submission values.
- The engine runner's configured delay is separate foreground-actor behavior. The semantic Process remains durably waiting, and the actor eventually invokes the same ordinary completion Update; no BPMN or Temporal timer is added to the Process Workflow.
- Same-gate Event History contains the content-bound Update acceptance/completion; a retained bypass mutation that writes variables outside the core while omitting the core command result fails Query/Update reconciliation.
- The pre-release atomic replacement covers TypeScript and Lean stimuli, strict decoders, schemas, scenario fixtures, canonical encoding, Update identity, all runners and projectors, retained CIB evidence, Temporal history assertions, docs, and compile-time closed-union guards. No legacy no-data command reader remains; existing fixtures emit `submittedValues: []`.

## Separating witnesses

| Witness | Required result |
|---|---|
| Start with `existing = "before"`; submit `created = "yes"`, `existing = "after"`, and `cleared = null` | Completion commits; final Process variables contain the created binding, overwritten value, present null, and every unrelated binding |
| Submit the same exact command again | Original committed result is recovered; variables are unchanged |
| Reuse the semantic command ID with a different submitted value | Adapter identity conflict; neither alternative patch is applied after the first result |
| Submit the valid patch for activation `2` while activation `1` is active | Semantic rejection with the complete pre-command variables unchanged |
| Mutate the host to write the patch without the core result | Temporal refinement/history guard fails |

## Evidence closure

The pinned CIB relation and raw probe, answer-free scenarios, Lean executable meaning and quantified refusal-preservation law, independent TypeScript behavior, strict wire and canonical-ID checks, retained CIB evidence with a raw-variable mutation, Temporal Update/refinement/replay evidence, and the completion-data bypass mutation are green. Exact current status is recorded in the [implementation map](../IMPLEMENTATION-MAP.md).

The reproducible implementation boundary is `8a5f3ac..5255888`: hand-written Lean, TypeScript, Java, and JavaScript changed by `+651/-94` nonblank lines and documentation changed by `+84/-63`; elapsed time is unknown. The exact established claim is atomic create/replace/preserve/present-null Process-variable merge on one exact active User Task completion under selected CIB extension `CIB-EXT-0005`. The closest unsupported claim is BPMN Data Association, form meaning, task-local data, variable deletion, a wider value domain, or more than one dummy task. The principal correlation risk is the shared admitted scenario/profile account; the separately constructed public-service CIB probe and retained raw history projection constrain the selected extension, while Lean and TypeScript remain separate realizations downstream of the admitted graph. Wrong activation, stale occurrence, changed-payload command identity, malformed binding order, and outside-core variable installation are the nearest executable counterexamples. This capsule is materially smaller in code than the preceding Message capsule because it reuses the existing occurrence, scoped-data, Update, receipt, and replay mechanisms; the raw CIB projector required the only new cross-layer evidence owner.

## Explicit exclusions

- BPMN `DataInput`, `DataOutput`, `InputOutputSpecification`, Data Associations, Properties, Data Objects, Assignments, and transformation expressions;
- Camunda/CIB form keys, embedded or external forms, generated forms, validation constraints, and form metadata;
- task-local variables, transient variables, serialization formats beyond the closed canonical string/null domain, and variable deletion;
- assignee, candidate, claim, delegation, actor identity, authorization, authentication, and audit policy;
- UI rendering, task lists, Search Attributes, global discovery, attachments, comments, due dates, priority, reminders, and escalation;
- more than one simultaneously active dummy User Task and any claim about multi-instance or repeated activation;
- A12 Workflows form or task-list compatibility.

## Versioning consequences

This was a breaking pre-release command-shape replacement even though `submittedValues: []` preserves existing meaning. Every producer and consumer changed atomically under the current pre-release policy. Completion first received identity `cibseven-2.2.0-user-task-data-draft`; the later [Process-start data specification](PROCESS-START-DATA-SPEC.md) atomically replaced that pre-release identity with current `cibseven-2.2.0-user-task-process-data-draft` when the accepted start surface widened.

No retained production history existed at replacement. Approval of the first durable baseline still requires explicit migration, patch, replay, and rollback decisions based on actual retained histories.

## Reopen conditions

Reopen before adding any new value kind, field schema, form metadata, task-local scope, data association, deletion, actor/authorization fact, simultaneous dummy tasks, or completion source other than the exact semantic command.
