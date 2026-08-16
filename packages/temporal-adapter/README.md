# Temporal adapter subsystem

`packages/temporal-adapter/` contains the packages that durably host the pure [TypeScript semantic core](../semantic-core/README.md) on Temporal. The subsystem separates client, Workflow, Worker, product runner, protocol, and test-only dependencies so Temporal mechanisms never define BPMN behavior.

## What you can do

Run an admitted BPMN Process against an existing Temporal service, observe current semantic waits, submit occurrence-bound commands, and recover or replay the durable execution through the same product boundary.

The runner compiles BPMN before it opens a network connection. Temporal records delivery and Workflow decisions, while the semantic core remains the owner of BPMN-visible transitions and canonical observations.

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
