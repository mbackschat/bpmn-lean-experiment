# User Task completion-data proposal

## Status

**Owner-approved on 2026-07-31; unimplemented; phase-zero CIB Seven `2.2.0` evidence is required before semantic implementation.**

## Question

For the existing exact User Task occurrence, how should an executable CIB Seven compatibility profile expose selected form input and apply simulated user-entered string/null values on completion without claiming general BPMN data association, form, or human-resource semantics?

## Layer ownership

The BPMN User Task lifecycle and exact occurrence admission remain owned by the [implemented User Task interaction specification](USER-TASK-INTERACTION-SPEC.md). BPMN 2.0.2 does not define `TaskService.complete(taskId, variables)` or a universal form-submission-to-Process-variable rule.

This proposal therefore adds one selected CIB Seven `2.2.0` operational compatibility rule over the existing BPMN lifecycle. The [runnable MVP](../RUNNABLE-TEMPORAL-MVP-PROPOSAL.md) is its first concrete host consumer. The dummy actor, delay, CLI, and simulated response configuration are adapter/product facts and do not enter Lean or the semantic core.

## Proposed data contract

Reuse the implemented closed string/null Process-variable domain. Extend the exact User Task completion stimulus atomically with a canonical submitted patch:

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

The exact open-task detail for the MVP pairs the existing `OpenUserTask` with a caller-selected projection of committed Process variables. Field selection is host configuration and does not become task-definition metadata or canonical semantic state. Values are read from the same committed Process scope that the semantic core projects publicly; private Activity-local variables remain invisible.

## Proposed rules

| Rule | Proposition | Layer |
|---|---|---|
| `UTDATA-READ-01` | A known active User Task can be paired with an exact caller-selected projection of the current committed Process string/null variables without changing semantic state. | Adapter projection over core-owned Process state |
| `UTDATA-COMPLETE-01` | Completing the exact active occurrence with a valid canonical patch atomically merges that patch into Process scope before outgoing internal closure, removes the task wait, and continues control flow. | Selected CIB compatibility overlay implemented by the semantic core |
| `UTDATA-REFUSE-01` | An occurrence mismatch or stale completion rejects with the complete Process state, including variables, unchanged; no patch is installed. | Existing BPMN task-admission rule specialized to the widened command |
| `UTDATA-OBSERVE-01` | A committed patch is visible only through the ordinary canonical Process-variable projection and subsequent semantic consumers; host form, actor, and timer facts remain absent. | Shared observation boundary |

The merge rule replaces an existing binding with the submitted value and creates an absent binding. Explicit null remains distinct from absence. No deletion operation, nested value, coercion, expression evaluation, output mapping, field validation, or task-local variable scope is introduced.

## Phase-zero CIB Seven evidence

Before Lean, TypeScript, shared wire, or Temporal implementation, a pristine packaged CIB Seven `2.2.0` probe must answer these exact questions through public services:

1. which Process variables are visible for one active User Task through the selected task-service read boundary;
2. whether `TaskService.complete(taskId, variables)` creates an absent string binding, overwrites an existing string binding, and preserves unrelated bindings;
3. whether an explicit null value is retained as a present null Process variable or treated as deletion/absence under the pinned serializer configuration;
4. whether the submitted values are committed before outgoing Sequence Flow continuation and visible at Process completion;
5. whether completion of an unknown or already completed host task applies no submitted values.

The probe must retain raw task/variable observations and a no-data control. Its result receives a reviewed `CIB-OP`, `CIB-INT`, `CIB-EXT`, `CIB-CFG`, `CIB-LIM`, or `CIB-DEV` entry before profile meaning is fixed. This proposal does not reserve a register identifier or pre-classify an unobserved result.

If null is not retained as present null, the owner must choose between narrowing the compatibility patch to strings, selecting a profile-specific null rule with an honest relation classification, or rejecting the capsule. Implementation must not silently substitute the existing Service Task null semantics.

## Semantic Process and runtime consequence

No checked BPMN node, Semantic Process operation, or source admission shape changes. `awaitUserTask` already identifies the exact task occurrence and continuation, and Process string/null bindings already exist. This capsule widens only the completion stimulus and its state transition under a new selected profile capability.

That absence of a new operation does not waive the targeted preservation gate. The capsule must prove or executable-check that submitted data cannot change which operation is enabled before the completion commits, that refusal preserves all scoped variables, and that post-patch internal closure remains within the current limit for the admitted acceptance model.

## Temporal hosting and refinement preflight

- Durable ingress remains the content-bound `bpmn-complete-user-task` Update; every submitted binding participates in the canonical Update ID.
- The validator checks transport shape only. One main Workflow loop applies the widened semantic stimulus and no handler mutates Process variables.
- The Update completes only after the patch and outgoing closure commit or the exact refusal result is recorded.
- Exact duplicate delivery returns the first result without applying the patch twice. Reuse of one semantic command ID with a different patch must reach the existing identity-conflict boundary rather than alias the first Update.
- Query may return the committed Process variables and open task for the known Workflow. It does not expose speculative submission values.
- The MVP dummy delay is separate foreground-actor behavior. The semantic Process remains durably waiting, and the actor eventually invokes the same ordinary completion Update; no BPMN or Temporal timer is added to the Process Workflow.
- Same-gate Event History must contain the content-bound Update acceptance/completion; a bypass mutation that writes variables or closes the task outside the core must fail.
- The pre-release atomic replacement includes TypeScript and Lean stimuli, strict decoders, schemas, scenario fixtures, canonical encoding, Update identity, all runners and projectors, retained CIB evidence, Temporal history assertions, docs, and compile-time closed-union guards. No legacy no-data command reader remains; existing fixtures emit `submittedValues: []`.

## Separating witnesses

| Witness | Required result |
|---|---|
| Start with `existing = "before"`; submit `created = "yes"`, `existing = "after"`, and `cleared = null` | Completion commits; final Process variables contain the created binding, overwritten value, present null, and every unrelated binding |
| Submit the same exact command again | Original committed result is recovered; variables are unchanged |
| Reuse the semantic command ID with a different submitted value | Adapter identity conflict; neither alternative patch is applied after the first result |
| Submit the valid patch for activation `2` while activation `1` is active | Semantic rejection with the complete pre-command variables unchanged |
| Mutate the host to write the patch without the core result | Temporal refinement/history guard fails |

## Required evidence

Closure requires the pinned CIB relation and raw probe, an answer-free scenario, Lean executable meaning and a quantified refusal-preservation law, independent TypeScript behavior, strict wire and canonical-ID checks, Temporal Update/refinement/replay evidence, a meaningful variable-write bypass mutation, and exact status in the [implementation map](../IMPLEMENTATION-MAP.md).

## Explicit exclusions

- BPMN `DataInput`, `DataOutput`, `InputOutputSpecification`, Data Associations, Properties, Data Objects, Assignments, and transformation expressions;
- Camunda/CIB form keys, embedded or external forms, generated forms, validation constraints, and form metadata;
- task-local variables, transient variables, serialization formats beyond the closed canonical string/null domain, and variable deletion;
- assignee, candidate, claim, delegation, actor identity, authorization, authentication, and audit policy;
- UI rendering, task lists, Search Attributes, global discovery, attachments, comments, due dates, priority, reminders, and escalation;
- more than one simultaneously active dummy User Task and any claim about multi-instance or repeated activation;
- A12 Workflows form or task-list compatibility.

## Versioning consequences

This is a breaking pre-release command-shape replacement even though `submittedValues: []` preserves existing meaning. Every producer and consumer changes atomically under the current pre-release policy. The selected semantic profile receives a new identity because completion meaning and the accepted stimulus surface widen.

No retained production history exists. If one is approved before this capsule lands, implementation stops for an explicit migration, patch, replay, and rollback decision based on those actual histories.

## Reopen conditions

Reopen before adding any new value kind, field schema, form metadata, task-local scope, data association, deletion, actor/authorization fact, simultaneous dummy tasks, or completion source other than the exact semantic command.
