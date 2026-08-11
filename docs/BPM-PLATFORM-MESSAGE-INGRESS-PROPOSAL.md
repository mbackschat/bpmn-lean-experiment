# BPM platform Message Start ingress proposal

## Status

**Owner-approved; first-green checkpoint implemented and pending independent semantic review.** The committed checkpoint adds the exact deployed-definition capability, strict public publication contract, shared SQLite schema epoch, durable retry and deduplication lifecycle, and handle-free direct Workflow-start host boundary. HTTP routes, server composition, UI, and live/browser evidence remain paused through checkpoint approval. The increment changes no BPMN meaning, semantic profile, checked graph, Semantic Process IL, runtime state, command, observation, Workflow definition, or Lean theorem.

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

The repository remains pre-release. A new shared `database-schema-epoch.ts` owner sets one SQLite `user_version` epoch only for an empty definitions database and requires that epoch before any definitions, schedule, or publication repository creates or reads a table. A database with existing Product 2 tables and the prior epoch fails at construction with `DefinitionSchemaResetRequiredError`. Construction-time fixtures retain both an old definition row and an old terminal schedule row containing `{ timerStarts }` and require the actionable reset error. No compatibility decoder infers `messageStarts: []`, and no old Timer Start schedule row survives construction for later failure.

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

`accepted` means that Temporal durably accepted a Workflow at the reserved private address through the production start constructor and Product 2 persisted that result. Immediate acceptance comes from the start response. Recovery acceptance comes from a retained Workflow with the expected type, task queue, address, and private intent marker, plus a separately guarded production-constructor invariant. The retained description does not independently prove the transmitted Workflow arguments or policies. `accepted` does not mean that a Worker polled, that the Process reached its first wait, or that the Process completed. `pending` means that the durable intent has not yet reached a truthful terminal delivery classification. `indeterminate` means that a start call may have reached Temporal but no retained execution is available to establish acceptance. It is a non-success result and exposes no Process-instance identity.

The platform privately reserves a semantic Process-instance identity before host dispatch. It exposes that identity only after `accepted`; a reservation or ambiguous call is not a public Process instance. No response contains a Workflow ID, Run ID, task queue, Memo, command ID, checked graph, Semantic Process program, SDK handle, or Event History fact.

## HTTP surface

The definitions module adds exactly two routes:

| Method | Route | Meaning |
|---|---|---|
| `PUT` | `/api/v1/message-start-publications/{publicationId}` | Reserve and deliver one immutable exact-target publication, or return the same resource after an identical retry. |
| `GET` | `/api/v1/message-start-publications/{publicationId}` | Reconcile and return the durable publication resource. |

`PUT` accepts exactly `application/json`, applies a 4096-byte body ceiling, and uses the existing canonical JSON response media type. The first confirmed acceptance returns `201`; an identical retry of an accepted item returns `200`; pending or indeterminate delivery returns `202`. `GET` returns every public state as `200`, an integrity-failed row as `500/internalFailure`, and an unknown publication as the existing `404/notFound` body.

Reusing a `publicationId` with any changed public definition version, Start Event, or channel member returns `409` with the existing `{ error: { code: "conflict", message } }` shape and changes nothing. Privately generated semantic identity, Workflow address, fingerprint protocol, or fingerprint drift is an integrity failure and returns `500/internalFailure`, never a public conflict. An unknown exact definition returns `404/notFound`. Malformed route identity, JSON, or exact keys return `400/invalidRequest`. A definition that does not publish exactly the selected complete capability returns `422/invalidRequest` before reservation and before any Workflow call. Oversized input returns `413/payloadTooLarge`, unsupported media returns `415/unsupportedMediaType`, and divergent retained host identity or unexpected persistence/service failure returns `500/internalFailure` without exposing private evidence.

There is no `DELETE`, collection route, replacement, retry-reset, or operator override. Accepted and indeterminate rows are durable tombstones. A caller who wants another legitimate Process instance uses another publication ID and creates another resource.

## Exact targeting and no fanout

The selected target is the request's exact `(processId, version, startEventId, channel)` tuple. The platform loads only that definition version, retrieves its exact artifact bytes, recompiles through Product 1, and requires equality of source ID, source SHA-256, byte length, semantic profile, Process ID, and the complete capability collection before reservation.

Deploying a later version cannot retarget a reserved or completed publication. Matching only `messageId`, only Message plus Interface, the latest version, every matching version, or every registered capability is invalid. The decisive fixture uses two versions of one Process with the same Message and Interface but different Interface Operations and different first User Tasks; a version-1 publication after version 2 exists must start only version 1.

No current definition activation policy, tenant policy, or subscription registry owns a legitimate multi-target set. Fanout is therefore exactly one target, not a hidden loop over catalog matches. This bounded contract can later coexist with a separate fanout resource without reinterpreting publications accepted here.

## Persistent lifecycle

The publication repository stores the complete immutable request and definition snapshot, one generated semantic Process-instance identity, one private semantic command ID, one private host Workflow address, one private intent-marker protocol version and digest, and a closed internal lifecycle:

```text
reserved -> starting -> accepted
                    \-> indeterminate
reserved | starting | accepted | indeterminate -> integrityFailure
```

`reserved` proves that no host call has been attempted. A compare-and-set to `starting` commits before any possibly transmitted start RPC. `accepted` and `indeterminate` are durable no-dispatch public terminal states, except that a later matching retained description may promote `indeterminate` to `accepted` and revalidation of any stored state may invalidate it to internal `integrityFailure`. `integrityFailure` is a durable non-public tombstone whose `PUT` and `GET` both return `500/internalFailure`. No state transitions back to `reserved` or otherwise becomes dispatchable after `starting`.

The repository uses a new cohesive SQLite owner and table. `publication_id` is the primary key; semantic Process-instance identity and private Workflow address are independently unique. Definition and capability values are copied into the row. The implementation uses immediate transactions and compare-and-set transitions, but no database transaction remains open across a Product 1 or Temporal call.

## Reservation, retry, and recovery algorithm

The exact algorithm is:

1. Decode the route and body, load the exact deployed version and artifact bytes, recompile through Product 1, require exact stored identity and capability equality, and require the selected capability exactly once.
2. Run semantic and Temporal host admission against the exact `TriggerMessageStart` stimulus and program before reservation. Rejection returns `422` with zero publication rows and zero Workflow calls; stored-definition drift is an integrity failure.
3. Begin an immediate transaction. If `publicationId` exists, require complete immutable public-request equality, then independently validate every stored private derived value and continue from its existing state. A changed public field is conflict; private drift is integrity failure. Otherwise generate and persist the semantic instance, command, private Workflow address, intent-marker protocol version, and digest in `reserved`, then commit.
4. A `reserved` reconciler may compare-and-set to `starting`, commit, and perform exactly one direct start call. This is the only dispatch edge.
5. A production-constructor failure before SDK invocation moves `starting -> integrityFailure` and returns `500` without a Workflow call. Successful start acceptance moves `starting -> accepted`. `WorkflowExecutionAlreadyStartedError`, timeout, cancellation, transport failure, or another error after SDK invocation does not establish success or authorize another start; reconcile by describing the existing private Workflow address without a Worker.
6. A retained description whose Workflow type, task queue, semantic instance address, intent-marker protocol, and Memo digest all match moves `starting` or `indeterminate` to `accepted` under the separately tested constructor invariant. A divergent retained description moves to internal `integrityFailure`.
7. `WorkflowNotFoundError` from an available describe call after the start may have been transmitted moves `starting -> indeterminate`, or leaves `indeterminate` unchanged. Any other describe failure leaves `starting` or `indeterminate` unchanged and returns `500`; unavailable evidence is not absence. A future `GET` or identical `PUT` may promote the item if the matching execution becomes describable, but it may not create another execution.
8. Startup reconciles every `reserved`, `starting`, and `indeterminate` row before the HTTP server listens. It may dispatch only `reserved`; it applies the same describe-only rule to `starting` and `indeterminate`.

This state machine is intentionally at-most-once after the dispatch boundary. It prevents resurrection when Temporal accepted the start, the response was lost, the platform stayed down, and retention later removed the closed execution. Those facts are observationally identical to a request that never reached Temporal. The platform cannot truthfully manufacture an accepted receipt or retry without duplicate risk, so it retains `indeterminate`.

## Closed delivery failure matrix

| Event | Durable row after the attempt | May dispatch? | HTTP result |
|---|---|---:|---|
| Unknown definition, malformed request, or capability/admission mismatch before reservation | no row | no | existing `400`, `404`, or `422` body |
| Existing publication with changed public request fields | existing row unchanged | no | `409/conflict` |
| Stored generated identity, address, protocol, or digest drift | `integrityFailure` | no | `500/internalFailure` |
| Reservation or `reserved -> starting` commit fails | no row or prior `reserved` row | only a later successful `reserved -> starting` CAS | `500/internalFailure` |
| Production constructor fails before SDK invocation | `integrityFailure` | no | `500/internalFailure` |
| Start returns success and `accepted` persistence succeeds | `accepted` | no | first resource `201`, identical retry `200` |
| Start returns success but `accepted` persistence fails | prior `starting` row | no | `500/internalFailure`; later describe-only reconciliation |
| Start throws `WorkflowExecutionAlreadyStartedError`, timeout, cancellation, transport, or another post-invocation error | `starting` | no | continue immediately to describe; otherwise the applicable describe result below |
| Describe returns matching type, task queue, address, protocol, and Memo digest | `accepted` | no | first resource `201`, existing resource `200` |
| Describe throws `WorkflowNotFoundError` | `indeterminate` | no | `PUT` `202`; `GET` `200` |
| Describe fails for authentication, deadline, transport, service, decoding, or another non-not-found reason | prior `starting` or `indeterminate` row | no | `500/internalFailure` |
| Describe returns a divergent retained Workflow | `integrityFailure` | no | `500/internalFailure` |
| Persistence of `accepted`, `indeterminate`, or `integrityFailure` fails | prior row | no after `starting` | `500/internalFailure` |
| Retry or restart observes `accepted` | `accepted` | no | `200` |
| Retry or restart observes `indeterminate` | `indeterminate`, unless later matching description promotes it | no | `PUT` `202`, `GET` `200`, or `200` after promotion |
| Retry or restart observes `integrityFailure` | `integrityFailure` | no | `500/internalFailure` |

An operation deadline never proves that the underlying RPC was cancelled before transmission. Once `starting` commits, all start exceptions therefore enter describe-only reconciliation. A non-not-found describe failure never causes an `indeterminate` transition merely because evidence is unavailable.

## Private host-intent comparison

The direct start call writes one private Memo record containing an explicit protocol version and a domain-separated SHA-256 marker over a canonical typed tuple of the logical dispatch intent:

- Workflow type, deterministic Workflow address, task queue, `REJECT_DUPLICATE` reuse policy, `FAIL` running-conflict policy, and absent Workflow retry policy;
- source ID, source SHA-256, semantic profile, Process ID, and semantic Process-instance ID;
- stimulus kind, private command ID, Start Event ID, and all three operation-addressed channel identifiers.

The Product 1 constructor snapshots the stimulus and program once, derives the marker from the stable origin fields, and supplies those same snapshots as the two Workflow arguments. A recording-client oracle asserts the complete constructed SDK request. Correct-Memo mutations independently replace the stimulus, program, retry policy, reuse policy, and running-conflict policy and must fail that constructor oracle or the resulting live semantic discriminator. The handle-free client describes and projects only Workflow type, task queue, Memo protocol and digest, and retained status to Product 1. Product 2 receives a closed matching-marker, missing, divergent, or unavailable result rather than an SDK description or private identity.

The marker identifies the caller-declared intent but is not independent proof of the transmitted arguments or policies because Memo is caller-supplied metadata. Recovery acceptance relies on both the matching-marker observation and the guarded production-constructor invariant. It does not claim byte equality of Temporal DataConverter payloads or a canonical encoding of the complete `SemanticProcessProgram`. A compiler or constructor change that can alter program output or start options for the same admitted source must change the private protocol before deployment; an old ambiguous row with another protocol remains indeterminate. Full cross-release program equivalence and retained results beyond Temporal retention are excluded.

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
| `MINGRESS-INDETERMINATE-01` | A possibly transmitted call with an available not-found description becomes a durable non-success tombstone and is never redispatched; unavailable describe leaves the prior no-redispatch state. | Controlled retention-loss, describe-unavailable, repeated recovery, restart, missing-Memo, divergent-Memo, and persistence-failure tests. |
| `MINGRESS-PUBLIC-01` | Public values are strict, deeply immutable, exact-version bound, and contain no Temporal identity or Memo. | Decoder/type mutation suite, recursive private-field scan, HTTP client identity-drift tests. |
| `MINGRESS-FANOUT-01` | One publication has one target and at most one accepted instance; no catalog fanout exists. | Multi-version catalog test and a mutation that starts an additional matching version. |
| `MINGRESS-REFINE-01` | The production constructor uses the unchanged Message Start program/stimulus and exact host policies, and an accepted publication reaches the exact core terminal state under the existing Workflow. | Complete recording-client request oracle; correct-Memo/wrong-stimulus, wrong-program, wrong-retry, wrong-reuse, and wrong-conflict-policy mutations; Worker-absent and replacement live witness, exact first wait, completion, history, replay, and no-Signal discriminator. |

The existing Message Start semantic, Lean, differential, and direct Temporal evidence remain regression floors. They are not counted as evidence that Product 2 routing, persistence, retry, or public receipts are correct.

## Package ownership and headroom

The exact growing owners and mechanically measured headroom are:

| Path | Responsibility | Current owner bound | `what-binds` |
|---|---|---:|---:|
| `packages/engine-api/src/definition-capabilities.ts` | Add exact Message Start capability projection. | `30/600` | 20 guards, 1 registry |
| `packages/engine-api/src/index.ts` | Export the new Product 1 operation. | `111/600` | 20 guards, 1 registry |
| `packages/temporal-adapter/client/src/definition-start-client.ts` | Retain the shared branded lazy runtime only. | `136/600` | 20 guards, 1 registry |
| `packages/temporal-adapter/client/package.json` | Export the selected `message-start` client subpath. | declarative manifest | 21 guards, 1 registry |
| `platform/foundation/engine-gateway/src/index.ts` | Compose the new host and export its closed contract. | `186/600` | 33 guards, 3 registries |
| `platform/foundation/engine-gateway/src/definition-schedule-gateway.ts` | Relinquish generic capability mapping; retain Schedule behavior. | `261/600` | 28 guards, 3 registries |
| `platform/contracts/src/definitions.ts` | Widen public definition capabilities. | `95/600` | 28 guards, 2 registries |
| `platform/contracts/src/deployed-definition-decoder.ts` | Decode exact `{ messageStarts, timerStarts }`. | `124/600` | 28 guards, 2 registries |
| `platform/contracts/src/index.ts` | Export new public contracts. | `12/600` | 33 guards, 2 registries |
| `platform/modules/definitions/src/contracts.ts` | Widen internal capability and repository contracts. | `146/600` | 28 guards, 3 registries |
| `platform/modules/definitions/src/definition-capabilities.ts` | Own strict capability clone, equality, and JSON encoding. | `75/600` | 28 guards, 3 registries |
| `platform/modules/definitions/src/definition-public-values.ts` | Project complete public capabilities. | `36/600` | 28 guards, 3 registries |
| `platform/modules/definitions/src/sqlite-definition-repository.ts` | Invoke the shared database epoch and retain definition rows. | `309/600` | 28 guards, 3 registries |
| `platform/modules/definitions/src/sqlite-definition-schedule-repository.ts` | Invoke the shared epoch and decode widened embedded snapshots. | `574/600` | 28 guards, 3 registries |
| `platform/modules/definitions/src/index.ts` | Export the publication service, repository, routes, contracts, and shared schema error. | `65/600` | 33 guards, 3 registries |
| `platform/apps/server/src/composition.ts` | Wire publication recovery before listen. | `114/600` | 28 guards, 3 registries |
| `platform/apps/web/src/definitions-api.ts` | Use extracted exact-definition comparison. | `276/600` | 28 guards, 3 registries |
| `platform/apps/web/src/definition-schedule-api.ts` | Use extracted exact-definition comparison. | `269/600` | 28 guards, 3 registries |
| `platform/apps/web/src/app.tsx` | Compose the exact-version publication panel. | `224/600` | 28 guards, 3 registries |

The exact new cohesive source owners are:

- Product 1 and Temporal: `packages/engine-api/src/definition-message-start.ts`, `packages/temporal-adapter/client/src/message-start-client.ts`, and their same-named focused tests, each bound by 20 guards and one package registry.
- Engine gateway: `platform/foundation/engine-gateway/src/definition-capabilities.ts`, `platform/foundation/engine-gateway/src/definition-message-start-gateway.ts`, and `platform/foundation/engine-gateway/test/definition-message-start-gateway.test.ts`, each bound by 28 guards and three registries.
- Public contract: `platform/contracts/src/message-start-publications.ts`, `message-start-publication-decoders.ts`, `message-start-publication-routes.ts`, and their runtime and type-test partners, each bound by 28 guards and two registries.
- Definitions module: `platform/modules/definitions/src/database-schema-epoch.ts`, `message-start-publication-contracts.ts`, `message-start-publication-values.ts`, `message-start-publication-service.ts`, `sqlite-message-start-publication-repository.ts`, `message-start-publication-http-routes.ts`, and their focused service, SQLite, and HTTP tests, each bound by 28 guards and three registries.
- Web: one focused exact-definition comparison owner and test, then separate HTTP-only publication client, panel, and tests under `platform/apps/web`; each platform path is bound by 28 guards and three registries.
- Showcase: `showcase/m2-message-start-ingress/README.md` is bound by 13 guards and one registry; `package.json` by 8 and one; `tsconfig.json` by 6 and one; `test/http-support.ts` and `test/temporal-support.ts` by 4 and one each; and `playwright.config.ts`, `src/host.ts`, `test/m2-message-start-ingress.test.ts`, and `e2e/message-start-ingress.spec.ts` by 3 and one each.
- Governance: this proposal is bound by 31 guards and `docs/README.md`.

The schedule repository has 26 lines of measured headroom, so its only feature edit is the shared epoch invocation and widened decoder use; a larger change requires extraction. The Workflow, Worker, protocol start stimulus, semantic core, checked graph, IL, and Lean files do not change. Product 2 never imports the Temporal client directly. Before adding a third web client, the duplicated exact-definition comparison is extracted and tested rather than copied again.

Source hygiene, Product 1/Product 2 and Temporal package boundaries, pre-release architecture, exact schema/contract guards, project configuration, documentation reviewability, review policy, Markdown links, and verification entrypoint coverage are mandatory.

## Required, optional, and excluded functionality

Required:

- exact complete Message Start capability publication on every deployed definition;
- one global caller-owned publication identity and one exact target;
- strict public request, item, route, decoder, HTTP client, and UI;
- durable reservation, immutable retry comparison, at-most-once dispatch edge, accepted receipt, and indeterminate tombstone;
- pre-reservation exact recompilation plus semantic and host admission;
- Worker-independent direct Workflow start, private versioned intent-marker Memo, separately guarded start construction, describe-only ambiguous recovery, and replay;
- server restart recovery, controlled retention-loss evidence, two-version discrimination, private-ID exclusion, and separate live/browser showcase gates.

Optional after this increment:

- richer operator explanation for an indeterminate item without exposing private host evidence;
- an administrative retention policy for terminal platform tombstones, only if it cannot permit publication-ID reuse.

Excluded:

- Message payloads, variables, correlation keys, topic names, broker protocols, tenant routing, authorization, or credentials;
- subscription discovery, activation policy, catalog-wide routing, multiple targets, partial-success receipts, or fanout;
- running-instance Message delivery, Intermediate Catch Message, Receive Task, Signal-With-Start, Update-With-Start, router Workflows, Child Workflows, Activities, or Schedules;
- cancellation, deletion, replacement, list/search, recurrence, deadlines, TTL reuse, or manual retry reset;
- exact SDK payload-byte equality, canonical full-program serialization, independent argument proof from Memo, transparent recovery beyond retained evidence, or a claim of globally exactly-once delivery;
- new BPMN source admission, semantic profile, checked graph, IL operation, core transition, public semantic observation, Workflow implementation, Lean proof, CIB relationship, or A12 behavior;
- instance search, which remains the final M2 platform increment.

## Acceptance and stop conditions

The proposal may enter implementation only after context-cold approval. Because it changes a public wire contract, stored capability schema, admission capability, and Temporal refinement claim, the first green Product 1 capability plus public contract, durable lifecycle, and host client is committed as a semantic checkpoint and sent to a new context-cold reviewer before UI and live evidence continue.

The increment closes only after the complete repository gate, cost/reflection record, exact-status updates, closure review, and graduation from `-PROPOSAL.md` to `-SPEC.md`. A warm closure review is eligible only when the approved checkpoint reviewer, descendant target, continuity manifest, and unchanged account, public contract, exclusions, and evidence strategy satisfy the guarded rule.

Stop and reopen this proposal if the direct client cannot provide Worker-independent exact retained description, if Product 1 cannot preserve the complete channel without exposing the program, if a no-redispatch tombstone cannot be persisted before recovery, or if the product requires unbounded retry-transparent accepted receipts. That stronger requirement needs an explicitly approved retained Schedule or router/Child-Workflow coordinator and is not a local retry change.

## Common-mode risks and nearest unsupported claim

Product 1 compilation and Product 2 deployment both depend on the same compiler, so exact source/profile/capability mutation tests must independently perturb the stored snapshot and the recompiled result. The Memo marker and Workflow arguments also share one production constructor; correct-marker mutations with wrong arguments and policies therefore test the complete captured SDK request and the resulting live semantic discriminator rather than treating Memo as an independent oracle. The capability encoder and decoder share one representation, so the separate SQLite epoch fixtures prove legacy-row rejection before decoding. The public server, web client, and browser share the public decoder; raw HTTP fixtures and recursive private-field scans remain separate oracles. The live start and semantic terminal-state checks share the production Workflow, so direct core comparison and history replay remain separate evidence.

The nearest unsupported claim is that a matching retained Memo independently establishes the exact transmitted Workflow arguments and policies. It does not; recovery acceptance also relies on the guarded production-constructor invariant. Beyond that boundary, the next unsupported claim is that every ambiguous accepted start can eventually be reported as accepted. Temporal retention or operator deletion can erase the only host evidence before Product 2 persists acceptance, so this increment reports `indeterminate` rather than claiming globally exactly-once delivery or eventual success classification.

## Owner decisions

1. Use one global publication ID whose closed request names the exact deployed version and complete capability. This makes changed-target reuse a direct conflict and avoids a mutable routing context.
2. Exclude fanout. There is no current authority for a multi-version target set, and Message identity alone is insufficient because Interface Operation is semantically material.
3. Use the existing direct Workflow start rather than Signal, Schedule, Activity, router Workflow, or Child Workflow. This is the smallest host path that preserves the existing semantic account.
4. Commit `starting` before the call and never redispatch afterward. A missing retained execution becomes durable `indeterminate`, not success and not permission to try again.
5. Expose semantic Process-instance identity only after accepted host creation. Reservation and ambiguity are platform facts, not public Process instances.
6. Store a versioned private intent marker in Memo, guard the complete production start request separately, and do not claim that Memo proves arguments, canonical full-program content, or SDK payload bytes.
7. Replace the pre-release capability schema atomically with exact `{ messageStarts, timerStarts }` and one SQLite database epoch checked before table access; do not infer compatibility defaults.
8. Keep Message Start semantics, Workflow behavior, and the complete channel unchanged. This increment owns only Product 2 selection, delivery lifecycle, receipt, API, UI, and evidence.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4223ded` | `fork-turns-none` | `approve-with-required-edits` | `ce180a9` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
