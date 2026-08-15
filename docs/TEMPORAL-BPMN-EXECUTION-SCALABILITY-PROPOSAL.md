# Temporal BPMN execution scalability proposal

## Status

**Owner-approved theoretical roadmap.** The owner directed that Product 2's horizontal-scaling blocker be resolved as the first post-MVP scalability increment. A context-cold proposal review approved the direction after two bounded warm correction audits closed its architecture, refinement, resource-budget, and owner-routing findings. This document changes no current BPMN meaning, semantic profile, public observation, Temporal Workflow behavior, persistence implementation, deployment claim, or performance service level.

[PLAN.md](PLAN.md) owns immediate sequencing, [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns the implemented and absent boundary, [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns the current Workflow lifecycle, and [Temporal execution research](research/TEMPORAL-EXECUTION-RESEARCH.md) owns the general Temporal-to-BPMN mapping.

## Decision

Adopt a three-horizon scalability roadmap:

1. make Product 2 horizontally deployable immediately after the MVP by replacing node-local synchronous persistence, node-local exact-byte artifact storage, and request-time fleet-wide Temporal Query aggregation with shared durable stores and bounded background recovery;
2. bound each Product 1 Process Workflow chain through explicit state, payload, Event History, and publication budgets plus semantically transparent Continue-As-New;
3. add workload isolation, backpressure, tenant fairness, capacity observability, and distributed performance evidence before claiming production scale.

This order is required. Scaling Product 1 Workers first would not remove Product 2's single-node persistence, serialized write, projection-rebuild, startup-reconciliation, or N+1 Query bottlenecks. Temporal's own horizontal capacity is therefore preserved by the engine architecture but not yet inherited by the complete platform.

## Scope

Required scope is a theoretical architecture assessment, the minimum cross-product invariants that later work must preserve, a dependency-ordered roadmap, resource budgets that must exist before production claims, and the distributed evidence needed to close each horizon.

Optional scope is workload-specific Task Queues, separate Workflow and Activity Worker pools, tenant or priority routing, a content-addressed Semantic Process program store, and additional read replicas after measurements show that the required design needs them.

Excluded scope is implementing the roadmap now, choosing throughput or latency service levels without a workload, treating a single development machine as scalability evidence, changing BPMN meaning, making Temporal Event History a product fact, creating one Workflow per BPMN element, replacing the semantic core, or claiming that Temporal Cloud capacity automatically makes Product 2 scalable.

## MVP disposition

The functional MVP does not require a premature performance benchmark or the post-MVP persistence migration. It may close with the current single-node Product 2 deployment only if documentation and reviewer-facing capability surfaces state that horizontal Product 2 scale, long-running Workflow-chain bounds, multi-tenant isolation, and production capacity figures are absent.

The MVP must not add a new unbounded collection, request-time fleet scan, node-local production dependency, or public Temporal Run identity that makes the roadmap harder. Any such change reopens this proposal before merge. Functional correctness on the development topology is evidence for the MVP feature, not evidence for production scalability.

## Evidence boundary

This is a source-based theoretical assessment. No performance or scalability benchmark was run. Repository structure identifies current serialization points and unbounded growth mechanisms, while official Temporal documentation establishes the platform mechanisms and per-execution limits. It does not establish this project's throughput, latency, capacity, or cost.

Temporal documents no fixed limit on concurrent Workflow Executions, subject to each execution's Event History and operation limits. It documents hard Event History limits of 51,200 events or 50 MB and warnings at 10,240 events or 10 MB, default payload and message limits of 2 MB and 4 MB, and default limits of ten in-flight and 2,000 total Updates per Workflow Execution. Those service limits are safety ceilings, not acceptable project operating targets. See [Workflow Execution limits](https://docs.temporal.io/workflow-execution/limits).

Temporal Task Queues are polled by one or more Workers and load-balance across available Worker processes. Multiple partitions increase queue throughput, while queue task ordering is distinct from the fixed Event order within one Workflow Execution. See [Task Queues](https://docs.temporal.io/task-queue).

Temporal recommends Continue-As-New for long or large histories. It starts a fresh Event History under the same Workflow ID and requires relevant state to be passed into the new run. See [Continue-As-New](https://docs.temporal.io/workflow-execution/continue-as-new) and the [TypeScript Continue-As-New guide](https://docs.temporal.io/develop/typescript/workflows/continue-as-new).

Temporal Worker concurrency is governed by task slots and may use fixed or resource-based suppliers. Capacity must therefore be configured and observed rather than inferred from Worker count. See [Worker performance](https://docs.temporal.io/develop/worker-performance).

## Current architecture assessment

### Product 1 preserves horizontal independence

The production adapter hosts one admitted Semantic Process instance in one Temporal Workflow Execution. Its deterministic loop serializes accepted inputs for that Process instance only. This is the required consistency boundary, not a global engine lock.

Independent Process instances have independent Workflow state and histories. A shared Task Queue can be polled by multiple equivalent Workers, so adding Workers can distribute Workflow Tasks across Process instances. No production Workflow, Worker, or client owner contains a global Process registry, shared interpreter mutex, or single engine-wide execution loop.

One Process instance does not execute its semantic transitions concurrently across Workers. Temporal preserves one ordered Workflow history, and the semantic core intentionally applies stimuli deterministically. Parallel BPMN paths are semantic concurrency within that state machine, not permission for competing Workers to mutate one Process state.

### Product 1 has per-chain longevity and payload risks

The current Workflow retains complete in-memory arrays for trace, accepted commands and their results, publication batches, flow-node occurrences, message delivery resolutions, and related deduplication facts. Several append and lookup paths copy or scan those arrays. The exact cost has not been measured, but work and retained state grow with the life of one Process instance.

The complete Semantic Process program enters Workflow and Schedule input. No project-owned encoded-byte budget limits the program, initial state, command, publication page, carried Workflow state, or completed receipt before it reaches Temporal transport.

The production Workflow does not Continue-As-New. Long-running or high-command Process instances can therefore approach Temporal's per-execution Event History limits even if the Worker fleet scales horizontally.

Continue-As-New is not a local call-site change. The adapter must preserve public Process identity, semantic runtime state, logical time, pending waits and effects, publication continuity, command-result recovery, message-delivery resolution, and conflicting-payload detection across a Workflow chain without carrying an unbounded ledger into each new run.

### Product 2 is the larger horizontal-scaling blocker

Product 2 currently composes one Node server over several local synchronous SQLite databases and one local-filesystem exact-byte artifact store. The concern is not one global database object. It is that every database and deployed artifact is node-local, write transactions use SQLite's serialized writer boundary, and no shared production store coordinates multiple server or recovery-worker replicas. Sharing only repository metadata would still leave definitions deployed on one replica unavailable to starts, Schedules, Message Starts, presentation, and recovery handled by another replica.

Process search, Work, incident operations, audit, and publication projections are split into sensible modules, but their persistence topology still binds the deployed platform to one filesystem host. Starting a second server against its own files creates divergent state; sharing those files is not a supported horizontal deployment design.

The Work snapshot performs one sequential open-task Query per registered Process and fails beyond its configured Process or task ceilings. Incident aggregation performs one sequential incident Query per nonclosed Process and has separate registration and incident ceilings. Flow-node metrics sequentially reconcile both committed-execution and flow-node-occurrence publications for each instance in an exact-version population and fail beyond their own population ceiling. Per-instance history also reconciles retained publication pages through Temporal Queries. These are distinct consumers and limits, not one generic fleet aggregate. Their request-time fan-out couples response latency and availability to every selected Workflow, while merely deleting the caps would replace a bounded failure with unbounded work.

Projection persistence rebuilds a complete retained image by deleting and reinserting history rather than applying a bounded suffix. Startup sequentially performs confirmed-instance replay, incident-action reconciliation, direct-start reconciliation, Schedule reconciliation, Message Start reconciliation, and pending audit delivery. These lifecycle repairs, bootstraps, projections, and outboxes need explicit replacement ownership before startup scans can be removed. The current mechanisms make recovery and read cost grow with retained population or history and concentrate work in the server process.

Temporal can continue scheduling Process Workflows while Product 2 is saturated or unavailable, but users then cannot reliably search, work, or operate those instances through the platform. The complete product cannot claim Temporal-scale horizontal capacity while this common-mode Product 2 boundary remains.

## Required scalability contract

### Cross-product invariants

Every roadmap horizon must preserve these facts:

- one public Process instance remains one semantic Process identity even when its host spans multiple Temporal Runs;
- definition identity, semantic Process identity, and private Temporal Workflow or Run identity remain distinct;
- the semantic core remains the only owner of BPMN transition meaning and committed RuntimeState;
- Product 2 projections consume only validated published engine facts and never reconstruct meaning from Temporal Event History, timestamps, state differences, retry metadata, or local database order;
- command outcomes and exact-retry recovery remain deterministic across Worker replacement, server replacement, projection replay, and Continue-As-New;
- a projection cursor, lease, partition, queue, database transaction, or Workflow Run boundary never becomes a BPMN fact;
- overload, lag, quota, transport, database, and Worker failures remain infrastructure outcomes rather than semantic failures;
- no successful read silently claims freshness or completeness beyond its published projection boundary;
- adding replicas must not require sticky ownership of a Process instance by one application server.

### Resource budgets

An implementation may choose conservative initial values, but it must own and enforce each applicable budget before a production scalability claim:

| Boundary | Required measured budget or signal | Required behavior at the boundary |
|---|---|---|
| Workflow chain | Event count, Event History bytes, Continue-As-New suggestion, chain length | Continue before the project threshold; never wait for a Temporal hard limit |
| Workflow carried state | encoded bytes by semantic state, command recovery, publication, message resolution, and program | reject before start or continue through an explicitly bounded representation; never rely on heap size alone |
| Workflow ingress and pending operations | encoded Signal and Update bytes, total and in-flight Updates, queued semantic inputs, and other supported pending-operation counts | reject before transport or roll over before a per-Run limit; never accept input that is then omitted from the continuation state |
| Workflow tasks | schedule-to-start latency, execution latency, replay latency, cache pressure, slot use | expose backlog and capacity; throttle ingress or add capacity before memory saturation |
| Activity and effect work | encoded request, result, and applicable failure-payload bytes; queue backlog age, retry rate, attempt duration, and slot use | reject before transport, bound failure detail, and isolate or throttle work that can starve semantic Workflow Tasks |
| Product 2 ingestion | projection lag, batch size, cursor age, retry count, lease age | process bounded idempotent batches; resume from a durable cursor after failure |
| Product 2 persistence | transaction duration, lock wait, connection saturation, storage growth | reject overload or apply backpressure; never fall back to node-local divergence |
| Product 2 reads | selected population, fan-out, response bytes, freshness boundary | use projections with an explicit completeness/freshness contract; never issue an unbounded request-time Workflow fan-out |
| Tenancy and routing | per-tenant backlog, rate, storage, and noisy-neighbor pressure | isolate or fairly schedule workloads before one tenant can exhaust shared capacity |

Numeric product service levels remain open until representative workloads and deployment assumptions exist. Temporal's hard service limits must not be copied into these project budgets as targets.

## Roadmap

### Horizon 1: remove Product 2's single-node scale boundary

This is the first post-MVP scalability increment and has priority over Product 1 Worker tuning.

Required design outcomes are:

1. introduce shared transactional production persistence for every Product 2 repository and shared immutable exact-byte artifact storage, while retaining SQLite and the local filesystem only as local-development and focused-test implementations. Artifact publication and retrieval must preserve digest, length, immutable-publication, conflict, and corruption guarantees across replicas;
2. inventory confirmed-instance replay, direct-start, Schedule, Message Start, incident-action, Work-audit, incident-audit, committed-execution, and flow-node-occurrence repair. Move every retained lifecycle, bootstrap, projection, and outbox family that requires autonomous recovery into independently scalable background workers with durable ownership, bounded batches, idempotent application, and safe lease loss or process replacement;
3. replace full-history delete-and-reinsert projection with monotonic cursor-based suffix application and explicit rebuild tooling for corruption or version migration;
4. remove sequential Temporal Query fan-out from Work, incidents, flow-node metrics, and per-instance history HTTP request paths. Serve paged or otherwise response-byte-bounded projection reads with consumer-specific completeness rules, and eliminate current Process, task, incident, and exact-version population caps as architectural ceilings without replacing them with unbounded reads;
5. make startup independent of whole-population reconciliation, so an API or Worker replica can become ready without serially visiting every Process instance;
6. define one explicit Product 2 projection freshness contract. Until a separate public contract approves stale success, a read that cannot establish its required completeness must fail closed rather than present an old snapshot as current;
7. prove that two or more API replicas and two or more recovery workers can operate concurrently against shared repositories and artifact storage without duplicate facts, lost suffixes, split-brain ownership, or reliance on local process memory. Cross-replica evidence must cover deploy, source retrieval, direct start, Schedule, Message Start, presentation, and recovery from the same immutable definition bytes.

A PostgreSQL-class shared relational database is the recommended first production repository implementation because the current repository and transaction model is relational and requires shared transactions, locking, indexing, and mature operational tooling. The precise database product, artifact-storage implementation, migration contract, and cross-store publication boundary require a focused Product 2 persistence and artifact architecture decision before code. That decision and [ARCHITECTURE.md](ARCHITECTURE.md) own the resulting deployment shape; the scalability contract is the shared durable capability, not a vendor API in business modules.

### Horizon 2: bound Product 1 Workflow chains

Required design outcomes are:

1. define project thresholds below Temporal's hard Event History limits and act on the SDK's Continue-As-New suggestion at a safe main-loop checkpoint;
2. carry the complete semantic continuation state needed by the new Run without exposing a Run boundary as Process completion, restart, or transition;
3. continue only after every accepted handler has finished and the ordered accepted semantic-input queue is empty, or carry that complete queue and its deduplication bindings exactly. Preserve pending waits, timers, effects, cancellation ownership, logical time, and terminal behavior;
4. preserve content-bound command result recovery and conflicting-payload refusal across Runs through a bounded durable design rather than an ever-growing copied array;
5. segment committed execution and occurrence publication so public history and cursor validation remain exact across Runs without copying all prior pages into every new Run;
6. measure and bound encoded Program, initial input, Signal, Update, stimulus, carried state, Query result, receipt, Activity request, Activity result, and applicable Activity failure bytes before Temporal transport. Track total and in-flight Updates and every supported pending-operation count below the corresponding Temporal per-Run ceiling;
7. decide whether large immutable Semantic Process programs remain inline or use a content-addressed definition mechanism whose deterministic retrieval and replay behavior are separately specified;
8. prove forced low-threshold Continue-As-New across open User Tasks, Messages, Timers, effects, duplicate and conflicting commands, Worker replacement, terminal completion, history export, and replay. One separating witness must accept a Message Signal immediately before the rollover decision and prove that it is applied exactly once rather than lost between handler drain and queue processing.

The public engine API should continue to address one Process instance. A Workflow chain and its Run IDs remain private hosting facts. If the current opaque locator cannot preserve this abstraction, its replacement is a separate engine contract change and must not leak a Run ID into Product 2 identity.

### Horizon 3: isolate workloads and prove distributed capacity

Required design outcomes are:

1. separate or route Workflow Tasks and materially different Activity workloads where shared queues create starvation or noisy-neighbor risk;
2. configure Worker slots and autoscaling from measured CPU, memory, task latency, backlog age, and replay cost rather than fixed process counts alone;
3. define tenant, priority, and rate boundaries for Workflow start, command ingress, effect work, projection ingestion, storage, and reads;
4. expose dashboards and alerts for Workflow history growth, Continue-As-New, replay latency, Task Queue backlog, Worker capacity, command result recovery, projection lag, database contention, and reconciliation failure;
5. validate upgrades, Worker replacement, queue partitioning, server replacement, shared-store failover, and lag recovery under representative mixed Process models;
6. establish capacity envelopes and service levels only from repeatable distributed tests on a deployment topology representative of the intended production service.

Task Queue partitioning and more Workers are tools within this horizon. They are not substitutes for budgets, workload isolation, or Product 2 scale-out.

## Owner impact

[ARCHITECTURE.md](ARCHITECTURE.md) and the focused Product 2 persistence and artifact decision own the shared deployment topology. Changes to Work, incidents, operator history, committed execution, occurrence metrics, Process search or direct start, Schedule, Message Start, or diagram-source retrieval must update their existing owners as applicable: [Human Work](BPM-PLATFORM-HUMAN-WORK-SPEC.md), [incident operations](BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md), [operator history and audit export](BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md), [committed execution publication](capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md), [flow-node occurrence metrics](capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md), [Process-instance search and direct start](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md), [definition scheduling](BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md), [Message ingress](BPM-PLATFORM-MESSAGE-INGRESS-SPEC.md), and [diagram presentation](BPMN-DIAGRAM-PRESENTATION-DECISION.md).

[TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns Continue-As-New, handler and queue drain, carried-state, and transport-budget semantics. [TESTING-SPEC.md](TESTING-SPEC.md) owns the cross-replica recovery and freshness gates, forced-rollover witness, Activity transport-budget gates, and pending-operation-limit gates.

## Future evidence contract

Correctness separators precede load tests. Each horizon must first prove that the scalable mechanism preserves existing outcomes under adversarial replacement, retry, reordering, partial failure, and restart.

Distributed performance evidence must vary at least Process-instance population, command rate, Process duration, active wait count, history length, Program size, publication size, Worker count, API replica count, projection-worker count, Task Queue topology, and tenant mix. It must include both short straight-through Processes and long-lived human, message, timer, effect, parallel, and incident-bearing Processes from the retained corpus.

Reports must distinguish throughput from latency and publish p50, p95, and p99 where samples justify percentiles. They must record Temporal service topology and quotas, Worker and slot configuration, database topology, dataset size, cache state, Process mix, failure injection, CPU, memory, network, and storage conditions. A run that omits these facts is feedback, not a capacity claim.

Minimum closure evidence for the full roadmap is:

- horizontal Process-instance execution improves when equivalent Product 1 Workers are added, without cross-instance interference or changed semantic results;
- one deliberately long Process crosses several Continue-As-New boundaries with byte-identical public semantic observations and exact retry/conflict behavior;
- Product 2 remains correct while API and reconciliation replicas are added, killed, restarted, and replaced against the shared store;
- projection throughput scales without request-time N+1 Query fan-out, and projection lag has a visible bounded failure or freshness contract;
- one noisy workload cannot starve the selected protected Workflow, effect, tenant, or operator workload beyond its declared service boundary;
- every reported limit identifies the actual saturated resource instead of attributing all bottlenecks to Temporal or to BPMN evaluation.

## Feasibility risks and reopen conditions

The hardest Product 1 risk is not invoking Continue-As-New. It is bounding command recovery and publication continuity without weakening exact retry, conflict, history, or replay contracts. Reopen the lifecycle design before discarding or externally moving any retained fact.

The hardest Product 2 risk is freshness. Moving reconciliation off the request path creates an asynchronous projection boundary. Reopen the applicable Product 2 public specification before returning a successful stale snapshot, changing fail-closed behavior, or publishing a new lag or consistency field.

Reopen this proposal before selecting a different Process-to-Workflow cardinality, using Child Workflows for BPMN scopes or elements, introducing an engine-wide scheduler or registry, making Product 2 persistence authoritative for semantics, exposing Temporal Run identity, accepting node-local multi-writer storage as production scale-out, or claiming a throughput or latency service level.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ef24a9f8357d2aac84049d7589a80e50c5ecb543` | `fork-turns-none` | `approve-with-required-edits` | `f14564c` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
