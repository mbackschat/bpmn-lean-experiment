# BPM platform Message Start ingress proposal

## Status

**Draft, not approved, and not implemented.** This proposal selects the smallest Product 2 published Message Start ingress for M2. It adds an exact deployed-definition capability, one-target publication resource, durable retry and deduplication lifecycle, handle-free direct Workflow-start host boundary, HTTP-only UI, and independent live evidence. It changes no BPMN meaning, semantic profile, checked graph, Semantic Process IL, runtime state, command, observation, Workflow definition, or Lean theorem.

The [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) owns the product boundary, [ARCHITECTURE.md](ARCHITECTURE.md) owns package direction, the [Message Start Event specification](capsules/MESSAGE-START-EVENT-SPEC.md) owns semantic and direct-host meaning, and [PLAN.md](PLAN.md) owns sequencing.

## Product question

What is the smallest public Product 2 contract that publishes one payload-free Message Start against one exact deployed definition version, retries without creating a second semantic Process instance, reports the truthful outcome after ambiguous host delivery, and exposes no Temporal identity or new BPMN behavior?

## Selected increment

Product 2 adds one global publication resource identified by a caller-owned `publicationId`. The request selects exactly one deployed definition version and one complete registered Message Start capability. The platform validates the exact stored artifact and capability, reserves one semantic Process-instance identity, and asks Product 1 to start the existing semantic-lifetime Workflow with the existing `TriggerMessageStart` stimulus.

One publication has exactly one target and at most one accepted Process instance. There is no fanout, subscription registry, broker selection, tenant routing, payload, correlation key, running-instance delivery, recurrence, cancellation, deletion, or list operation. A later fanout feature requires its own target-set authority, parent and child receipts, partial-failure semantics, and deduplication policy rather than widening this resource implicitly.

## Public engine capability

Product 2 must not inspect a checked Message Start node or `initiateMessage` operation. Accepted compilation therefore widens the existing Product 1 capability projection:

```ts
type EngineOperationMessageChannel = DeepReadonly<{
  kind: "operationMessage";
  interfaceId: string;
  interfaceOperationId: string;
  messageId: string;
}>;

type EngineMessageStartCapability = DeepReadonly<{
  startEventId: string;
  channel: EngineOperationMessageChannel;
}>;

type EngineDefinitionStartCapabilities = DeepReadonly<{
  messageStarts: readonly EngineMessageStartCapability[];
  timerStarts: readonly EngineTimerStartCapability[];
}>;
```

The registered Message Start profile publishes its exact Start Event and complete operation-addressed channel. Every other current profile publishes an empty `messageStarts` collection. The collection shape preserves multiplicity without claiming that multiple Message Start Events are currently admitted. Product 2 requires exactly one capability equal to the request before reservation.

The platform engine gateway maps this Product 1 value into a platform-owned capability with the same public fields. `platform/contracts` never imports Product 1. `DeployedDefinitionVersion`, definition-module metadata, SQLite definition rows, and embedded definition snapshots widen atomically from exact `{ timerStarts }` to exact `{ messageStarts, timerStarts }`.

The repository remains pre-release. An existing database with the old capability shape fails at construction with the existing actionable schema-reset boundary. No compatibility decoder infers `messageStarts: []`, and no old Timer Start schedule row is silently reinterpreted.

## Public contract

The global public identity is `publicationId`, a caller-owned nonempty well-formed Unicode value encoded as one URI segment. The body is closed and repeats the complete immutable target so retry comparison does not depend on a mutable route context:

```ts
type PublicOperationMessageChannel = Readonly<{
  kind: "operationMessage";
  interfaceId: string;
  interfaceOperationId: string;
  messageId: string;
}>;

type PublicMessageStartCapability = Readonly<{
  startEventId: string;
  channel: PublicOperationMessageChannel;
}>;

type PutMessageStartPublicationRequest = Readonly<{
  definition: Readonly<{
    processId: string;
    version: number;
  }>;
  messageStart: PublicMessageStartCapability;
}>;

type MessageStartPublicationBase = Readonly<{
  publicationId: string;
  definition: DeployedDefinitionVersion;
  messageStart: PublicMessageStartCapability;
}>;

type MessageStartPublication =
  | (MessageStartPublicationBase & Readonly<{
      status: "pending";
      instance: null;
    }>)
  | (MessageStartPublicationBase & Readonly<{
      status: "accepted";
      instance: PublicProcessInstanceIdentity;
    }>)
  | (MessageStartPublicationBase & Readonly<{
      status: "indeterminate";
      instance: null;
    }>);
```

`accepted` means that Temporal durably accepted creation of the exact logical Process Workflow dispatch and Product 2 persisted that result. It does not mean that a Worker polled, that the Process reached its first wait, or that the Process completed. `pending` means that the durable intent has not yet reached a truthful terminal delivery classification. `indeterminate` means that a start call may have reached Temporal but no retained execution is available to prove acceptance. It is a non-success result and exposes no Process-instance identity.

The platform privately reserves a semantic Process-instance identity before host dispatch. It exposes that identity only after `accepted`; a reservation or ambiguous call is not a public Process instance. No response contains a Workflow ID, Run ID, task queue, Memo, command ID, checked graph, Semantic Process program, SDK handle, or Event History fact.

## HTTP surface

The definitions module adds exactly two routes:

| Method | Route | Meaning |
|---|---|---|
| `PUT` | `/api/v1/message-start-publications/{publicationId}` | Reserve and deliver one immutable exact-target publication, or return the same resource after an identical retry. |
| `GET` | `/api/v1/message-start-publications/{publicationId}` | Reconcile and return the durable publication resource. |

`PUT` accepts exactly `application/json`, applies a 4096-byte body ceiling, and uses the existing canonical JSON response media type. The first confirmed acceptance returns `201`; an identical retry of an accepted item returns `200`; pending or indeterminate delivery returns `202`. `GET` returns every known state as `200` and an unknown publication as the existing `404/notFound` body.

Reusing a `publicationId` with any changed definition version, Start Event, channel member, or reserved semantic identity returns `409` with the existing `{ error: { code: "conflict", message } }` shape and changes nothing. An unknown exact definition returns `404/notFound`. Malformed route identity, JSON, or exact keys return `400/invalidRequest`. A definition that does not publish exactly the selected complete capability returns `422/invalidRequest` before reservation and before any Workflow call. Oversized input returns `413/payloadTooLarge`, unsupported media returns `415/unsupportedMediaType`, and divergent retained host identity or unexpected persistence/service failure returns `500/internalFailure` without exposing private evidence.

There is no `DELETE`, collection route, replacement, retry-reset, or operator override. Accepted and indeterminate rows are durable tombstones. A caller who wants another legitimate Process instance uses another publication ID and creates another resource.

## Exact targeting and no fanout

The selected target is the request's exact `(processId, version, startEventId, channel)` tuple. The platform loads only that definition version, retrieves its exact artifact bytes, recompiles through Product 1, and requires equality of source ID, source SHA-256, byte length, semantic profile, Process ID, and the complete capability collection before reservation.

Deploying a later version cannot retarget a reserved or completed publication. Matching only `messageId`, only Message plus Interface, the latest version, every matching version, or every registered capability is invalid. The decisive fixture uses two versions of one Process with the same Message and Interface but different Interface Operations and different first User Tasks; a version-1 publication after version 2 exists must start only version 1.

No current definition activation policy, tenant policy, or subscription registry owns a legitimate multi-target set. Fanout is therefore exactly one target, not a hidden loop over catalog matches. This bounded contract can later coexist with a separate fanout resource without reinterpreting publications accepted here.

## Persistent lifecycle

The publication repository stores the complete immutable request and definition snapshot, one generated semantic Process-instance identity, one private semantic command ID, one private host Workflow address, one private dispatch-origin fingerprint, and a closed internal lifecycle:

```text
reserved -> starting -> accepted
                    \-> indeterminate
```

`reserved` proves that no host call has been attempted. A compare-and-set to `starting` commits before any possibly transmitted start RPC. `accepted` and `indeterminate` are durable terminal tombstones, except that a later exact retained description may promote `indeterminate` to `accepted`. No state transitions back to `reserved` or otherwise becomes dispatchable after `starting`.

The repository uses a new cohesive SQLite owner and table. `publication_id` is the primary key; semantic Process-instance identity and private Workflow address are independently unique. Definition and capability values are copied into the row. The implementation uses immediate transactions and compare-and-set transitions, but no database transaction remains open across a Product 1 or Temporal call.

## Reservation, retry, and recovery algorithm

The exact algorithm is:

1. Decode the route and body, load the exact deployed version and artifact bytes, recompile through Product 1, require exact stored identity and capability equality, and require the selected capability exactly once.
2. Run semantic and Temporal host admission against the exact `TriggerMessageStart` stimulus and program before reservation. Rejection returns `422` with zero publication rows and zero Workflow calls; stored-definition drift is an integrity failure.
3. Begin an immediate transaction. If `publicationId` exists, require complete immutable request equality and continue from its existing state. Otherwise generate and persist the semantic instance, command, private Workflow address, and dispatch-origin fingerprint in `reserved`, then commit.
4. A `reserved` reconciler may compare-and-set to `starting`, commit, and perform exactly one direct start call. This is the only dispatch edge.
5. Successful start acceptance moves `starting -> accepted`. A duplicate-address result or an ambiguous error does not authorize another start; reconcile by describing the existing private Workflow address without a Worker.
6. A retained description whose Workflow type, task queue, semantic instance address, and private Memo fingerprint all match moves `starting` or `indeterminate` to `accepted`. A divergent retained description is integrity failure.
7. A missing description after the call may have been transmitted moves `starting -> indeterminate`, or leaves `indeterminate` unchanged. Absence never authorizes redispatch. A future `GET` or identical `PUT` may promote the item if the exact execution becomes describable, but it may not create another execution.
8. Startup reconciles every `reserved`, `starting`, and `indeterminate` row before the HTTP server listens. It may dispatch only `reserved`; it applies the same describe-only rule to `starting` and `indeterminate`.

This state machine is intentionally at-most-once after the dispatch boundary. It prevents resurrection when Temporal accepted the start, the response was lost, the platform stayed down, and retention later removed the closed execution. Those facts are observationally identical to a request that never reached Temporal. The platform cannot truthfully manufacture an accepted receipt or retry without duplicate risk, so it retains `indeterminate`.

## Private host-intent comparison

The direct start call writes one private Memo field containing a domain-separated SHA-256 fingerprint over a canonical typed tuple of the logical dispatch origin:

- private fingerprint protocol version;
- Workflow type, deterministic Workflow address, task queue, duplicate-reuse policy, and no-Workflow-retry policy;
- source ID, source SHA-256, semantic profile, Process ID, and semantic Process-instance ID;
- stimulus kind, private command ID, Start Event ID, and all three operation-addressed channel identifiers.

The same immutable snapshot supplies both the fingerprint and the direct start arguments. The handle-free client describes and projects only Workflow type, task queue, Memo fingerprint, and retained status to Product 1. Product 2 receives a closed `matching`, `missing`, or `divergent` result rather than an SDK description or private identity.

This fingerprint proves the same admitted dispatch origin. It does not claim byte equality of Temporal DataConverter payloads or a canonical encoding of the complete `SemanticProcessProgram`. A compiler change that can alter program output for the same admitted source must change the private fingerprint protocol before deployment; an old ambiguous row with another protocol remains indeterminate. Full cross-release program equivalence and retained results beyond Temporal retention are excluded.

## Temporal hosting and refinement preflight

The durable ingress is the existing Process Workflow start with the existing `TriggerMessageStart` stimulus. There is no Signal, Update-With-Start, Schedule, Activity, Child Workflow, Workflow Timer, broker, or router Workflow in this path. Workflow creation remains Worker-independent, and normal semantic execution starts when a Worker later polls.

The preserved relation is unchanged from the Message Start Event specification: direct core execution and the hosted Workflow receive the same exact program and stimulus and reach the same public semantic state. Product 2 publication state, Memo, host address, retries, and the `indeterminate` outcome are outside BPMN state. `accepted` establishes durable host creation, not semantic progress.

Delivery order is defined only by each publication row's compare-and-set transitions. There is no FIFO or global order across distinct publication IDs. Concurrent identical requests converge on one row and at most one start call; conflicting reuse is rejected. Distinct publication IDs are independent and intentionally may create distinct Process instances. Temporal retry and Workflow identity remain host facts, and replay continues to use the unchanged Workflow implementation.

The smallest executable refinement witness keeps the Worker absent, accepts one exact publication, restarts the Product 2 server against the same SQLite store after injecting response loss, reconciles the retained Workflow through private description, starts a replacement Worker, and reaches the version-1 first User Task and terminal state. The witness fetches and replays history only inside the testkit evidence boundary and recursively proves that no public response contains a private host identifier.

## Stable rules and evidence

| Rule | Stable claim | Required executable evidence |
|---|---|---|
| `MINGRESS-CAPABILITY-01` | Accepted compilation publishes the exact Message Start Event and complete operation-addressed channel; other current profiles publish none. | Product 1 capability tests, strict platform decoder/type tests, exact schema-reset and round-trip tests. |
| `MINGRESS-TARGET-01` | One publication selects exactly one deployed definition version and one exact capability; later deployment and partial channel matches cannot retarget it. | Two-version fixture, latest-version mutation, Message-ID-only and changed-Interface-Operation mutations. |
| `MINGRESS-RESERVE-01` | The complete intent and one semantic identity commit before host dispatch, with no database transaction across the call. | SQLite reopen, uniqueness, immutable snapshot, compare-and-set, and crash-boundary tests. |
| `MINGRESS-DELIVERY-01` | Only `reserved -> starting` dispatches, and one publication causes at most one Workflow start. | Controlled host call counts, concurrent request test, direct-start substitution, and live Workflow inventory. |
| `MINGRESS-RETRY-01` | Identical retry converges on the same accepted resource and Process instance while conflicting identity reuse changes nothing. | Response-loss restart witness, repeated PUT/GET, fresh-instance-on-retry mutation, and conflict matrix. |
| `MINGRESS-INDETERMINATE-01` | A possibly transmitted call with no exact retained description becomes a durable non-success tombstone and is never redispatched. | Controlled retention-loss test, repeated recovery and restart test, missing-Memo and divergent-Memo mutations. |
| `MINGRESS-PUBLIC-01` | Public values are strict, deeply immutable, exact-version bound, and contain no Temporal identity or Memo. | Decoder/type mutation suite, recursive private-field scan, HTTP client identity-drift tests. |
| `MINGRESS-FANOUT-01` | One publication has one target and at most one accepted instance; no catalog fanout exists. | Multi-version catalog test and a mutation that starts an additional matching version. |
| `MINGRESS-REFINE-01` | An accepted publication uses the unchanged Message Start program/stimulus and reaches the exact core terminal state under the existing Workflow. | Worker-absent and replacement live witness, exact first wait, completion, history, replay, and no-Signal discriminator. |

The existing Message Start semantic, Lean, differential, and direct Temporal evidence remain regression floors. They are not counted as evidence that Product 2 routing, persistence, retry, or public receipts are correct.

## Package ownership and headroom

Product 1 gains a cohesive Message Start definition operation and a separate handle-free Temporal Message Start client. The compiler capability owner grows from `30/600`; the engine index is `111/600`; the existing definition-start client is `136/600` and remains the shared branded runtime owner rather than gaining an optional start-mode bag. The Workflow, Worker, protocol start stimulus, semantic core, checked graph, IL, and Lean files do not change.

The engine gateway first extracts generic capability mapping from the schedule-specific owner, then adds a Message Start gateway collaborator. The gateway index is `186/600`; the existing schedule gateway is `261/600` and retains only schedule behavior. Product 2 never imports the Temporal client directly.

`platform/contracts` adds cohesive Message Start capability, publication, decoder, route, and type-test owners. Existing definition contracts are `95/600`, their decoder is `124/600`, and the public index is `12/600`. The definitions module adds separate publication contracts, immutable values, service, SQLite repository, body reader, and HTTP route owners. Existing shared contracts are `146/600`, capability codec `75/600`, public projection `36/600`, and definition repository `309/600`. The existing schedule repository is already above the review target and must not grow.

The server composition root is `114/600` and wires recovery before listen. Before adding a third web client, the duplicated exact-definition snapshot comparison in `definitions-api.ts` (`276/600`) and `definition-schedule-api.ts` (`269/600`) is extracted into one focused tested owner. The new HTTP-only publication client and exact-version panel remain separate from `app.tsx` (`224/600`).

A new `showcase/m2-message-start-ingress` package owns the live and browser witnesses and is registered independently from the M1 deployment and M2 scheduling gates. It may import only public platform contracts, the production server, and the Temporal testkit evidence boundary selected by the package guard.

`what-binds` reports 20 guards plus one registry for Product 1 owners, 28 to 33 guards plus two or three registries for platform owners, 31 guards plus the documentation registry for this proposal, and 13 guards plus the showcase registry for the new evidence package. Source hygiene, package boundaries, pre-release architecture, exact schema/contract guards, project configuration, documentation reviewability, review policy, Markdown links, and verification entrypoint coverage are mandatory.

## Required, optional, and excluded functionality

Required:

- exact complete Message Start capability publication on every deployed definition;
- one global caller-owned publication identity and one exact target;
- strict public request, item, route, decoder, HTTP client, and UI;
- durable reservation, immutable retry comparison, at-most-once dispatch edge, accepted receipt, and indeterminate tombstone;
- pre-reservation exact recompilation plus semantic and host admission;
- Worker-independent direct Workflow start, private dispatch-origin Memo, describe-only ambiguous recovery, and replay;
- server restart recovery, controlled retention-loss evidence, two-version discrimination, private-ID exclusion, and separate live/browser showcase gates.

Optional after this increment:

- richer operator explanation for an indeterminate item without exposing private host evidence;
- an administrative retention policy for terminal platform tombstones, only if it cannot permit publication-ID reuse.

Excluded:

- Message payloads, variables, correlation keys, topic names, broker protocols, tenant routing, authorization, or credentials;
- subscription discovery, activation policy, catalog-wide routing, multiple targets, partial-success receipts, or fanout;
- running-instance Message delivery, Intermediate Catch Message, Receive Task, Signal-With-Start, Update-With-Start, router Workflows, Child Workflows, Activities, or Schedules;
- cancellation, deletion, replacement, list/search, recurrence, deadlines, TTL reuse, or manual retry reset;
- exact SDK payload-byte equality, canonical full-program serialization, transparent recovery beyond retained evidence, or a claim of globally exactly-once delivery;
- new BPMN source admission, semantic profile, checked graph, IL operation, core transition, public semantic observation, Workflow implementation, Lean proof, CIB relationship, or A12 behavior;
- instance search, which remains the final M2 platform increment.

## Acceptance and stop conditions

The proposal may enter implementation only after context-cold approval. Because it changes a public wire contract, stored capability schema, admission capability, and Temporal refinement claim, the first green Product 1 capability plus public contract, durable lifecycle, and host client is committed as a semantic checkpoint and sent to a new context-cold reviewer before UI and live evidence continue.

The increment closes only after the complete repository gate, cost/reflection record, exact-status updates, closure review, and graduation from `-PROPOSAL.md` to `-SPEC.md`. A warm closure review is eligible only when the approved checkpoint reviewer, descendant target, continuity manifest, and unchanged account, public contract, exclusions, and evidence strategy satisfy the guarded rule.

Stop and reopen this proposal if the direct client cannot provide Worker-independent exact retained description, if Product 1 cannot preserve the complete channel without exposing the program, if a no-redispatch tombstone cannot be persisted before recovery, or if the product requires unbounded retry-transparent accepted receipts. That stronger requirement needs an explicitly approved retained Schedule or router/Child-Workflow coordinator and is not a local retry change.

## Common-mode risks and nearest unsupported claim

Product 1 compilation and Product 2 deployment both depend on the same compiler, so exact source/profile/capability mutation tests must independently perturb the stored snapshot and the recompiled result. The public server, web client, and browser share the public decoder; raw HTTP fixtures and recursive private-field scans remain separate oracles. The live start and semantic terminal-state checks share the production Workflow, so direct core comparison and history replay remain separate evidence.

The nearest unsupported claim is that every ambiguous accepted start can eventually be reported as accepted. Temporal retention or operator deletion can erase the only host evidence before Product 2 persists acceptance. This increment preserves at-most-once delivery by reporting `indeterminate`; it does not claim globally exactly-once delivery or eventual success classification.

## Owner decisions

1. Use one global publication ID whose closed request names the exact deployed version and complete capability. This makes changed-target reuse a direct conflict and avoids a mutable routing context.
2. Exclude fanout. There is no current authority for a multi-version target set, and Message identity alone is insufficient because Interface Operation is semantically material.
3. Use the existing direct Workflow start rather than Signal, Schedule, Activity, router Workflow, or Child Workflow. This is the smallest host path that preserves the existing semantic account.
4. Commit `starting` before the call and never redispatch afterward. A missing retained execution becomes durable `indeterminate`, not success and not permission to try again.
5. Expose semantic Process-instance identity only after accepted host creation. Reservation and ambiguity are platform facts, not public Process instances.
6. Fingerprint the exact logical dispatch origin in private Memo and explicitly do not claim canonical full-program or SDK payload-byte equality.
7. Replace the pre-release capability schema atomically with exact `{ messageStarts, timerStarts }`; do not infer compatibility defaults.
8. Keep Message Start semantics, Workflow behavior, and the complete channel unchanged. This increment owns only Product 2 selection, delivery lifecycle, receipt, API, UI, and evidence.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
