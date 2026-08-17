# Temporal adapter subsystem

`packages/temporal-adapter/` contains the packages that durably host the pure [TypeScript semantic core](../semantic-core/README.md) on Temporal. The subsystem separates client, Workflow, Worker, product runner, protocol, and test-only dependencies so Temporal mechanisms never define BPMN behavior.

## What you can do

Run an admitted BPMN Process against an existing Temporal service, observe current semantic waits, submit occurrence-bound commands, and recover or replay the durable execution through the same product boundary.

The runner compiles BPMN before it opens a network connection. Temporal records delivery and Workflow decisions, while the semantic core remains the owner of BPMN-visible transitions and canonical observations.

The lazy client runtime exposes an explicit connection handshake for application readiness without coupling construction to network availability.

Product 1 starts enroll in the versioned Workflow-chain contract with production budgets and return only the semantic Process-instance ID. The client reacquires Temporal capabilities privately by Workflow ID, recovers content-bound User Task, Message, Retry, and Cancel commands through the latest Run, decodes the opaque Workflow result into a closed public v1 terminal receipt, and traverses paired execution and occurrence publication segments across retained Runs without exposing Run identity. A test-only lower Event History threshold proves three Runs and two Continue-As-New boundaries, while a production-limit witness proves that the 512th recovery entry returns its semantic result before the retained failed Run reports typed capacity for unseen work. The paired traversal witness proves exact pages before, at, and after both boundaries. The remaining capacity rows, cross-mechanism forced rollover evidence, and deployment admission remain open under the [Workflow-chain proposal](../../docs/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md).

The containerized evaluation distribution uses the `bpmn-evaluation-worker` entry point. It connects to the caller-selected Temporal address, Namespace, and Task Queue from `BPMN_TEMPORAL_ADDRESS`, `BPMN_TEMPORAL_NAMESPACE`, and `BPMN_TEMPORAL_TASK_QUEUE`; identifies itself with `BPMN_WORKER_IDENTITY`; and exposes an internal `/healthz` endpoint on `BPMN_WORKER_HEALTH_PORT` only after the Worker is polling. All five values are required.

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
- [Implementation map](../../docs/IMPLEMENTATION-MAP.md) records current hosting and replay evidence without turning Event History into BPMN state.

The rejection demonstration `./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/unsupported.json` performs source admission without connecting to Temporal. The optional time-skipping lane is `./scripts/pnpm.sh run test:timer-time-skipping`.
