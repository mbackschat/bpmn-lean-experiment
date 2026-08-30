# Temporal adapter subsystem

`packages/temporal-adapter/` contains the packages that durably host the pure [TypeScript semantic core](../semantic-core/README.md) on Temporal. The subsystem separates client, Workflow, Worker, product runner, protocol, and test-only dependencies so Temporal mechanisms never define BPMN behavior.

## What you can do

Run an admitted BPMN Process against an existing Temporal service, observe current semantic waits, submit occurrence-bound commands, and recover or replay the durable execution through the same product boundary.

The runner compiles BPMN before it opens a network connection. Temporal records delivery and Workflow decisions, while the semantic core remains the owner of BPMN-visible transitions and canonical observations.

The lazy client runtime exposes an explicit connection handshake for application readiness without coupling construction to network availability.

Product 1 starts enroll in the versioned Workflow-chain contract with production budgets and return only the semantic Process-instance ID. The client reacquires Temporal capabilities privately by Workflow ID, recovers content-bound User Task, Message, Retry, and Cancel commands through the latest Run, decodes the opaque Workflow result into a closed public v1 terminal receipt, and traverses paired execution and occurrence publication segments across retained Runs without exposing Run identity. Event History rollover honors an earlier SDK suggestion, then the lower-only 8,000-Event and 8 MiB project triggers after a fresh continuation Run has retained work, preventing an empty Continue-As-New loop. An executable host-mechanism cost table keeps one admitted activation inside the reserved warning margins; live count and byte cases preserve the registered cyclic Process semantics through three and two Runs respectively. The six separately encoded continuation arguments retain their individual bounds and sum under an exact 448 KiB aggregate preflight before successor emission or incoming restoration. The chain admits Run 128 with 127 retained descriptors and fails a required Run 129 before closing another segment. A production-limit witness separately proves that the 512th recovery entry returns its semantic result before the retained failed Run reports typed capacity for unseen work. The paired traversal witness proves exact pages before, at, and after both boundaries. Selected-Run Query responses stay within 192 KiB by returning the largest complete aligned E1/E2 prefix that fits; the client independently enforces the same ceiling before public projection. The private terminal receipt-plus-recovery envelope also stays within 192 KiB: exact-bound bytes return unchanged, while one byte over fails nonretryably after the closing semantic result becomes recoverable. Worker replacement uses the stop-the-world deployment gate: exact bundle hashes bind replay bytes and poller identities, old Workers stop before candidate replay and startup, candidate-only inventory precedes ingress reopen, and failure never becomes a BPMN result. The forced Message witnesses carry both the payload-free and exact scalar payload subscriptions through Run boundaries, commit delivery only from a successor, and preserve refusal, routed Process data, duplicate/conflict recovery, terminal receipts, and semantic-core traces across replayed Runs. The forced Timer witness carries the exact registered `PT1S` wait across a boundary before any durable Timer is armed, then records one matched Timer lifecycle and one derived semantic firing in the successor. The forced effect witness carries the exact registered Service Task intent across a boundary before any Activity is scheduled, then records one Activity lifecycle, one external mutation, and one derived semantic completion in the successor. The closure-reviewed current contract is owned by the [production lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract).

The registered sequential Multi-Instance User Task profile reuses that Workflow-chain boundary with one managed outer-lifetime Timer. Its natural and interrupted witnesses cross the pre-arming continuation boundary, preserve the same semantic Timer through task turnover, replace the Worker, recover an accepted Update result, compare production histories with the independently measured capacity envelope, validate exact E1/E2 publication and terminal receipts, and replay every Run. The interrupted schedule reaches a third Run only after the original Timer callback is reduced, rejects the stale inner task, and exposes no partial output collection.

The containerized evaluation distribution uses the `bpmn-evaluation-worker` entry point. It connects to the caller-selected Temporal address, Namespace, and Task Queue from `BPMN_TEMPORAL_ADDRESS`, `BPMN_TEMPORAL_NAMESPACE`, and `BPMN_TEMPORAL_TASK_QUEUE`; uses `BPMN_WORKER_IDENTITY` as the fleet instance component of an exact bundle-bound poller identity; and exposes an internal `/healthz` endpoint on `BPMN_WORKER_HEALTH_PORT` only after the Worker is polling. All five values are required.

For the evaluation incident journey only, that entry point supplies a process-local host simulation which reports one technical failure for the first Activity invocation of each exact effect idempotency key and succeeds with an empty local patch on later invocations. This exercises the existing retry and incident mechanism. It defines neither BPMN meaning nor a production integration contract, and it does not change the configured host-effect implementation used by the maintained engine example.

## Quick start

Start a local Temporal service in one terminal:

```sh
temporal server start-dev --headless
```

Run the maintained engine example in another:

```sh
./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/user-task-discovery-completion.json
```

The example expects `localhost:7233` and a fresh semantic Process-instance ID. Copy the configuration before changing its explicit address, Namespace, Task Queue, or instance identity.

Run the focused adapter gate with:

```sh
./scripts/pnpm.sh run test:temporal
```

## Learn more

- [Source map](SOURCE-MAP.md) explains package and execution-environment ownership.
- [Runnable Temporal MVP specification](../../docs/RUNNABLE-TEMPORAL-MVP-SPEC.md) owns the command contract, supported runner surface, and exit behavior.
- [Production lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns durable ingress, recovery, retry, and lifecycle distinctions.
- [Temporal execution research](../../docs/research/TEMPORAL-EXECUTION-RESEARCH.md) records the source-grounded hosting analysis.
- [Temporal test evidence map](../../docs/TEMPORAL-TEST-EVIDENCE-MAP.md) maps exact witnesses and mutations to the focused gate.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the closure-reviewed two-order replacement, stale-refusal, replay, and Query-mutation witness.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 typed-value transport, content identity, replacement, conflict, history, and replay boundary.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the exact managed-deadline and production-refinement boundary.
- [`implementation-status-owner:TEMPORAL-HOSTING`](../../docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) records current hosting and replay evidence without turning Event History into BPMN state.

The rejection demonstration `./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/unsupported.json` performs source admission without connecting to Temporal. The optional time-skipping lane is `./scripts/pnpm.sh run test:timer-time-skipping`.
