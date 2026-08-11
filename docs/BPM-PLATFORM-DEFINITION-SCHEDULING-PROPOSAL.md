# BPM platform definition scheduling proposal

## Status

**Draft; independent cold proposal review pending.** This proposal selects the smallest Product 2 definition-scheduling increment for the registered Timer Start profile. It changes no BPMN meaning, semantic profile, checked graph, Semantic Process IL, runtime state, command, observation, or Lean theorem. Implementation remains unauthorized by repository status until the proposal review receipt is complete.

The [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) owns the product boundary, [ARCHITECTURE.md](ARCHITECTURE.md) owns package direction, the [Timer Start Event specification](capsules/TIMER-START-EVENT-SPEC.md) owns semantic and host-refinement meaning, and [PLAN.md](PLAN.md) owns sequencing.

## Product question

What is the smallest public definition-scheduling surface that lets an operator activate the registered one-shot Timer Start profile without inspecting private engine representations, retargeting a deployed version, or treating Temporal identifiers as BPMN identity?

## Selected increment

Product 2 adds one exact-version, one-shot Timer Start schedule. A caller selects a deployed Process definition version, a public schedule ID, and an activation instant. The platform derives the due instant from the engine-published Timer Start duration, persists the immutable intent, and creates one Temporal Schedule action that starts the exact compiled definition version with one fresh semantic Process-instance identity.

This increment is schedule management for a host-resolved start occurrence. It is not a fifth semantic consumption operation. The engine still owns compile and start meaning; the platform owns definition-version selection, host lifecycle, persistence, API, idempotency, operator visibility, and pre-start cancellation.

## Public engine capability

Product 2 must not inspect the checked graph or Semantic Process IL to discover whether a definition is schedulable. Accepted compilation therefore publishes one additive capability projection:

```ts
type PublicTimerStartCapability = DeepReadonly<{
  startEventId: string;
  durationMs: number;
}>;

type PublicDefinitionStartCapabilities = DeepReadonly<{
  timerStarts: readonly PublicTimerStartCapability[];
}>;
```

The current registered Timer Start profile publishes exactly one entry with `durationMs: 1000`; every other current profile publishes an empty collection. The collection shape preserves future multiple-start admission without reinterpreting any already published definition. Later Message Start publication receives a separate capability rather than overloading this one.

The projection contains only resolved start identity and normalized duration needed by a scheduling client. It contains no checked node, IL operation, token place, scope, stimulus, Temporal Schedule ID, Workflow ID, Run ID, task queue, retry policy, or private host instruction.

The deployed definition version stores this capability beside its exact source identity and profile. Schedule creation recompiles the stored bytes and requires the same Process ID, profile, digest, byte length, Start Event ID, and duration before any Temporal Schedule is created. Stored metadata is an index, not an alternative admission authority.

## Public contract

The public identity of a definition schedule is the tuple `(processId, version, scheduleId)`. `scheduleId` is caller-owned, nonempty, well-formed Unicode encoded as one URI segment. The web client generates a UUID by default and displays it; the API permits another conforming value.

The creation body is deliberately closed:

```ts
type PutDefinitionScheduleRequest = DeepReadonly<{
  activationAt: string;
}>;
```

`activationAt` must equal its canonical UTC RFC 3339 millisecond rendering, for example `2026-08-11T12:00:00.000Z`. The platform computes `dueAt = activationAt + durationMs`. The API exposes both instants so an operator can distinguish activation policy from the modeled duration.

One returned schedule is a closed union:

```ts
type DefinitionScheduleBase = DeepReadonly<{
  scheduleId: string;
  definition: DeployedDefinitionVersion;
  timerStart: PublicTimerStartCapability;
  activationAt: string;
  dueAt: string;
}>;

type DefinitionSchedule =
  | (DefinitionScheduleBase & { status: "scheduled"; instance: null })
  | (DefinitionScheduleBase & {
      status: "started";
      instance: PublicProcessInstanceIdentity;
    })
  | (DefinitionScheduleBase & { status: "missed"; instance: null })
  | (DefinitionScheduleBase & { status: "cancelled"; instance: null });
```

No response contains a Temporal Schedule ID, configured Workflow-ID base, execution Workflow ID, first Run ID, action timestamp, Schedule description, or raw Temporal failure.

## HTTP surface

The definition module adds these exact routes:

| Method | Route | Meaning |
|---|---|---|
| `PUT` | `/api/v1/definitions/{processId}/versions/{version}/schedules/{scheduleId}` | Create the exact immutable schedule, or return the existing identical schedule after a retry. |
| `GET` | `/api/v1/definitions/{processId}/versions/{version}/schedules` | List schedules for exactly one stored definition version in stable schedule-ID order. |
| `GET` | `/api/v1/definitions/{processId}/versions/{version}/schedules/{scheduleId}` | Reconcile and return one exact schedule. |
| `DELETE` | `/api/v1/definitions/{processId}/versions/{version}/schedules/{scheduleId}` | Cancel a still-pending schedule and return its terminal `cancelled` representation. |

`PUT` returns `201` for the first completed creation and `200` for an identical retry. Reusing the same schedule identity with a different activation instant, definition version, capability, or derived Process-instance identity returns `409 conflict` and changes nothing. A missing definition or schedule returns `404`. A definition without exactly one Timer Start capability, a noncanonical instant, an activation whose due instant is no longer in the future, or an out-of-range timestamp returns `422` before any host resource is created. Existing body-size, media-type, and exact-key rules remain in force.

Replacement is deliberately absent. An operator cancels a pending schedule and creates another public schedule identity. A started, missed, or cancelled schedule is immutable. `DELETE` against `started` or `missed` returns `409` with the current representation; repeated deletion of `cancelled` returns that representation idempotently.

The web definition workspace shows the stored Timer Start capability only on the exact version that published it. Its schedule panel creates, lists, refreshes, and cancels schedules through these HTTP routes. It never imports the platform module, engine gateway, engine API, or Temporal client.

## Identity and version binding

Schedule creation snapshots the exact deployed definition metadata and artifact identity. Deploying a later version of the same Process ID cannot change an existing schedule, its public representation, or its host action. No code path asks for the latest definition after the schedule intent is reserved.

The platform generates one fresh semantic `processInstanceId` when it first reserves the schedule intent and persists it before calling Temporal. Retries reuse that identity. This is Process-instance identity, not an occurrence identity; the engine constructs every later occurrence identity from committed semantic state.

The host Schedule ID and configured Workflow-ID base are deterministic private addresses derived from the reserved schedule and semantic instance identities. They are not public Process facts. After the action fires, the service-returned execution Workflow ID and first Run ID are persisted privately and used for later engine routing. They are never reconstructed from a server naming formula and never returned by the public schedule API.

## Persistent lifecycle

The schedule repository stores one immutable intent and a closed internal lifecycle:

```text
creating -> scheduled -> started
                    \-> missed
          \-> cancelled
```

`creating` is internal and never returned as a successful public result. It records the exact request, definition capability, semantic instance identity, private host Schedule ID, and configured Workflow-ID base before the network call. `scheduled`, `started`, `missed`, and `cancelled` are durable public states. A separate cleanup flag records whether the terminal Temporal Schedule resource has been deleted; cleanup progress is not public lifecycle state.

The repository uses one SQLite table with the complete public tuple as its primary key and unique constraints for the private host Schedule ID and semantic Process-instance identity. Definition metadata is copied into the row rather than joined to a mutable latest-version pointer. The artifact remains content-addressed in the existing store.

## Creation, retry, and recovery algorithm

The exact creation algorithm is:

1. Decode the route and body, load the exact deployed version, and read its exact artifact bytes.
2. Recompile those bytes through the engine gateway and require identity plus Timer Start capability equality.
3. Begin an immediate SQLite transaction. If the public identity exists, require complete immutable request equality and return to reconciliation. Otherwise generate and reserve the semantic instance identity plus private host addresses in `creating`, then commit.
4. Ask the engine gateway to create the one exact Temporal Schedule from the exact artifact, profile, expected identity, reserved semantic instance identity, and stored host Schedule ID.
5. If creation reports that the host Schedule already exists, describe it through the same gateway and require equality of the entire stored spec, action, arguments, configured Workflow-ID base, task queue, retry policy, and one-action state. This is the accepted-but-response-lost and concurrent-retry path, not success by ID alone.
6. Persist `scheduled` only after exact host equality is established, then return the public schedule.

Every `PUT`, item `GET`, `DELETE`, and server startup reconciles nonterminal rows. A missing or divergent host resource after durable `scheduled` state is an integrity failure and returns an opaque internal error. It is never silently recreated, silently retargeted, or treated as cancellation.

A crash after host creation but before `scheduled` persistence is recovered by the exact describe-and-compare path. A crash after terminal state persistence but before host deletion is recovered by the cleanup flag. No database transaction remains open across a Temporal call.

## Exact Temporal Schedule policy

The engine gateway is Product 2's only route to both the engine API and `@bpmn-lean/temporal-client`. A narrow handle-free scheduling client owns Schedule create, describe, pause, and delete calls. Workflow, Worker, and semantic-core packages remain unreachable from the platform tree.

The one stored Schedule has:

- one UTC Calendar occurrence at `dueAt`;
- `startAt = dueAt` and `endAt = dueAt`;
- one `startWorkflow` action carrying the exact admitted Timer Start stimulus and exact compiled program;
- the existing semantic Process task queue and Workflow type;
- the existing configured Workflow-ID base derived from semantic instance identity;
- Workflow retry `maximumAttempts: 1`;
- Schedule overlap policy `SKIP`;
- Schedule catch-up window `60 seconds`, selected explicitly rather than inheriting an SDK default;
- `pauseOnFailure: true`;
- `remainingActions: 1`.

The 60-second catch-up window is host policy, not BPMN time. It permits a bounded service interruption without silently starting an arbitrarily stale definition. The first service description that reports the one action taken moves the public state to `started` and persists the service-returned execution Workflow ID and first Run ID. When the service reports no action taken, no running action, no future action, and a missed catch-up after the bounded window, the platform records `missed`. Wall-clock passage alone does not establish a miss.

After `started`, `missed`, or `cancelled` is durable, the reconciler deletes the exhausted or paused Temporal Schedule. The Process Workflow continues under its returned execution identity after Schedule cleanup.

## Cancellation and races

Cancellation is permitted only before the Schedule action wins. The gateway first pauses the Schedule, then describes it:

- if one action was taken or is running, the platform persists `started`, retains the returned execution identity when available, and returns `409`;
- if no action was taken or is running and no future action can fire while paused, the platform persists `cancelled`, then deletes the Schedule;
- if service state cannot establish either fact, cancellation fails without changing public state.

This proposal relies on the pinned Temporal Schedule service to serialize pause and action state so the post-pause description decides the race. The implementation checkpoint must prove that boundary with a focused live witness. If the pinned stack cannot provide this decision without reconstructing server internals, pre-start cancellation is a stop condition and requires a corrected proposal rather than a local best-effort policy.

## Temporal hosting and refinement preflight

The durable ingress remains Workflow start with a pre-admitted `TriggerTimerStart` stimulus. There is no Signal, Update, Workflow Timer, Activity, Child Workflow, broker, or running-instance command in the scheduling path. The one external Schedule action resolves the exact start occurrence and starts the existing semantic-lifetime Workflow.

The preserved relation is the Timer Start specification's existing one: direct core execution and hosted execution receive the same exact program and resolved stimulus and reach the same public semantic state. Product 2 schedule state is not part of that relation. Schedule description proves host delivery and supplies private execution addressing; it is not a BPMN observation.

Delivery is at most one action per public schedule because `remainingActions` is one, overlap skips, and the stored action is immutable. Host retries or accepted-but-response-lost client calls are reconciled by exact Schedule description. Semantic command identity remains content-bound to the resolved stimulus. Worker absence before and after the due occurrence must not change the committed result. Replay remains owned by the existing Process Workflow.

The smallest executable refinement witness deploys Timer Start version 1, creates a public schedule, deploys a distinct version 2 of the same Process before the due occurrence, keeps the Worker absent through the due occurrence, discovers the action through Schedule description, starts a replacement Worker, and proves the exact version-1 downstream wait and public schedule identity. It then proves replay and private execution-ID non-disclosure. A direct Workflow-start mutation must produce no corresponding Schedule action and fail the host evidence.

## Required evidence

Implementation uses red/green TDD and must retain these separating facts:

| Rule | Required evidence |
|---|---|
| `DSCHED-CAPABILITY-01` | Accepted compilation publishes exact Timer Start identity and duration; other profiles publish an empty collection; a changed Start Event or duration cannot pass stored capability equality. |
| `DSCHED-VERSION-01` | A schedule bound to version 1 executes version 1 after version 2 is deployed; latest-version lookup and changed artifact mutations fail. |
| `DSCHED-IDEMPOTENCY-01` | An identical `PUT` and accepted-but-response-lost retry return one schedule and one semantic instance; changed request reuse returns conflict and creates nothing. |
| `DSCHED-ZERO-CREATE-01` | Wrong Process, version, digest, profile, start identity, capability, body, or past due instant creates neither Schedule nor Workflow. |
| `DSCHED-HOST-01` | Exact one-action policy, Worker absence, service-returned opaque execution identity, version-1 semantic result, action exhaustion, cleanup, and replay are observed on the pinned Temporal stack. |
| `DSCHED-CANCEL-01` | Cancellation before action yields no Workflow; action winning the race yields `started` and cannot be rewritten to `cancelled`; repeated cancellation is idempotent. |
| `DSCHED-PUBLIC-01` | Strict HTTP decoders reject extra, missing, empty, malformed, and private fields; every public response excludes all Temporal identities and checked/IL values. |
| `DSCHED-RECOVERY-01` | Crashes at each database/host boundary reconcile without duplicate action, silent recreation, retargeting, or a database transaction spanning a network call. |

Meaningful mutations are: resolve latest at fire time; omit capability equality; reuse an ID by host Schedule ID alone; call direct Workflow start; reconstruct the execution ID from the configured base; publish a Run ID; mark missed from wall clock alone; cancel without pause-and-describe; and recreate a missing `scheduled` host resource.

The registered Product 2 showcase uses the public HTTP API and browser UI to deploy two exact versions, schedule version 1, display activation and due instants, observe `started`, and retain the version-1 binding. Test infrastructure may inspect Temporal history and replay as evidence; the product UI may not.

## Package ownership

The implementation remains inside existing architectural boundaries and uses cohesive new owners where schedule lifecycle would otherwise crowd M1 files:

| Boundary | Planned owner |
|---|---|
| Public schedule and capability shapes, strict decoders, route helpers | New files under `platform/contracts/src/` |
| Immutable schedule workflow, repository contract, reconciliation, and HTTP routes | New files under `platform/modules/definitions/src/` |
| SQLite schedule persistence | New `sqlite-definition-schedule-repository.ts` under the definitions module |
| Product-facing compile/schedule gateway | New schedule collaborator under `platform/foundation/engine-gateway/src/` |
| Capability projection and exact-version Schedule preparation | New cohesive owners under `packages/engine-api/src/` |
| Handle-free Schedule create/describe/pause/delete | New cohesive owner under `packages/temporal-adapter/client/src/` |
| Server assembly | Existing composition root only |
| HTTP-only schedule UI | New panel and API collaborator under `platform/apps/web/src/` |
| Runnable M2 acceptance | New `showcase/m2-definition-scheduling/` package |

The existing definition route, start service, engine-gateway index, engine-api index, Temporal-client index, and composition root receive only bounded wiring or exports. No production Workflow, Worker, semantic core, BPMN source, Lean, CIB runner, or differential owner changes.

Before implementation, `what-binds` must be rerun for every added or grown path. The current tight existing owners are `platform/foundation/engine-gateway/src/index.ts` at 142/600, `packages/engine-api/src/index.ts` at 99/600, `platform/apps/server/src/composition.ts` at 83/600, and `platform/apps/web/src/definitions-api.ts` at 256/600; new schedule responsibilities must not be folded into those mixed owners.

## Required, optional, and excluded functionality

Required in this increment:

- exact Timer Start capability publication and persistence;
- one-shot exact-version creation, listing, lookup, reconciliation, pre-start cancellation, and terminal cleanup;
- strict public API and HTTP-only React client;
- accepted-but-response-lost and concurrent idempotency;
- explicit bounded missed-run policy;
- private service-returned execution addressing;
- one registered M2 showcase and live Temporal evidence.

Optional only after the required contract is green:

- display formatting beyond the canonical instants;
- manual refresh convenience in addition to ordinary query refetch;
- an operator-readable opaque integrity incident message that adds no private identifier.

Excluded:

- recurrence, cron, calendar forms, backfill, jitter, overlap selection, pause/resume controls, mutable schedule updates, or silent replacement;
- scheduling the latest version, retargeting after deployment, or changing a stored action;
- Message Start routing, broker delivery, correlation, fanout, payload, or retries;
- instance search, task list, forms, authorization provider, tenancy, or platform read-model expansion;
- public Temporal Schedule, Workflow, Run, task-queue, history, or retry data;
- Process cancellation after start, incidents, migration, or Continue-As-New;
- new BPMN source admission, profile semantics, IL operation, runtime state, command, observation, Lean proof, CIB claim, or A12 surface.

The current fake identity boundary permits every caller as the platform proposal already specifies. This increment owns the future authorization point on every schedule route but does not select an authentication or authorization provider.

## Acceptance and stop conditions

The increment is accepted when the public API, web client, exact SQLite recovery path, engine gateway, live Temporal witness, and M2 showcase pass their focused gates; every planted mutation reaches its declared discriminator; the platform tree still consumes the engine only through the gateway; the engine gate passes with the platform tree absent; and the complete repository gate is green.

Stop and correct this proposal if:

- Product 2 must inspect a checked node, IL operation, Process Workflow Query, or Event History to decide schedule meaning;
- an existing schedule can observe a newer definition version;
- accepted-but-response-lost recovery cannot distinguish the exact stored action from an ID collision;
- the service does not expose enough state to decide cancellation versus a winning action;
- an execution identity must be reconstructed rather than returned by the service;
- a missed run can be decided only from local wall clock;
- a public response must expose a Temporal identifier;
- implementation requires a new semantic transition, Workflow, Worker, dependency, or CIB relationship.

## Owner decisions

The approval set is:

1. one exact-version, one-shot Timer Start schedule, not general cron;
2. an additive engine-published Timer Start capability collection;
3. public identity `(processId, version, scheduleId)` and `PUT` idempotency;
4. immutable activation with derived due instant and explicit 60-second catch-up;
5. private intent-first persistence and exact describe-and-compare recovery;
6. service-returned execution identity retained privately and never reconstructed or published;
7. pre-start pause-describe-delete cancellation, with started winning every race;
8. terminal host Schedule cleanup after durable state;
9. no latest-version lookup, replacement, recurrence, message ingress, instance search, or semantic change.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
