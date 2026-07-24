# User Task interaction semantic capsule

## Status

**Evidence-closed draft for the bounded interaction slice on 2026-07-24; not an immutable compatibility profile.**

This project-owned semantic specification closes only the interaction boundary around the existing sequential `None Start Event → User Task → None End Event` model. It does not approve general human-task lifecycle semantics, people assignment, authorization, forms, variables, Search Attributes, a task inbox, multi-instance execution, or a broader CIB compatibility claim.

## Question

How can an application discover the exact active User Task of a known Process instance and submit a completion command through Temporal without treating Temporal messaging, Visibility, CIB-generated task IDs, or a UI read model as BPMN semantic authority?

## Source basis

BPMN 2.0.2 Clause 10.7.3 defines a User Task as human work assisted by software whose lifecycle is managed by a task manager, describes potential and actual ownership, and supplies optional rendering and implementation hooks. Clause 13.3.2 defines the shared Activity lifecycle, including activation, completion dependencies, and outgoing Sequence Flow activation. Clause 13.3.3 states that a User Task is distributed to its assigned person or group on activation and completes when the work has been done.

Those clauses require an execution-conforming runtime to manage the task and its completion, but they do not prescribe Temporal messaging, a global task-inbox consistency model, an authorization protocol, or a portable string encoding for a task occurrence.

The pinned CIB Seven `v2.2.0` public API exposes active tasks through `TaskService.createTaskQuery()`. The inherited `UserTaskTest.testTaskPropertiesNotNull` witness observes a non-null generated task ID, name, Process-instance ID, execution ID, Process-definition ID, task-definition key, and creation time. `TaskAssigneeTest.testTaskAssignee` discovers an assigned task, completes it through `TaskService.complete(task.getId())`, and observes Process completion. `TaskServiceTest.testCompleteTaskUnexistingTaskId` establishes that completing an unknown CIB task ID fails rather than advancing execution.

CIB’s task ID is generated host identity. It is retained only in oracle diagnostics and in the local mapping needed to invoke `TaskService.complete`; it is not a canonical identity shared with Lean, TypeScript, or Temporal.

## Semantic decision

The semantic core owns the User Task occurrence, its exact discoverable projection, and completion admission. Host transports expose that projection and deliver completion commands without becoming semantic authority.

```text
BPMN source and profile
          │
          ▼
versioned User Task definition in executable IR
          │
          ▼
semantic-core runtime creates one task occurrence
          │
          ├────────────► exact open-task projection
          │
          ◄──────────── versioned completion command
```

The adopted Temporal Query/Update binding, replay path, and discovery boundary are owned by [the Temporal execution model](../TEMPORAL-EXECUTION-MODEL.md#initial-user-task-interaction-binding).

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

The User Task name comes from the admitted BPMN source through a versioned executable-IR field. `null` distinguishes an omitted BPMN name from an invented display value. The task projection does not expose generated host IDs.

The versioned canonical state observation adds `openUserTasks` for the new scenario schema. The Milestone 0 schema and retained Temporal history keep their original projection so replay does not reinterpret an old Workflow completion payload.

The interaction schema reports state-derived, command-ID-free `enabledInteractions`. It must not filter a scenario’s future scripted commands: the same model and runtime state always produce the same canonical state projection.

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

The nearest checked non-law is: “matching the BPMN User Task element ID is sufficient for completion.” A witness with the correct element ID and wrong activation ordinal must be rejected.

Claiming, delegation, assignment, actor identity, authorization, completion variables, form submission, and task output mapping are excluded. Carrying an actor or variables without those semantics would create a misleading contract.

## IR and Lean consequence

The existing sequential XML compiler gains a second semantic use of the CMOF-derived `FlowElement.name` property by preserving the optional BPMN User Task name in a new executable-IR version. This is not a second structurally distinct compiler consumer. The prior IR version remains readable only where required for retained history and compatibility tests. The change does not generalize the partial CMOF manifest or introduce a universal BPMN IR.

Lean keeps a small executable model separate from runtime instances. The model gains the reviewed User Task definition metadata; runtime state gains the semantic activation ordinal; observations gain the exact open-task projection for the new scenario.

The capsule must retain separate Lean claim lanes:

1. starting creates the exact active task occurrence;
2. matching full task-instance completion terminates the Process;
3. any mismatch in Process instance, BPMN element, or activation ordinal is rejected with state unchanged;
4. wrong activation is retained as a named corollary of that general identity law;
5. matching `elementId` alone is not sufficient, demonstrated by the same wrong-ordinal witness.

These theorems are properties of the Lean account. CIB correspondence and Temporal refinement remain separately tested.

## Closure interpretation

The exact claim established by this capsule is bounded: for the one content-addressed sequential model and draft CIB Seven profile, the semantic task occurrence `(Instance_1, UserTask_Approve, 1)` is discoverable from committed state; completing that exact occurrence commits and completes the Process; wrong-activation and stale completions are rejected without changing committed state; Lean, the independent TypeScript semantic core, and pinned CIB Seven produce the same canonical results for the retained witnesses; and Temporal Query/Update hosting preserves those results under the tested duplicate-delivery and replay histories.

The closest unsupported claim is repeated or simultaneous activation of the same BPMN User Task definition. The current model creates only activation `1`; the checked wrong-ordinal witness proves that element identity alone is insufficient, but it does not establish how ordinals are allocated across loops, multi-instance execution, nested scopes, migration, or Continue-As-New.

The principal common-mode risk is a shared interpretation or observation defect. All semantic targets could agree because the capsule omitted a relevant BPMN fact or because the canonical projection hid it. The answer-free scenarios, independent live CIB execution, checked non-law, source/profile identities, exact task-projection mutation, and retained Temporal histories reduce that risk but do not eliminate it. In particular, Lean currently executes content-identified capsule data compiled into its module rather than decoding the pipeline’s scenario and executable-IR JSON; this is a known correspondence gap, not a general input equivalence proof.

The result supports continuing the architecture: Lean supplied a reusable full-occurrence rejection law and forced definition identity, runtime occurrence identity, command admission, and host identity apart; the TypeScript core remained independently executable; and Temporal added durable Query/Update transport without owning task semantics. It does not yet justify a general BPMN IR, a general Lean transport, a global task inbox, or any conformance claim.

## Separating witnesses

| Witness | Required result | Distinction protected |
|---|---|---|
| Start the sequential Process | One active task named `Approve` with identity `(Instance_1, UserTask_Approve, 1)` | Definition identity versus semantic occurrence identity |
| Complete that exact occurrence | Command committed; no open tasks; Process completed | Managed User Task completion |
| Correct element, wrong activation `2` | Command rejected; state unchanged | Element ID alone is insufficient |
| Correct task occurrence after completion under a new command ID | Command rejected; completed state unchanged | Stale task occurrence cannot reactivate control |
| Mutate observed activation `1` to `2` | Differential comparison reports the exact task-projection disagreement | New evidence projection is mutation-sensitive |

## Explicit exclusions

- claiming, unclaiming, assignment, candidate users or groups, delegation, ownership, authorization, and identity-provider integration;
- forms, renderings, completion variables, data associations, and output mapping;
- due dates, priority, suspension, cancellation, escalation, and boundary Events;
- multiple or repeated User Task occurrences;
- Search Attributes, Visibility-based discovery, and a production task inbox;
- Continue-As-New and cross-Run command deduplication;
- a general BPMN executable IR, general source compiler, or BPMN conformance claim.
