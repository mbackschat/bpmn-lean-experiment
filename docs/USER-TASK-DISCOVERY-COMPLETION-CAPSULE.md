# User Task discovery and completion capsule

## Status

**Approved for bounded implementation on 2026-07-24.**

This decision closes only the interaction boundary around the existing sequential `None Start Event → User Task → None End Event` model. It does not approve general human-task lifecycle semantics, people assignment, authorization, forms, variables, Search Attributes, a task inbox, multi-instance execution, or a broader CIB compatibility claim.

## Question

How can an application discover the exact active User Task of a known Process instance and submit a completion command through Temporal without treating Temporal messaging, Visibility, CIB-generated task IDs, or a UI read model as BPMN semantic authority?

## Source basis

BPMN 2.0.2 Clause 10.7.3 defines a User Task as human work assisted by software whose lifecycle is managed by a task manager, describes potential and actual ownership, and supplies optional rendering and implementation hooks. Clause 13.3.2 defines the shared Activity lifecycle, including activation, completion dependencies, and outgoing Sequence Flow activation. Clause 13.3.3 states that a User Task is distributed to its assigned person or group on activation and completes when the work has been done.

Those clauses require an execution-conforming runtime to manage the task and its completion, but they do not prescribe Temporal messaging, a global task-inbox consistency model, an authorization protocol, or a portable string encoding for a task occurrence.

The pinned CIB Seven `v2.2.0` public API exposes active tasks through `TaskService.createTaskQuery()`. The inherited `UserTaskTest.testTaskPropertiesNotNull` witness observes a non-null generated task ID, name, Process-instance ID, execution ID, Process-definition ID, task-definition key, and creation time. `TaskAssigneeTest.testTaskAssignee` discovers an assigned task, completes it through `TaskService.complete(task.getId())`, and observes Process completion. `TaskServiceTest.testCompleteTaskUnexistingTaskId` establishes that completing an unknown CIB task ID fails rather than advancing execution.

CIB’s task ID is generated host identity. It is retained only in oracle diagnostics and in the local mapping needed to invoke `TaskService.complete`; it is not a canonical identity shared with Lean, TypeScript, or Temporal.

## Decision

The semantic core owns the User Task occurrence, its exact discoverable projection, and completion admission. Temporal owns durable delivery and request-response mechanics. A client that already knows the Workflow ID discovers exact open tasks through a Query and submits completion through an Update.

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
          │                         │
          │                         └── Temporal Query for known Workflow ID
          │
          ◄──────────── versioned completion command
                                    │
                                    └── Temporal Update with typed result
```

Signal remains the retained Milestone 0 harness transport and the compatibility path for pre-Update histories. New discovery/completion histories use Update because Service acceptance alone is not the semantic result of a User Task completion command.

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

## Temporal interaction contract

The exact-task Query is read-only and returns the semantic core’s current `openUserTasks` projection for one known Workflow ID. It is not recorded as an Event and is not canonical authority.

The completion Update carries the semantic command and returns its typed `CommandOutcome`. Its handler validates only transport shape, enqueues the command, and waits for the single main Workflow loop to apply the semantic core. The handler does not mutate semantic state directly.

The caller uses `commandId` as the Temporal Update ID. Temporal deduplicates the same Update ID within one Run, while the adapter retains an application result ledger so repeated delivery of the same semantic command returns the first result without a second transition. Cross-Run deduplication remains deferred until Continue-As-New exists.

Two different command IDs targeting the same occurrence are distinct semantic attempts. At most one can commit; a later accepted attempt is rejected by the semantic core. An attempt delivered only after the Workflow has closed is a Temporal closed-Workflow transport outcome, not a fabricated BPMN rejection.

## Discovery boundary

The implemented discovery surface is exact Query by known Workflow ID. Global discovery is deliberately separate:

- Temporal Search Attributes are Workflow-level, indexed, eventually consistent projections and create replay-relevant Commands.
- A production task inbox is an external read model with its own delivery, deduplication, reconciliation, authorization, privacy, and consistency contract.
- Neither surface may become the source of truth for task existence or completion admission.

This capsule does not implement custom Search Attributes or an inbox. A later proposal must name the global-discovery consumer, data-access boundary, Search Attribute registry, staleness behavior, and rebuild/reconciliation evidence before adding either.

## IR and Lean consequence

The XML compiler gains a second concrete consumer by preserving the optional BPMN User Task name in a new sequential executable-IR version. The prior IR version remains readable only where required for retained history and compatibility tests. This does not generalize the partial CMOF manifest or introduce a universal BPMN IR.

Lean keeps a small executable model separate from runtime instances. The model gains the reviewed User Task definition metadata; runtime state gains the semantic activation ordinal; observations gain the exact open-task projection for the new scenario.

The capsule must retain separate Lean claim lanes:

1. starting creates the exact active task occurrence;
2. matching full task-instance completion terminates the Process;
3. a wrong activation ordinal is rejected with state unchanged;
4. matching `elementId` alone is not sufficient, demonstrated by the same wrong-ordinal witness.

These theorems are properties of the Lean account. CIB correspondence and Temporal refinement remain separately tested.

## Separating witnesses

| Witness | Required result | Distinction protected |
|---|---|---|
| Start the sequential Process | One active task named `Approve` with identity `(Instance_1, UserTask_Approve, 1)` | Definition identity versus semantic occurrence identity |
| Complete that exact occurrence | Command committed; no open tasks; Process completed | Managed User Task completion |
| Correct element, wrong activation `2` | Command rejected; state unchanged | Element ID alone is insufficient |
| Correct task occurrence after completion under a new command ID | Command rejected; completed state unchanged | Stale task occurrence cannot reactivate control |
| Repeat the same Temporal Update ID | First typed result returned; semantic command applied once | Transport deduplication versus semantic execution |
| Mutate observed activation `1` to `2` | Differential comparison reports the exact task-projection disagreement | New evidence projection is mutation-sensitive |

## Pipeline closure

Implementation proceeds through the established fast lane:

1. add the versioned neutral scenario/profile and retained CIB discovery/completion observations;
2. add Lean task identity, projection, semantics, laws, and checked non-law;
3. extend the bounded executable IR and independent TypeScript semantic core;
4. add Temporal Query and Update mechanics with live and retained replay evidence;
5. extend four-target differential comparison and seed a task-identity mutation;
6. update the implementation map, testing record, contributor guide, README, and exact resume point.

## Explicit exclusions

- claiming, unclaiming, assignment, candidate users or groups, delegation, ownership, authorization, and identity-provider integration;
- forms, renderings, completion variables, data associations, and output mapping;
- due dates, priority, suspension, cancellation, escalation, and boundary Events;
- multiple or repeated User Task occurrences;
- Search Attributes, Visibility-based discovery, and a production task inbox;
- Continue-As-New and cross-Run command deduplication;
- a general BPMN executable IR, general source compiler, or BPMN conformance claim.

