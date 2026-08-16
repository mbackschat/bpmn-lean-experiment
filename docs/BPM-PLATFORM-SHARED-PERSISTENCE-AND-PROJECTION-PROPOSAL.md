# BPM platform shared persistence and projection proposal

## Status

**Draft at immutable target `c9cf16e`, awaiting context-cold proposal review; owner approval is not yet recorded.** This proposal selects the focused Product 2 architecture required by Horizon 1 of the owner-approved [Temporal BPMN execution scalability roadmap](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md#horizon-1-remove-product-2s-single-node-scale-boundary). It changes no BPMN meaning, semantic profile, Product 1 Workflow behavior, public semantic observation, or current scalability claim.

[ARCHITECTURE.md](ARCHITECTURE.md) owns the implemented deployment shape after this proposal closes. [PLAN.md](PLAN.md) owns sequencing, [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns current absences, and the existing Product 2 specifications retain their business and public API contracts except for the bounded projection-freshness rule selected here.

## Decision

Use one shared PostgreSQL 18 database as the first production persistence boundary for every Product 2 repository and every bounded definition artifact. Keep the modular monolith and business-module ownership, but add independently scalable API and Product 2 recovery-worker processes over the same database. Replace request-time fleet-wide Temporal Query aggregation with durable, leased background projection work and bounded projection-backed reads.

This is the smallest complete Horizon 1 design because the current definition source is capped at 1 MiB and the other retained definition artifacts are similarly bounded. PostgreSQL `bytea` can keep those exact bytes in the same transactional system as their metadata, so Horizon 1 needs no object store, distributed transaction, dual write, or metadata-to-blob repair protocol. A separate object store becomes justified only when measured artifact volume, artifact size, transfer cost, or lifecycle isolation exceeds this bounded definition-artifact use case.

The shared database removes the current node-local application boundary. It does not claim unlimited database write scale, database high availability, or production capacity. Product 1 Workflow-chain bounds and distributed capacity evidence remain Horizons 2 and 3.

## Required, optional, and excluded

Required:

- PostgreSQL major version 18 with the latest supported patch release in production;
- one logical database shared by every Product 2 API and recovery-worker replica;
- asynchronous repository ports, with PostgreSQL and local SQLite implementations of the same closed business capabilities;
- exact definition artifacts stored as verified immutable `bytea` rows in that database;
- durable domain-owned pending work, bounded leases, idempotent application, and safe worker replacement;
- suffix-only committed-execution and occurrence projection during ordinary operation;
- projection-backed Work, incident, metrics, and per-instance execution reads with one explicit bounded-freshness contract;
- no whole-population reconciliation during API startup;
- concurrent correctness evidence with at least two API replicas and two recovery-worker replicas.

Optional after measurements:

- read replicas for explicitly lag-tolerant queries;
- table partitioning, connection pooling through an external pooler, or separate worker pools by projection family;
- change-driven Product 1 publication that reduces polling without changing semantic authority;
- moving immutable artifacts behind the existing artifact-store port when the reopen condition below is met.

Excluded:

- an ORM, generic repository framework, event bus, service mesh, or microservice split;
- cross-database transactions, dual writes, local-file sharing, or SQLite on a network filesystem;
- using Temporal Visibility, Event History, Search Attributes, database order, or wall-clock order to reconstruct BPMN facts;
- returning an unlabelled stale snapshot;
- read-replica use for claims, commands, lifecycle state, leases, freshness decisions, or any read requiring current completeness;
- importing the current local SQLite data into the first shared pre-release deployment;
- performance or capacity claims before representative distributed evidence.

## Deployment shape

```text
browser or API client
          |
          v
  two or more API replicas --------------+
          |                               |
          v                               v
  shared PostgreSQL 18 <---------- two or more Product 2 recovery workers
          ^                               |
          |                               v
          +---------------------- Product 1 public Query and command gateways
                                          |
                                          v
                                      Temporal
```

`platform/apps/server` remains the stateless HTTP composition root. A new `platform/apps/recovery-worker` composition root runs Product 2 repair, outbox, and projection loops. It is not a Temporal Workflow or Activity Worker and belongs under `platform/apps`, not `platform/workers`. Business services remain in their current modules; neither composition root owns a business rule.

Two explicit storage modes remain:

- `local`: one development or focused-test server using the existing SQLite and filesystem implementations, with no horizontal claim;
- `shared`: API replicas and recovery workers using PostgreSQL only.

There is no hybrid mode. One deployment may not combine PostgreSQL metadata with local artifacts, mix SQLite and PostgreSQL repositories, or let one replica run startup repair while another uses background repair.

## Shared persistence contract

### Repository ownership

The PostgreSQL implementation replaces all twelve SQLite repository owners without combining their domain contracts:

| Domain | Shared repository responsibilities |
|---|---|
| Definitions | definitions and version allocation, presentation, Schedules, Message Start publications, and confirmed Process registrations |
| Operate | Process-instance search, incident actions, committed-execution projection, and flow-node-occurrence projection |
| Work | Process registrations, observations, claims, structured completion bindings, actions, and the Work audit outbox |
| Audit | Work audit events and incident-action audit events as two separately ordered streams |
| Artifact store | exact admitted BPMN source bytes addressed by lowercase SHA-256 |

Module repositories remain the owners of table meaning and domain invariants. A narrow Product 2 PostgreSQL runtime owns the bounded connection pools, transaction callback, cancellation and deadline propagation, database-clock access for leases, and clean lifecycle. It owns no domain table, query, migration, or projection meaning. Business modules do not import a concrete driver outside their PostgreSQL adapters.

All repository capabilities become asynchronous. The SQLite implementations adapt to the same Promise-returning ports rather than preserving a second synchronous service path. The pre-release change replaces every producer, consumer, fake, and test atomically.

### Exact stored values

Canonical JSON that participates in equality, content binding, audit integrity, or export remains canonical UTF-8 bytes or text. It is not stored only as `jsonb`, because `jsonb` does not preserve the original canonical byte representation. Indexed identity and filter fields use typed columns beside the canonical value.

Private insertion and projection cursors may use PostgreSQL `bigint`, but adapters reject values outside the existing non-negative JavaScript-safe integer domain before they reach current TypeScript contracts. Database sequence or row order never becomes semantic or cross-stream causal order.

### Definition artifacts

The shared artifact table has one row per verified digest with at least `sha256`, `byte_length`, and `bytes`. `put` snapshots and hashes caller bytes before SQL. Insertion never replaces an existing row. A conflicting existing row is read and compared exactly, preserving the current `stored`, `already-present`, digest-mismatch, and conflict distinctions. `get` returns a detached byte array and rechecks length and SHA-256 before returning it across the trust boundary.

Deployment publishes artifact bytes before definition metadata. A foreign key prevents metadata from naming a missing artifact. A metadata failure may leave an unreferenced immutable artifact, which is safe and invisible; deletion and garbage collection remain excluded. No successful definition publication can precede its exact source bytes.

This same-database ordering is the cross-store publication decision: Horizon 1 deliberately has no second durable artifact system. If artifacts later move to object storage, a new proposal must select staged publication, verification, orphan handling, metadata visibility, deletion, and recovery without weakening the current invariant.

### Transactions and concurrency

PostgreSQL `READ COMMITTED` is the default. Each business invariant is enforced through unique or foreign-key constraints, compare-and-set updates, and the narrowest row lock needed by its repository. Definition version allocation locks only the row owning one Process ID; it does not serialize unrelated Processes. Serialization and deadlock failures are retried only by the owning bounded transaction wrapper and never across a Temporal call.

One transaction may atomically update domain state and its domain-owned outbox in the same database. Audit delivery remains at-least-once with sink-side unique identities and byte-equality checks, so a lost acknowledgement is harmless. The Work and incident audit streams keep independent source-local order and never acquire a fabricated merged chronology.

No database transaction remains open while compiling BPMN, querying or commanding Temporal, generating presentation, or performing other external work. A service first commits a durable intent or reservation, performs the external operation, then conditionally records the observed outcome. Existing content-bound identity, retry recovery, conflict, indeterminate, and process-closed distinctions remain unchanged.

## Recovery and projection workers

### Claiming work

Each lifecycle or projection family owns its pending rows and state machine. Shared mechanics may claim a bounded ordered batch using `FOR UPDATE SKIP LOCKED`, stamp a database-clock lease expiry and opaque lease token, and commit before external work begins. PostgreSQL documents `SKIP LOCKED` as suitable for queue-like consumers rather than general reads; this proposal uses it only on those pending rows.

A worker applies an outcome only when the row still carries its lease token and expected state. Lease expiry makes work reclaimable after process loss. Duplicate work remains safe through existing content identities, unique constraints, exact stored-result comparisons, and idempotent producer operations. A lease, attempt count, worker identity, cursor, or poll schedule is private infrastructure state and never enters a Product 1 command or public BPMN fact.

Every loop has configured batch size, lease duration, per-item deadline, retry delay, and concurrency. A failed item cannot hold a database transaction or block unrelated rows while waiting for its delay. Poisoned or integrity-failed work becomes an explicit failed state and visible operator signal rather than an infinite hot loop.

### Required families

The recovery-worker composition must own all current autonomous repair rather than leaving any family at API startup:

| Family | Durable responsibility |
|---|---|
| Confirmed registrations | deliver each confirmed Process identity to Operate and Work exactly by its published identity |
| Direct start | resolve a retained start reservation and deliver its confirmed registration without redispatch |
| Schedule | reconcile prepared, created, paused, deleted, accepted, or failed Schedule lifecycle state |
| Message Start | reconcile publication lifecycle and confirmed Process delivery without redispatch |
| Incident action | resolve retained Retry or Cancel actions and deliver their audit outbox |
| Work audit | deliver pending Work audit events to the Work audit store |
| Incident audit | deliver pending incident-action audit events to the incident audit store |
| Committed execution | pull and apply strict contiguous revision suffixes from each confirmed Process |
| Flow-node occurrence | pull and apply strict contiguous occurrence suffixes after the corresponding execution head exists |
| Work snapshot | replace one Process's current open-task snapshot from one exact Product 1 observation |
| Incident snapshot | replace one Process's current incident snapshot from one exact Product 1 observation |

API readiness checks only configuration, database connectivity, exact schema epoch, and required dependency health. It never scans the Process population. Recovery-worker readiness likewise proves it can claim work and reach required gateways, not that the backlog is empty.

### Suffix projection

Ordinary committed-execution and flow-node-occurrence application inserts only the validated suffix and advances the retained head in the same transaction. It must not rebuild an in-memory complete history and delete/reinsert all prior rows. Byte-identical overlap remains idempotent; changed overlap, a gap, identity drift, or an occurrence ahead of its execution authority fails closed.

Full rebuild is an explicit administrative operation for corruption repair or schema migration. It runs outside HTTP requests, requires exclusive ownership of the selected projection, remains bounded by pages and bytes, and atomically swaps or marks the rebuilt image only after the complete replacement validates.

## Projection-backed read contract

Work, incidents, flow-node metrics, and per-instance History, Diagram, and export leave their current request-time Temporal Query paths. Recovery workers keep their domain projections current in bounded batches. HTTP reads use only PostgreSQL and retain their existing authorization-first, pagination, response-byte, canonical-export, and unavailable distinctions.

This proposal explicitly permits bounded projection age and makes it visible. Every successful projection-backed HTTP response carries these exact decimal headers:

```text
Bpmn-Projection-Observed-After-Epoch-Ms: <non-negative safe integer>
Bpmn-Projection-Max-Age-Ms: <positive safe integer>
```

`observed-after` is the minimum database-clock completion time among all Product 1 observations needed for that result. For a population result, the database transaction also verifies that the completed projection generation covers the current retained population head and that every included nonclosed registration succeeded. The private population head is not returned. A success is legal only when database time minus `observed-after` is no greater than the configured maximum age at read time.

If no complete generation exists, a registration arrived after the completed generation, one required projection is unavailable or corrupt, or the age bound is exceeded, the endpoint retains its current fail-closed unavailable result. It may enqueue or raise the priority of background work, but the HTTP request never waits for or directly performs a population Query sweep. An empty population uses the read transaction's database time as `observed-after`.

The age budget is a correctness configuration, not a measured service level. Shared mode refuses to start without an explicit value. A later public contract may select a different freshness model, but an implementation may not silently omit the headers, return an older generation, or convert unavailability into stale success.

Work and incident snapshots are replaceable per-Process current images, while committed execution and occurrences are append-only suffix projections. Metrics aggregate only a complete exact-definition population from those retained projections. Claims and incident actions still use content-bound commands against Product 1, so a Process change after a valid projection snapshot can produce the existing semantic rejection or conflict rather than a false commit.

## Schema and migration contract

The first shared implementation creates one PostgreSQL schema epoch from empty state. Current SQLite and filesystem data are pre-release local data and have no automatic import, dual-write, or compatibility promise. Local mode remains available for demonstrations and focused tests but is not a replica of shared mode.

After the first shared epoch exists, schema changes are forward-only, named, ordered, and checksum-bound. An explicit migration command acquires one fixed database advisory lock, verifies the complete applied prefix and checksums, runs one pending transactional migration at a time, and records it before releasing the lock. API and recovery-worker processes never apply migrations automatically; they fail readiness when the database epoch differs from the exact application-supported epoch. Migration credentials are separate from runtime DML credentials.

The implementation may select a maintained MIT-compatible PostgreSQL driver and migration runner only after the repository's ordinary dependency and licence approval. No ORM or generated domain model is needed for this decision.

## Correctness evidence before implementation closure

No load test is required for this increment. Correctness evidence must nevertheless use a real PostgreSQL 18 service and prove:

- two API replicas deploy, list, start, schedule, publish Message Start, retrieve source, retrieve generated presentation, and join Human Task catalogs through the same exact bytes;
- concurrent same-Process version allocation produces a gap-free unique order without blocking unrelated Process IDs;
- two recovery workers claim disjoint bounded work, survive one worker's death after lease acquisition, and complete through lease loss without duplicate facts or lost outcomes;
- response loss after an external Temporal call recovers the current exact result and changed content conflicts;
- Work and incident audit delivery remains idempotent and separately ordered under duplicate delivery;
- execution and occurrence suffixes accept exact overlap, reject changed overlap and gaps, and never delete an accepted prefix during ordinary reconciliation;
- a new confirmed registration inserted between generation completion and an aggregate read prevents stale population success;
- an expired freshness generation returns the existing unavailable outcome and never triggers request-time Query fan-out;
- corruption of artifact bytes, length, canonical JSON, projection identity, cursor, or lease state fails closed;
- API and recovery-worker startup remain bounded with a large retained population because readiness performs no population scan;
- local mode retains its current focused behavioral contract without being presented as horizontal evidence.

The gate records database version, schema epoch, replica counts, worker counts, batch and lease settings, and total wall time. These facts establish distributed correctness only. Throughput, percentile latency, saturation, failover time, and cost remain unclaimed until Horizon 3.

## Feasibility risks and reopen conditions

The largest implementation cost is the synchronous-to-asynchronous repository replacement across every Product 2 service and test fake. Keeping one shared Promise-based port avoids a permanent two-mode service architecture.

The largest operational risk is moving the bottleneck into PostgreSQL. Connection pools, query plans, indexes, lock wait, table growth, projection lag, lease age, and retry rate must be observable from the first shared implementation. Read replicas, partitioning, a pooler, or domain extraction remain measurement-driven follow-ups, not assumptions that this proposal already closes.

Background polling removes request-time N+1 fan-out but still consumes Product 1 Query capacity in proportion to active Process population and the selected age budget. Reopen the ingestion design if measured polling load or lag prevents the declared freshness bound; prefer a revisioned, idempotent change-driven publication before weakening completeness or deriving facts from Temporal metadata.

Reopen this proposal before storing attachments or another unbounded payload in the artifact table, moving artifacts to another durable system, splitting Product 2 across databases, making a read replica authoritative, changing the projection-freshness headers or success rule, exposing a private lease or cursor, merging audit order, or treating PostgreSQL state as semantic authority.

## Source basis

The design is bound to the current repository owners and the approved scalability assessment. PostgreSQL 18 is the current stable major release; its documentation defines [`bytea`](https://www.postgresql.org/docs/18/datatype-binary.html), [transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [`SKIP LOCKED`](https://www.postgresql.org/docs/18/sql-select.html), and [advisory locks](https://www.postgresql.org/docs/18/functions-admin.html). The project uses those standard database mechanisms only at the boundaries described above.

## Owner impact

Implementation changes [ARCHITECTURE.md](ARCHITECTURE.md), the server composition, public projection response contracts, every repository port and adapter named above, and the affected Work, incident, operator-history, execution-publication, metrics, Process-search, start, Schedule, Message Start, presentation, and Definitions owners linked from the [scalability roadmap](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md#owner-impact). [TESTING-SPEC.md](TESTING-SPEC.md) must own the real-PostgreSQL multi-replica gate, no-startup-scan guard, and no-request-time-fan-out guard. [CONTRIBUTOR-SETUP-GUIDE.md](CONTRIBUTOR-SETUP-GUIDE.md) and [SOURCES.md](SOURCES.md) must own local and CI PostgreSQL provisioning without adding PostgreSQL to Product 1 verification.

No Lean, BPMN source, semantic-core, CIB, differential, or Product 1 Temporal implementation owner changes unless later work selects the optional change-driven publication path.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `c9cf16e` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The semantic-checkpoint stage is not required because this proposal changes no BPMN meaning, semantic profile, checked graph, Semantic Process program, runtime or public semantic observation, admission capability, transition family, Lean proof boundary, or Product 1 Temporal refinement claim. Its Product 2 public freshness and deployment claims still require the proposal and closure review recorded here.
