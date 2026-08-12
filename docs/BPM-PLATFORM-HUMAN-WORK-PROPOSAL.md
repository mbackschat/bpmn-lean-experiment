# BPM platform human-work proposal

## Status

**Redesigned draft for a new independent cold proposal review.** This proposal selects the smallest complete M3 human-work contract: a current cross-instance inbox, platform-owned claim and authorization policy, one typed form field, retry-safe completion, and distinct platform audit. The original immutable target received `APPROVE WITH REQUIRED EDITS`; correction target `55d87e8` was ineligible for warm approval because it materially changed completion serialization, default policy visibility, and shared contract ownership. This redesigned target retains those choices, closes the remaining transport and owner-routing gaps, and requires a new context-cold review before owner approval. Implementation remains paused until the [User Task assignment and form metadata proposal](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-PROPOSAL.md) receives closure approval and this proposal receives owner approval.

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

An inbox refresh first builds one complete system-visible aggregation equal to the fresh engine-published task sets for every nonclosed confirmed registration. Actor policy is a separate projection over that complete aggregation. The equality oracle runs before policy filtering, so an authorization rule cannot hide a missing producer or task from the engine-to-platform agreement check.

A matching retained engine completion receipt moves a private Process registration to positively closed, after which it needs no task Query. The platform never treats host absence as completion and never silently drops an active or indeterminate registration whose current engine observation is unavailable. A configured Process and task ceiling bounds one request; an unresolved nonclosed registration or an exceeded ceiling returns a closed `workSnapshotUnavailable` result rather than a partial system or actor snapshot. M3 therefore has no unstable live-task pagination.

## Private engine address

Semantic Process-instance identity and Temporal Workflow identity remain distinct. Direct and Message starts use the canonical Process Workflow address, while a Timer Schedule may return an opaque execution Workflow address different from its configured base. Querying every Process by semantic identity would therefore miss or misaddress scheduled work.

Product 1 owns an opaque `EngineProcessWorkLocator` and supplies one with each confirmed start. Direct and Message starts mint it from Product 1's canonical Process Workflow address. The Schedule path mints it only from the service-returned `executionWorkflowId`, never the configured Workflow-ID base. Only the engine gateway interprets the locator through three narrowed operations: `observeOpenWork`, `readWorkDetail`, and `completeWork`.

The private locator is stored with the confirmed Product 2 registration and is immutable for that semantic Process identity. Re-recording the same public identity and locator is idempotent; changing either is an integrity failure. The locator never appears in public contracts, HTTP, browser state, audit, task identity, Process-instance search, or any logger input. Internal diagnostics use the registration identity and classified gateway outcome instead.

The gateway returns only engine public facts and closed host outcomes. If a task Query cannot run, it may resolve a matching retained completed-Process receipt and return `closed`; unresolved absence returns `unknown`, never `closed`. Product 2 does not import Temporal Event History, derive tasks from state differences, construct task occurrences, infer Workflow completion from absence, or reconstruct a Schedule address from its configured base.

The private registration classification is a closed state machine:

| Stored state | Gateway observation | Next state | Snapshot effect |
|---|---|---|---|
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

The server resolves one `ActorContext` containing a nonempty actor ID and exact group IDs. Requests never choose or override the actor in a body, query, or task identifier. M3 provides a pluggable identity-policy boundary and a configured fake implementation; it selects no authentication provider and makes no authentication-strength claim.

The system-visible aggregation contains every task in the fresh engine observations. The actor policy then projects it to the public inbox. The selected metadata candidate group governs claim eligibility. The default fake policy shows eligible unclaimed tasks and the current actor's claims, hides ineligible tasks and another actor's claims, and hides metadata-free tasks. Focused evidence must separately prove the system aggregation still contains eligible, ineligible, and metadata-free tasks before filtering. A metadata-free task is never claimable or form-completable through this contract. Metadata does not become an engine completion precondition.

Every task read and mutation applies the same actor projection immediately before its repository operation. A task already claimed by another actor, an ineligible task, and a metadata-free task are all policy-hidden and return 404 without revealing which condition applied. A true two-actor race may pass the policy while both observe the task as unclaimed; the claim compare-and-set loser then receives 409. Once the winning claim is visible in a later fresh projection, the other actor receives 404 instead.

Claiming is a platform compare-and-set over the complete engine task occurrence. Every occurrence owns a monotonic `claimGeneration` that increases on claim and release, is never reset or reused while unclaimed, and survives restart. The same actor may retry the same claim `actionId` idempotently only against the currently live generation. A changed action ID against a current same-actor claim or a concurrent claim compare-and-set loss receives conflict. Only the claimant may release or complete. A release carries its own action ID and the observed generation and refuses stale or foreign claims without changing state. A claim, release, reclaim sequence therefore cannot make a stale generation valid again.

Every claim or release action ID is durably bound to exact actor ID, operation kind, task occurrence, and input generation before mutation. After a successful release removes the claim, an exact retry returns the retained `WorkReleaseResult` without another generation change or audit event. The same action ID with changed actor, operation, task, or generation is conflict. An absent claim without that exact retained release result is 404. This retained action rule is the only absent-claim release success.

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
  | DeepReadonly<{ kind: "claim"; actionId: string; outcome: "claimed" | "idempotent" | "forbidden" | "conflict" }>
  | DeepReadonly<{ kind: "release"; actionId: string; outcome: "released" | "idempotent" | "forbidden" | "conflict" }>
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

type WorkApiErrorResponse = DeepReadonly<{
  error: { code: WorkApiErrorCode; message: string };
}>;
```

Audit uses an opaque `v1.` plus nonempty unpadded base64url cursor, default limit 50, and maximum limit 100. It sorts by its private monotonically increasing insertion ordinal but exposes only the opaque cursor. Filters are exact, query keys are unique, and an unknown or malformed cursor is invalid.

The default fake policy permits an actor to read only audit events whose `actorId` equals its resolved actor ID. Omitting the filter implicitly selects that ID; explicitly selecting the same ID is equivalent; selecting another actor is 403 before repository search. Hosting-Process, task-Process, and action-kind filters narrow only that self-owned set. M3 has no administrator, cross-actor audit role, or audit-export authorization.

The three new error codes extend the single project-owned `PublicApiErrorCode`, `PublicApiErrorResponse`, and strict decoder rather than introducing a parallel error envelope. Existing routes keep their byte-identical error bodies and accepted code subsets.

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

The existing engine result maps exactly:

| Engine result | Platform action | Claim and registration effect |
|---|---|---|
| `semantic/committed` with matching command identity | `committed` | increment the claim generation, clear the claim, and await the next fresh task observation |
| `semantic/rolledBack`, `semantic/rejected`, `semantic/semanticFailure`, or `semantic/unsupported` | `rejected` preserving the exact semantic outcome | retain the current claim, clear its active-action slot, and permit a new action after refresh |
| `processClosed` with an exact matching retained receipt | `rejected` preserving `processClosed` | close the registration and increment the generation while clearing the claim |
| `processUnknown`, retention-indistinguishable absence, or infrastructure loss after possible transmission | `indeterminate` | retain the claim and active-action slot; permit only the same action to reconcile |

The `processClosed` receipt is checked against the exact hosting Process before classification and remains engine evidence rather than a new Work HTTP field. Its public engine discriminator is preserved as `processClosed`; success is never inferred from a closed Process.

The public completion result is a closed union. `committed` alone reports success. `rejected` reports the engine's public command outcome without inventing a reason. `indeterminate` returns HTTP 202 and exposes no success claim. Changed-content retry, stale claim, another actor, mismatched current task, or a value-type mismatch never calls the engine.

No database transaction spans the engine call. The reservation, result, claim update, and audit writes use explicit compare-and-set transitions. At most one nonterminal completion action may occupy a task occurrence and claim generation. Two distinct action IDs racing through independent connections produce exactly one reservation and at most one engine call; the loser receives conflict. Startup reconciliation revisits `submitting` and `indeterminate` actions through the same exact gateway request and never derives a result from Workflow history.

## Platform audit

Audit is an append-only Product 2 record of actor, policy decision, wall-clock instant, exact task occurrence, action identity, action kind, and closed platform outcome. It is distinct from BPMN semantic history and Temporal Event History.

Claim and release decisions plus completion reservation, commitment, rejection, and indeterminate resolution each produce an exact typed event. A unique `(actionId, outcome)` key makes equivalent retries idempotent without collapsing distinct transitions. Claim and release use their caller-supplied `actionId`; completion uses its content-bound command identity. Audit exposes no Workflow ID, Run ID, Task Queue, Schedule identity, command transport payload, Temporal status, Event History field, or private locator.

Audit paging uses an opaque insertion cursor and exact filters for actor ID, task Process identity, hosting Process identity, and action kind. It adds no claim that its wall-clock order is semantic execution order.

## Persistence and concurrency

Product 2 persists only confirmed Process registrations with their private locators and positive active, closed, or indeterminate observation classification, plus claims, completion actions, and audit. `closed` requires a matching engine receipt. It may cache the latest task snapshot for one request, but a cached task row is never semantic authority and is never returned as current without a fresh successful engine observation.

Independent database connections must serialize two-actor claims on the complete task occurrence. Exactly one claimant wins. Equivalent same-actor retries converge. Release and reclaim advance the durable generation, so an old release cannot affect a later claim. A single active-action slot serializes distinct completion action IDs before the host boundary; only the winning reservation may call the engine. Product 2 records the returned committed or rejected outcome without rewriting it.

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

1. direct, Timer Schedule, and Message Start producers register exact public identity plus the correct private locator, with a configured-Schedule-base mutation failing;
2. one live system snapshot discovers tasks from all three producers without Event History, including metadata-free Timer/Message controls and one E2 metadata-bearing direct task, then actor policy exposes only its authorized projection;
3. Worker and platform restart preserve discovery, claims, actions, audit, and recovery from indeterminate observation or completion;
4. independent connections prove same-actor idempotency, exactly one winner in a two-actor claim race, claim-release-reclaim ABA refusal, and at most one host call for two distinct completion actions;
5. candidate mismatch, nonclaimant release/completion, stale generation, cross-host task identity, changed action content, extra/missing field, and Boolean stringification fail before or at their owning boundary;
6. response loss after engine acceptance converges to one committed completion and one logical audit outcome, while retention-indistinguishable absence remains indeterminate and retryable;
7. active, zero-task active, closed, unknown, unavailable, and configured-ceiling observations prove the all-or-error snapshot state machine;
8. absent, null, Boolean false, string `"false"`, Boolean-under-string, and string-under-Boolean form values prove exact preservation and fail-closed rendering without coercion;
9. audit equivalent retries deduplicate, distinct lifecycle transitions remain distinct, exact filters page with an opaque cursor, and engine results are asserted independently before the Work result and audit projections;
10. recursive HTTP, browser, and adopter-log scans exclude Workflow, Run, Task Queue, Schedule, history, locator, and transport command fields;
11. Chromium acceptance uses the production server, Worker, public HTTP client, React Aria controls, TanStack Table/Query, and CSS Modules to find, claim, complete, and remove one exact Boolean task.

The rule-to-evidence matrix is:

| Rule | Separating executable failure |
|---|---|
| Exact three-producer addressing | Replace the Schedule execution locator with its configured base, or omit any producer publication; system aggregation loses or misaddresses that task |
| Exact system set before actor policy | Compare an independently captured gateway task multiset before filtering; eligible, ineligible, and metadata-free controls must all be present even when two are hidden publicly |
| Observation classification | Unknown or unavailable registration silently omitted; zero-task Query classified closed; indeterminate cannot recover to active or closed |
| Monotonic claim generation | Claim, release, reclaim, then replay the first generation from an independent connection; the later claim must remain unchanged |
| Claim and completion serialization | Two actors claim or two action IDs complete through independent connections; only one claim or active action may cross its owning CAS |
| Exact form domain | Collapse absent/null/false/`"false"`, coerce either cross-type value, or submit a value different from the published type |
| Completion reconciliation | Independently capture every Product 1 result, then require the exact Work state, claim effect, and audit event; no shared projector serves as the oracle |
| Audit identity and paging | Retry the same transition, change content under one action ID, filter every key, and insert beyond a cursor without duplication or reordering |
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

This proposal changes the Product 1 client and engine API narrowly enough to address existing observations and commands by an opaque locator, then adds Product 2 gateway, HTTP, persistence, policy, audit, and UI contracts. It also requires a behavior-preserving extraction of the existing tuple-preserving `DeepReadonly<T>` into one neutral type-only workspace package because both product contracts must use the single project-owned utility without reversing the product dependency. It does not change BPMN source admission, checked graph, Semantic Process IL, semantic runtime state, engine public `OpenUserTask`, completion stimulus, Workflow definition, Lean, CIB evidence, or registered semantic artifacts.

Product 1 adds a cohesive `process-work` engine API and Temporal client subpath rather than growing the existing Process client. Their closed operations accept only `EngineProcessWorkLocator` and return existing `OpenUserTask`, `UserTaskDetail`, and `ProcessCommandResult` facts. The Product 2 engine gateway wraps that contract without importing Temporal. The locator type is opaque outside Product 1 and the gateway.

The existing public Process-instance search response remains byte-identical. The private confirmed-start output port is widened atomically to publish `{instance, locator}` to a server-owned fan-out adapter. Direct and Message paths receive Product 1's canonical locator; Schedule receives a locator minted from its stored service-returned `executionWorkflowId`. Operate records only `instance`; Work records both. No definitions module imports Operate or Work.

The platform is pre-release. Work and audit databases use exact schema epochs with no compatibility reader. Any retained production-data compatibility promise would require a separate version, migration, rollback, and mixed-version contract before release.

## Atomic owner and guard plan

New cohesive owners have the full 600-line source budget and must be registered in their owning README and package indexes:

- `packages/contract-types/src/index.ts` for the byte-identical, type-only `DeepReadonly<T>` extracted from [`packages/semantic-core/src/deep-readonly.ts`](../packages/semantic-core/src/deep-readonly.ts), imported by both products, and registered through the root [`README.md`](../README.md) repository tree; [`ARCHITECTURE.md`](ARCHITECTURE.md#repository-map), [`PROJECT-DESIGN.md`](PROJECT-DESIGN.md#one-repository-for-products-1-and-2), and [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) must classify this exact package as neutral rather than Product 1;
- `packages/engine-api/src/process-work.ts` for the opaque Product 1 locator and closed observe/detail/complete contract, registered by [`packages/engine-api/README.md`](../packages/engine-api/README.md);
- `packages/temporal-adapter/client/src/process-work-client.ts` and a `./process-work` export for separately addressed Queries and completion, registered by [`packages/temporal-adapter/README.md`](../packages/temporal-adapter/README.md);
- `platform/foundation/engine-gateway/src/process-work-gateway.ts` for the Product 2 structural gateway, registered by [`platform/foundation/engine-gateway/README.md`](../platform/foundation/engine-gateway/README.md);
- `platform/foundation/identity-policy/` for `ActorContext`, fake resolution, and exact visibility/claim policy, registered by [`platform/foundation/README.md`](../platform/foundation/README.md);
- `platform/foundation/audit/` for typed append-only action records, opaque paging, and SQLite lifecycle, registered by [`platform/foundation/README.md`](../platform/foundation/README.md);
- `platform/modules/work/` for private registration, observation aggregation, claims, completion reconciliation, repositories, and HTTP routes, registered by [`platform/modules/README.md`](../platform/modules/README.md);
- `platform/contracts/src/work-tasks.ts`, `work-task-decoders.ts`, `work-task-routes.ts`, and focused type/runtime tests, registered by [`platform/contracts/README.md`](../platform/contracts/README.md);
- `platform/ui-kit/` for React Aria primitives, the TanStack table wrapper, CSS Modules, and focused accessibility tests, registered by [`platform/ui-kit/README.md`](../platform/ui-kit/README.md);
- cohesive Work API, inbox, task-detail, and `.module.css` owners under [`platform/apps/web/README.md`](../platform/apps/web/README.md);
- `showcase/m3-human-work/` for live Temporal, restart/concurrency/private-field, and Playwright evidence, registered by [`showcase/README.md`](../showcase/README.md).

Measured existing owners and constraints from `node scripts/what-binds.ts` are:

| Existing owner | Headroom | Bindings | Constraint |
|---|---:|---:|---|
| [`packages/temporal-adapter/client/src/process-client.ts`](../packages/temporal-adapter/client/src/process-client.ts) | 465/600 | 20 guards, 1 registry | Extract `process-work-client.ts`; do not add the new family here |
| [`packages/engine-api/src/index.ts`](../packages/engine-api/src/index.ts) | 112/600 | 20 guards, 1 registry | Export only the new cohesive owner |
| [`platform/foundation/engine-gateway/src/index.ts`](../platform/foundation/engine-gateway/src/index.ts) | 207/600 | 52 guards, 3 registries | Export and compose; keep locator logic in the new owner |
| [`platform/modules/definitions/src/process-instance-recording.ts`](../platform/modules/definitions/src/process-instance-recording.ts) | 22/600 | 47 guards, 3 registries | Widen the private output port once |
| [`platform/modules/definitions/src/definition-start-service.ts`](../platform/modules/definitions/src/definition-start-service.ts) | 165/600 | 47 guards, 3 registries | One narrow publication call only |
| [`platform/modules/definitions/src/definition-schedule-service.ts`](../platform/modules/definitions/src/definition-schedule-service.ts) | 528/600 | 47 guards, 3 registries | Delegate locator minting/publication; extract before any additional responsibility |
| [`platform/modules/definitions/src/message-start-publication-service.ts`](../platform/modules/definitions/src/message-start-publication-service.ts) | 511/600 | 47 guards, 3 registries | Delegate locator minting/publication; extract before any additional responsibility |
| [`platform/apps/server/src/composition.ts`](../platform/apps/server/src/composition.ts) | 163/600 | 47 guards, 3 registries | Own fan-out, configuration, route order, and reverse close only |
| [`platform/apps/web/src/app.tsx`](../platform/apps/web/src/app.tsx) | 241/600 | 47 guards, 3 registries | Compose the new panel; keep behavior in cohesive feature files |
| [`platform/contracts/src/index.ts`](../platform/contracts/src/index.ts) | 23/600 | 52 guards, 2 registries | Export only the new contract owners |

Before each implementation lane, rerun [`scripts/what-binds.ts`](../scripts/what-binds.ts) on every added or grown path. Package manifests, [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), [`pnpm-lock.yaml`](../pnpm-lock.yaml), harness types, boundary guards, licences, source hygiene, READMEs, root scripts, and the M3 showcase registry are shared root-integration owners. Apart from the type-only `DeepReadonly<T>` import extraction, semantic-core behavior and artifacts remain byte-identical; BPMN source, Workflow, Lean, CIB, E2 artifacts, and differential owners remain byte-unchanged.

Exact executable guard and oracle routing is mandatory:

| Planned boundary | Existing guard or registry owner | Required focused oracle |
|---|---|---|
| Neutral type package and package graph | [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts), [`scripts/temporal-package-boundary.test.ts`](../scripts/temporal-package-boundary.test.ts), [`scripts/pnpm-project-config.test.ts`](../scripts/pnpm-project-config.test.ts), [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts) | tuple, union, callable, and nested mutation type test in the new package; semantic-core and platform contract builds consume the same exported symbol |
| Product 1 process-work client/API | [`packages/temporal-adapter/README.md`](../packages/temporal-adapter/README.md), [`packages/engine-api/README.md`](../packages/engine-api/README.md), [`scripts/temporal-package-boundary.test.ts`](../scripts/temporal-package-boundary.test.ts) | new engine API and client tests covering canonical direct/Message locators, service-returned Schedule locator, current Query/detail, every `ProcessCommandResult`, and configured-base mutation |
| Product 2 gateway and producer fan-out | [`platform/foundation/engine-gateway/README.md`](../platform/foundation/engine-gateway/README.md), [`platform/modules/definitions/README.md`](../platform/modules/definitions/README.md), [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) | new gateway tests plus [`platform/modules/definitions/test/process-instance-recording.test.ts`](../platform/modules/definitions/test/process-instance-recording.test.ts), [`definition-start-service.test.ts`](../platform/modules/definitions/test/definition-start-service.test.ts), [`definition-schedule-service.test.ts`](../platform/modules/definitions/test/definition-schedule-service.test.ts), and [`message-start-publication-service.test.ts`](../platform/modules/definitions/test/message-start-publication-service.test.ts) |
| Public Work transport | [`platform/contracts/README.md`](../platform/contracts/README.md), [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) | new runtime and type tests for every request/result/error/status, strict extras, route encoding, cursor, private-field rejection, and incompatible form values |
| Identity, claims, completion, and audit | [`platform/foundation/README.md`](../platform/foundation/README.md), [`platform/modules/README.md`](../platform/modules/README.md) | new independent-connection tests for policy projection, race, monotonic generation, release response loss, action collision, all engine result mappings, audit self-only filters, cursor paging, restart, and corruption |
| Server and web composition | [`platform/apps/server/README.md`](../platform/apps/server/README.md), [`platform/apps/web/README.md`](../platform/apps/web/README.md), [`scripts/platform-product-boundary.test.ts`](../scripts/platform-product-boundary.test.ts) | server route/composition tests and web build/type/runtime tests for the public HTTP-only client, actor-visible table, form mismatch, and private-field exclusion |
| Live and browser closure | [`showcase/README.md`](../showcase/README.md), [`scripts/pre-release-architecture.test.ts`](../scripts/pre-release-architecture.test.ts), [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts) | `showcase/m3-human-work` live Temporal and Chromium gates across all three producers, restart, Worker replacement, races, response loss, audit, replay, and recursive private-fact scans |

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
