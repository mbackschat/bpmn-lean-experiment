# BPM platform Process-instance search specification

## Status

**Implemented, closure-reviewed, evidence-closed, and graduated.** Closure target `8a87cf4` passed the complete repository gate and guarded warm-continuity review; correction `326dde5` closed the sole cost-accounting finding. The strict public route, production server composition, HTTP-only global panel, three-producer live witness, restart and paging evidence, and browser acceptance retain the independently approved first-green contract at `5bd9d13`. This is the final closed M2 Product 2 increment. It adds no BPMN meaning, semantic profile, checked graph, Semantic Process IL, runtime state, command, Workflow behavior, Lean theorem, CIB relationship, or Temporal discovery mechanism.

The implemented [shared-persistence addendum](BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md) preserves the append-only identity index and stable cursor order in PostgreSQL. Confirmed registration delivery is lease-fenced and bounded, shared API replicas read the same index, and readiness performs no bootstrap sweep. The SQLite repository, close lifecycle, and startup passages below describe local mode only.

The [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) owns the product boundary and states that cross-instance discovery is a platform problem. [PROJECT-DESIGN.md](PROJECT-DESIGN.md#what-the-platform-may-consume) forbids reconstructing semantic facts from Temporal Event History, state differences, or platform guesses. [ARCHITECTURE.md](ARCHITECTURE.md#business-modules) assigns instance operations and monitoring to the `operate` module. [PLAN.md](PLAN.md) owns sequencing.

## Product question

What is the smallest truthful Process-instance search surface Product 2 can provide from facts it already receives, without pretending it knows current semantic state?

The engine currently publishes an exact semantic Process-instance identity and deployed definition after a confirmed start. It does not publish a trustworthy current running/completed status, start timestamp, completion timestamp, transition record, token position, or cross-instance feed. M2 search therefore indexes only confirmed start facts and omits every absent fact.

## Selected account

A search item means exactly this:

> The platform durably accepted one exact engine-confirmed public Process-instance identity from an admitted producer.

The current producer set is exactly:

1. exact-version definition start with its strict canonical command returning `started`;
2. one-shot definition Schedule reaching `started`;
3. Message Start publication reaching `accepted`.

Pending, scheduled, missed, cancelled, rejected, indeterminate, integrity-failed, and host-only executions create no search item. Search absence is not proof that no Temporal Workflow exists. This M2 specification records the boundary implemented at its closure target: the then-current non-idempotent direct-start route could lose its response after host acceptance but before Product 2 recorded success. The later [M3 human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md#selected-account) supersedes that producer failure boundary with a reviewed durable direct-start reservation, private intent Memo, describe-only recovery, and one shared confirmed-start publication lifecycle. The M2 evidence claim remains historical to its immutable target.

Instances started through the engine runner, a Temporal client, or another adopter outside the Product 2 public API are absent under the current producer set. Adding an engine publication feed is a separate public-observation change and requires its own reviewed contract; the identity-only search result does not prevent that later producer addition.

## Public contract

The public contract reuses the existing immutable public Process-instance identity and adds only one request and one page:

```ts
type ProcessInstanceSearchRequest = Readonly<{
  processInstanceId?: string;
  processId?: string;
  version?: number;
  sourceSha256?: string;
  cursor?: string;
  limit?: number;
}>;

type ProcessInstanceSearchPage = Readonly<{
  instances: ReadonlyArray<PublicProcessInstanceIdentity>;
  nextCursor: string | null;
}>;
```

`PublicProcessInstanceIdentity` remains the single owner of semantic instance plus exact deployed-definition identity. Search adds no origin, lifecycle status, or timestamp.

All nested fields are compile-time immutable. Strict unknown decoders reject missing, extra, empty, malformed, unsafe-number, wrong-union, and private host fields. The response decoder reuses the existing exact public Process-instance decoder, so source identity, semantic profile, Process ID, version, and both start-capability collections remain complete.

## Search and cursor semantics

`GET /api/v1/process-instances` is the only new route. It accepts each of `processInstanceId`, `processId`, `version`, `sourceSha256`, `cursor`, and `limit` at most once and rejects every unknown query key.

The first four filters are optional exact matches. `sourceSha256` is exactly 64 lowercase hexadecimal characters. There is no substring, fuzzy, normalized, case-insensitive, variable, task, status, timestamp, payload, origin, or full-text search. `version` is a positive safe integer. `limit` defaults to 50 and is bounded to 1 through 100.

Results use one private positive safe insertion ordinal, newest first. The public cursor is an opaque versioned encoding of the last returned ordinal. A later request returns only records with smaller ordinals. New insertions therefore do not duplicate or skip older rows already behind a cursor. Rows are append-only and never deleted by this increment. The response exposes neither the ordinal nor a total count.

A cursor may be combined with any filter because it means one global insertion boundary, not a digest of the prior request. The client preserves filters while paging, but the server contract remains well-defined if an external client changes them.

## Durable index and integrity

The first implemented `operate` module owns one separate `process-instances.sqlite` database under the configured platform data directory. Keeping the read index in its owning module avoids coupling its schema to the definitions module's `definitions.sqlite` lifecycle. The database has its own pre-release epoch and strict schema check.

Each row stores:

- one private insertion ordinal;
- one globally unique semantic `processInstanceId`;
- the exact public deployed-definition snapshot;
- indexed copies of Process ID, version, and source digest for exact filtering.

The repository enforces one Process-instance identity globally. Re-recording the byte-equivalent public fact is idempotent. Reusing the same Process-instance identity with a changed definition, source, profile, or capabilities is an integrity failure. The full definition snapshot is decoded and compared on every read rather than trusting filter columns independently.

Independent repository connections preserve those outcomes under a same-identity race. Concurrent byte-equivalent records both resolve idempotently to one row and one ordinal. Concurrent conflicting records produce one winner and one classified integrity failure, leaving the winner byte-identical and unchanged.

The index is not an engine source of truth and is not a transition-record projection. It is an append-only Product 2 registry of confirmed starts. Deleting or corrupting its database loses or blocks search but does not alter an engine Process. Rebuild from engine Event History or Temporal Visibility is prohibited. Backfill of starts that predate this feature is excluded.

## Producer integration and failure boundary

The definitions module owns one output port accepting a `PublicProcessInstanceIdentity`. The server composition injects the `operate` service into the existing direct-start, Schedule, and Message-publication services without creating a module-to-module import.

Each service records only after its existing host or durable lifecycle has produced the confirmed state, and before it returns the public success containing that instance:

- direct start records after engine result `started` and before HTTP `201`;
- Schedule projection records only state `started` and before a successful response exposing the instance;
- Message publication projection records only state `accepted` and before a successful response exposing the instance.

Schedule and publication retries re-project the same confirmed fact and therefore repair a previous index-write failure idempotently. Their existing durable resource identities remain authoritative for retry. At this M2 closure target, direct start has no caller-owned idempotency identity, retained receipt, or describe reconciliation, so an index-write failure after host acceptance remains the explicit ambiguity named above and returns no successful public start response. The M3 human-work specification supersedes the current implementation boundary with its durable shared producer lifecycle; it does not retroactively change the evidence claimed by this specification.

A recorder failure never yields a public success that exposes the unrecorded instance. Direct start leaves no index row and returns `500` with the canonical `internalFailure` body rather than `201`. A Schedule or Message-publication response that would first expose its durable `started` or `accepted` instance leaves no index row and returns its existing route-specific `500`/`internalFailure` response; retrying that exact durable resource records one byte-equivalent identity and then succeeds.

No database transaction spans a host call or crosses the `definitions` and `operate` databases. The index write is synchronous and atomic within its own database.

## HTTP and UI

The `operate` module owns the search service, SQLite repository, and Fetch-compatible route contribution. The server composes it before the generic not-found path and closes it with the other repositories.

The HTTP-only React client owns strict route construction, decoding, filter-to-response checks, duplicate Process-instance refusal across pages, and cursor-preserving pagination. The global Process-instance panel exposes exact Process-instance, Process ID, version, source ID and digest, and semantic profile. It labels the list as confirmed starts and does not display a running/completed badge or inferred time.

The UI provides exact filters for Process-instance ID, Process ID, version, and source digest, plus search and load-more actions. Definition links may use existing public routes, but instance detail, diagram overlay, task state, and history remain absent.

## Temporal hosting and refinement preflight

This increment adds no Temporal client, Workflow, Worker, Query, Update, Signal, Schedule, Search Attribute, Visibility, Memo, Event History, or replay mechanism at its immutable M2 closure target. The later M3 human-work specification adds a private direct-start Memo and handle-free describe contract as a separately governed replacement of the producer failure boundary; those facts remain excluded from the public search item and do not broaden this M2 evidence claim.

The smallest live witness starts one instance through each admitted producer path using the production HTTP server and real existing Temporal hosting, then searches only through the new public API. Worker absence or replacement remains owned by the existing scheduling and Message ingress specifications and is not re-proved here.

The nearest realistic wrong account is a search implementation backed by Temporal Visibility or Event History. The product-boundary guard must reject those imports, and the witness must recursively reject Workflow IDs, Run IDs, task queues, Memo, history, and insertion ordinals from every public response and browser surface.

## Rules and evidence

| Rule | Required evidence | Separating failure |
|---|---|---|
| `PSEARCH-FACT-01` | Direct start, started Schedule, and accepted Message publication each record one exact public identity before success returns | Omitting any one producer makes the three-receipt identity set fail |
| `PSEARCH-RECORD-01` | Throwing recorder faults on direct start, Schedule, and Message publication leave no row and suppress public success; retry of each durable Schedule/publication resource repairs to one record | Catching recorder failure and returning `201` or an instance-bearing `200`, or duplicating the repaired row, fails |
| `PSEARCH-EXACT-01` | Repository reopen and public decoder preserve full definition/source/profile/capability identity | Same Process-instance ID with changed version, source digest, or capability is rejected |
| `PSEARCH-RACE-01` | Two independent connections race equivalent and conflicting same-ID records | Select-then-insert admits duplicates, two ordinals, an unclassified database error, or replacement of the winning bytes |
| `PSEARCH-STATE-01` | Pending, scheduled, missed, cancelled, rejected, indeterminate, and integrity-failed inputs create no item | Treating resource existence as a started Process fails focused service tests |
| `PSEARCH-PAGE-01` | Newest-first limit-plus-one paging remains stable when a newer row is inserted between pages | Offset pagination duplicates or skips an older row |
| `PSEARCH-BOUNDARY-01` | Product and Temporal boundary guards plus recursive public-value scan | Any Workflow/Run/task-queue/Memo/history/private-ordinal field fails |
| `PSEARCH-UI-01` | Browser search and exact filters render three distinct Process instances and their exact definitions | Aliasing Process ID, semantic instance ID, source digest, or definition version fails field-specific assertions |

The live witness uses production public routes to create all three records, restarts the server over the same index, checks stable pagination and each exact filter, and proves a direct engine start outside Product 2 creates no search row. The browser witness uses the production web panel against the same public contract and never calls a private support endpoint.

## Required, optional, and excluded functionality

Required:

- exact immutable public contract, strict decoders, and safe route builder;
- append-only SQLite index with strict schema, idempotency, collision refusal, exact snapshots, and cursor paging;
- all three confirmed Product 2 start producers;
- global exact-filter HTTP route and HTTP-only React panel;
- restart, concurrency, pagination, exact-definition, private-field, live, and browser evidence;
- platform product, Temporal, architecture, source-hygiene, package, registry, and documentation guards.

Optional only if it does not expand the contract:

- links from results to existing definition routes;
- a UI empty-state explanation that search covers confirmed Product 2 starts only.

Excluded:

- current running/completed/failed/cancelled status, start or completion timestamps, duration, variables, waits, tasks, incidents, tokens, transition history, diagram position, or audit actor;
- Event History, Temporal Visibility, Search Attributes, Workflow Query fanout, state differencing, polling every Workflow, or a new engine observation;
- instance detail, command submission, cancellation, task interaction, forms, identity, authorization, retention, deletion, export, aggregation, mining, full-text search, or fuzzy matching;
- starts outside Product 2, historical backfill, and, at this M2 closure target, retry-transparent recovery for the then body-free direct-start ambiguity; the later M3 specification owns the reviewed replacement of that failure boundary;
- new BPMN semantics, profile, checked graph, IL, semantic-core transition, Workflow behavior, Lean proof, CIB relationship, Schedule policy, Message routing, broker, or fanout.

## Acceptance evidence

The maintained acceptance boundary is the focused package gates, both platform harness type gates, Product 1/Product 2 and Temporal boundary guards, source hygiene, the real three-producer live witness, headless Chromium acceptance, and the complete repository and M2 showcase gates. The live and browser witnesses are registered under `showcase/m2-process-instance-search/`; [TESTING-SPEC.md](TESTING-SPEC.md) owns their execution procedure, the [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md) owns the exact current evidence boundary, and [PLAN.md](PLAN.md) owns the latest measured result.

## Common-mode risks and nearest unsupported claim

The three producer paths and the search index are all Product 2 code, so their agreement is not independent evidence that a Temporal Workflow exists or remains live. The live witness uses each existing production start path to separate wiring omissions, but the search claim remains exactly the persisted public confirmation, not host discovery.

The strongest supported claim at this M2 closure target is stable cross-instance search over confirmed Product 2 starts with exact immutable definition identity. The nearest unsupported claim at that target is complete discovery of every engine Process instance, including a direct start whose successful host RPC lost its Product 2 response. The later M3 human-work specification implements the separately reviewed durable reservation, private intent Memo, describe-only recovery, and publication lifecycle that closes that specific Product 2 producer gap without a Temporal history scan.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `3fbaf27` | `fork-turns-none` | `approve-with-required-edits` | `e1d037f` |
| Semantic checkpoint | `5bd9d13` | `fork-turns-none` | `approve` | `not-required` |
| Closure | `8a87cf4` | `checkpoint-reviewer-warm` | `approve-with-required-edits` | `326dde5` |
