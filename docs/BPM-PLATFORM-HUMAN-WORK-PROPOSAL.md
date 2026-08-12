# BPM platform human-work proposal

## Status

**Draft for independent cold proposal review.** This proposal selects the smallest complete M3 human-work contract: a current cross-instance inbox, platform-owned claim and authorization policy, one typed form field, retry-safe completion, and distinct platform audit. Implementation remains paused until the [User Task assignment and form metadata proposal](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-PROPOSAL.md) receives closure approval and this proposal receives owner approval after its cold review.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Product question

What is the smallest complete Product 2 contract that lets a person find assigned User Tasks, claim one, render its typed input, complete the exact engine occurrence, and see a durable actor audit without turning platform state into BPMN meaning?

The recommendation is **one atomic human-work contract, implemented through internal checkpoints rather than temporary public APIs**. A read-only inbox would immediately be replaced when claim identity, typed input, completion recovery, and audit arrive. Those facts are jointly visible to adopters and must agree from the first public contract.

## Selected account

A work item means one currently open User Task obtained from the engine's committed public observation for one Process instance confirmed by Product 2. The engine owns the task occurrence, name, active state, optional assignment/form metadata, input variables, and completion outcome. Product 2 owns cross-instance discovery, actor resolution, claim state, authorization, completion intent recovery, wall-clock audit, HTTP, and UI.

The M3 producer set is the same confirmed-start set as [Process-instance search](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md#selected-account): direct exact-version start, a one-shot Schedule that reached `started`, and a Message Start publication that reached `accepted`. Instances started outside Product 2 remain absent. Inbox absence is never evidence that no other engine Process or User Task exists.

An inbox refresh returns one complete actor-visible snapshot or a closed `workSnapshotUnavailable` error. A matching retained engine completion receipt moves a private Process registration to positively closed, after which it needs no task Query. The platform never treats host absence as completion and never silently drops an active or indeterminate registration whose current engine observation is unavailable. A configured Process and task ceiling bounds one request; exceeding it returns the same explicit unavailable result rather than a partial page. M3 therefore has no unstable live-task pagination.

## Private engine address

Semantic Process-instance identity and Temporal Workflow identity remain distinct. Direct and Message starts use the canonical Process Workflow address, while a Timer Schedule may return an opaque execution Workflow address different from its configured base. Querying every Process by semantic identity would therefore miss or misaddress scheduled work.

Product 1 supplies one opaque private Process-work locator with each confirmed start. The Schedule path binds it to the service-returned execution Workflow address. Only the engine gateway interprets the locator through three narrowed operations: observe current open tasks, read one task detail, and submit one exact completion command.

The private locator is stored with the confirmed Product 2 registration and is immutable for that semantic Process identity. Re-recording the same public identity and locator is idempotent; changing either is an integrity failure. The locator never appears in public contracts, HTTP, browser state, audit, logs intended for adopters, task identity, or Process-instance search.

The gateway returns only engine public facts and closed host outcomes. If a task Query cannot run, it may resolve a matching retained completed-Process receipt and return `closed`; unresolved absence returns `unknown`, never `closed`. Product 2 does not import Temporal Event History, derive tasks from state differences, construct task occurrences, infer Workflow completion from absence, or reconstruct a Schedule address from its configured base.

## Public contract

Every transport type is deeply immutable, strictly decoded, and closed to unknown fields. The examples below show the minimal shape; the existing public definition and Process-instance contracts remain their single owners.

```ts
type PublicWorkTask = Readonly<{
  task: Readonly<{
    id: Readonly<{
      processInstanceId: string;
      elementId: string;
      activation: number;
    }>;
    name: string | null;
    state: "active";
    metadata?: Readonly<{
      assignment: Readonly<{
        candidates: readonly [Readonly<{ kind: "group"; id: string }>];
      }>;
      form: Readonly<{
        fields: readonly [Readonly<{
          key: string;
          type: "string" | "boolean";
        }>];
      }>;
    }>;
  }>;
  hostingInstance: PublicProcessInstanceIdentity;
  claim: null | Readonly<{ actorId: string; revision: number }>;
  claimableByCurrentActor: boolean;
}>;

type WorkTaskSnapshot = Readonly<{
  tasks: readonly PublicWorkTask[];
}>;
```

`task.id.processInstanceId` is the semantic owner of the task occurrence. `hostingInstance.processInstanceId` is the root Process whose private locator addresses the Workflow. They may differ for a called Process and are never collapsed.

The snapshot is sorted by exact Unicode scalar order of hosting Process identity, task Process identity, BPMN element identity, then numeric activation. No locale collation, normalization, host order, database row order, or Workflow identity enters ordering.

## Current actor and authorization

The server resolves one `ActorContext` containing a nonempty actor ID and exact group IDs. Requests never choose or override the actor in a body, query, or task identifier. M3 provides a pluggable identity-policy boundary and a configured fake implementation; it selects no authentication provider and makes no authentication-strength claim.

The actor-visible inbox contains tasks the policy permits the actor to view and exposes that policy's current claimability decision. The selected metadata candidate group governs claim eligibility. The default fake policy shows metadata-free tasks for operational awareness with `claimableByCurrentActor: false`; a configured policy may hide them. A metadata-free task is never claimable or form-completable through this contract. Metadata does not become an engine completion precondition.

Claiming is a platform compare-and-set over the complete engine task occurrence. The same actor may retry an identical claim idempotently. Another actor receives a conflict. Only the claimant may release or complete. A release carries the observed revision and refuses stale, absent, or foreign claims without changing state.

Claims are authorization state, not semantic User Task state. Product 2 never reports a claim as a BPMN transition or sends claim/release commands to the engine.

## Task detail and typed form

Task detail is re-read from the engine through the stored locator and exact task occurrence. It carries the current task plus the one metadata-declared field and that Process variable's exact current state:

```ts
type PublicFormValue =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "null" }>
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "boolean"; value: boolean }>;

type PublicTaskDetail = Readonly<{
  workTask: PublicWorkTask;
  form: null | Readonly<{
    fields: readonly [Readonly<{
      key: string;
      type: "string" | "boolean";
      currentValue: PublicFormValue;
    }>];
  }>;
}>;
```

Absence, semantic null, Boolean false, and string `"false"` remain distinct. A string field renders as a text field. A Boolean field renders as an unselected `true` or `false` choice when the current value is absent or null, rather than as an unchecked checkbox that would silently convert absence to false.

Completion requires exactly the published field key and exactly one string or Boolean value matching the published field type. This is Product 2 request validation for its generated form, not an engine form-validation claim. Labels, requiredness, defaults, constraints, mapping, and generalized form semantics are absent.

## HTTP resources

The public surface is:

- `GET /api/v1/work-tasks` for one complete current actor-visible snapshot;
- `GET /api/v1/work-tasks/{taskProcessInstanceId}/{elementId}/{activation}` for current task detail;
- `PUT /api/v1/work-tasks/{taskProcessInstanceId}/{elementId}/{activation}/claim` for an idempotent current-actor claim;
- `DELETE /api/v1/work-tasks/{taskProcessInstanceId}/{elementId}/{activation}/claim?revision={revision}` for claimant-only release;
- `PUT /api/v1/work-task-completions/{actionId}` for one retry-safe completion action;
- `GET /api/v1/work-audit` for exact-filtered, opaque-cursor platform audit.

Every path component uses ordinary percent encoding and strict well-formed scalar validation. Query keys are unique and closed. `GET` and `DELETE` accept no body. Mutation bodies have a 4,096-byte decoded JSON ceiling. Wrong methods, duplicate keys, malformed encoding, private fields, unsafe activations, and unknown fields fail before a service call.

The completion action contains the exact task occurrence, observed claim revision, and submitted value. The caller-generated nonempty `actionId` is the engine command identity. Reusing an action ID with byte-equivalent public content is idempotent; changing the task, revision, key, type, or value is a conflict.

## Completion lifecycle

Product 2 durably reserves the exact completion action before any engine call. The lifecycle is closed:

```text
reserved -> submitting -> committed
                      +-> rejected
                      +-> indeterminate
```

Only `reserved` may initiate the first engine call. A possibly transmitted action never becomes a different dispatchable action. Exact retries use the same content-bound engine command, so response loss or platform restart cannot create a second semantic completion. A retained matching engine result closes the action; a semantic refusal closes it as rejected; host absence that cannot distinguish accepted-then-unretained from never accepted becomes durable indeterminate.

The public completion result is a closed union. `committed` alone reports success. `rejected` reports the engine's public command outcome without inventing a reason. `indeterminate` returns HTTP 202 and exposes no success claim. Changed-content retry, stale claim, another actor, mismatched current task, or a value-type mismatch never calls the engine.

No database transaction spans the engine call. The reservation, result, claim update, and audit writes use explicit compare-and-set transitions. Startup reconciliation revisits `submitting` and `indeterminate` actions through the same exact gateway request and never derives a result from Workflow history.

## Platform audit

Audit is an append-only Product 2 record of actor, policy decision, wall-clock instant, exact task occurrence, action identity, action kind, and closed platform outcome. It is distinct from BPMN semantic history and Temporal Event History.

Claim, release, completion reservation, committed completion, rejection, and indeterminate resolution each produce an exact typed event. Equivalent retries do not duplicate their logical event. Audit exposes no Workflow ID, Run ID, Task Queue, Schedule identity, command transport payload, Temporal status, Event History field, or private locator.

Audit paging uses an opaque insertion cursor and exact filters for actor ID, task Process identity, hosting Process identity, and action kind. It adds no claim that its wall-clock order is semantic execution order.

## Persistence and concurrency

Product 2 persists only confirmed Process registrations with their private locators and positive active, closed, or indeterminate observation classification, plus claims, completion actions, and audit. `closed` requires a matching engine receipt. It may cache the latest task snapshot for one request, but a cached task row is never semantic authority and is never returned as current without a fresh successful engine observation.

Independent database connections must serialize two-actor claims on the complete task occurrence. Exactly one claimant wins. Equivalent same-actor retries converge. Concurrent distinct completion actions may both cross the host boundary after the same fresh observation, but the engine's exact occurrence admission permits at most one semantic completion; Product 2 records every returned committed or rejected outcome without rewriting it.

The pre-release database schema is exact and fail-closed. Corrupt identities, locators, claim revisions, action content, state transitions, or audit values block the affected operation. Rebuilding semantic task state from Temporal Visibility or Event History is prohibited.

## User interface and selected stack

The M3 web surface is a global inbox plus one task-detail form. It remains an HTTP-only static React client. The selected stack is:

- `react-aria-components` for accessible buttons, text fields, radio groups, dialogs, focus, and keyboard behavior;
- TanStack Table for deterministic inbox table mechanics;
- TanStack Query for request state, invalidation, and ordinary explicit or interval refetch;
- CSS Modules compiled by Vite to ordinary CSS, with platform CSS variables for tokens.

No router is required for this slice. TanStack Virtual is not added until a measured list requires it. No form library, component theme framework, WebSocket, server-sent event, or still-unapproved long-polling contract is added.

The inbox renders Process identity, definition version, task name and occurrence, assignment group, and claim state. The detail surface preserves absent/null/current value distinctions, requires an explicit Boolean choice, exposes pending or indeterminate completion honestly, and never renders a private host field.

## Required evidence

The contract is accepted only with all of the following:

1. direct, Timer Schedule, and Message Start producers register exact public identity plus the correct private locator, with a configured-Schedule-base mutation failing;
2. one live snapshot discovers tasks from all three producers without Event History, including metadata-free Timer/Message controls and one E2 metadata-bearing direct task;
3. Worker and platform restart preserve discovery, claims, actions, and audit;
4. independent connections prove same-actor idempotency and exactly one winner in a two-actor claim race;
5. candidate mismatch, nonclaimant release/completion, stale revision, cross-host task identity, changed action content, extra/missing field, and Boolean stringification fail before or at their owning boundary;
6. response loss after engine acceptance converges to one committed completion and one logical audit outcome, while retention-indistinguishable absence remains indeterminate;
7. recursive HTTP and browser scans exclude Workflow, Run, Task Queue, Schedule, history, locator, and transport command fields;
8. Chromium acceptance uses the production server, Worker, public HTTP client, React Aria controls, TanStack Table/Query, and CSS Modules to find, claim, complete, and remove one exact Boolean task.

## Required, optional, and excluded functionality

Required:

- private exact observation locators for every confirmed Product 2 start producer;
- current engine observation, exact task detail, and exact completion through the engine gateway;
- actor resolution, candidate-group claim authorization, durable claim concurrency, retry-safe completion, and platform audit;
- one exact string or Boolean generated field with absent/null preservation;
- strict public HTTP contracts, global inbox and detail UI, restart/live evidence, and browser acceptance.

Optional only if it changes no public or semantic claim:

- a read-only metadata-free task row from the Timer or Message profile as an additional locator control;
- an explicit manual refresh control in addition to bounded interval refetch.

Excluded:

- Process instances started outside Product 2, engine-wide discovery, or completeness beyond the confirmed producer set;
- authentication provider, single sign-on, external directory, tenancy, organization hierarchy, or production security claim;
- assignee, candidate users, delegation, escalation, due dates, priority, notifications, task-local variables, multiple candidates, or multiple form fields;
- labels, defaults, requiredness, constraints, validation rules, files, dates, numbers, objects, form schema/runtime, form designer, or rendering templates;
- claim/release as engine commands, metadata as engine completion admission, or any new BPMN transition or value meaning;
- Event History, Visibility, Search Attributes, Workflow status, Run identity, Schedule identity, or state differencing as task facts;
- stable live-task pagination, virtualization, routing, live push transport, offline UI, mobile application, or production release packaging.

## Versioning consequences

This proposal adds Product 2 HTTP contracts and private platform persistence only. It does not change BPMN source admission, checked graph, Semantic Process IL, semantic runtime state, engine public `OpenUserTask`, completion stimulus, Workflow definition, Lean, CIB evidence, or registered semantic artifacts.

The existing public Process-instance search response remains byte-identical. Its private confirmed-start recording is widened atomically to carry an opaque locator to the server composition fan-out. The public search index may store or ignore that private value internally, but it never returns it.

The platform is pre-release. Work and audit databases use exact schema epochs with no compatibility reader. Any retained production-data compatibility promise would require a separate version, migration, rollback, and mixed-version contract before release.

## Material risks and stop conditions

Stop and return to the owner or engine boundary if:

- E2 has not received closure approval before Product 2 code imports or projects its metadata;
- a confirmed producer cannot supply the actual private Workflow address, especially the service-returned Schedule execution address;
- current task observation or completion requires Event History, Visibility inference, state differencing, or platform-created occurrence identity;
- a task completion requires metadata to become an engine precondition or requires a new semantic value kind;
- M3 must discover Process instances started outside Product 2;
- implementing the contract requires an unselected router, form, authentication, transport, database, broker, or UI dependency;
- exact retries cannot distinguish committed, rejected, and retention-indeterminate completion without claiming success from absence.

The recommendation is to approve this contract after cold review. It gives M3 one usable human-work slice without freezing a general form engine, authentication system, or host-derived BPMN model.
