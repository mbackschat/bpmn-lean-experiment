# BPM platform incident operations proposal

## Status

**Draft; independently unreviewed; owner approval pending; implementation is not authorized.** This proposal selects the smallest M4 Stage 3 Product 2 contract for an authorized operator to see current engine-published Service Task incidents, inspect one exact incident, submit the published Retry or root-Process Cancel interaction, and audit those platform actions without making Product 2 a semantic authority.

[PLAN.md](PLAN.md) owns sequencing. The graduated [Service Task incident and retry specification](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md) and [incident-root-cancellation specification](capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md) own the existing semantic facts and transitions. The [platform proposal](BPM-PLATFORM-PROPOSAL.md#operations-and-monitoring), [information architecture](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md), [UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md), [architecture](ARCHITECTURE.md), and [human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) own the surrounding Product 2 boundaries and reusable patterns.

## Owner question and motivation

What is the smallest complete operator surface that exposes the incident, Retry, and incident-scoped root cancellation already published by Product 1, while remaining restart-safe and honest about uncertain delivery?

M4 must make the implemented engine capability usable in the browser. An operator should be able to find an incident, understand the affected Process and Service Task, retry it, or deliberately cancel its hosting root Process. The platform must not reconstruct that incident from Temporal Event History, Activity failures, retry attempts, a state difference, or its own database. The existing M2 Process-instance search, M3 full-width workspace layout, durable action lifecycle, audit outbox, responsive collection, and diagram presentation provide the product pattern; this proposal selects the incident-specific contract.

## Scope

Required scope is one complete current incident snapshot over Product 2-confirmed Process instances, one exact incident detail, durable Retry and Cancel actions, operator authorization, incident-action audit, an Operations workspace, and live browser evidence over the two graduated incident profiles.

Optional scope is one exact actor filter on the audit collection and an explicit manual refresh control. Both may be omitted without changing the contract.

Excluded scope includes general BPMN cancellation, a second incident generation, causes, stack traces, retry or attempt counts, arbitrary effect repair, job editing, token movement, general variable editing, migration, Event History rendering, Temporal Workflow control, Process instances not confirmed by Product 2, and every M5 history or mining surface.

## Selected decisions

1. Product 1 adds a closed current-incident Query and a cohesive `process-operations` API. Product 2 never consumes the diagnostic trace Query.
2. Definitions delivers the existing complete confirmed publication `{ instance, locator }` to Operate. The opaque locator bytes and codec remain Product 1-owned and byte-identical to the locator already used by Work.
3. Operate fresh-queries every nonclosed confirmed registration and returns one all-or-error current snapshot. A successful zero-incident observation means active with no incident; only an exact matching terminal receipt means closed.
4. Product 2 publishes only the engine's exact generation-1 incident and matching Retry/Cancel interactions. It adds no cause, priority, retry count, host identity, or inferred status.
5. One configured operations group authorizes incident list, detail, actions, and incident audit. The fake development actor belongs to both the existing `reviewers` group and the new `operators` group.
6. Every action ID is durably bound to actor, exact published interaction, and complete incident identity before Product 1 is called. Equivalent retries converge; changed content conflicts.
7. Distinct Retry and Cancel action IDs are independently durable and may both reach Product 1. Product 2 assigns no priority and does not choose a semantic winner; the existing Workflow input order and semantic transition produce the exact outcomes.
8. Operate owns action state and a same-transaction audit outbox. The audit foundation owns a separate append-only incident-action sink; the existing Work audit contract and bytes do not change.
9. The primary navigation destination becomes Operations, with Process instances, Incidents, and Audit tabs. Incident selection replaces the collection with a full-width Overview, Diagram, and Audit detail rather than opening a right inspector.

## Product and engine boundary

The Workflow already owns the current committed `openIncidents` collection and ordered `enabledInteractions`. Stage 3 adds one Query that atomically projects only each current open incident and its exactly matching Retry and optional Cancel interaction from the same committed state. Missing, duplicate, reordered, cross-incident, or unsupported interactions make the Query result invalid rather than giving Product 2 permission to repair it.

The private Workflow Query result is closed and includes the semantic Process status so a query against a retained closed execution cannot be mistaken for an active zero-incident Process:

```ts
type TemporalIncidentOperationsSnapshot =
  | null
  | DeepReadonly<{
      instanceId: string;
      status: "running";
      incidents: Array<{
        incident: OpenEffectIncident;
        interactions:
          | [RetryIncidentInteraction]
          | [RetryIncidentInteraction, CancelIncidentProcessInteraction];
      }>;
    }>
  | DeepReadonly<{
      instanceId: string;
      status: "completed" | "cancelled";
      incidents: [];
    }>;
```

`null` is the transient not-started state and maps to unavailable. A terminal Query result is corroborated with the exact matching terminal Workflow receipt before the registration becomes closed. If the Query itself is absent because the Workflow is already closed, Product 1 performs the same retained-receipt resolution. The Product 1 operation result is then:

```ts
type EngineIncidentObservationResult =
  | DeepReadonly<{
      status: "observed";
      incidents: Array<{
        incident: OpenEffectIncident;
        interactions:
          | [RetryIncidentInteraction]
          | [RetryIncidentInteraction, CancelIncidentProcessInteraction];
      }>;
    }>
  | DeepReadonly<{ status: "closed" }>
  | DeepReadonly<{ status: "unknown" }>
  | DeepReadonly<{ status: "unavailable" }>;
```

`observed` may contain zero incidents and exists only for semantic status `running`. `closed` requires a terminal receipt whose Process identity and completed-or-cancelled status equal the addressed semantic Process and Query result when both exist. Host absence without that receipt is `unknown`; transient not-started state, transport failure, or integrity uncertainty is `unavailable`. Product 1 interprets the stored opaque locator and validates the Query and existing content-bound Retry/Cancel results. It exposes no Workflow ID, Run ID, Task Queue, history field, Activity attempt, or locator.

The Workflow Query is registered for every admitted profile so ordinary confirmed instances return an empty observed set. Product 2 accepts incidents only in the two graduated M4 profiles and requires their exact payload-free effect shape. A later incident profile with another generation, effect argument, or action set reopens this proposal rather than widening silently.

## Public incident contract

Product 2 defines its own strict public projection rather than exporting semantic-core types into HTTP clients:

```ts
type PublicEffectOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

type PublicEffectIncidentId = DeepReadonly<{
  effectId: PublicEffectOccurrenceId;
  generation: 1;
}>;

type PublicEffectIncident = DeepReadonly<{
  kind: "effectExecutionFailed";
  id: PublicEffectIncidentId;
  effect: {
    id: PublicEffectOccurrenceId;
    descriptor: { protocol: string; operation: string };
    arguments: [];
  };
}>;

type PublicRetryIncidentInteraction = DeepReadonly<{
  kind: "retryIncident";
  incidentId: PublicEffectIncidentId;
}>;

type PublicCancelIncidentProcessInteraction = DeepReadonly<{
  kind: "cancelIncidentProcess";
  processInstanceId: string;
  incidentId: PublicEffectIncidentId;
}>;

type PublicIncident = DeepReadonly<{
  hostingInstance: PublicProcessInstanceIdentity;
  incident: PublicEffectIncident;
  availableInteractions:
    | [PublicRetryIncidentInteraction]
    | [PublicRetryIncidentInteraction, PublicCancelIncidentProcessInteraction];
}>;

type PublicIncidentSnapshot = DeepReadonly<{
  incidents: PublicIncident[];
}>;
```

The incident ID, nested effect ID, effect ID, hosting public Process identity, and Cancel Process identity must all agree exactly for these root-hosted profiles. The complete interaction is copied from the engine publication. The client chooses one published interaction but never constructs an occurrence or broad cancellation request.

The aggregate is ordered by hosting Process-instance ID, effect Process-instance ID, BPMN element ID, numeric activation, and literal generation. Exact Unicode scalar ordering is used and no database, host, or locale order is public.

## Confirmed registration and current aggregation

The existing Definitions durable publication lifecycle retains its independent Operate and Work acknowledgement markers. Its Operate subscriber changes from `recordProcessInstance(instance)` to `recordConfirmedProcessInstance({ instance, locator })`; no new subscriber or delivery state is added. Operate persists the immutable locator with the existing exact public identity. Re-recording equivalent bytes is idempotent and any identity or locator drift is integrity failure.

Operate classifies each registration privately as active, closed, or indeterminate. Initial confirmed registration is active. `observed`, including an empty incident set, records active; an exact terminal receipt records closed; unknown or unavailable records indeterminate and makes the request fail. A later successful observation may recover indeterminate to active or closed. Process-instance search remains identity-only and byte-identical.

Every incident list request queries every nonclosed registration. Separate positive configuration ceilings bound registrations and incidents, defaulting to 100 and 1,000. One unknown or unavailable registration, one invalid Product 1 result, or an exceeded ceiling yields `incidentSnapshotUnavailable`; no partial snapshot or cached incident is returned. Operate persists no incident row as current semantic authority.

## Authorization

The existing actor resolver supplies the immutable actor ID and exact group set. A new `OperationsAuthorizationPolicy` permits the incident list, detail, actions, and audit only when the actor belongs to the one configured exact operations group. `PLATFORM_OPERATIONS_GROUP_ID` defaults to `operators`; the development fake actor defaults to groups `reviewers` and `operators` so M3 and M4 are both demonstrable.

Authorization is evaluated before an engine Query, action lookup for another actor, repository mutation, or audit search. Denial is uniformly HTTP 403 and causes zero engine calls, action rows, outbox rows, or audit events. An authorized operator may inspect incident audit across actors because it is an operations surface rather than Human Work self-audit. This selects no authentication provider and makes no production-security claim. The existing Process-instance search authorization contract is unchanged.

## Action contract

The public action request is the exact selected interaction:

```ts
type IncidentActionRequest =
  | PublicRetryIncidentInteraction
  | PublicCancelIncidentProcessInteraction;

type IncidentActionResult =
  | DeepReadonly<{
      state: "committed";
      actionId: string;
      interaction: IncidentActionRequest;
    }>
  | DeepReadonly<{
      state: "rejected";
      actionId: string;
      interaction: IncidentActionRequest;
      engineResult:
        | {
            kind: "semantic";
            outcome: "rolledBack" | "rejected" | "semanticFailure" | "unsupported";
          }
        | {
            kind: "processClosed";
            status: "completed" | "cancelled";
          };
    }>
  | DeepReadonly<{
      state: "indeterminate";
      actionId: string;
      interaction: IncidentActionRequest;
    }>;
```

The nonempty caller-generated `actionId` becomes the semantic command ID. Retry copies `{ kind, commandId, incidentId }`; Cancel copies `{ kind, commandId, processInstanceId, incidentId }`. An unseen action requires a fresh authorized snapshot containing the byte-equivalent interaction. Retained lookup precedes that fresh snapshot only for the exact bound actor and content, allowing response recovery after Retry removes the incident or Cancel closes the Process.

Semantic `committed` maps only to `committed`. Other semantic outcomes preserve their exact outcome as `rejected`. A matching `processClosed` receipt is preserved as `rejected` with its exact terminal status because closure alone does not prove that this action committed. `processUnknown`, retention-indistinguishable absence, or infrastructure loss after possible transmission maps to `indeterminate`. Product 2 never promotes absence or a cancelled receipt to action success.

## Durable action lifecycle and concurrency

Each action follows one closed lifecycle:

```text
reserved -> submitting -> committed
                      +-> rejected
                      +-> indeterminate
indeterminate -> submitting
```

The reservation binds action ID, actor ID, exact interaction kind and content, hosting Process identity, and complete generation-1 incident identity before any Product 1 call. Only a won `reserved` or reconciliation-owned `indeterminate` transition initiates a call. `submitting` after restart is retried only with the same content-bound command; a concurrent equivalent request in one running server never adds another live call. No database transaction spans Product 1.

Equivalent retries return or reconcile the retained action. Another actor receives 403; changed content under the same action ID receives 409. Distinct action IDs are distinct explicit inputs. If authorized operators race Retry and Cancel, both reservations may cross Product 1, the Workflow orders the Updates, and Product 2 records each exact result. Product 2 makes no one-winner, one-call, or Retry-before-Cancel request-priority claim. At most one semantic transition can commit from the incident state, as the graduated engine specifications already establish.

## Platform audit

Operate owns a same-transaction audit outbox beside its action state. The audit foundation owns a separate append-only incident-action repository rather than widening the Work task event or `work_audit_events` schema.

```ts
type IncidentAuditEvent = DeepReadonly<{
  eventId: string;
  actorId: string;
  recordedAt: string;
  hostingProcessInstanceId: string;
  incidentId: PublicEffectIncidentId;
  actionId: string;
  actionKind: "retryIncident" | "cancelIncidentProcess";
  outcome: "reserved" | "committed" | "rejected" | "indeterminate";
}>;
```

Action transition and exact event snapshot commit in one `BEGIN IMMEDIATE` transaction. A globally unique `eventId` makes sink insertion idempotent and changed content under the same ID an integrity failure. Unique `(actionId, outcome)` prevents equivalent retries or repeated indeterminate reconciliation from adding another logical event, while a later terminal outcome remains distinct. The reserved event is delivered and acknowledged before the first Product 1 call; a sink failure therefore suppresses the call and public reservation success. Startup and every incident or audit handler reconcile pending events before exposing success or current state. Authorization denial and pre-reservation conflict create no event.

Audit filters are actor ID, hosting Process ID, exact incident occurrence, and action kind, with an opaque insertion cursor. Wall-clock order is platform audit order, never semantic execution order. Audit contains no private locator, Workflow or Run identity, Task Queue, Event History, Activity attempt, retry count, stack trace, inferred cause, or transport payload.

## HTTP contract

The public routes are:

- `GET /api/v1/incidents` for one complete current authorized snapshot;
- `GET /api/v1/incidents/{processInstanceId}/{elementId}/{activation}/generations/1` for one exact current incident;
- `PUT /api/v1/incident-actions/{actionId}` with one strict `IncidentActionRequest`;
- `GET /api/v1/incident-audit` with exact optional filters and cursor.

List, detail, committed, and rejected results use HTTP 200. Indeterminate uses 202. Authorization denial is 403, an absent current incident is 404, changed action content or a requested interaction not currently published is 409, and an incomplete aggregate is 503 `incidentSnapshotUnavailable`. Existing strict 400, 405, 413, 415, and 500 envelopes remain. Bodies reject missing, extra, duplicate, malformed, noncanonical, wrong-generation, cross-Process, and mismatched nested identity fields.

## Operations workspace

The primary navigation label `Process instances` becomes `Operations`. Its content owns three React Aria tabs: Process instances, Incidents, and Audit. The existing M2 search remains the Process instances tab without changing its API or semantics.

The Incidents tab opens on the responsive collection. A row contains Process ID, Process-instance ID, Service Task element ID, activation, generation, and available action labels, but no mutation control. Selecting it replaces the collection with a full-width detail. Overview shows exact public identity, effect descriptor, and currently published actions. Diagram uses the existing definition presentation route and highlights the exact effect element. Audit shows retained platform action facts for that incident. Back returns focus to the exact row when present or the collection heading otherwise.

Retry is the primary action. Cancel uses the shared destructive button and an explicit React Aria confirmation dialog stating that it cancels the hosting root Process, removes its remaining live work, and preserves already committed Process data. Pending and indeterminate state stays in detail with the same retained action ID. Semantic rejection and `processClosed` remain visible and do not masquerade as success.

The shared DataTable collection/card pattern must remain one semantic DOM with no horizontal page or row scrolling at 1600, 1280, 1024, and 768 CSS pixels. No right inspector is introduced. Product 2 Playwright evidence remains path-scoped and outside `verify.sh` and every Product 1 semantic feedback loop.

## Temporal hosting and refinement preflight

No new semantic transition, wait, timer, effect, cancellation rule, or terminal state is selected. Durable ingress reuses the existing content-bound Retry and Cancel Workflow Updates; cancellation still completes the Workflow normally with the typed cancelled receipt. The new Query is read-only and returns the current committed incident projection, not Event History or a trace prefix.

The refinement relation is exact: for each addressed nonterminal Workflow, the Query result equals the current stable semantic state's `openIncidents` paired with only the same state's matching Retry and Cancel `enabledInteractions`; an action result equals the existing content-bound Update resolution for the exact published interaction and Process identity. Query execution neither changes state nor creates a semantic input.

Delivery and restart risk lies in the Product 2 action/result boundary. Reservation occurs before submission, every retry uses the same content-bound command, and possibly transmitted work never becomes a different dispatchable action. Ordering of distinct action IDs remains the existing Workflow Update order. Actor authorization and durable storage add no semantic input until the exact Update call. Replay must remain green because the Query handler is deterministic over Workflow state and adds no nondeterministic source.

The smallest executable witness starts two Product 2-confirmed instances through the real server. Both reach one current generation-1 incident. An authorized operator retries the first through response loss and server restart, observes one committed retry and later successful Process completion, and cancels the second across Worker replacement, observes a committed Cancel and exact cancelled receipt, and replays both histories. A native Temporal cancellation mutation, trace-derived snapshot mutation, configured Schedule-base locator substitution, action-content substitution, and cancelled-receipt-as-action-success mutation must each fail.

## Required evidence

1. Direct, Timer Schedule, and Message Start registrations retain their exact locator and remain separately addressable; replacing a Schedule execution locator with its configured base fails.
2. The dedicated Query returns current incident and interaction bytes from one committed state; trace use, missing or duplicate interactions, reordered Cancel-before-Retry, cross-incident identity, Stage 1 Cancel synthesis, and nonempty effect arguments fail.
3. The complete aggregate distinguishes active zero-incident, active incident, closed, unknown, unavailable, recovered indeterminate, and both configured ceilings; any unresolved registration makes the whole request unavailable.
4. Unauthorized list, detail, action, and audit requests perform zero engine calls and zero writes; the exact configured group grants all four surfaces without changing M3 task authorization.
5. Wrong generation, element-only matching, mismatched nested effect identity, generic cancellation without the published Cancel interaction, extra fields, and changed action content fail before an engine call.
6. Response loss and restart converge on the same action ID and exact result. `processUnknown` remains indeterminate; `processClosed` preserves exact status as rejected and is never promoted to committed.
7. Independent equivalent requests make one live Product 1 call. Distinct concurrent Retry and Cancel requests may make two calls, and independently captured engine results prove no more than one semantic commit without platform priority.
8. Action and outbox transaction, sink insert, and acknowledgement crash points converge to one exact event per `(actionId, outcome)`; changed event content is integrity failure and both stores are inspected independently.
9. Recursive public JSON, browser state, audit, and captured logs exclude locator, Workflow ID, Run ID, Task Queue, history, Activity attempt, retry count, cause, exception, stack trace, and transport command payload.
10. Component and four-width Playwright evidence proves Operations tabs, collection-to-detail focus, exact diagram highlight, confirmation, retained indeterminate action, honest rejection, and no horizontal overflow.
11. The real M4 showcase proves current incident discovery, exact Retry and Cancel through Product 2, server and Worker replacement, terminal outcomes, history mutations, and replay while Playwright remains isolated from Product 1 development gates.

The rule-to-evidence matrix is:

| Rule | Separating executable failure |
|---|---|
| Exact private address | Substitute the configured Schedule Workflow base for its stored execution locator; the incident must not be queried or commanded at another host |
| Current publication only | Leave a historical incident in trace after Retry but remove it from current state; Product 2 must show no incident and must never query trace |
| Interaction authority | Remove, duplicate, reorder, or cross-bind one interaction; strict Product 1 projection must fail instead of repairing it |
| All-or-error aggregation | Make one nonclosed registration unknown or unavailable; returning the other incidents is a defect |
| Authorization before observation | Use an actor outside the configured group; any Query, mutation, action row, outbox row, or audit row is a defect |
| Content-bound recovery | Lose the first response after possible submission, restart, and retry with equal and changed content; only equal content may reconcile the same command |
| No platform priority | Race distinct Retry and Cancel IDs and capture both Product 1 results; a platform one-winner slot or two committed semantic outcomes is a defect |
| Honest terminal classification | Return a matching cancelled receipt without a retained Update result; classifying the action committed is a defect |
| Audit durability | Stop after action commit, sink insert, and before acknowledgement; replay must converge without a missing or duplicate logical event |
| Private-fact exclusion | Plant each forbidden host or diagnostic field recursively in contracts, UI models, audit, and configured logging sinks |

## Required, optional, and excluded functionality

Required:

- one dedicated current-incident Product 1 Query and cohesive engine operation over the existing opaque locator;
- complete confirmed registration delivery to Operate and all-or-error current aggregation;
- exact generation-1 incident and engine-published Retry/Cancel interactions;
- configured operator-group authorization, durable content-bound actions, and incident-action audit;
- Operations tabs, responsive collection, full-width detail, diagram highlight, confirmation, and live browser evidence.

Optional:

- an actor filter in authorized audit search;
- manual refresh in addition to ordinary bounded refetch.

Excluded:

- Event History or diagnostic trace as a Product 2 fact source;
- cached or persisted incident rows as current authority;
- cause, exception, stack, retry count, Activity attempt, host retry, raw engine identity, or private locator exposure;
- platform-created occurrence identity, Cancel interaction, action priority, semantic result, or success from absence;
- arbitrary Process cancellation, nested-scope selection, compensation, variable repair, token movement, job editing, second incidents, or incident migration;
- authentication providers, tenancy, production security, external starts, M5 history/mining, and Temporal operator-console replacement.

## Versioning and owner feasibility

This is a material additive Product 1 public-observation change because it adds a production Workflow Query and exact incident projection, even though the underlying semantic state, interactions, Updates, receipts, Lean account, CIB relationship, checked graph, and IL remain unchanged. It requires a cold proposal review, owner approval, and a conditional semantic checkpoint after the first green Query, engine API, and strict wire checkpoint. Closure is governed before this proposal may graduate to a specification.

The implementation uses new cohesive owners for incident projection/Query, Product 1 process operations, Operate aggregation/actions/outbox, incident HTTP, incident audit, and the Operations UI. It must not grow the near-full Workflow implementation, Work mutation service, Work repository, existing identity-only Operate repository, or task-shaped audit contracts into mixed-responsibility owners. The existing Process-instance search API and Work API remain byte-identical.

No new dependency is selected. Existing React Aria, TanStack Query/Table, SQLite, Temporal client, and bpmn-js boundaries are sufficient.

## Reopen conditions

Stop and return to the owner if the dedicated Query cannot be implemented without reading trace/history, if a confirmed producer cannot retain its exact locator, if exact action retry cannot distinguish retained result from unknown delivery, if the platform must invent Retry/Cancel eligibility or ordering, if authorization requires an authentication provider or tenant model, if a future profile introduces another incident generation/effect shape/action set, or if implementation requires a new semantic transition, Lean rule, CIB mapping, BPMN source/checked/IL change, native Temporal cancellation, or M5 transition history.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `c3bcd44` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The proposal target will be recorded in a docs-only follow-up before the context-cold review prompt is minted. No implementation may begin before the proposal review closes and the owner approves the selected decisions.
