# High-priority BPMN 2.0 execution extensions

## Status

**Ingested external research input, supplied by the owner on 2026-08-07; not project-authored and not semantic authority.** It evaluates the four capabilities the companion [minimal engine research](MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) defers out of a first profile: Call Activity, multi-instance Activities, Event Sub-Process, and non-interrupting Boundary Events. It is a follow-up scope reference, not a schedule: this repository already implements bounded slices of Call Activity and of the non-interrupting boundary Timer, and their exact boundaries are owned by the [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) rather than by this document. Nothing here disposes a BPMN requirement or approves a semantic account.

## Provenance

Supplied as `high-priority-bpmn-execution-extensions.md`, carrying its own date of 2026-08-06. The body below is preserved as received, including its section numbering, tables, code blocks, and source list. Its citations are its own: of the works it lists, only OMG BPMN 2.0.2 is a registered project input under [SOURCES.md](../SOURCES.md), and its Camunda documentation references are vendor material that this repository has not pinned. Its clause numbers have not been checked against the normative corpus.

---


## Executive summary

This document evaluates four BPMN capabilities previously classified as **high-priority follow-ups** to a minimal executable BPMN profile:

1. Call Activity
2. Multi-Instance Activities
3. Event Subprocess
4. Non-Interrupting Boundary Events

These constructs are relevant to real-world process automation. Their exclusion from an initial engine profile should mean only that their execution semantics are not yet implemented—not that they are unimportant.

The recommended product structure is:

- **Base profile:** the minimal durable process core
- **Extension profile 1.1:** the high-priority capabilities described here
- **Later business-transaction profile:** compensation, Transaction Subprocess, and Cancel Events

A practical implementation order is:

1. Call Activity with static definition binding and explicit variable mappings
2. Sequential Multi-Instance Activities
3. Parallel Multi-Instance Activities with bounded concurrency
4. Non-interrupting Timer Boundary Events
5. Non-interrupting Message Boundary Events
6. Interrupting Event Subprocesses for Error, Timer, and Message
7. Non-interrupting Event Subprocesses for Timer and Message

The main recommendation is:

> Include Call Activity and at least sequential Multi-Instance support when the engine is intended for production process libraries. Include non-interrupting Timer Boundary Events when reminders, SLA escalation, or periodic follow-up are expected. Add Event Subprocesses once the scope and subscription model can safely support scope-wide event handlers.

---

## 1. Purpose and decision context

The base engine profile already assumes support for:

- Durable process instances
- Immutable, versioned process definitions
- Tasks and external jobs
- User tasks
- Sequence flows and expressions
- Exclusive, parallel, and event-based gateways
- Message and timer subscriptions
- Embedded subprocess scopes
- Interrupting boundary timer and error events
- Cancellation propagation
- Incidents and retry handling

The four features in this document are not independent parser additions. Each one introduces runtime state and interactions with concurrency, variable scopes, cancellation, recovery, and definition versioning.

The implementation decision should therefore be based on five dimensions:

| Dimension | Question |
|---|---|
| Business reach | How many realistic processes become substantially simpler or possible? |
| Semantic complexity | How difficult is correct token, scope, and cancellation behavior? |
| Runtime dependencies | Which engine capabilities must already be reliable? |
| Operational risk | What can go wrong under retries, crashes, duplicate commands, or concurrent triggers? |
| Restrictability | Can a useful and clearly documented subset be implemented first? |

---

## 2. Normative foundation and interpretation policy

The normative reference is **BPMN 2.0.2**, published by the Object Management Group. The specification defines Call Activities in §10.3.6, Multi-Instance characteristics in §10.3.8 and execution semantics in §13.3.7, Event Subprocesses in §10.3.5 and §13.5.4, and boundary-event behavior in §10.5.4 and §13.5.3.

A minimal engine should not claim complete BPMN execution conformance merely because it supports selected constructs. Instead, it should publish an explicit executable profile and state any restrictions.

Vendor documentation, especially current Camunda documentation, is used in this guide as an example of practical runtime decisions. Vendor behavior is informative but not normative. The engine described here may choose different extensions and defaults if those choices are documented and deterministic.

---

## 3. Summary decision matrix

| Feature | Business value | Implementation cost | Semantic risk | Recommended timing |
|---|---:|---:|---:|---|
| Call Activity | Very high | Medium | Medium | First extension |
| Sequential Multi-Instance | High | Medium | Medium | First or second extension |
| Parallel Multi-Instance | Very high | High | High | After sequential MI and concurrency controls |
| Non-interrupting Timer Boundary | High | Medium | Medium | Early, once durable timers exist |
| Non-interrupting Message Boundary | High | Medium | Medium/high | After correlation and repeated-subscription semantics are stable |
| Interrupting Event Subprocess | High | Medium/high | High | After scope cancellation is robust |
| Non-interrupting Event Subprocess | High | High | High | After concurrent child-scope activation is robust |

### Recommended default decision

For an engine intended only for embedded application workflows with a small number of process definitions, the base profile may be sufficient initially.

For an engine intended as a reusable orchestration platform, the following should be included in the first production-oriented extension:

```yaml
profile:
  id: minimal-executable-bpmn
  version: 1.1

extensions:
  callActivity:
    enabled: true
    staticCalledProcess: true
    explicitInputOutputMappings: true

  multiInstance:
    sequential: true
    parallel: true
    boundedParallelism: true

  nonInterruptingBoundary:
    timer: true
    message: true

  eventSubprocess:
    interrupting:
      error: true
      timer: true
      message: true
    nonInterrupting:
      timer: true
      message: true
```

The full matrix above should not be enabled merely by accepting the corresponding XML. Each enabled feature requires the runtime invariants and tests described below.

---

## 4. Cross-cutting prerequisites

Before implementing any of the four features, the engine should have explicit runtime concepts for **scope**, **element instance**, **token**, **subscription**, and **cancellation**.

A suitable conceptual model is:

```typescript
interface ScopeInstance {
  id: string;
  processInstanceId: string;
  parentScopeId: string | null;
  definitionScopeId: string;
  state: "ACTIVE" | "COMPLETING" | "CANCELING" | "COMPLETED" | "TERMINATED";
}

interface ElementInstance {
  id: string;
  scopeInstanceId: string;
  elementId: string;
  parentElementInstanceId: string | null;
  state: "ACTIVATING" | "ACTIVE" | "COMPLETING" | "COMPLETED" | "TERMINATING" | "TERMINATED";
}

interface EventSubscription {
  id: string;
  scopeInstanceId: string;
  ownerElementInstanceId: string;
  eventElementId: string;
  eventType: "MESSAGE" | "TIMER" | "ERROR" | "ESCALATION" | "SIGNAL" | "CONDITIONAL";
  interrupting: boolean;
  repeatable: boolean;
  state: "ACTIVE" | "CLAIMED" | "CANCELED" | "CONSUMED";
}
```

The engine should also provide these guarantees:

### 4.1 Atomic state transitions

Activation, completion, cancellation, timer creation, subscription creation, and outgoing-token creation should be committed atomically per engine command.

### 4.2 Idempotent commands

Commands such as child completion, message correlation, timer firing, and cancellation should contain an idempotency key or use a unique transition key. Duplicate delivery must not create duplicate execution paths.

### 4.3 Scope-relative cancellation

Cancellation must target a scope or element-instance subtree rather than a BPMN element ID alone. Multiple instances of the same BPMN element can be active concurrently.

### 4.4 Immutable definition pinning

Every running process instance and every called child instance must reference an immutable deployed definition version.

### 4.5 Deterministic variable visibility

Variables must have explicit ownership and lookup rules. Parallel branches and child scopes must not silently overwrite one another.

---

# 5. Call Activity

## 5.1 Why it matters

A Call Activity invokes a separately defined reusable process. BPMN describes it as a wrapper that transfers control to a callable process or global task. It differs from an embedded subprocess because the called process has its own deployed definition and can be reused by several parent processes.

Typical uses include:

- Customer or supplier verification shared by several processes
- A reusable approval process
- Payment collection
- Document signing
- Standardized fraud review
- Incident remediation
- Country- or tenant-specific process variants
- A reusable shipment, cancellation, or notification process

Without Call Activity, reusable behavior must be copied into every parent model or moved into an opaque service task. Copying causes model divergence; hiding orchestration inside a service task removes process-level observability.

## 5.2 Normative semantics

At a conceptual level:

```text
Parent enters Call Activity
    -> resolve called definition
    -> create child process instance
    -> parent Call Activity waits
    -> child completes
    -> map child output
    -> complete Call Activity
    -> continue parent
```

The standard `calledElement` identifies the callable BPMN element. Definition version binding, deployment bundles, tenants, and variable-mapping syntax are engine-level concerns and normally require engine extensions.

## 5.3 Recommended first subset

Support only calls to executable processes, not calls to Global Tasks.

```yaml
callActivityProfile:
  target:
    process: true
    globalTask: false

  calledElement:
    staticReference: true
    expressionReference: false

  versionBinding:
    sameDeployment: true
    explicitVersion: true
    latest: false
    versionTagExpression: false

  childStart:
    noneStartEventOnly: true

  variables:
    explicitInputMappings: true
    explicitOutputMappings: true
    implicitCopyAll: false

  lifecycle:
    waitForCompletion: true
    parentCancellationCancelsChild: true
    bpmnErrorPropagation: true

  initiallyRejected:
    recursiveCallCycles: true
    multiInstanceCallActivity: true
    dynamicTenantResolution: true
```

This subset is already useful and substantially reduces lifecycle ambiguity.

## 5.4 Definition resolution

The engine must specify how a callable process is selected. Recommended modes are:

### Same deployment

Resolve the called process from the deployment bundle containing the caller. This supports reproducible releases of related process definitions.

### Explicit immutable version

Resolve a specific deployed definition key or version. This is reproducible but couples the model to a deployment identity.

### Latest version

Do not use this as the initial default. A parent instance started months earlier could invoke a child definition deployed yesterday. The child contract may no longer match the parent’s expectations.

At activation, persist the resolved definition identity:

```typescript
interface CalledProcessLink {
  callActivityInstanceId: string;
  parentProcessInstanceId: string;
  childProcessInstanceId: string;
  calledDefinitionKey: string;
  calledDefinitionVersion: number;
  state: "ACTIVE" | "COMPLETED" | "CANCELED" | "FAILED";
}
```

Once resolved, the target must not change for that Call Activity instance.

## 5.5 Variable mappings

A safe first version should require explicit mappings:

```yaml
input:
  orderId: "= order.id"
  customerId: "= customer.id"
  paymentAmount: "= order.total"

output:
  paymentReference: "= child.paymentReference"
  paymentStatus: "= child.status"
```

Avoid implicit copy-all behavior because it creates several risks:

- Undocumented coupling between parent and child variable names
- Accidental disclosure of unrelated variables
- Parallel child instances overwriting parent state
- Difficult version compatibility
- Large payload copies

The mapping transaction should be atomic with child creation and Call Activity completion respectively.

## 5.6 Cancellation, errors, and incidents

### Parent cancellation

When the parent Call Activity is canceled, the complete child process-instance scope must be canceled, including jobs, user tasks, timers, message subscriptions, and nested child processes.

### Child completion

Normal child completion applies output mappings and completes the Call Activity.

### BPMN Error

A BPMN Error escaping the child process should be catchable by an Error Boundary Event attached to the Call Activity or by a suitable enclosing event handler.

### Technical failure or incident

A failed worker job inside the child should normally create an incident in the child while the parent remains waiting. Treating every technical failure as a BPMN Error would mix operational failure with modeled business error.

### Child termination

A Terminate End Event in the child terminates the child’s process scope and normally completes the Call Activity. It does not terminate the parent unless the model explicitly propagates a BPMN event or the engine profile defines an extension.

## 5.7 Runtime transition sketch

```typescript
function activateCallActivity(cmd: ActivateElement): Transition[] {
  const activity = requireCallActivity(cmd.elementId);
  const target = resolveCalledDefinition(activity.binding, cmd.variables);

  return atomic([
    createElementInstance(activity.id, "ACTIVE"),
    createChildProcessInstance({
      definitionKey: target.definitionKey,
      parentCallActivityInstanceId: cmd.elementInstanceId,
      variables: evaluateInputMappings(activity, cmd.variables),
    }),
    createCalledProcessLink(cmd.elementInstanceId, target.definitionKey),
    appendAuditEvent("CALL_ACTIVITY_CHILD_CREATED"),
  ]);
}
```

Child completion should be guarded by a unique child-completion transition key so retries cannot complete the parent twice.

## 5.8 Deployment validation

Reject deployment when:

- `calledElement` is absent
- The static target cannot be resolved under the selected binding mode
- The target is not executable
- The target lacks a supported None Start Event
- Input or output mappings are invalid
- A static call graph contains a prohibited recursion cycle
- An unsupported dynamic binding expression is used

Optionally warn when the child contract changes incompatibly between deployments.

## 5.9 Required tests

| Area | Scenario |
|---|---|
| Activation | Child creation and parent wait are atomic |
| Completion | Child completes exactly once despite duplicate completion delivery |
| Binding | Same-deployment and explicit-version resolution are deterministic |
| Variables | Input and output mappings respect scope boundaries |
| Cancellation | Canceling parent removes all child runtime artifacts |
| Errors | Child BPMN Error is caught at Call Activity boundary |
| Incident | Child technical incident leaves parent waiting |
| Recovery | Crash before and after child-creation commit |
| Versioning | New child deployment does not alter an already resolved call |
| Nesting | Call Activity inside embedded subprocess |
| Depth | Maximum call depth and prohibited recursion behavior |

## 5.10 Inclusion decision

**Include Call Activity early when any of these are true:**

- More than one parent process must reuse a common process
- Process definitions are deployed and versioned independently
- Child-process monitoring is valuable
- The platform is expected to host a process library
- Teams otherwise copy subprocess logic between models

**Defer it when all of these are true:**

- The engine runs only a few small, self-contained workflows
- Reuse can remain at the service-task implementation level
- Definition versioning is not yet stable
- Scope cancellation is not yet reliable

**Recommendation:** include in extension profile 1.1.

---

# 6. Multi-Instance Activities

## 6.1 Why they matter

A Multi-Instance Activity executes an activity repeatedly for a collection or cardinality. It is BPMN’s structured `for each` construct.

Typical uses include:

- Review by several people
- Process every order line
- Validate each document
- Contact several suppliers
- Provision several resources
- Run checks for each jurisdiction
- Execute one child process per account
- Collect a quorum of approvals

Without Multi-Instance support, users must generate explicit parallel branches, hide loops in service code, or dynamically create ad hoc work outside the process model.

## 6.2 Normative semantics

BPMN distinguishes sequential and parallel execution:

```text
Sequential:
  item 1 -> item 2 -> item 3 -> complete body

Parallel:
  create item 1, item 2, item 3 concurrently
  wait for required completions
  complete body
```

The specification defines runtime counters such as total, active, completed, and terminated instances. It also defines an optional completion condition that can cause remaining instances to be canceled.

## 6.3 Recommended staged subset

### Stage A: sequential collection-based Multi-Instance

```yaml
multiInstanceProfile:
  sequential: true
  parallel: false
  inputCollectionExpression: true
  inputElementVariable: true
  outputCollection: true
  completionCondition: false
  loopCardinality: false
```

This delivers most collection-processing value with limited concurrency complexity.

### Stage B: parallel Multi-Instance

```yaml
multiInstanceProfile:
  sequential: true
  parallel: true
  maxConcurrencyExtension: true
  deterministicOutputOrder: true
  completionCondition: false
```

### Stage C: completion conditions

```yaml
multiInstanceProfile:
  completionCondition: true
  cancelRemainingInstances: true
  persistCounters: true
```

Initially reject the standard’s complex Multi-Instance event behavior modes. They add little value for a minimal profile and substantially increase semantic surface.

## 6.4 Multi-Instance body model

Represent each Multi-Instance activation as a distinct body scope containing inner instances:

```typescript
interface MultiInstanceBody {
  elementInstanceId: string;
  activityId: string;
  sequential: boolean;

  inputSnapshot: readonly JsonValue[];

  total: number;
  active: number;
  completed: number;
  terminated: number;
  nextIndex: number;

  maxConcurrency: number;
  state: "ACTIVE" | "COMPLETING" | "CANCELING" | "COMPLETED";
}

interface MultiInstanceChild {
  id: string;
  bodyInstanceId: string;
  index: number;
  inputValue: JsonValue;
  state: "ACTIVE" | "COMPLETED" | "TERMINATED";
  outputValue?: JsonValue;
}
```

The body, not the BPMN activity definition ID, is the synchronization unit.

## 6.5 Snapshot the input collection

Evaluate the collection exactly once when the Multi-Instance body is activated and persist the result.

```text
Activation variables -> evaluate collection -> immutable input snapshot
```

Do not re-evaluate a mutable collection after a crash or after each child completion. Re-evaluation can duplicate, omit, or reorder instances.

The engine should define behavior for:

- `null`: deployment/runtime incident, or empty collection by explicit policy
- Non-array value: expression incident
- Empty collection: complete the body immediately
- Duplicate items: create distinct instances by index
- Very large collections: reject, page, or apply a configurable limit

## 6.6 Per-instance variable scopes

Each inner instance receives local variables:

```yaml
item: "<input element>"
itemIndex: 0
```

Use zero-based or one-based indexing consistently and document it. BPMN’s conceptual `loopCounter` exists per instance, while vendor engines differ in naming and indexing conventions.

Child-local variables must not leak into sibling instances.

## 6.7 Output aggregation

Parallel child completion order is nondeterministic. Therefore output aggregation should be ordered by the original input index, not by completion time.

```typescript
outputs[child.index] = evaluateOutput(child.localVariables);
```

When the body completes, publish the complete output array atomically to the parent scope.

Avoid direct writes from parallel children into the same parent variable. Such writes create last-writer-wins races and nondeterministic replay.

## 6.8 Bounded parallelism

Unbounded fan-out can create thousands of jobs or child processes in one transaction. Provide an engine extension such as:

```xml
<bpmn:multiInstanceLoopCharacteristics isSequential="false">
  <bpmn:loopDataInputRef>items</bpmn:loopDataInputRef>
  <bpmn:inputDataItem id="item" />
  <bpmn:extensionElements>
    <engine:parallelism maxActive="25" />
  </bpmn:extensionElements>
</bpmn:multiInstanceLoopCharacteristics>
```

The invariant is:

```text
active <= maxConcurrency
active + completed + terminated + notStarted = total
```

After a child completes, activate the next not-started child in the same transaction or through a durable follow-up command.

## 6.9 Completion condition

A completion condition is evaluated whenever an inner instance completes. If it becomes true, remaining instances are canceled and the Multi-Instance body completes.

Example:

```text
completed approvals >= 2
```

This is useful for quorum and first-success patterns, but it introduces races. Two children may complete concurrently and both evaluate the condition.

Implement it using serialized body-state updates or optimistic concurrency:

```sql
UPDATE multi_instance_body
SET completed = completed + 1,
    version = version + 1
WHERE id = :id
  AND version = :expectedVersion;
```

Only one successful transition may change the body to `COMPLETING` and initiate cancellation of remaining children.

## 6.10 Boundary events and cancellation

A boundary event attached to a Multi-Instance activity normally attaches to the Multi-Instance body.

- Interrupting boundary event: cancel the body and all active child instances
- Non-interrupting boundary event: leave the body and children active and create an additional path

The engine must define whether partial output is published after interruption. The safer initial rule is:

> Do not publish the aggregate output collection if the Multi-Instance body does not complete normally.

Partial results may remain available in audit history or explicit child records.

## 6.11 Supported activity types

A conservative progression is:

| Activity | Sequential MI | Parallel MI |
|---|---:|---:|
| Service Task | Yes | Yes |
| User Task | Yes | Yes |
| Receive Task | Yes | Yes |
| Embedded Subprocess | Yes | Yes, after scope cancellation tests |
| Call Activity | Later | Later |
| Events | No initially | No initially |

Multi-Instance Call Activity combines both feature families and should be enabled only after each feature works independently.

## 6.12 Deployment validation

Reject deployment when:

- Both loop cardinality and input collection are configured ambiguously
- The collection expression is missing
- The per-item variable name is invalid
- Parallelism is zero or negative
- The activity type is not enabled for Multi-Instance
- A completion condition is present but not supported
- Output mapping writes directly to a shared parent variable per child

Warn when the configured maximum collection size or parallelism can exceed deployment policy.

## 6.13 Required tests

| Area | Scenario |
|---|---|
| Snapshot | Collection mutation after activation does not change child count |
| Empty input | Body completes without child creation |
| Sequential | Exactly one active child at any time |
| Parallel | Bounded fan-out respects maximum concurrency |
| Output | Results are ordered by input index, not completion time |
| Variables | Child-local variables are isolated |
| Recovery | Restart preserves counters and unstarted indexes |
| Duplicate completion | A child cannot complete twice |
| Completion condition | Only one transition cancels remaining children |
| Cancellation | Interrupting boundary event terminates body and children |
| Non-interrupting event | Additional path does not affect active children |
| Failure | Incident in one child follows documented body policy |
| Scale | Large collection does not create one oversized transaction |

## 6.14 Inclusion decision

**Include sequential Multi-Instance when:**

- Processes commonly handle collections
- Model visibility of per-item work matters
- User tasks or external jobs must exist per item

**Include parallel Multi-Instance when:**

- Parallel throughput materially matters
- The engine already supports reliable concurrent scope updates
- Back-pressure and maximum parallelism are available

**Defer completion conditions when:**

- Quorum and first-success patterns are not immediately needed
- Cancellation races and partial-result behavior are not yet designed

**Recommendation:** include sequential support early; add bounded parallel support next.

---

# 7. Non-Interrupting Boundary Events

## 7.1 Why they matter

A non-interrupting boundary event creates an additional execution path while the attached activity continues.

Typical uses include:

- Send a reminder while an approval remains open
- Escalate an SLA breach without canceling ongoing work
- Notify support after a delay
- Record progress or audit checkpoints
- React to a customer message while fulfillment continues
- Start a parallel investigation
- Periodically repeat a follow-up action

Without this construct, models often require a parallel gateway with a separate timer or message branch, additional synchronization, and explicit cancellation. The boundary event expresses the intent more directly.

## 7.2 Normative distinction

The `cancelActivity` property distinguishes behavior:

```text
Interrupting boundary event:
  trigger -> cancel attached activity -> follow boundary path

Non-interrupting boundary event:
  trigger -> keep attached activity active -> create additional boundary path
```

The specification permits non-interrupting forms for event types such as Message, Timer, Escalation, Conditional, Signal, Multiple, and Parallel Multiple. Error and Cancel Boundary Events are always interrupting; Compensation has separate semantics.

## 7.3 Recommended first subset

```yaml
nonInterruptingBoundaryProfile:
  timer:
    timeDuration: true
    timeDate: true
    timeCycle: true

  message:
    enabled: true
    repeatableWhileActivityActive: true

  initiallyRejected:
    escalation: true
    conditional: true
    signal: true
    multiple: true
    parallelMultiple: true
```

Timer and Message cover the dominant reminder, escalation, and external-notification use cases.

## 7.4 Subscription ownership

The subscription must be owned by the specific attached activity instance:

```typescript
interface BoundarySubscription extends EventSubscription {
  attachedActivityInstanceId: string;
  boundaryEventId: string;
  interrupting: false;
}
```

When the attached activity completes or is canceled, all remaining boundary subscriptions must be canceled atomically.

Do not address the activity by BPMN element ID only. Multiple instances of the same activity may be active due to loops, parallel paths, or Multi-Instance behavior.

## 7.5 Trigger algorithm

For a non-interrupting event:

```text
1. Atomically claim one trigger occurrence.
2. Verify that the attached activity instance is still active.
3. Keep the activity instance active.
4. Create a new boundary-event execution path.
5. Retain or reschedule the subscription when the event is repeatable.
6. Commit an audit event linking the occurrence to the attached activity instance.
```

The attached activity can complete concurrently with the trigger. The engine needs a deterministic winner rule based on transactional commit order:

- If activity completion commits first, the subscription is canceled and the trigger does not create a path.
- If event triggering commits first, the boundary path is created and activity completion may still commit afterward.

Both commands must use row versions or equivalent concurrency guards.

## 7.6 Timer behavior

A duration or date normally fires once. A cycle may fire repeatedly while the activity remains active.

Example:

```xml
<bpmn:boundaryEvent
    id="Reminder"
    attachedToRef="ApproveOrder"
    cancelActivity="false">
  <bpmn:timerEventDefinition>
    <bpmn:timeCycle>R3/PT24H</bpmn:timeCycle>
  </bpmn:timerEventDefinition>
</bpmn:boundaryEvent>
```

Persist timer schedule state:

```typescript
interface RepeatingTimerState {
  timerId: string;
  occurrence: number;
  repetitionLimit: number | null;
  nextDueAt: string;
  scheduleExpression: string;
}
```

A crash after creating the boundary path but before calculating the next occurrence must not duplicate the occurrence. Update occurrence state and create the boundary path in one transaction.

Timers should never fire before their due time. Under load they may fire later; this operational property should be documented.

## 7.7 Message behavior

A message boundary event creates a subscription when the attached activity becomes active.

For a non-interrupting Message Boundary Event, the subscription remains active after a successful correlation while the attached activity remains active. Multiple matching messages may therefore create multiple boundary paths.

The engine should specify:

- Message name
- Correlation-key expression
- Tenant partition
- Whether a message correlates to one or many subscriptions
- Message deduplication ID
- Buffering behavior for early messages
- Subscription lifetime

Example runtime key:

```text
(messageName, tenantId, correlationKey, attachedActivityInstanceId)
```

Each published message should contain a producer-provided idempotency ID. Re-delivery of the same message ID must not trigger the boundary path again.

## 7.8 Variable visibility

The boundary path is a sibling execution in the attached activity’s containing scope. It should see variables visible from that scope but should not automatically access transient local state internal to the attached activity implementation.

For Call Activities and Multi-Instance bodies, local-variable visibility requires special care. A non-interrupting boundary path attached to a Call Activity should not read the child process’s private variables. A path attached to a Multi-Instance body should not assume access to one particular child’s item variable.

## 7.9 Path completion

The process scope must remain active until both the original activity path and every non-interrupting boundary path have completed.

This means a user task can finish while a previously created reminder path is still running. The containing scope must not complete prematurely.

## 7.10 Deployment validation

Reject deployment when:

- `cancelActivity="false"` is used with Error or Cancel Boundary Events
- The event type is outside the supported subset
- A Timer Boundary Event has an unsupported timer expression
- A Message Boundary Event lacks a resolvable message definition or correlation expression
- A boundary event is attached to an unsupported activity type
- The boundary event has no outgoing sequence flow

Warn when an unbounded repeating timer can continuously create work while a long-lived activity remains active.

## 7.11 Required tests

| Area | Scenario |
|---|---|
| Timer | One-shot duration creates one path and does not cancel activity |
| Cycle | Repeating timer creates the expected number of paths |
| Message | Different message IDs create separate paths |
| Deduplication | Re-delivery of one message ID creates one path |
| Race | Activity completion versus event trigger has deterministic outcome |
| Cleanup | Activity completion cancels active subscriptions and future timers |
| Concurrency | Several boundary paths may be active simultaneously |
| Scope completion | Parent waits for original path and spawned boundary paths |
| Variables | Boundary path cannot access child-private variables accidentally |
| Recovery | Restart does not duplicate a timer occurrence |
| Multi-Instance | Boundary event attached to MI body leaves children running |

## 7.12 Inclusion decision

**Include non-interrupting Timer Boundary Events when:**

- Approval reminders or SLA escalation are common
- Long-lived tasks need periodic follow-up
- The engine already has durable timer scheduling

**Include non-interrupting Message Boundary Events when:**

- An active activity must react to several external messages without being canceled
- Message correlation and deduplication are already robust

**Defer them when:**

- The scope model cannot retain concurrent spawned paths correctly
- Trigger-versus-completion races are not transactionally guarded

**Recommendation:** Timer first, Message second.

---

# 8. Event Subprocess

## 8.1 Why it matters

An Event Subprocess is a scope-level handler started by an event rather than normal Sequence Flow. It has no incoming or outgoing Sequence Flows and contains its own flow.

Typical uses include:

- Handle a BPMN Error anywhere inside a subprocess
- React to a cancellation message while a process is active
- Start a scope-wide timeout handler
- Record repeated status updates
- Run a non-interrupting escalation flow
- Centralize exception logic instead of attaching boundary events to many activities
- Implement compensation-related handlers later

The feature is especially valuable in large scopes because it avoids duplicating the same boundary-event behavior on several activities.

## 8.2 Normative constraints

An Event Subprocess:

- Is marked with `triggeredByEvent="true"`
- Has no incoming or outgoing Sequence Flow
- Has exactly one Start Event
- Uses a Start Event with an event trigger
- Can be interrupting or non-interrupting, subject to event-type constraints
- Exists only while its containing process or subprocess scope is active

A non-interrupting Event Subprocess can be triggered repeatedly while its containing scope remains active. An interrupting Event Subprocess cancels active work in the containing scope before executing its handler flow.

## 8.3 Recommended staged subset

### Stage A: interrupting Error Event Subprocess

This centralizes modeled business-error handling and reuses the engine’s existing error propagation and scope cancellation.

### Stage B: interrupting Timer and Message Event Subprocess

These implement scope-wide timeout and cancellation-message patterns.

### Stage C: non-interrupting Timer and Message Event Subprocess

These create concurrent handler scopes and may trigger repeatedly.

```yaml
eventSubprocessProfile:
  interrupting:
    error: true
    timer: true
    message: true

  nonInterrupting:
    timer: true
    message: true

  initiallyRejected:
    escalation: true
    signal: true
    conditional: true
    compensation: true
    multiple: true
    parallelMultiple: true
```

## 8.4 Subscription lifecycle

When a containing scope becomes active, create subscriptions for all eligible Event Subprocess Start Events in that scope.

```text
activate scope
  -> activate normal start path
  -> register event-subprocess subscriptions
```

When the containing scope completes or is canceled, remove those subscriptions.

For an interrupting Error Event Subprocess, a durable external subscription may not be necessary. Instead, include the Event Subprocess Start Event in the scope’s error-handler lookup table.

## 8.5 Interrupting activation

When an interrupting Event Subprocess is triggered:

```text
1. Claim trigger.
2. Mark containing scope as interrupting.
3. Cancel all currently active child elements in the scope.
4. Cancel other event-subprocess subscriptions in the scope.
5. Activate the Event Subprocess handler scope.
6. Continue only inside the handler.
```

The containing scope itself remains the owner of the handler and should not be destroyed before the handler completes.

The cancellation operation must include:

- Tokens
- Jobs and leases
- User tasks
- Timers
- Message subscriptions
- Multi-Instance child scopes
- Called child process instances
- Previously triggered non-interrupting Event Subprocess instances

The engine should model cancellation as a durable state transition rather than deleting rows immediately.

## 8.6 Non-interrupting activation

When a non-interrupting Event Subprocess is triggered:

```text
1. Claim trigger occurrence.
2. Verify containing scope is active.
3. Keep normal work active.
4. Create a new Event Subprocess instance as a child of the containing scope.
5. Retain or recreate the trigger subscription when repeatable.
```

Several handler instances may be active concurrently. The containing scope cannot complete until normal work and all triggered handler instances complete.

## 8.7 Error matching

For Error Event Subprocesses, define deterministic handler lookup:

```text
throwing element scope
  -> nearest enclosing scope with matching error code
  -> next enclosing scope
  -> process boundary
  -> unhandled BPMN error incident or process termination policy
```

Within the same scope:

- Exact error-code match has priority
- A catch-all error handler may match any error
- Ambiguous duplicate catch-all or duplicate-code handlers should fail deployment

An Error Event Subprocess is interrupting; a non-interrupting Error Start Event is not valid under BPMN semantics.

## 8.8 Timer and message handlers

A Timer Event Subprocess Start Event schedules its timer relative to activation of the containing scope.

A Message Event Subprocess Start Event registers a correlation subscription scoped to the containing scope instance.

The correlation key should be evaluated when the scope is activated and persisted. Re-evaluating it later from mutated variables can make active subscriptions impossible to address.

## 8.9 Nested scopes

Event Subprocesses can exist in the process scope or an embedded subprocess scope. The nearest active scope owns the handler.

Example:

```text
Root process
├── root message Event Subprocess
└── Fulfillment subprocess
    ├── normal activities
    └── local error Event Subprocess
```

An error thrown inside Fulfillment should first search its local handlers. A root handler is considered only if no suitable local handler catches it.

## 8.10 Interaction with normal end events

A scope should complete only when:

- All normal-flow tokens are consumed
- No active child activities remain
- No triggered non-interrupting Event Subprocess instance remains

Unused dormant subscriptions do not prevent scope completion; they are canceled as part of completing the scope.

## 8.11 Deployment validation

Reject deployment when:

- `triggeredByEvent` is false or missing for an Event Subprocess declaration
- It has incoming or outgoing Sequence Flows
- It has zero or more than one Start Event
- The Start Event has no trigger
- The trigger type is unsupported
- A non-interrupting form is used with Error
- Duplicate Error handlers in one scope are ambiguous
- The timer or message definition cannot be compiled

## 8.12 Required tests

| Area | Scenario |
|---|---|
| Activation | Subscriptions exist only while containing scope is active |
| Error | Nearest matching Error Event Subprocess wins |
| Catch-all | Catch-all handles unmatched error codes |
| Interrupting | Normal work and subscriptions are canceled before handler proceeds |
| Non-interrupting | Normal work and handler run concurrently |
| Repetition | Non-interrupting handler can trigger several times |
| Scope completion | Scope waits for triggered handler instances |
| Cleanup | Dormant subscriptions disappear when scope completes |
| Race | Scope completion versus trigger is deterministic |
| Nested scopes | Local handler takes precedence over outer handler |
| Call Activity | Parent/child error propagation interacts correctly with local handlers |
| Multi-Instance | Interrupting handler cancels all child instances in its scope |
| Recovery | Restart preserves active subscriptions and handler instances |

## 8.13 Inclusion decision

**Include Event Subprocess when:**

- Processes require scope-wide error, timeout, or message handling
- Models are becoming cluttered with duplicate boundary handlers
- Nested scope behavior is important
- The engine already supports reliable scope-tree cancellation

**Defer non-interrupting Event Subprocess when:**

- Concurrent child scopes cannot yet be retained safely
- Repeated subscriptions and trigger deduplication are incomplete

**Recommendation:** implement interrupting Error first, then Timer and Message, then non-interrupting Timer and Message.

---

# 9. Feature interactions

The four features interact and should not be tested only in isolation.

## 9.1 Call Activity plus Multi-Instance

A parallel Multi-Instance Call Activity can create many child process instances. Required protections include:

- Bounded child-process creation
- One immutable target definition per child
- Per-child input mappings
- Ordered output aggregation
- Parent cancellation cascading to all children
- No implicit copy-all output into a shared parent variable

Enable this combination only after standalone Call Activity and parallel Multi-Instance are stable.

## 9.2 Call Activity plus non-interrupting boundary event

A non-interrupting boundary event on a Call Activity creates a parent-side additional path while the child process remains active.

The boundary path should not gain access to private variables inside the child process. Canceling or completing the boundary path does not affect the child unless modeled explicitly.

## 9.3 Event Subprocess plus Call Activity

An interrupting Event Subprocess in the parent scope must cancel active Call Activities and their child instances.

A BPMN Error escaping a child may be caught by:

1. An Error Boundary Event on the Call Activity
2. An enclosing Error Event Subprocess
3. An outer scope handler

The engine must define handler precedence and test it.

## 9.4 Event Subprocess plus Multi-Instance

An interrupting Event Subprocess in the Multi-Instance body’s containing scope may cancel all active instances. A handler nested inside an individual inner activity scope affects only that instance.

Scope identity, not BPMN element ID, determines the cancellation boundary.

## 9.5 Non-interrupting paths and process completion

Every non-interrupting trigger creates additional active work. Process completion must account for these paths even after the originally attached activity has completed.

A common bug is to mark a parent scope complete when its normal token reaches an end event while reminder or escalation paths are still running.

---

# 10. Suggested internal persistence additions

A relational implementation may add tables similar to:

```text
called_process_link
multi_instance_body
multi_instance_child
scope_event_subscription
boundary_event_occurrence
```

Example schema sketch:

```sql
CREATE TABLE called_process_link (
    call_activity_instance_id UUID PRIMARY KEY,
    parent_process_instance_id UUID NOT NULL,
    child_process_instance_id UUID NOT NULL UNIQUE,
    called_definition_key VARCHAR(255) NOT NULL,
    called_definition_version BIGINT NOT NULL,
    state VARCHAR(32) NOT NULL,
    version BIGINT NOT NULL
);

CREATE TABLE multi_instance_body (
    element_instance_id UUID PRIMARY KEY,
    sequential BOOLEAN NOT NULL,
    input_snapshot JSONB NOT NULL,
    total_count INTEGER NOT NULL,
    active_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL,
    terminated_count INTEGER NOT NULL,
    next_index INTEGER NOT NULL,
    max_concurrency INTEGER NOT NULL,
    state VARCHAR(32) NOT NULL,
    version BIGINT NOT NULL
);

CREATE TABLE boundary_event_occurrence (
    subscription_id UUID NOT NULL,
    trigger_id VARCHAR(255) NOT NULL,
    boundary_path_instance_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (subscription_id, trigger_id)
);
```

The exact schema is less important than these invariants:

- A called child can complete its parent at most once
- A Multi-Instance child index exists at most once per body
- Counters remain internally consistent
- A trigger occurrence creates at most one boundary or Event Subprocess path
- Scope completion cannot race past active spawned paths

---

# 11. Deployment profile and diagnostics

Publish the optional feature set as a machine-readable profile:

```yaml
profile:
  id: minimal-executable-bpmn
  version: 1.1

execute:
  callActivity:
    processTarget: true
    staticReference: true
    bindings:
      - deployment
      - explicitVersion

  multiInstance:
    activities:
      - serviceTask
      - userTask
      - receiveTask
      - subProcess
    modes:
      - sequential
      - parallel
    completionCondition: false

  eventSubprocess:
    interrupting:
      - error
      - timer
      - message
    nonInterrupting:
      - timer
      - message

  nonInterruptingBoundary:
    - timer
    - message
```

Example diagnostic:

```text
BPMN-PROFILE-2117

Parallel Multi-Instance activity "ReviewDocuments" uses a completionCondition,
but completion conditions are not supported by profile
minimal-executable-bpmn/1.1.

The process was not deployed.
```

Diagnostics should identify:

- BPMN element ID and name
- Unsupported attribute or event type
- Active engine profile
- Suggested supported alternative when one exists

---

# 12. Packaging options for the implementer

## Option A: Base engine only

Include none of the four features.

Suitable for:

- Small embedded workflows
- Technical orchestration with few definitions
- Early proof of concept

Main limitation: process reuse, collection work, and non-interrupting exception paths must be modeled outside BPMN or with more verbose constructs.

## Option B: Composition package

Include:

- Call Activity
- Sequential Multi-Instance
- Parallel Multi-Instance with bounded concurrency

Suitable for:

- Reusable process libraries
- Human approvals over collections
- Batch and fan-out orchestration

This package offers the largest increase in business reach.

## Option C: Reactive process package

Include:

- Non-interrupting Timer Boundary Event
- Non-interrupting Message Boundary Event
- Interrupting Error, Timer, and Message Event Subprocess
- Non-interrupting Timer and Message Event Subprocess

Suitable for:

- SLA-driven processes
- Long-running human work
- Scope-wide cancellation and escalation patterns

This package depends strongly on robust subscriptions and scope cancellation.

## Option D: Full high-priority extension profile

Include both Composition and Reactive packages.

Suitable for a general-purpose process engine. This is the recommended target after the base execution kernel is stable.

---

# 13. Recommended implementation sequence

## Milestone 1: Call Activity foundation

Implement:

- Static called-process reference
- Same-deployment and explicit-version binding
- None Start Event child activation
- Explicit input/output mappings
- Parent-to-child cancellation
- Child BPMN Error propagation

Exit criterion: nested calls survive crash recovery and definition upgrades without changing resolved targets.

## Milestone 2: Sequential Multi-Instance

Implement:

- Collection snapshot
- Per-item local scope
- Sequential child creation
- Deterministic output collection

Exit criterion: restart and duplicate completion cannot skip or repeat an item.

## Milestone 3: Bounded parallel Multi-Instance

Implement:

- Multi-Instance body counters
- Maximum active children
- Ordered aggregation
- Body cancellation

Exit criterion: concurrent completions maintain all counter invariants under optimistic-lock retries.

## Milestone 4: Non-interrupting Timer Boundary

Implement:

- One-shot and repeating timers
- Trigger-versus-completion concurrency guard
- Spawned path lifetime

Exit criterion: each scheduled occurrence creates at most one path and no timer survives attached-activity completion.

## Milestone 5: Non-interrupting Message Boundary

Implement:

- Repeatable message subscription
- Correlation and deduplication
- Trigger occurrence audit

Exit criterion: repeated unique messages create repeated paths; duplicate message delivery does not.

## Milestone 6: Interrupting Event Subprocess

Implement:

- Scope-level handler registration
- Error lookup
- Timer and message subscriptions
- Full child-scope cancellation

Exit criterion: the handler starts only after all canceled normal work is durably transitioned to cancellation states.

## Milestone 7: Non-interrupting Event Subprocess

Implement:

- Repeatable scope-level subscriptions
- Concurrent handler instances
- Parent-scope completion accounting

Exit criterion: repeated handlers and normal work can complete in any order without premature scope completion.

---

# 14. Go/no-go checklist

An implementer can use the following checklist before including the extension profile.

## Runtime model

- [ ] Every active BPMN construct has an element-instance identity
- [ ] Scope trees are persisted
- [ ] Cancellation operates on instance subtrees
- [ ] Spawned concurrent paths delay scope completion
- [ ] State transitions are idempotent

## Definitions and variables

- [ ] Definitions are immutable and versioned
- [ ] Call targets can be resolved deterministically
- [ ] Variable scopes and mappings are explicit
- [ ] Parallel output aggregation is deterministic

## Events

- [ ] Message correlation includes deduplication
- [ ] Timers are durable and never fire early
- [ ] Repeating timer occurrences are persisted atomically
- [ ] Subscription cleanup is atomic with scope or activity completion

## Concurrency and recovery

- [ ] Optimistic or pessimistic concurrency guards body and scope state
- [ ] Crash points are tested before and after every commit boundary
- [ ] Duplicate worker, timer, and message commands are safe
- [ ] Back-pressure limits parallel fan-out

## Validation and support contract

- [ ] Unsupported combinations fail deployment
- [ ] Enabled subsets are documented precisely
- [ ] Test fixtures assert execution traces and active runtime state
- [ ] Product documentation avoids claiming complete BPMN execution conformance

A no-go result in scope cancellation, idempotency, or subscription cleanup should block Event Subprocess and non-interrupting event support. A no-go result in immutable definition binding should block Call Activity. A no-go result in concurrency control should block parallel Multi-Instance.

---

# 15. Final recommendation

For a process engine described as **minimal but useful**, the original base profile remains defensible. However, a platform intended for real organizational process automation should plan these high-priority extensions explicitly.

The best value-to-risk order is:

1. **Call Activity** — large reuse and modularity benefit with manageable restrictions
2. **Sequential Multi-Instance** — common collection semantics without full concurrency risk
3. **Bounded Parallel Multi-Instance** — high throughput and approval use cases
4. **Non-interrupting Timer Boundary Event** — strong practical value for reminders and SLAs
5. **Non-interrupting Message Boundary Event** — reactive parallel behavior
6. **Interrupting Event Subprocess** — centralized scope-wide handling
7. **Non-interrupting Event Subprocess** — powerful but concurrency-heavy

A reasonable product decision is:

> Keep the base execution profile small, but define Call Activity, Multi-Instance, Event Subprocess, and non-interrupting Timer/Message Boundary Events as an official versioned extension profile rather than leaving them in a generic unsupported list.

Compensation, BPMN Transaction Subprocesses, and Cancel Events remain a separate, related feature track. They should be evaluated together after completion history and compensation registration have been designed.

---

# 16. Sources

## Normative specification

1. Object Management Group, **Business Process Model and Notation (BPMN), Version 2.0.2**. Relevant sections include §10.3.5 Sub-Processes and Event Sub-Processes, §10.3.6 Call Activity, §10.3.8 Loop Characteristics, §10.5 Events, §13.3 Activities, and §13.5 Events.  
   <https://www.omg.org/spec/BPMN/2.0.2/PDF>

2. Object Management Group, **BPMN 2.0.2 specification landing page and machine-readable artifacts**.  
   <https://www.omg.org/spec/BPMN/2.0.2/>

## Practical implementation references

3. Camunda, **Call activities**. Describes child-process creation, definition binding, cancellation, and variable mapping decisions in a production engine.  
   <https://docs.camunda.io/docs/components/modeler/bpmn/call-activities/>

4. Camunda, **Multi-instance**. Describes the Multi-Instance body, sequential and parallel execution, per-instance variables, mappings, and boundary-event interactions.  
   <https://docs.camunda.io/docs/components/modeler/bpmn/multi-instance/>

5. Camunda, **Event subprocess**. Describes scope activation, interrupting and non-interrupting behavior, and repeated non-interrupting triggers.  
   <https://docs.camunda.io/docs/components/modeler/bpmn/event-subprocesses/>

6. Camunda, **Message events**. Describes message subscriptions, correlation, and repeated correlation of non-interrupting boundary message events.  
   <https://docs.camunda.io/docs/components/modeler/bpmn/message-events/>

7. Camunda, **Timer events**. Describes one-shot and repeating timers and non-interrupting boundary timer behavior.  
   <https://docs.camunda.io/docs/components/modeler/bpmn/timer-events/>

8. Camunda, **Events overview**. Summarizes the distinction between interrupting and non-interrupting boundary events.  
   <https://docs.camunda.io/docs/components/modeler/bpmn/events/>

---

## Further engineering directions

**A. Definition compatibility contracts** — Static interface metadata for called processes, deployment-time mapping validation, and child-version migration policy.

**B. Multi-Instance scheduling model** — Fairness, bounded fan-out, partitioning, partial results, and completion-condition serialization.

**C. Unified event-subscription kernel** — One abstraction for intermediate catches, boundary events, Event Subprocess starts, and event-based gateway races.

**D. Cancellation protocol** — Durable hierarchical cancellation with worker revocation, late completion handling, and audit reconstruction.

**E. Model-based semantic testing** — Generate token traces and race schedules for combinations of calls, Multi-Instance scopes, event handlers, and crash recovery.
