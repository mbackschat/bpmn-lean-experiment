# Minimal but useful BPMN 2.0 execution profile

## Status

**Ingested external research input, supplied by the owner on 2026-08-07; not project-authored and not semantic authority.** It recommends the executable BPMN element profile a shippable engine needs, and the owner selected it on 2026-08-07 as the scope reference for the engine product's essential element set and depth. Nothing here disposes a BPMN requirement or approves a semantic account: [BPMN-REQUIREMENT-LEDGER.md](../BPMN-REQUIREMENT-LEDGER.md) owns dispositions, the owning capsule owns meaning, and [PLAN.md](../PLAN.md) owns the order in which its recommendations are taken up. The follow-up profile it defers is covered by the companion [high-priority execution extensions research](HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md).

## Provenance

Supplied as `minimal-useful-bpmn2-process-engine.md`, carrying its own date of 2026-08-06. The body below is preserved as received, including its section numbering, tables, code blocks, and source list. Its citations are its own: of the works it lists, only OMG BPMN 2.0.2 is a registered project input under [SOURCES.md](../SOURCES.md), and the remainder have not been fetched, pinned, or verified by this repository. Treat its empirical figures as reported rather than reproduced.

---


## Executive summary

The commonly repeated claim that “80% of BPMN models use 20% of BPMN elements” is directionally useful, but it should not be treated as a precise law.

An empirical study of 25,590 publicly available BPMN models found a strongly skewed distribution: only a small set of elements occurred frequently, most models used a relatively small vocabulary, and the majority of BPMN element types appeared rarely. However, public model repositories contain domain, tooling, teaching, and duplication biases. In particular, a later GitHub study found that approximately 90% of the models in its corpus belonged to clone groups.

The appropriate conclusion is therefore not “implement exactly 20% of BPMN.” It is:

> Implement a small, explicitly versioned executable profile that covers core control flow, durable waits, human work, external work, timeouts, and scoped error handling. Parse and preserve common diagram-only constructs, and reject unsupported executable semantics during deployment.

A strong first version should execute approximately 12–15 behavioral concepts:

- None and message start events
- None, error, and terminate end events
- Sequence flows, including conditional and default flows
- Service, user, receive, and configured generic tasks
- Exclusive, parallel, and event-based gateways
- Intermediate message and timer catch events
- Embedded subprocesses
- Interrupting timer and error boundary events

It should additionally preserve pools, lanes, message flows, associations, annotations, data artifacts, extension elements, and BPMN Diagram Interchange information.

Inclusive gateways, call activities, multi-instance behavior, compensation, transactions, choreographies, conversations, and rarer event families should initially be rejected in executable processes.

---

## 1. Research basis

### 1.1 Empirical element usage

Compagnucci, Corradini, Fornari, and Re analyzed 25,590 BPMN models collected from six public repositories. Their study considered 85 BPMN element types and found that usage was highly concentrated.

The most common elements were approximately:

| BPMN element | Models containing the element |
|---|---:|
| Sequence Flow | 99.65% |
| None End Event | 82.62% |
| None Start Event | 82.04% |
| Task | 60.91% |
| Exclusive Gateway | 54.45% |
| Pool | 49.53% |
| User Task | 43.83% |
| Lane | 40.29% |
| Parallel Gateway | 34.85% |
| Message Flow | 28.33% |
| Message Start Event | 25.16% |
| Association | 24.75% |
| Service Task | 21.75% |
| Intermediate Catch Timer Event | 19.27% |
| Intermediate Catch Message Event | 17.22% |
| Terminate End Event | 15.35% |
| Event-Based Gateway | 14.63% |
| Collapsed Subprocess | 12.88% |
| Conditional Sequence Flow | 12.30% |
| Text Annotation | 10.46% |

Only five elements appeared in more than half of the analyzed models. Twenty elements appeared in at least 10%, while 65 of the 85 element types appeared in fewer than 10%.

The combination of Task, Sequence Flow, Start Event, and End Event appeared in roughly 89% of the models. Adding Exclusive Gateway reduced the joint occurrence to approximately 50%, and adding Pool reduced it to approximately 44%.

These results support a deliberately small execution vocabulary, but they do not prove a literal or domain-independent 80/20 ratio.

### 1.2 Important limitations of public model corpora

Frequency data from public repositories must not be interpreted as production telemetry.

Possible biases include:

- Educational examples that overrepresent basic constructs
- Tool-generated templates
- Sample processes shipped in repositories
- Public availability bias
- Domain bias
- Duplicate and near-duplicate models
- Models intended only for documentation rather than execution

A 2025 empirical GitHub study identified 2,109 clone classes and reported that approximately 90% of the BPMN models in its analyzed open-source corpus were involved in clone-and-own practices. This means raw model counts can substantially overstate independent adoption.

The frequency data is still useful for prioritization, but it should be combined with:

1. Semantic implementation cost
2. Operational value
3. The target domain
4. The intended programming and worker model
5. The cost of getting a construct subtly wrong

### 1.3 Standard conformance is broader than practical support

The formal BPMN version published by the Object Management Group is BPMN 2.0.2. The standard defines modeling and execution conformance concepts, but a small engine will not implement the complete Common Executable conformance subclass.

Research comparing open-source engines has shown that engines often support only subsets of BPMN and may differ in their behavior. One 2015 conformance study tested Activiti, Camunda BPM, and jBPM and found that the tested engines supported at most 64% of its test features.

A minimal implementation should therefore describe itself precisely, for example:

> Supports BPMN 2.0 XML import/export and the Minimal Executable BPMN Profile 1.0.

It should not claim complete BPMN 2.0 execution conformance.

---

## 2. Design principle: execute, preserve, or reject

Every BPMN element encountered at deployment should fall into one of three categories.

### 2.1 Execute

The engine implements explicit, tested runtime semantics for the element.

### 2.2 Preserve only

The engine parses and retains the XML and diagram information but does not assign token-flow semantics to it.

This category is especially important for:

- Pools and participants
- Lanes
- Message flows
- Associations
- Text annotations
- Groups
- Data objects and data store references
- BPMN Diagram Interchange data
- Unknown extension elements

### 2.3 Reject when executable

The engine detects the element during deployment and rejects the process with a precise diagnostic.

Unsupported executable constructs must never be silently ignored. Silent skipping creates processes that appear successful while omitting intended business behavior.

---

## 3. Recommended executable profile

## 3.1 Core process structures

The engine must support:

| Concept | Recommended support |
|---|---|
| `bpmn:definitions` | Parse and validate |
| `bpmn:process` | Deploy executable processes |
| Process identifiers | Stable IDs and versioned definitions |
| BPMN namespaces | Preserve known and unknown namespaces |
| BPMN extension elements | Preserve; interpret only recognized engine extensions |
| BPMN DI | Preserve coordinates, shapes, edges, and waypoints |

At deployment, compile XML into an immutable internal graph rather than executing directly against the XML DOM.

```typescript
interface CompiledProcess {
  definitionKey: string;
  bpmnProcessId: string;
  version: number;

  nodes: ReadonlyMap<string, FlowNode>;
  sequenceFlows: ReadonlyMap<string, SequenceFlow>;
  scopes: ReadonlyMap<string, ScopeDefinition>;

  startNodeIds: readonly string[];
}
```

Precompute:

- Incoming and outgoing flows
- Scope ownership
- Boundary-event attachment
- Default flows
- Event-based gateway candidates
- Error-handler lookup chains
- Static diagnostics
- Reachability information needed by supported semantics

Running instances should remain pinned to the exact deployed process-definition version.

---

## 3.2 Sequence flow

**Recommendation: full support.**

Sequence Flow is present in essentially every BPMN model and is the basis of process-token movement.

Support:

- Unconditional sequence flows
- Conditional sequence flows
- Default sequence flows
- Incoming and outgoing flow references
- Stable evaluation order

A sequence flow should not itself become a long-lived runtime object unless required for join bookkeeping or audit history. It normally represents a token transition between nodes.

Suggested compiled form:

```typescript
interface SequenceFlow {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;

  condition?: CompiledExpression;
  isDefault: boolean;
  documentOrder: number;
}
```

---

## 3.3 None start event

**Recommendation: full support.**

The None Start Event is the primary API-triggered entry point.

Initial constraints can be:

- One None Start Event per executable process
- No incoming Sequence Flow
- At least one outgoing Sequence Flow
- Explicit API command starts the process

```typescript
interface StartProcessCommand {
  processId: string;
  version?: number;
  businessKey?: string;
  variables?: Record<string, JsonValue>;
  idempotencyKey: string;
}
```

Supporting multiple none start events is possible, but it requires an API mechanism for selecting which start event to activate. It is reasonable to defer that until there is a concrete use case.

---

## 3.4 None end event

**Recommendation: full support.**

A None End Event consumes the arriving token. The process instance completes when no active work remains in its root scope.

“Active work” includes:

- Active tokens
- Child scopes
- Service jobs
- User tasks
- Message subscriptions
- Timers
- Other runtime subscriptions

Do not mark a process complete merely because one token reached an end event.

---

## 3.5 Exclusive gateway

**Recommendation: full split and merge support.**

The Exclusive Gateway is the most frequently used explicit decision element.

### Exclusive split

A deterministic policy should be defined:

1. Evaluate outgoing conditional flows in stable order.
2. Select exactly one matching flow.
3. If none matches, take the default flow.
4. If none matches and no default exists, create an incident.
5. If multiple conditions match, either reject the model or select deterministically and emit a warning.

The safest validation profile requires conditions to be mutually exclusive.

```typescript
function selectExclusiveFlow(
  flows: readonly SequenceFlow[],
  variables: VariableView,
): SequenceFlow {
  const matching = flows.filter(
    flow => flow.condition && evaluateBoolean(flow.condition, variables),
  );

  if (matching.length === 1) {
    return matching[0];
  }

  if (matching.length > 1) {
    throw new AmbiguousGatewayError(matching.map(flow => flow.id));
  }

  const defaultFlow = flows.find(flow => flow.isDefault);
  if (defaultFlow) {
    return defaultFlow;
  }

  throw new NoMatchingSequenceFlowError();
}
```

### Exclusive merge

An exclusive merge should normally pass each arriving token through independently. It does not synchronize incoming paths.

---

## 3.6 Parallel gateway

**Recommendation: full split and join support.**

The Parallel Gateway enables concurrent work without conditional selection.

### Parallel split

Consume one incoming token and create one token for every outgoing flow.

### Parallel join

Wait until the required incoming branches have arrived, consume those arrivals, and produce one outgoing activation.

A naïve global counter keyed only by gateway ID is incorrect. Join bookkeeping must be scoped to the current activation lineage so that tokens from different process instances, subprocess instances, or loop iterations cannot synchronize accidentally.

An example join key is:

```text
(processInstanceId, scopeInstanceId, gatewayId, activationSetId)
```

An implementation can use token lineage, fork identifiers, or another explicit activation model, but it must be tested against loops and nested parallelism.

---

## 3.7 Generic task

**Recommendation: support only with explicit semantics.**

A plain `bpmn:task` is semantically underspecified for an execution engine.

Choose one policy:

1. Treat it as a generic externally completed work item.
2. Require an engine extension that identifies a handler.
3. Reject it in executable processes.

Do not execute a generic task as a no-op.

A useful extension might be:

```xml
<bpmn:task id="ReviewInput" name="Review input">
  <bpmn:extensionElements>
    <engine:taskDefinition type="manual-review" />
  </bpmn:extensionElements>
</bpmn:task>
```

---

## 3.8 Service task

**Recommendation: full support through an external-worker protocol.**

Service Task is the primary automation integration point.

Entering a service task should atomically:

1. Consume the incoming token.
2. Create an activity instance.
3. Create an external job.
4. Append an execution/audit record.
5. Commit the transaction.

A job should include at least:

```typescript
interface Job {
  id: string;
  processInstanceId: string;
  elementInstanceId: string;

  type: string;
  retriesRemaining: number;
  retryAt?: Instant;

  leaseOwner?: string;
  leaseExpiresAt?: Instant;

  idempotencyKey: string;
  createdAt: Instant;
}
```

Workers should claim jobs using leases. The engine should assume at-least-once delivery because a worker can complete an external side effect and crash before acknowledging the job.

Exactly-once execution across the engine database and arbitrary external services cannot generally be guaranteed by the workflow engine alone. The protocol therefore needs:

- Idempotent completion commands
- Stable job IDs
- Idempotency keys
- Lease expiration
- Retry policies
- Incident creation
- Explicit incident resolution

---

## 3.9 User task

**Recommendation: full support as a durable wait state.**

A User Task creates a persistent work item and suspends the token until completion.

Suggested state:

```typescript
interface UserTask {
  id: string;
  processInstanceId: string;
  elementInstanceId: string;

  name: string;
  assignee?: string;
  candidateUsers: readonly string[];
  candidateGroups: readonly string[];

  dueDate?: Instant;
  followUpDate?: Instant;

  state: "CREATED" | "COMPLETED" | "CANCELLED";
  version: number;
}
```

The first engine version does not need to implement a complete identity or authorization system. Assignment fields can be stored as metadata and exposed through APIs.

Completion must use optimistic concurrency or another duplicate-prevention mechanism.

---

## 3.10 Receive task

**Recommendation: support as a thin specialization of message waiting.**

A Receive Task can use the same runtime machinery as an Intermediate Message Catch Event.

This adds little semantic cost once durable message subscriptions exist.

---

## 4. Durable orchestration

A process engine without durable messages and timers is mainly a synchronous flowchart interpreter. A useful business process engine must survive restarts while waiting for external events.

## 4.1 Message start event

**Recommendation: full support.**

A Message Start Event creates a new process instance when an external message is published.

Define explicitly:

- Message name
- Tenant boundary
- Correlation policy
- Idempotency behavior
- Definition-version selection
- Whether unmatched messages are buffered
- Message time-to-live
- Whether one message may start one or multiple instances

A start-message command could be:

```typescript
interface PublishMessageCommand {
  messageName: string;
  correlationKey?: string;
  tenantId?: string;
  messageId: string;
  variables?: Record<string, JsonValue>;
  timeToLive?: Duration;
}
```

---

## 4.2 Intermediate message catch event

**Recommendation: full support.**

When the token reaches a Message Catch Event, create a durable subscription.

```typescript
interface MessageSubscription {
  id: string;
  processInstanceId: string;
  scopeInstanceId: string;
  elementInstanceId: string;

  messageName: string;
  correlationKey?: string;
  tenantId?: string;

  raceGroupId?: string;
  createdAt: Instant;
  expiresAt?: Instant;

  state: "ACTIVE" | "CLAIMED" | "CANCELLED";
  version: number;
}
```

The engine contract must define:

- Correlation uniqueness
- Buffering behavior
- Delivery multiplicity
- Duplicate message detection
- Correlation updates
- Tenant isolation
- Cancellation behavior

A practical default is:

```text
(messageName, tenantId, correlationKey) -> zero or one active subscription
```

When multiple subscriptions match, do not choose nondeterministically. Reject correlation or require an explicit broadcast mode.

---

## 4.3 Intermediate timer catch event

**Recommendation: full support.**

Timers enable:

- Delays
- Deadlines
- SLA handling
- Retry scheduling
- Event races
- Timeout branches

Support these timer forms in stages:

1. Absolute date/time
2. ISO-8601 duration
3. Repeating cycle, later if needed

Persist timers in the database rather than relying exclusively on in-memory scheduler callbacks.

```typescript
interface TimerSubscription {
  id: string;
  processInstanceId: string;
  scopeInstanceId: string;
  elementInstanceId: string;

  dueAt: Instant;
  raceGroupId?: string;

  state: "SCHEDULED" | "CLAIMED" | "CANCELLED" | "FIRED";
  version: number;
}
```

The scheduler should claim due timers with a lease or atomic state transition so that multiple engine nodes cannot fire the same timer independently.

---

## 4.4 Timer start event

**Recommendation: add after timer infrastructure exists.**

Timer Start Events have moderate practical value and low incremental runtime cost once durable timers and definition scheduling are available.

The deployment/versioning policy must define whether deploying a newer process version disables schedules for older versions.

---

## 4.5 Event-based gateway

**Recommendation: full support once messages and timers work.**

The Event-Based Gateway expresses a race between alternative external events.

Implementation:

1. Enter the gateway.
2. Create all candidate subscriptions in one transaction.
3. Give them the same `raceGroupId`.
4. Atomically claim the first subscription that fires.
5. Cancel all losing subscriptions.
6. Emit exactly one token along the winning path.

Without an atomic winner operation, a message and a timer arriving concurrently may both continue the process.

```sql
UPDATE event_subscription
SET state = 'CLAIMED',
    claimed_by = :command_id
WHERE id = :subscription_id
  AND state = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1
      FROM event_subscription sibling
      WHERE sibling.race_group_id = event_subscription.race_group_id
        AND sibling.state = 'CLAIMED'
  );
```

The exact SQL depends on the database and isolation model. The semantic invariant is:

```text
At most one subscription in a race group may win.
```

---

## 5. Scope, cancellation, and errors

## 5.1 Embedded subprocess

**Recommendation: full support for ordinary embedded subprocesses.**

A subprocess introduces a runtime scope.

```text
scope instance
├── local variables
├── active tokens
├── child scopes
├── service jobs
├── user tasks
├── message subscriptions
└── timer subscriptions
```

A subprocess scope is essential for:

- Local variables
- Boundary events
- Error propagation
- Termination
- Cancellation
- Future multi-instance behavior
- Future call activities

The first version can support expanded and collapsed visual representations identically because collapse is diagram notation rather than execution semantics.

---

## 5.2 Error end event

**Recommendation: full support.**

An Error End Event throws a BPMN error from the current scope.

The engine should resolve a handler by walking outward through enclosing scopes:

```text
current scope
  -> attached boundary handlers
  -> parent scope
  -> parent boundary handlers
  -> ...
```

Matching can use:

- Exact error code
- Catch-all error handler
- Optional engine-defined error type metadata

If no matching handler exists, the process instance should fail or create an incident according to the engine contract.

A BPMN Error is a modeled business/process error. It should not automatically be equivalent to an infrastructure exception, worker timeout, database failure, or exhausted retry count.

---

## 5.3 Interrupting error boundary event

**Recommendation: full support.**

When an interrupting Error Boundary Event catches an error:

1. Cancel the attached activity or subprocess scope.
2. Cancel child jobs, tasks, timers, and subscriptions.
3. Consume or mark child tokens as cancelled.
4. Record the caught error.
5. Emit a token along the boundary event’s outgoing flow.

The cancellation and boundary continuation should happen atomically.

---

## 5.4 Interrupting timer boundary event

**Recommendation: full support.**

An interrupting Timer Boundary Event implements a durable timeout.

There is a race between:

- Normal completion of the attached activity
- Firing of the timer

Only one may win. Use optimistic versioning, a state-machine transition, or an atomic compare-and-set.

```text
ACTIVE --complete--> COMPLETED
ACTIVE --timeout---> TIMED_OUT
```

Both commands must fail or become idempotent no-ops when the state is no longer `ACTIVE`.

Non-interrupting boundary events should be deferred because they introduce repeated concurrent paths and more complex lifecycle behavior.

---

## 5.5 Terminate end event

**Recommendation: full support.**

A Terminate End Event cancels all active work in its containing scope.

At root scope it cancels:

- Tokens
- Child scopes
- Jobs
- User tasks
- Message subscriptions
- Timer subscriptions
- Event races

Inside an embedded subprocess, it should terminate that subprocess scope rather than the entire process instance, consistent with the selected BPMN scope semantics.

---

## 6. Elements to parse and preserve without runtime semantics

## 6.1 Participants and pools

Pools are common but do not necessarily require execution behavior.

Recommended treatment:

- Preserve participant metadata
- Map each executable process to a separate deployed process definition
- Treat black-box participants as non-executable
- Preserve participant-to-process references
- Do not create runtime tokens for pools

---

## 6.2 Lanes

Lanes are frequently used for responsibility visualization.

Recommended treatment:

- Preserve lane structure
- Preserve flow-node references
- Expose lane metadata through the model API
- Optionally use lane names as assignment hints
- Do not make lane membership an authorization mechanism by default

---

## 6.3 Message flows

A Message Flow represents communication between participants. It is not a Sequence Flow and must not directly move a token inside a process.

Recommended treatment:

- Preserve source and target references
- Validate that it crosses participant boundaries where applicable
- Use message events and engine correlation configuration for runtime communication
- Do not infer a transport protocol solely from the diagram edge

---

## 6.4 Associations and annotations

Preserve:

- Associations
- Text annotations
- Groups
- Documentation elements

These affect documentation and interchange, not token execution.

---

## 6.5 Data objects and data stores

Initially preserve Data Objects and Data Store References as model metadata.

Use engine variables for runtime data. A current production example is Camunda 8, which supports Data Object and Data Store elements for modeling purposes rather than executable data semantics.

Later versions may introduce adapters between BPMN data associations and variable mappings, but the semantics should be explicit rather than inferred.

---

## 6.6 BPMN Diagram Interchange

Preserve:

- `BPMNShape`
- `BPMNEdge`
- Bounds
- Waypoints
- Labels
- Expansion/collapse state
- Participant and lane geometry

Ignoring BPMN DI causes imported models to lose their layout and substantially harms tool interoperability.

Unknown XML extension elements should be retained during round trips whenever possible.

---

## 7. Constructs to defer

## 7.1 Inclusive gateway

**Recommendation: reject initially.**

Inclusive split behavior is manageable, but inclusive join behavior is non-local.

A correct inclusive join must decide whether another active token can still reach an unfilled incoming branch. It cannot simply wait for all incoming flows, because some branches may never have been selected.

Research on inclusive gateway semantics identifies the need for non-local analysis of the process graph and current execution state.

Do not approximate an Inclusive Gateway as:

- A Parallel Gateway
- An Exclusive Gateway
- “Wait for every incoming edge”
- “Continue on the first token”

Add it only after the engine has:

- Formal token semantics
- Stable scope handling
- Token lineage
- Reachability analysis
- Extensive loop and unstructured-flow tests

---

## 7.2 Call activity

**Recommendation: defer.**

The node transition itself is simple. The associated lifecycle is not.

Required design decisions include:

```text
called process identifier
definition binding
deployment binding
version binding
tenant binding
input mappings
output mappings
business-key propagation
cancellation propagation
error propagation
incident propagation
child completion
migration behavior
```

Add Call Activity after embedded scopes and process-definition versioning are stable.

---

## 7.3 Multi-instance activities

**Recommendation: defer; later implement sequential before parallel.**

Multi-instance behavior introduces:

- Collection expressions
- Cardinality expressions
- Per-item variables
- Instance-local variables
- Completion conditions
- Result aggregation
- Partial cancellation
- Parallel fan-out
- Boundary-event interaction
- Retry and incident behavior per child

Sequential multi-instance is simpler and can be added first.

---

## 7.4 Script task

**Recommendation: model as an external worker initially.**

Embedding JavaScript, Python, Groovy, or another general-purpose scripting runtime expands:

- Security risk
- Dependency management
- Determinism problems
- Runtime versioning
- Resource isolation
- Observability requirements
- Upgrade compatibility

Use:

```xml
<bpmn:serviceTask id="EvaluateScript">
  <bpmn:extensionElements>
    <engine:taskDefinition type="script-evaluator" />
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

The worker may execute scripts in a separately sandboxed environment.

---

## 7.5 Business rule task

**Recommendation: model as a worker or DMN integration adapter.**

A Business Rule Task can dispatch to:

- A DMN engine
- A rules service
- A decision microservice
- A generic external worker

It does not require embedded rule-engine semantics in the BPMN core.

---

## 7.6 Transactions, cancel events, and compensation

**Recommendation: reject initially.**

These require:

- Completed-activity history
- Compensation-handler registration
- Reverse-order compensation
- Partial compensation tracking
- Transaction subprocess semantics
- Cancel events
- Compensation failure handling
- Interaction with termination and retries

Their implementation cost and semantic risk are high relative to typical initial demand.

---

## 7.7 Other deferred constructs

Initially reject executable use of:

- Complex Gateway
- Signal Events
- Escalation Events
- Conditional Events
- Link Events
- Multiple and Parallel Multiple Events
- Event Subprocess
- Ad-Hoc Subprocess
- Transaction Subprocess
- Choreography
- Conversation
- Non-interrupting Boundary Events
- Non-interrupting Event Subprocess behavior
- Compensation handlers
- Loop markers beyond the selected profile

Add them only in response to concrete model demand.

---

## 8. Machine-readable profile

The support contract should be machine-readable and versioned.

```yaml
profile:
  id: minimal-executable-bpmn
  version: 1.0

execute:
  activities:
    - configuredTask
    - serviceTask
    - userTask
    - receiveTask
    - embeddedSubProcess

  gateways:
    - exclusiveGateway
    - parallelGateway
    - eventBasedGateway

  startEvents:
    - none
    - message
    - timer

  intermediateCatchEvents:
    - message
    - timer

  boundaryEvents:
    - interruptingTimer
    - interruptingError

  endEvents:
    - none
    - error
    - terminate

  sequenceFlows:
    - unconditional
    - conditional
    - default

preserveOnly:
  - participant
  - lane
  - messageFlow
  - association
  - textAnnotation
  - group
  - dataObject
  - dataStoreReference
  - bpmndi
  - unknownExtensionElement

rejectWhenExecutable:
  - inclusiveGateway
  - complexGateway
  - callActivity
  - transaction
  - compensation
  - choreography
  - conversation
  - adHocSubProcess
  - eventSubProcess
  - nonInterruptingBoundaryEvent
  - multiInstanceLoopCharacteristics
```

Deployment diagnostics should identify:

- Profile ID and version
- Unsupported element ID
- Element type
- XML location where possible
- Reason for rejection
- Suggested alternative where safe

Example:

```text
MINBPMN-1042

Inclusive gateway "Gateway_17" is not supported by execution profile
"minimal-executable-bpmn/1.0".

The process was not deployed.

Suggested alternatives:
- Use an exclusive gateway when exactly one path is selected.
- Use a parallel gateway when every path is selected.
- Split the model into explicit mutually exclusive cases.
```

---

## 9. Runtime model

## 9.1 Core runtime entities

A minimal relational model can contain:

```text
process_definition
process_instance
scope_instance
element_instance
token
job
user_task
message_subscription
timer_subscription
incident
variable
execution_log
command_deduplication
```

Possible relationships:

```text
process_definition
└── process_instance
    └── scope_instance
        ├── element_instance
        ├── token
        ├── job
        ├── user_task
        ├── message_subscription
        ├── timer_subscription
        └── child scope_instance
```

---

## 9.2 State transitions

Model execution as explicit state transitions rather than arbitrary mutations.

Example activity lifecycle:

```text
CREATED
  -> ACTIVATED
  -> COMPLETING
  -> COMPLETED

ACTIVATED
  -> TERMINATING
  -> TERMINATED

ACTIVATED
  -> INCIDENT
  -> ACTIVATED
```

Every command should:

1. Validate the expected current state.
2. Apply an atomic transition.
3. Write runtime updates.
4. Append an audit record.
5. Commit.
6. Publish asynchronous notifications through an outbox, if required.

---

## 9.3 Transaction boundaries

A useful rule is:

> One logical engine transition equals one database transaction.

Examples:

- Enter Service Task and create job
- Complete job and activate outgoing flows
- Enter Message Catch Event and create subscription
- Correlate message and remove subscription
- Fire boundary timer and cancel attached scope
- Complete User Task and continue token
- Win event race and cancel alternatives

Avoid keeping database transactions open while calling external workers or services.

---

## 9.4 Idempotent commands

Every externally submitted command should have a stable command or idempotency key.

Examples:

- Start process
- Publish message
- Complete job
- Fail job
- Complete user task
- Resolve incident
- Cancel process instance

A deduplication table can map:

```text
(tenantId, commandType, idempotencyKey) -> stored result
```

A repeated command should return the original result or a deterministic duplicate response.

---

## 9.5 Optimistic concurrency

Use version columns on mutable runtime records.

```sql
UPDATE element_instance
SET state = 'COMPLETED',
    version = version + 1
WHERE id = :id
  AND state = 'ACTIVE'
  AND version = :expected_version;
```

If no row is updated, another command won the race or the supplied state was stale.

This mechanism is useful for:

- Activity completion versus boundary timeout
- Message versus timer races
- Duplicate job completion
- User-task completion versus process cancellation
- Concurrent gateway arrivals

---

## 9.6 Audit history

Record transitions with enough information for diagnosis and replay-oriented inspection:

```typescript
interface ExecutionLogEntry {
  sequence: bigint;
  processInstanceId: string;
  scopeInstanceId?: string;
  elementInstanceId?: string;

  eventType: string;
  occurredAt: Instant;
  commandId: string;

  data: Record<string, JsonValue>;
}
```

The first version does not need full event sourcing. A hybrid model with mutable current state plus append-only audit events is often simpler.

---

## 10. Variables and expression language

## 10.1 Variable model

A JSON-compatible value model is a reasonable initial choice.

```typescript
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
```

Define:

- Root process variables
- Subprocess-local variables
- Input mappings
- Output mappings
- Variable shadowing
- Null and missing-value semantics
- Numeric comparison behavior
- Serialization limits
- Maximum payload sizes

Large binary documents should generally be stored externally and referenced by metadata.

---

## 10.2 Expression engine

Provide an expression-language SPI, but ship only one constrained implementation initially.

Expressions are needed for:

- Conditional Sequence Flows
- Correlation keys
- Timer dates and durations
- Worker job types, if dynamic
- Input/output mappings
- Assignment metadata

Prefer a deterministic, resource-limited language such as:

- A constrained FEEL subset
- CEL
- A purpose-built expression AST

Avoid unrestricted embedded code in the process engine.

Persist the expression language and engine version with each deployed definition to prevent upgrades from silently changing evaluation semantics.

---

## 11. Validation

Validation should operate in layers.

## 11.1 XML validation

Validate against the official BPMN XML schemas where practical.

This catches:

- Invalid structure
- Missing required attributes
- Invalid element placement
- Namespace mistakes
- Type mismatches

XML Schema validation is necessary but insufficient.

---

## 11.2 BPMN semantic validation

Examples:

- Start Event must not have incoming Sequence Flows.
- End Event must not have outgoing Sequence Flows.
- Boundary Event must reference an existing activity.
- Default flow must belong to the source node.
- Event-Based Gateway successors must be supported event-catching nodes.
- Executable process must contain a supported start mechanism.
- Referenced messages and errors must exist where required.
- Unsupported executable elements must fail deployment.

---

## 11.3 Engine-profile validation

Examples:

- Generic Task must have an engine task definition.
- Service Task must specify a worker type.
- Message Catch Event must define a message name.
- Timer expressions must be statically parseable where possible.
- Inclusive Gateway is unsupported.
- Multi-instance marker is unsupported.
- Non-interrupting boundary behavior is unsupported.
- Multiple matching exclusive conditions should be rejected or warned about.

---

## 11.4 Soundness-oriented validation

Full formal soundness checking may be outside the first release, but useful checks include:

- Unreachable nodes
- Dead ends
- Sequence Flow cycles without wait states
- Parallel joins with suspicious topology
- Gateway with no outgoing flows
- Event race with no candidates
- Boundary event attached to unsupported activity
- Process with no reachable end or durable wait

Warnings should be distinct from deployment errors.

---

## 12. Testing strategy

Element-level tests are not enough. The engine needs semantic and concurrency tests.

## 12.1 Required semantic fixtures

| Area | Required cases |
|---|---|
| Sequence flow | Single flow, multiple outgoing flows, invalid references |
| Exclusive split | Zero, one, and several matching conditions |
| Default flow | No condition matches; default chosen |
| Exclusive merge | Multiple arrivals pass independently |
| Parallel split | All outgoing branches activated |
| Parallel join | Waits for required branches |
| Parallel loops | Iterations do not cross-synchronize |
| Service job | Complete, fail, retry, exhausted retries |
| Job lease | Expiry, reclaim, stale completion |
| User task | Complete, duplicate complete, cancel |
| Message catch | Message before and after subscription |
| Correlation | Zero, one, and multiple matches |
| Duplicate message | Same message ID published twice |
| Timer | Fire once, scheduler restart, duplicate claim |
| Event race | Message and timer arrive concurrently |
| Boundary timer | Activity completes while timeout fires |
| BPMN error | Matching handler, catch-all, uncaught error |
| Terminate | Nested scope versus root scope |
| Versioning | Existing instance pinned to old definition |
| Cancellation | Jobs, tasks, timers, and subscriptions removed |
| Crash recovery | Crash before and after each transaction commit |

---

## 12.2 Trace assertions

For every fixture, assert more than final completion.

Inspect:

- Execution-log sequence
- Active tokens
- Element instance states
- Scope tree
- Jobs
- User tasks
- Timers
- Message subscriptions
- Incidents
- Variables
- Cancellation state

A process can reach the expected end while still having leaked subscriptions or duplicated work.

---

## 12.3 Property-based testing

Property-based and model-based tests are especially valuable for the token kernel.

Candidate invariants:

```text
A token belongs to exactly one process instance.

An active element instance belongs to exactly one active scope.

A completed process instance has no active jobs, tasks, timers, subscriptions,
tokens, or child scopes.

At most one subscription wins an event-race group.

A service job completion activates outgoing flow at most once.

A terminated scope has no active descendants.

A process instance always references an existing immutable definition version.
```

Generate random combinations of supported gateways, branches, loops, and wait states, then compare the engine state to a simpler reference interpreter where feasible.

---

## 13. Interoperability

## 13.1 BPMN XML round trip

Import and re-export should preserve:

- IDs
- Names
- Documentation
- Namespace declarations
- Extension elements
- BPMN DI
- Unknown metadata where possible
- Diagram layout

Do not normalize or rewrite IDs unless explicitly requested.

---

## 13.2 BPMN MIWG

Use the BPMN Model Interchange Working Group test cases to test serialization and diagram interchange.

The MIWG’s mandate is model interchange, not runtime-semantic equivalence. Therefore use two separate suites:

1. **Interchange suite** for XML and BPMN DI round trips
2. **Execution suite** for token behavior and durable state

Passing the MIWG fixtures does not demonstrate correct process execution.

---

## 13.3 Vendor extension strategy

Keep vendor-specific runtime configuration under a dedicated namespace.

```xml
<bpmn:serviceTask id="ChargeCustomer" name="Charge customer">
  <bpmn:extensionElements>
    <engine:taskDefinition type="payments.charge" retries="5" />
    <engine:retryBackoff>PT30S,PT2M,PT10M</engine:retryBackoff>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

Guidelines:

- BPMN standard elements define process meaning.
- Extensions define engine bindings and operational policy.
- Unknown extensions are preserved.
- Unsupported mandatory extensions fail deployment.
- Extension schemas are versioned.

---

## 14. Suggested implementation phases

## Phase 1: deterministic token kernel

Implement:

- BPMN XML parsing
- Immutable deployment
- None Start Event
- None End Event
- Sequence Flow
- Conditional and default flow
- Exclusive Gateway
- Parallel Gateway
- Service Task
- User Task
- Variables
- Expression evaluation
- Durable process state
- External jobs
- Basic audit log

Result:

> Reliable synchronous and externally completed workflows.

---

## Phase 2: durable orchestration

Add:

- Message Start Event
- Intermediate Message Catch Event
- Intermediate Timer Catch Event
- Timer Start Event
- Receive Task
- Event-Based Gateway
- Message correlation
- Timer scheduler
- Job leases and retries
- Incidents
- Definition versioning
- Idempotent external commands

Result:

> Durable long-running processes that survive engine restarts.

---

## Phase 3: scope and failure semantics

Add:

- Embedded Subprocess
- Error End Event
- Interrupting Error Boundary Event
- Interrupting Timer Boundary Event
- Terminate End Event
- Scope-local variables
- Cancellation propagation

Result:

> Structured failure, timeout, and cancellation handling.

---

## Phase 4: reuse and scaling features

Potential additions:

- Call Activity
- Input/output mappings
- Sequential multi-instance
- Parallel multi-instance
- Non-interrupting timer boundary event
- Outbound message throw behavior
- More complete FEEL support

Only add each feature with a written semantic contract and dedicated trace tests.

---

## Phase 5: demand-driven expansion

Possible later features:

- Inclusive Gateway
- Event Subprocess
- Escalation
- Signal
- Compensation
- Transaction Subprocess
- Conditional events
- Link events
- Choreography or conversation metadata enhancements

Prioritize using models from the actual target domain rather than general public-model statistics.

---

## 15. Final scope recommendation

### Execute in version 1

- `definitions`
- Executable `process`
- None Start Event
- Message Start Event
- Timer Start Event
- None End Event
- Error End Event
- Terminate End Event
- Sequence Flow
- Conditional Sequence Flow
- Default Sequence Flow
- Configured generic Task
- Service Task
- User Task
- Receive Task
- Exclusive Gateway
- Parallel Gateway
- Event-Based Gateway
- Intermediate Message Catch Event
- Intermediate Timer Catch Event
- Embedded Subprocess
- Interrupting Error Boundary Event
- Interrupting Timer Boundary Event

### Parse and preserve

- Participant / Pool
- Lane
- Message Flow
- Association
- Text Annotation
- Group
- Data Object
- Data Store Reference
- BPMN DI
- Documentation
- Unknown extension elements

### Reject in executable processes

- Inclusive Gateway
- Complex Gateway
- Call Activity
- Multi-instance activities
- Transactions
- Cancel Events
- Compensation
- Choreography
- Conversation
- Ad-Hoc Subprocess
- Event Subprocess
- Non-interrupting Boundary Events
- Signal Events
- Escalation Events
- Conditional Events
- Link Events
- Multiple Events
- Parallel Multiple Events

This profile remains small enough for a coherent implementation while supporting:

- Straight-through automation
- Human workflows
- External workers
- Decisions
- Parallel execution
- External messages
- Delays and deadlines
- Event races
- Timeouts
- Modeled errors
- Scoped cancellation
- Durable long-running orchestration

The hard engineering work is not the number of BPMN symbols. It is making every supported transition durable, deterministic, recoverable, idempotent, and precisely specified.

---

## 16. Sources

1. **I. Compagnucci, F. Corradini, F. Fornari, and B. Re**, “Trends on the Usage of BPMN 2.0 from Publicly Available Repositories,” 2021.  
   Repository record and abstract:  
   https://pubblicazioni.unicam.it/handle/11581/458952

2. **Object Management Group**, “Business Process Model and Notation, Version 2.0.2,” adopted January 2014.  
   Specification page:  
   https://www.omg.org/spec/BPMN/2.0.2  
   Specification catalog and machine-readable schemas:  
   https://www.omg.org/spec/BPMN/

3. **M. Saeedi Nikoo, S. Kochanthara, Ö. Babur, and M. van den Brand**, “An empirical study of business process models and model clones on GitHub,” *Empirical Software Engineering*, volume 30, article 48, 2025.  
   DOI:  
   https://doi.org/10.1007/s10664-024-10584-z

4. **M. Geiger, S. Harrer, J. Lenhard, and G. Wirtz**, “BPMN Conformance in Open Source Engines,” 2015.  
   PDF:  
   https://www.uni-bamberg.de/fileadmin/pi/Dateien/Publikationen/Geiger2015BpmnConformanceIn.pdf

5. **D. R. Christiansen, M. Carbone, and T. Hildebrandt**, “Formal Semantics and Implementation of BPMN 2.0 Inclusive Gateways,” *Lecture Notes in Computer Science*, volume 6551, pages 146–160, 2011.  
   Author-hosted PDF:  
   https://davidchristiansen.dk/pubs/wsfm2010.pdf  
   DOI page:  
   https://doi.org/10.1007/978-3-642-19589-1_10

6. **BPMN Model Interchange Working Group**, purpose, test cases, and resources.  
   https://www.omgwiki.org/bpmn-miwg/doku.php?id=start  
   Test repositories:  
   https://github.com/bpmn-miwg

7. **Camunda 8 Documentation**, “BPMN coverage.” This is a vendor implementation reference rather than a normative source. It illustrates the distinction between modeling and execution support, including modeling-only Data Objects and Data Stores.  
   https://docs.camunda.io/docs/components/modeler/bpmn/bpmn-coverage/

8. **Camunda 8 Documentation**, message correlation and job-worker concepts. These are operational examples rather than normative BPMN semantics.  
   https://docs.camunda.io/docs/components/concepts/messages/  
   https://docs.camunda.io/docs/components/concepts/job-workers/

---

## 17. Further engineering directions

### A. Formal transition semantics

Specify each node as preconditions and atomic state transitions over tokens, scopes, jobs, timers, and subscriptions. Use this as the authoritative reference for implementation and tests.

### B. Persistence architecture

Compare a mutable relational runtime, pure event sourcing, and a hybrid current-state-plus-audit-log design with respect to recovery, queryability, migration, and operational complexity.

### C. Distributed worker protocol

Define job leasing, heartbeats, retry schedules, stale completions, idempotency, payload transport, backpressure, and tenant isolation.

### D. Process migration

Define whether and how running instances may move between process-definition versions. Migration is separate from normal version pinning and should not emerge accidentally.

### E. Domain-specific corpus analysis

Collect BPMN models from the engine’s intended users, normalize duplicates, classify executable versus documentation-only models, and use the results to prioritize profile version 1.1 and later.
