# BPM platform human-work proposal

## Status

**Owner-approved proposal on 2026-08-12; implementation has not started.** Context-cold target `7444ce3` received `APPROVE WITH REQUIRED EDITS`; correction `3b748e2` closed its logical-audit identity, policy-hiding, crash-durable audit handoff, and owner-routing findings and received `APPROVE` from the exact reviewer. The proposal selects the current inbox, platform claim and authorization policy, one typed form field, retry-safe completion, distinct platform audit, and CSS-Modules UI scope. Implementation remains paused until the [User Task assignment and form metadata proposal](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-PROPOSAL.md) receives closure approval and explicit owner direction permits the next E2 review action.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `7444ce3` | `fork-turns-none` | `approve-with-required-edits` | `3b748e2` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Product question

What is the smallest complete Product 2 contract that lets a person find assigned User Tasks, claim one, render its typed input, complete the exact engine occurrence, and see a durable actor audit without turning platform state into BPMN meaning?

The recommendation is **one atomic human-work contract, implemented through internal checkpoints rather than temporary public APIs**. A read-only inbox would immediately be replaced when claim identity, typed input, completion recovery, and audit arrive. Those facts are jointly visible to adopters and must agree from the first public contract.

## Selected account

A work item means one currently open User Task obtained from the engine's committed public observation for one Process instance confirmed by Product 2. The engine owns the task occurrence, name, active state, optional assignment/form metadata, input variables, and completion outcome. Product 2 owns cross-instance discovery, actor resolution, claim state, authorization, completion intent recovery, wall-clock audit, HTTP, and UI.

The M3 producer set is the same confirmed-start set as [Process-instance search](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md#selected-account): direct exact-version start, a one-shot Schedule that reached `started`, and a Message Start publication that reached `accepted`. Instances started outside Product 2 remain absent. Inbox absence is never evidence that no other engine Process or User Task exists.

Definitions owns one durable confirmed-start publication lifecycle containing the exact public instance and private locator. Direct start first asks Product 1 to prepare an immutable start intent, which compiles and admits the stored bytes, returns the canonical locator plus a versioned intent marker, and performs zero SDK calls. The domain-separated v1 marker hashes the exact Workflow type, private Workflow address, Task Queue, `REJECT_DUPLICATE` reuse policy, `FAIL` conflict policy, absent Workflow retry policy, complete Start Process stimulus, and complete Semantic Process program snapshot. Definitions persists the generated Process identity, exact definition binding, canonical locator, and marker, then moves the row to `starting` before asking Product 1 to start that exact prepared intent. Product 1 reconstructs the same snapshots, rejects marker drift before any SDK call, passes those snapshots unchanged as the Workflow arguments, and retains the marker in private Memo key `bpmnLeanDirectStartIntentSha256`. Product 1 gains a handle-free describe operation that compares the Memo marker, Workflow type, and Task Queue without a Worker. Once the start call may have been transmitted, the lifecycle never dispatches again: a matching description confirms the start, a divergent description is integrity failure, and missing or unavailable description stays nonpublic indeterminate and remains describe-only retryable. Schedule and Message reuse their existing pre-host durable lifecycle and confirm publication only from `started` or `accepted`.

Each confirmed publication starts with independent `operatePending` and `workPending` delivery markers. The server composition supplies idempotent Operate and Work subscribers, but it does not fan out directly from a producer call. Definitions persists confirmation before invoking either subscriber, marks each delivery separately after that subscriber succeeds, and reconciles every pending marker plus every direct-start indeterminate record on startup and producer retry. Direct start returns HTTP success only after confirmation exists and both subscribers have acknowledged. A crash after host acceptance, after confirmation, or after either subscriber therefore converges after restart without another start, and the durable confirmed Definitions publication set is the independent oracle for exact equality of the Operate and Work confirmed-start sets.

The direct-start lifecycle is closed:

| Stored state | Allowed work | Next state | Public start result |
|---|---|---|---|
| no row | prepare only | rejected preparation leaves no row; admitted preparation reserves `reserved` | existing 422 rejection or no result yet |
| `reserved` | one compare-and-set to `starting` | `starting` | no result yet |
| `starting` before any returned host result | invoke start at most once, then describe after any thrown or interrupted call | `confirmed`, `indeterminate`, or `integrityFailure` | no result yet |
| `indeterminate` | describe only | matching becomes `confirmed`; missing or unavailable stays `indeterminate`; divergent becomes `integrityFailure` | existing 500 `internalFailure` while unresolved |
| `confirmed` with pending subscriber markers | invoke only the missing idempotent subscriber | `confirmed` with each acknowledgement retained | existing 500 `internalFailure` until both acknowledge |
| `confirmed` with both acknowledgements | no host or subscriber call | stable | existing 201 start response |
| `integrityFailure` | no host or subscriber call | stable | existing 500 `internalFailure` |

A crash after the durable `starting` transition but before the SDK call may therefore leave a nonpublic indeterminate row rather than risk duplicate dispatch. A preparation rejection happens before reservation; any rejection or constructor failure after an admitted marker is integrity failure rather than a second semantic outcome. Definitions table access and startup reconciliation occur before route construction. If reconciliation cannot repair a confirmed publication's pending subscriber marker, server composition fails rather than serving a known incomplete confirmed set.

This lifecycle closes the M2 orphan-registration gap, not the body-free route's caller-idempotency gap. If the direct-start response is lost, the accepted host instance still converges into Operate and Work, but the caller has no resource identity with which to retrieve that response. A later body-free request intentionally creates a distinct semantic Process identity. Making direct start retry-transparent would require a separate public idempotency contract.

An inbox refresh first builds one complete system-visible aggregation equal to the fresh engine-published task sets for every nonclosed confirmed registration. Actor policy is a separate projection over that complete aggregation. The equality oracle runs before policy filtering, so an authorization rule cannot hide a missing producer or task from the engine-to-platform agreement check.

A matching retained engine completion receipt moves a private Process registration to positively closed, after which it needs no task Query. The platform never treats host absence as completion and never silently drops an active or indeterminate registration whose current engine observation is unavailable. Server configuration owns positive `PLATFORM_WORK_MAX_PROCESSES` and `PLATFORM_WORK_MAX_TASKS` ceilings, defaulting to 100 confirmed registrations and 1,000 observed tasks per request. An unresolved nonclosed registration or an exceeded ceiling returns a closed `workSnapshotUnavailable` result rather than a partial system or actor snapshot. M3 therefore has no unstable live-task pagination.

## Private engine address

Semantic Process-instance identity and Temporal Workflow identity remain distinct. Direct and Message starts use the canonical Process Workflow address, while a Timer Schedule may return an opaque execution Workflow address different from its configured base. Querying every Process by semantic identity would therefore miss or misaddress scheduled work.

Product 1 owns an opaque `EngineProcessWorkLocator` and supplies one with each confirmed start. Direct and Message starts mint it from Product 1's canonical Process Workflow address. The Schedule path mints it only from the service-returned `executionWorkflowId`, never the configured Workflow-ID base. Only the engine gateway interprets the locator through three narrowed operations: `observeOpenWork`, `readWorkDetail`, and `completeWork`.

The private locator is stored with the confirmed Product 2 registration and is immutable for that semantic Process identity. Re-recording the same public identity and locator is idempotent; changing either is an integrity failure. The locator, direct-start intent protocol/digest, Memo key/value, Workflow type, Task Queue, and describe result never appear in public contracts, HTTP, browser state, audit, task identity, Process-instance search, or any logger input. Internal diagnostics use the registration identity and classified gateway outcome instead.

The gateway returns only engine public facts and closed host outcomes. If a task Query cannot run, it may resolve a matching retained completed-Process receipt and return `closed`; unresolved absence returns `unknown`, never `closed`. Product 2 does not import Temporal Event History, derive tasks from state differences, construct task occurrences, infer Workflow completion from absence, or reconstruct a Schedule address from its configured base.

The private registration classification is a closed state machine:

| Stored state | Gateway observation | Next state | Snapshot effect |
|---|---|---|---|
| newly delivered publication | no observation yet | `indeterminate` | remains registered and must be observed before any snapshot succeeds |
| `active` or `indeterminate` | successful Query with zero or more exact open tasks | `active` | contributes the exact task set |
| `active` or `indeterminate` | matching retained completed-Process receipt | `closed` | contributes no task and is not queried again |
| `active` or `indeterminate` | unresolved `unknown` or infrastructure `unavailable` | `indeterminate` | fails the complete snapshot as `workSnapshotUnavailable` |
| `closed` | no gateway call | `closed` | contributes no task |

`indeterminate` remains registered and retryable. A successful zero-task Query establishes `active`; zero tasks alone never establishes `closed`.

## Public contract

Every transport type is `DeepReadonly`, strictly decoded, and closed to unknown fields. The examples below show the complete semantic shape; route files own the exact encodings, size limits, and status mappings. The existing public definition and Process-instance contracts remain their single owners.

```ts
type PublicWorkTask = DeepReadonly<{
  task: {
    id: {
      processInstanceId: string;
      elementId: string;
      activation: number;
    };
    name: string | null;
    state: "active";
    metadata?: {
      assignment: {
        candidates: readonly [{ kind: "group"; id: string }];
      };
      form: {
        fields: readonly [{
          key: string;
          type: "string" | "boolean";
        }];
      };
    };
  };
  hostingInstance: PublicProcessInstanceIdentity;
  claimGeneration: number;
  claim: null | { actorId: string; generation: number };
  claimableByCurrentActor: boolean;
}>;

type WorkTaskSnapshot = DeepReadonly<{
  tasks: readonly PublicWorkTask[];
}>;
```

`task.id.processInstanceId` is the semantic owner of the task occurrence. `hostingInstance.processInstanceId` is the root Process whose private locator addresses the Workflow. They may differ for a called Process and are never collapsed.

The snapshot is sorted by exact Unicode scalar order of hosting Process identity, task Process identity, BPMN element identity, then numeric activation. No locale collation, normalization, host order, database row order, or Workflow identity enters ordering.

## Current actor and authorization

The server resolves one `ActorContext` containing a nonempty actor ID and exact group IDs. Requests never choose or override the actor in a body, query, or task identifier. M3 provides a pluggable identity-policy boundary and a configured fake implementation; it selects no authentication provider and makes no authentication-strength claim. Server configuration owns `PLATFORM_FAKE_ACTOR_ID`, defaulting to `demo-user`, and `PLATFORM_FAKE_ACTOR_GROUPS_JSON`, defaulting to `["reviewers"]`. The group value must be a strict JSON array of unique nonempty well-formed Unicode strings with no extra JSON value; malformed, duplicate, empty, or non-string members reject startup. Composition snapshots those values into the fake resolver and no request can alter them.

The system-visible aggregation contains every task in the fresh engine observations. The actor policy then projects it to the public inbox. The selected metadata candidate group governs claim eligibility. The default fake policy shows eligible unclaimed tasks and the current actor's claims, hides ineligible tasks and another actor's claims, and hides metadata-free tasks. Focused evidence must separately prove the system aggregation still contains eligible, ineligible, and metadata-free tasks before filtering. A metadata-free task is never claimable or form-completable through this contract. Metadata does not become an engine completion precondition.

Every task read and previously unseen mutation applies the same actor projection immediately before its repository operation. The only exception is the exact retained claim, release, or completion action lookup defined below: it validates the bound actor and content before any current-task refresh. A task already claimed by another actor, an ineligible task, and a metadata-free task are all policy-hidden and return 404 without revealing which condition applied. A true two-actor race may pass the policy while both observe the task as unclaimed; the claim compare-and-set loser then receives 409. Once the winning claim is visible in a later fresh projection, the other actor receives 404 instead.

Claiming is a platform compare-and-set over the complete engine task occurrence. Every occurrence owns a monotonic `claimGeneration` that increases on claim and release, is never reset or reused while unclaimed, and survives restart. The same actor may retry the same claim `actionId` idempotently only against the currently live generation; the first equivalent retry may durably add one logical `idempotent` audit outcome and later retries reuse it. A changed action ID against a current same-actor claim or a concurrent claim compare-and-set loss receives conflict. Only the claimant may release or complete. A release carries its own action ID and the observed generation and refuses stale or foreign claims without changing state. A claim, release, reclaim sequence therefore cannot make a stale generation valid again.

Every claim or release action ID is durably bound to exact actor ID, operation kind, task occurrence, and input generation before mutation. After a successful release removes the claim, an exact retry returns the retained `WorkReleaseResult` without another generation change. The first equivalent retry may durably add one logical `idempotent` audit outcome; later equivalent retries reuse it. The same action ID with changed actor, operation, task, or generation is conflict. An absent claim without that exact retained release result is 404. This retained action rule is the only absent-claim release success.

Claims are authorization state, not semantic User Task state. Product 2 never reports a claim as a BPMN transition or sends claim/release commands to the engine.

## Task detail and typed form

Task detail is re-read from the engine through the stored locator and exact task occurrence. It carries the current task plus the one metadata-declared field and that Process variable's exact current state:

```ts
type PublicFormValue =
  | DeepReadonly<{ kind: "absent" }>
  | DeepReadonly<{ kind: "null" }>
  | DeepReadonly<{ kind: "string"; value: string }>
  | DeepReadonly<{ kind: "boolean"; value: boolean }>;

type PublicFormField =
  | DeepReadonly<{ key: string; type: "string"; currentValue: Extract<PublicFormValue, { kind: "absent" | "null" | "string" }>; compatibility: "compatible" }>
  | DeepReadonly<{ key: string; type: "boolean"; currentValue: Extract<PublicFormValue, { kind: "absent" | "null" | "boolean" }>; compatibility: "compatible" }>
  | DeepReadonly<{ key: string; type: "string"; currentValue: Extract<PublicFormValue, { kind: "boolean" }>; compatibility: "incompatible" }>
  | DeepReadonly<{ key: string; type: "boolean"; currentValue: Extract<PublicFormValue, { kind: "string" }>; compatibility: "incompatible" }>;

type PublicTaskDetail = DeepReadonly<{
  workTask: PublicWorkTask;
  form: null | { fields: readonly [PublicFormField] };
}>;
```

Absence, semantic null, Boolean false, and string `"false"` remain distinct. A string field renders as a text field. A Boolean field renders as an unselected `true` or `false` choice when the current value is absent or null, rather than as an unchecked checkbox that would silently convert absence to false.

E2 metadata is passive, so the observed value may disagree with the declared field type. The detail preserves that raw value as `incompatible`, renders it read-only, and disables completion with `formValueIncompatible`; it never stringifies, parses, defaults, or hides the mismatch. Completion requires a compatible detail, exactly the published field key, and exactly one string or Boolean value matching the published field type. This is Product 2 request validation for its generated form, not an engine form-validation claim. Labels, requiredness, defaults, constraints, mapping, and generalized form semantics are absent.

## HTTP resources

The public surface is:

- `GET /api/v1/work-tasks` for one complete current actor-visible snapshot;
- `GET /api/v1/work-tasks/{taskProcessInstanceId}/{elementId}/{activation}` for current task detail;
- `PUT /api/v1/work-tasks/{taskProcessInstanceId}/{elementId}/{activation}/claim` for an idempotent current-actor claim;
- `DELETE /api/v1/work-tasks/{taskProcessInstanceId}/{elementId}/{activation}/claim?actionId={actionId}&generation={generation}` for claimant-only release;
- `PUT /api/v1/work-task-completions/{actionId}` for one retry-safe completion action;
- `GET /api/v1/work-audit` for exact-filtered, opaque-cursor platform audit.

Every path component uses ordinary percent encoding and strict well-formed scalar validation. Query keys are unique and closed. `GET` and `DELETE` accept no body. Mutation bodies have a 4,096-byte decoded JSON ceiling. Wrong methods, duplicate keys, malformed encoding, private fields, unsafe activations, and unknown fields fail before a service call.

The completion action contains the exact task occurrence, observed claim generation, and submitted value. The caller-generated nonempty `actionId` is the engine command identity. Reusing an action ID with byte-equivalent public content is idempotent; changing the task, generation, key, type, or value is a conflict.

Every completion action is durably bound before dispatch to the resolved actor ID, operation kind `completion`, exact task occurrence, observed claim generation, field key, declared field type, and submitted tagged value. Completion handling first looks up an existing action by `actionId`, before refreshing task visibility. An equivalent retry by the bound actor returns or reconciles its retained result even after commitment has removed the task and cleared the claim; a foreign actor receives 404 and changed content receives 409. Only an unseen action proceeds through fresh engine observation, actor policy, current claim, field-compatibility, and reservation checks. This narrow precedence preserves idempotency without making a completed task newly visible.

The closed mutation and audit contracts are:

```ts
type WorkClaimRequest = DeepReadonly<{
  actionId: string;
  expectedGeneration: number;
}>;

type WorkClaimResult = DeepReadonly<{
  taskId: PublicWorkTask["task"]["id"];
  claim: { actorId: string; generation: number };
}>;

type WorkReleaseResult = DeepReadonly<{
  taskId: PublicWorkTask["task"]["id"];
  claimGeneration: number;
  released: true;
}>;

type WorkReleaseRequest = DeepReadonly<{
  actionId: string;
  generation: number;
}>;

type WorkCompletionRequest = DeepReadonly<{
  taskId: PublicWorkTask["task"]["id"];
  expectedClaimGeneration: number;
  submittedValues: readonly [{ key: string; value: Extract<PublicFormValue, { kind: "string" | "boolean" }> }];
}>;

type WorkCompletionResult =
  | DeepReadonly<{ state: "committed"; actionId: string; taskId: PublicWorkTask["task"]["id"] }>
  | DeepReadonly<{ state: "rejected"; actionId: string; taskId: PublicWorkTask["task"]["id"]; engineResult: { kind: "semantic"; outcome: "rolledBack" | "rejected" | "semanticFailure" | "unsupported" } | { kind: "processClosed" } }>
  | DeepReadonly<{ state: "indeterminate"; actionId: string; taskId: PublicWorkTask["task"]["id"] }>;

type WorkAuditAction =
  | DeepReadonly<{ kind: "claim"; actionId: string; outcome: "claimed" | "idempotent" | "conflict" }>
  | DeepReadonly<{ kind: "release"; actionId: string; outcome: "released" | "idempotent" | "conflict" }>
  | DeepReadonly<{ kind: "completion"; actionId: string; outcome: "reserved" | "committed" | "rejected" | "indeterminate" }>;

type WorkAuditEvent = DeepReadonly<{
  eventId: string;
  actorId: string;
  recordedAt: string;
  hostingProcessInstanceId: string;
  taskId: PublicWorkTask["task"]["id"];
  action: WorkAuditAction;
}>;

type WorkAuditPage = DeepReadonly<{
  events: readonly WorkAuditEvent[];
  nextCursor: string | null;
}>;

type WorkAuditRequest = DeepReadonly<{
  actorId?: string;
  taskProcessInstanceId?: string;
  hostingProcessInstanceId?: string;
  actionKind?: "claim" | "release" | "completion";
  cursor?: string;
  limit?: number;
}>;

type WorkApiErrorCode = PublicApiErrorCode | "forbidden" | "formValueIncompatible" | "workSnapshotUnavailable";

type PublicApiErrorResponse<Code extends string> = DeepReadonly<{
  error: { code: Code; message: string };
}>;

type WorkApiErrorResponse = PublicApiErrorResponse<WorkApiErrorCode>;
```

Audit uses an opaque `v1.` plus nonempty unpadded base64url cursor, default limit 50, and maximum limit 100. It sorts by private monotonically increasing insertion ordinal ascending. A cursor identifies the last returned ordinal exclusively, so the next page returns only later ordinals; inserting a later event never duplicates or reorders earlier pages. Filters are exact, query keys are unique, and an unknown or malformed cursor is invalid. `eventId` is a globally unique opaque public identity with no encoded order. `recordedAt` is the canonical UTC RFC 3339 form `YYYY-MM-DDTHH:mm:ss.sssZ`; offsets, missing milliseconds, and noncanonical equivalents are rejected.

The default fake policy permits an actor to read only audit events whose `actorId` equals its resolved actor ID. Omitting the filter implicitly selects that ID; explicitly selecting the same ID is equivalent; selecting another actor is 403 before repository search. Hosting-Process, task-Process, and action-kind filters narrow only that self-owned set. M3 has no administrator, cross-actor audit role, or audit-export authorization. A uniform-404 visibility failure is audit-silent: hidden, ineligible, metadata-free, another-actor, no-longer-current, and unknown tasks create no audit event or outbox item. `conflict` is retained only after the task was actor-visible and an observable compare-and-set race or same-actor action-content collision occurred.

The three new error codes extend the single project-owned code catalog and generic `PublicApiErrorResponse<Code>` envelope rather than introducing a parallel error shape. The single public error-decoder owner accepts an explicit route-owned readonly code set and returns the corresponding parameterized envelope. Existing clients pass their exact legacy subsets and keep byte-identical error bodies and accepted codes; the Work client alone passes the Work subset. The no-argument global decoder is replaced rather than broadened.

`GET` success is HTTP 200. A new claim is 201 and an idempotent claim or release is 200. A completion is 200 for `committed` or `rejected` and 202 for `indeterminate`; an engine nonsuccess is a typed domain result, not an invented HTTP failure. Hidden, unknown, no-longer-current, or policy-filtered tasks are uniformly 404. A disallowed cross-actor audit filter is 403, a claim race loss, stale generation, or changed action content is 409, incompatible current form value is 422, and a nonpartial snapshot failure is 503. Transport errors are 400, 405, 415, or 413 as applicable; an unclassified repository or gateway failure is 500. `forbidden`, `formValueIncompatible`, and `workSnapshotUnavailable` have route-owned canonical messages, while the existing codes retain their current canonical messages. Every error uses `WorkApiErrorResponse` and exposes no private evidence.

## Completion lifecycle

Product 2 durably reserves the exact completion action before any engine call. The lifecycle is closed:

```text
reserved      -> submitting -> committed
                            +-> rejected
                            +-> indeterminate
indeterminate -> submitting
```

Only `reserved` may initiate the first engine call. Reconciliation may move `indeterminate` back to `submitting` only for the byte-equivalent retained action. A possibly transmitted action never becomes a different dispatchable action. Exact retries use the same content-bound engine command, so response loss or platform restart cannot create a second semantic completion.

The retained-action lookup and actor/content binding run before current-task authorization only when `actionId` already exists. That rule applies equally to retained `committed`, `rejected`, `indeterminate`, and `processClosed` results. It lets an exact response-loss retry observe the original result after the engine task and platform claim have disappeared, while a new action still requires a fresh visible task and live claim.

The existing engine result maps exactly:

| Engine result | Platform action | Claim and registration effect |
|---|---|---|
| `semantic/committed` with matching command identity | `committed` | increment the claim generation, clear the claim, retain the terminal action result, and await the next fresh task observation |
| `semantic/rolledBack`, `semantic/rejected`, `semantic/semanticFailure`, or `semantic/unsupported` | `rejected` preserving the exact semantic outcome | retain the current claim, retain the terminal action result, clear its active-action slot, and permit a new action after refresh |
| `processClosed` with an exact matching retained receipt | `rejected` preserving `processClosed` | close the registration, increment the generation, clear the claim, and retain the terminal action result |
| `processUnknown`, retention-indistinguishable absence, or infrastructure loss after possible transmission | `indeterminate` | retain the claim and active-action slot; permit only the same action to reconcile |

The `processClosed` receipt is checked against the exact hosting Process before classification and remains engine evidence rather than a new Work HTTP field. Its public engine discriminator is preserved as `processClosed`; success is never inferred from a closed Process.

The public completion result is a closed union. `committed` alone reports success. `rejected` reports the engine's public command outcome without inventing a reason. `indeterminate` returns HTTP 202 and exposes no success claim. Changed-content retry, stale claim, another actor, mismatched current task, or a value-type mismatch never calls the engine.

No database transaction spans the engine call. The reservation, result, claim update, and audit-outbox writes use explicit compare-and-set transitions. At most one nonterminal completion action may occupy a task occurrence and claim generation. Two distinct action IDs racing through independent connections produce exactly one reservation and at most one engine call; the loser receives conflict. Startup reconciliation revisits `submitting` and `indeterminate` actions through the same exact gateway request and never derives a result from Workflow history.

## Platform audit

Audit is an append-only Product 2 record of an authorized or retained action's actor, wall-clock instant, exact established task occurrence, action identity, action kind, and closed logical platform outcome. It is distinct from BPMN semantic history and Temporal Event History.

The first claim, release, idempotent retry, compare-and-set/content conflict, completion reservation, commitment, rejection, or entrance into indeterminate produces one exact typed logical outcome. A unique `(actionId, outcome)` key makes equivalent retries idempotent without collapsing different logical outcomes. Reconciliation from `indeterminate` through `submitting` and back to the same `indeterminate` outcome is an internal retry, not a second logical audit outcome; a later `committed` or `rejected` result remains a distinct event. Claim and release use their caller-supplied `actionId`; completion uses its content-bound command identity. Audit exposes no Workflow ID, Run ID, Task Queue, Schedule identity, command transport payload, Temporal status, Event History field, private locator, direct-start intent protocol/digest, Memo field, or describe result.

Work owns a durable audit outbox in the Work SQLite database. Every audited claim, release, or completion transition commits its exact event snapshot and globally unique `eventId` in the same `BEGIN IMMEDIATE` transaction as the Work state/action compare-and-set. The audit repository idempotently inserts that event by `eventId`, rejects changed content under the same ID as integrity failure, and the Work repository then retains delivery acknowledgement. A crash after the Work commit leaves a pending item; a crash after the audit insert but before acknowledgement repeats an equivalent insert and then acknowledges. Startup, exact mutation retry, and every Work or audit HTTP handler reconcile pending items before exposing current Work or audit state. If delivery remains unavailable, the handler returns the existing 500 `internalFailure` response and exposes neither a successful mutation result nor a later Work snapshot. Completion reservation is delivered and acknowledged before its first engine call; terminal or first-indeterminate outcomes are delivered and acknowledged before their public result.

Audit paging uses an opaque insertion cursor and exact filters for actor ID, task Process identity, hosting Process identity, and action kind. It adds no claim that its wall-clock order is semantic execution order.

## Persistence and concurrency

Product 2 persists only confirmed Process registrations with their private locators and positive active, closed, or indeterminate observation classification, plus claims, completion actions, durable audit-outbox items, delivery acknowledgements, and audit. `closed` requires a matching engine receipt. It may cache the latest task snapshot for one request, but a cached task row is never semantic authority and is never returned as current without a fresh successful engine observation.

Independent database connections must serialize two-actor claims on the complete task occurrence. Exactly one claimant wins. Equivalent same-actor retries converge. Release and reclaim advance the durable generation, so an old release cannot affect a later claim. A single active-action slot serializes distinct completion action IDs before the host boundary; only the winning reservation may call the engine. Product 2 records the returned committed or rejected outcome without rewriting it. Work-state and outbox rows are inspected independently from audit rows in crash evidence so neither store acts as the other's oracle.

The pre-release database schema is exact and fail-closed. Corrupt identities, locators, claim generations, action content, state transitions, or audit values block the affected operation. Rebuilding semantic task state from Temporal Visibility or Event History is prohibited.

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

1. direct, Timer Schedule, and Message Start producers durably publish exact public identity plus the correct private locator once, with direct-start reservation before host dispatch, describe-only recovery after possible transmission, independent Operate/Work delivery markers, failure after host acceptance and after either subscriber, restart convergence, direct-start success suppression until both acknowledgements, and a configured-Schedule-base mutation failing;
2. one live system snapshot discovers tasks from all three producers without Event History, including metadata-free Timer/Message controls and one E2 metadata-bearing direct task, then actor policy exposes only its authorized projection;
3. Worker and platform restart preserve discovery, claims, actions, audit outbox/delivery acknowledgements, and recovery from indeterminate observation or completion;
4. independent connections prove same-actor idempotency, exactly one winner in a two-actor claim race, claim-release-reclaim ABA refusal, and at most one host call for two distinct completion actions;
5. candidate mismatch, nonclaimant release/completion, stale generation, cross-host task identity, changed action content, extra/missing field, and Boolean stringification fail before or at their owning boundary, while every uniform-404 policy failure leaves both Work audit stores unchanged;
6. response loss after engine acceptance converges to one committed completion and one logical audit outcome even after claim removal, while `processClosed` preserves its exact retained rejection, retention-indistinguishable absence remains indeterminate and retryable, a foreign actor sees 404, and changed action content conflicts;
7. active, zero-task active, closed, unknown, unavailable, and configured-ceiling observations prove the all-or-error snapshot state machine;
8. absent, null, Boolean false, string `"false"`, Boolean-under-string, and string-under-Boolean form values prove exact preservation and fail-closed rendering without coercion;
9. audit equivalent retries and repeated same-outcome reconciliation deduplicate, distinct logical outcomes remain distinct, Work commit/audit append/audit acknowledgement crash points reconcile, exact filters page with an opaque cursor, and engine results are asserted independently before the Work result and audit projections;
10. recursive HTTP, browser, and adopter-log scans exclude Workflow, Run, Task Queue, Schedule, history, locator, and transport command fields;
11. Chromium acceptance uses the production server, Worker, public HTTP client, React Aria controls, TanStack Table/Query, and CSS Modules to find, claim, complete, and remove one exact Boolean task.

The rule-to-evidence matrix is:

| Rule | Separating executable failure |
|---|---|
| Exact three-producer addressing | Replace the Schedule execution locator with its configured base, omit any producer publication, or fail after direct host acceptance, confirmation, or either durable subscriber; the Definitions lifecycle must use describe-only direct recovery, retain missing delivery, and reconcile Operate and Work before public success |
| Exact system set before actor policy | Compare an independently captured gateway task multiset before filtering; eligible, ineligible, and metadata-free controls must all be present even when two are hidden publicly |
| Observation classification | Unknown or unavailable registration silently omitted; zero-task Query classified closed; indeterminate cannot recover to active or closed |
| Monotonic claim generation | Claim, release, reclaim, then replay the first generation from an independent connection; the later claim must remain unchanged |
| Claim and completion serialization | Two actors claim or two action IDs complete through independent connections; only one claim or active action may cross its owning CAS |
| Exact form domain | Collapse absent/null/false/`"false"`, coerce either cross-type value, or submit a value different from the published type |
| Completion reconciliation | Independently capture every Product 1 result, then require the exact Work state, claim effect, actor decision, HTTP result, audit-outbox item, and audit event across retained-action retry after task removal; no shared projector serves as the oracle |
| Audit identity, delivery, and paging | Retry the same logical outcome, cycle through the same indeterminate outcome, change content under one action ID, stop after Work commit and after audit append before acknowledgement, inspect both stores independently, filter every key, and insert beyond a cursor without duplication or reordering |
| Private-fact exclusion | Plant locator, Workflow, Run, Task Queue, Schedule, and history-shaped fields in every public decoder, browser model, and configured log sink |
| Restart durability | Stop after reservation and after possible engine acceptance; reopen the same SQLite files and reconcile without a different command or duplicate audit outcome |

## Required, optional, and excluded functionality

Required:

- private exact observation locators for every confirmed Product 2 start producer;
- current engine observation, exact task detail, and exact completion through the engine gateway;
- actor resolution, candidate-group claim authorization, durable claim concurrency, retry-safe completion, and platform audit;
- one exact string or Boolean generated field with absent/null preservation;
- strict public HTTP contracts, global inbox and detail UI, restart/live evidence, and browser acceptance.

Optional only if it changes no public or semantic claim:

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

This proposal changes the Product 1 client and engine API narrowly enough to prepare, start, describe, observe, and command an exact Process by opaque intent and locator, then adds Product 2 gateway, HTTP, persistence, policy, audit, and UI contracts. The direct-start Memo changes host request metadata only; it changes no Workflow code, Workflow argument, or engine public fact. It also requires a behavior-preserving extraction of the existing tuple-preserving `DeepReadonly<T>` into one neutral type-only workspace package because both product contracts must use the single project-owned utility without reversing the product dependency. It does not change BPMN source admission, checked graph, Semantic Process IL, semantic runtime state, engine public `OpenUserTask`, completion stimulus, Workflow definition, Lean, CIB evidence, or registered semantic artifacts.

Product 1 adds a cohesive `process-work` engine API and Temporal client subpath rather than growing the existing Process client. Their closed operations accept only `EngineProcessWorkLocator` and return existing `OpenUserTask`, `UserTaskDetail`, and `ProcessCommandResult` facts. The Product 2 engine gateway wraps that contract without importing Temporal. The locator type is opaque outside Product 1 and the gateway.

The existing public Process-instance search response remains byte-identical. The private confirmed-start output port is replaced by a durable Definitions-owned publication lifecycle. Direct start persists reservation plus private intent before Product 1 dispatch and confirms through start or describe; Schedule and Message confirm from their existing durable terminal states. Direct and Message paths receive Product 1's canonical locator; Schedule receives a locator minted from its stored service-returned `executionWorkflowId`. Definitions knows only two structural subscriber ports, never Operate or Work implementations. It tracks each idempotent subscriber acknowledgement independently and reconciles direct-start indeterminate state plus both deliveries after restart. Operate records only `instance`; Work records both. No definitions module imports Operate or Work.

The platform is pre-release. The new Definitions publication tables participate in the exact shared Definitions schema epoch; Work and audit databases use their own exact schema epochs. None has a compatibility reader. Any retained production-data compatibility promise would require a separate version, migration, rollback, and mixed-version contract before release.

## Atomic owner and guard plan

New cohesive owners have the full 600-line source budget and must be registered in their owning README and package indexes:

- `packages/contract-types/src/index.ts` for the byte-identical, type-only `DeepReadonly<T>` extracted from [`packages/semantic-core/src/deep-readonly.ts`](../packages/semantic-core/src/deep-readonly.ts), imported by both products, and registered through the root [`README.md`](../README.md) repository tree; [`ARCHITECTURE.md`](ARCHITECTURE.md#repository-map), [`PROJECT-DESIGN.md`](PROJECT-DESIGN.md#one-repository-for-products-1-and-2), and [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) must classify this exact package as neutral rather than Product 1;
- `packages/engine-api/src/process-work.ts` for the opaque Product 1 locator and closed observe/detail/complete contract, registered by [`packages/engine-api/README.md`](../packages/engine-api/README.md);
- `packages/temporal-adapter/client/src/process-work-client.ts` and a `./process-work` export for separately addressed Queries and completion, registered by [`packages/temporal-adapter/README.md`](../packages/temporal-adapter/README.md);
- `platform/foundation/engine-gateway/src/process-work-gateway.ts` for the Product 2 structural gateway, registered by [`platform/foundation/engine-gateway/README.md`](../platform/foundation/engine-gateway/README.md);
- `platform/foundation/identity-policy/src/actor-context.ts`, `fake-actor-resolver.ts`, and `task-authorization-policy.ts` for `ActorContext`, configured fake resolution, and exact visibility/claim policy, registered by [`platform/foundation/README.md`](../platform/foundation/README.md);
- `platform/foundation/audit/src/audit-contracts.ts`, `sqlite-audit-repository.ts`, and `audit-search-service.ts` for typed append-only action records, idempotent event publication, opaque paging, and SQLite lifecycle, registered by [`platform/foundation/README.md`](../platform/foundation/README.md);
- `platform/modules/work/src/work-contracts.ts`, `work-service.ts`, `sqlite-work-repository.ts`, `work-audit-outbox-service.ts`, and `work-http-routes.ts` for private registration, observation aggregation, claims, completion reconciliation, same-transaction audit outbox, delivery acknowledgement, and HTTP routes, registered by [`platform/modules/README.md`](../platform/modules/README.md);
- `platform/modules/definitions/src/confirmed-process-instance-contracts.ts`, `confirmed-process-instance-publication-service.ts`, and `sqlite-confirmed-process-instance-repository.ts` for the reserved/starting/indeterminate/confirmed lifecycle, private intent/locator snapshot, independent delivery markers, and restart reconciliation, with focused `confirmed-process-instance-publication-service.test.ts` and `sqlite-confirmed-process-instance-repository.test.ts`, all registered by [`platform/modules/definitions/README.md`](../platform/modules/definitions/README.md);
- `platform/contracts/src/work-tasks.ts`, `work-task-decoders.ts`, `work-task-routes.ts`, and focused type/runtime tests, registered by [`platform/contracts/README.md`](../platform/contracts/README.md);
- `platform/ui-kit/` for React Aria primitives, the TanStack table wrapper, CSS Modules, and focused accessibility tests, registered by [`platform/ui-kit/README.md`](../platform/ui-kit/README.md);
- cohesive Work API, inbox, task-detail, and `.module.css` owners under [`platform/apps/web/README.md`](../platform/apps/web/README.md);
- `showcase/m3-human-work/` for live Temporal, restart/concurrency/private-field, and Playwright evidence, registered by [`showcase/README.md`](../showcase/README.md).

Existing owners that must change are part of the same atomic plan: [`packages/semantic-core/src/deep-readonly.ts`](../packages/semantic-core/src/deep-readonly.ts), [`packages/semantic-core/src/index.ts`](../packages/semantic-core/src/index.ts), and [`packages/semantic-core/package.json`](../packages/semantic-core/package.json) move/re-export the neutral type and declare its dependency; [`platform/contracts/src/definitions.ts`](../platform/contracts/src/definitions.ts) and [`platform/contracts/src/definition-decoders.ts`](../platform/contracts/src/definition-decoders.ts) own the generic route-code-set error envelope/decoder; the four existing HTTP clients [`definitions-api.ts`](../platform/apps/web/src/definitions-api.ts), [`definition-schedule-api.ts`](../platform/apps/web/src/definition-schedule-api.ts), [`message-start-publication-api.ts`](../platform/apps/web/src/message-start-publication-api.ts), and [`process-instance-search-api.ts`](../platform/apps/web/src/process-instance-search-api.ts) pass their unchanged exact subsets; [`ARCHITECTURE.md`](ARCHITECTURE.md#temporal-adapter-subsystem) and [`packages/temporal-adapter/README.md`](../packages/temporal-adapter/README.md) add only the handle-free `./process-work` client subpath and direct-start describe result; [`packages/engine-api/src/definition-start.ts`](../packages/engine-api/src/definition-start.ts) and [`packages/temporal-adapter/client/src/definition-start-client.ts`](../packages/temporal-adapter/client/src/definition-start-client.ts) add retained-intent comparison and handle-free describe; and [`platform/modules/definitions/src/process-instance-recording.ts`](../platform/modules/definitions/src/process-instance-recording.ts) is replaced by cohesive confirmed-start reservation, SQLite lifecycle, delivery, and reconciliation owners rather than becoming a multi-responsibility file.

Measured existing owners and constraints from `node scripts/what-binds.ts` are:

| Existing owner | Current occupancy | Remaining headroom | Bindings | Constraint |
|---|---:|---:|---|---|
| [`packages/temporal-adapter/client/src/process-client.ts`](../packages/temporal-adapter/client/src/process-client.ts) | 465/600 | 135 | 20 guards, 1 registry | Extract `process-work-client.ts`; do not add the new family here |
| [`packages/engine-api/src/index.ts`](../packages/engine-api/src/index.ts) | 112/600 | 488 | 20 guards, 1 registry | Export only the new cohesive owner |
| [`platform/foundation/engine-gateway/src/index.ts`](../platform/foundation/engine-gateway/src/index.ts) | 207/600 | 393 | 52 guards, 3 registries | Export and compose; keep locator logic in the new owner |
| [`platform/modules/definitions/src/process-instance-recording.ts`](../platform/modules/definitions/src/process-instance-recording.ts) | 22/600 | 578 | 47 guards, 3 registries | Replace with cohesive durable publication lifecycle owners |
| [`platform/modules/definitions/src/database-schema-epoch.ts`](../platform/modules/definitions/src/database-schema-epoch.ts) | 48/600 | 552 | 47 guards, 3 registries | Advance the exact shared epoch before any new publication table access |
| [`platform/modules/definitions/src/index.ts`](../platform/modules/definitions/src/index.ts) | 100/600 | 500 | 52 guards, 3 registries | Export only the new cohesive publication owners |
| [`platform/modules/definitions/src/definition-start-service.ts`](../platform/modules/definitions/src/definition-start-service.ts) | 165/600 | 435 | 47 guards, 3 registries | One narrow durable publication call only |
| [`platform/modules/definitions/src/definition-schedule-service.ts`](../platform/modules/definitions/src/definition-schedule-service.ts) | 528/600 | 72 | 47 guards, 3 registries | Delegate locator minting/publication; extract before any additional responsibility |
| [`platform/modules/definitions/src/message-start-publication-service.ts`](../platform/modules/definitions/src/message-start-publication-service.ts) | 511/600 | 89 | 47 guards, 3 registries | Delegate locator minting/publication; extract before any additional responsibility |
| [`platform/apps/server/src/composition.ts`](../platform/apps/server/src/composition.ts) | 163/600 | 437 | 47 guards, 3 registries | Inject subscribers, configuration, route order, and reverse close only |
| [`platform/apps/server/src/config.ts`](../platform/apps/server/src/config.ts) | 159/600 | 441 | 51 guards, 3 registries | Own positive Process/task ceilings and strict fake actor/group configuration |
| [`platform/apps/web/src/app.tsx`](../platform/apps/web/src/app.tsx) | 241/600 | 359 | 47 guards, 3 registries | Compose the new panel; keep behavior in cohesive feature files |
| [`platform/contracts/src/index.ts`](../platform/contracts/src/index.ts) | 23/600 | 577 | 52 guards, 2 registries | Export only the new contract owners |
| [`platform/contracts/src/definitions.ts`](../platform/contracts/src/definitions.ts) | 108/600 | 492 | 47 guards, 2 registries | Own the generic error code/envelope shape without broadening routes |
| [`platform/contracts/src/definition-decoders.ts`](../platform/contracts/src/definition-decoders.ts) | 174/600 | 426 | 47 guards, 2 registries | Parameterize the single strict decoder by exact route code set |
| [`packages/semantic-core/src/deep-readonly.ts`](../packages/semantic-core/src/deep-readonly.ts) | 13/600 | 587 | 20 guards, 1 registry | Move the byte-identical utility and re-export it from the neutral package |
| [`packages/semantic-core/src/index.ts`](../packages/semantic-core/src/index.ts) | 42/600 | 558 | 20 guards, 1 registry | Re-export the neutral utility without changing semantic behavior |
| [`packages/engine-api/src/definition-start.ts`](../packages/engine-api/src/definition-start.ts) | 209/600 | 391 | 20 guards, 1 registry | Add direct-start prepare/start/describe around one retained intent |
| [`packages/temporal-adapter/client/src/definition-start-client.ts`](../packages/temporal-adapter/client/src/definition-start-client.ts) | 136/600 | 464 | 20 guards, 1 registry | Retain and compare Memo/type/Task Queue without exposing a handle |
| [`platform/apps/web/src/definitions-api.ts`](../platform/apps/web/src/definitions-api.ts) | 236/600 | 364 | 47 guards, 3 registries | Pass the unchanged exact legacy error-code set |
| [`platform/apps/web/src/definition-schedule-api.ts`](../platform/apps/web/src/definition-schedule-api.ts) | 229/600 | 371 | 47 guards, 3 registries | Pass the unchanged exact Schedule error-code set |
| [`platform/apps/web/src/message-start-publication-api.ts`](../platform/apps/web/src/message-start-publication-api.ts) | 226/600 | 374 | 47 guards, 3 registries | Pass the unchanged exact publication error-code set |
| [`platform/apps/web/src/process-instance-search-api.ts`](../platform/apps/web/src/process-instance-search-api.ts) | 166/600 | 434 | 47 guards, 3 registries | Pass the unchanged exact search error-code set |
| [`docs/BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md`](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) | not a source owner | not applicable | 31 guards, 1 registry | Preserve the M2 evidence boundary while naming the reviewed M3 supersession |

Before each implementation lane, rerun [`scripts/what-binds.ts`](../scripts/what-binds.ts) on every added or grown path. Package manifests, [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), [`pnpm-lock.yaml`](../pnpm-lock.yaml), harness types, boundary guards, licences, source hygiene, READMEs, root scripts, and the M3 showcase registry are shared root-integration owners. Apart from the type-only `DeepReadonly<T>` import extraction and private direct-start request Memo/describe support, semantic-core behavior and artifacts remain byte-identical; BPMN source, Workflow code/arguments, Lean, CIB, E2 artifacts, and differential owners remain byte-unchanged.

Exact executable guard and oracle routing is mandatory:

| Planned boundary | Existing guard or registry owner | Required focused oracle |
|---|---|---|
| Neutral type package and package graph | [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts), [`scripts/temporal-package-boundary.test.ts`](../scripts/temporal-package-boundary.test.ts), [`scripts/pnpm-project-config.test.ts`](../scripts/pnpm-project-config.test.ts), [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts) | tuple, union, callable, and nested mutation type test in the new package; semantic-core and platform contract builds consume the same exported symbol |
| Product 1 process-work client/API | [`packages/temporal-adapter/README.md`](../packages/temporal-adapter/README.md), [`packages/engine-api/README.md`](../packages/engine-api/README.md), [`scripts/temporal-package-boundary.test.ts`](../scripts/temporal-package-boundary.test.ts) | new engine API and client tests covering canonical direct/Message locators, service-returned Schedule locator, direct-start retained intent and describe-only matching/missing/divergent/unavailable results, current Query/detail, every `ProcessCommandResult`, and configured-base mutation |
| Product 2 gateway and durable producer publication | [`platform/foundation/engine-gateway/README.md`](../platform/foundation/engine-gateway/README.md), [`platform/modules/definitions/README.md`](../platform/modules/definitions/README.md), [`platform/modules/definitions/test/database-schema-epoch.test.ts`](../platform/modules/definitions/test/database-schema-epoch.test.ts), [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) | new gateway/lifecycle/reconciliation tests `confirmed-process-instance-publication-service.test.ts` and `sqlite-confirmed-process-instance-repository.test.ts`, plus [`definition-start-service.test.ts`](../platform/modules/definitions/test/definition-start-service.test.ts), [`definition-schedule-service.test.ts`](../platform/modules/definitions/test/definition-schedule-service.test.ts), and [`message-start-publication-service.test.ts`](../platform/modules/definitions/test/message-start-publication-service.test.ts), with direct response loss and failures after each subscriber |
| Public Work transport | [`platform/contracts/README.md`](../platform/contracts/README.md), [`platform/contracts/src/definitions.ts`](../platform/contracts/src/definitions.ts), [`platform/contracts/src/definition-decoders.ts`](../platform/contracts/src/definition-decoders.ts), [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) | new runtime and type tests for every request/result/error/status, strict extras, exact legacy and Work code sets, route encoding, cursor, private-field rejection, incompatible form values, canonical UTC timestamps, and exclusive ascending paging |
| Identity, claims, completion, and audit | [`platform/foundation/README.md`](../platform/foundation/README.md), [`platform/modules/README.md`](../platform/modules/README.md) | new `task-authorization-policy.test.ts`, `sqlite-work-repository.test.ts`, `work-audit-outbox-service.test.ts`, and `sqlite-audit-repository.test.ts` independently cover policy projection, audit-silent uniform 404, race, monotonic generation, release response loss, action collision, all engine result mappings, same-transaction outbox, audit insert/ack crash recovery, self-only filters, cursor paging, restart, and corruption |
| Server and web composition | [`platform/apps/server/README.md`](../platform/apps/server/README.md), [`platform/apps/server/test/config.test.ts`](../platform/apps/server/test/config.test.ts), [`platform/apps/web/README.md`](../platform/apps/web/README.md), [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) | strict positive ceilings and fake identity/group JSON tests, server route/composition tests, and web build/type/runtime tests for the public HTTP-only client, actor-visible table, form mismatch, and private-field exclusion |
| Live and browser closure | [`showcase/README.md`](../showcase/README.md), [`scripts/pre-release-architecture.test.ts`](../scripts/pre-release-architecture.test.ts), [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts) | `showcase/m3-human-work` live Temporal and Chromium gates across all three producers, restart, Worker replacement, races, response loss, audit, replay, and recursive scans excluding locator, direct-start intent/Memo/describe, Workflow, Run, Task Queue, Schedule, and history fields from public/log/browser surfaces |

The implementation is atomically specified but lands through three guarded checkpoints:

1. neutral `DeepReadonly<T>` extraction, Product 1 locator plus observe/detail/complete, the widened confirmed-start publication, Product 2 gateway, and strict public contract types;
2. identity policy, Work registration and observation, claims, completion reconciliation, audit, SQLite, and HTTP composition;
3. React Aria/TanStack/CSS-Modules UI plus live Temporal and Chromium evidence.

Checkpoint 1 requires the package-boundary and semantic checkpoint review because it changes engine-to-platform addressing and public observation plumbing. Later checkpoints may proceed only against its approved immutable contract. The root integrator alone updates shared manifests, registries, status documents, commits, and the complete applicable gate.

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
