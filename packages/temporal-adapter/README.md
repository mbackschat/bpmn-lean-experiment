# Temporal adapter

`@bpmn-lean/temporal-adapter` is the durable host for the pure [TypeScript semantic core](../semantic-core/README.md). Temporal records delivery and Workflow decisions; the semantic core remains the owner of BPMN-visible state transitions and canonical observations.

The M0.5 implementation supports only the content-addressed sequential User Task capsule. One Workflow receives the neutral scenario, admits it through the semantic core, applies the start stimulus, waits for a `bpmn-stimulus` Signal, and returns the same result as the in-process core. The Signal handler only deduplicates and queues stimuli; one main loop alone advances semantic state. A `bpmn-trace` Query exists for diagnostic/refinement observation and is not a durable semantic authority.

## What the gate proves

The focused test:

- starts a full local Temporal development server through pinned CLI `v1.8.1`;
- runs SDK `1.21.0` Workflow code against the calibrated scenario;
- compares the complete Workflow result with the pure core result;
- replays the fetched live Event History;
- independently replays a committed CLI-exported history fixture.

It does not yet parse arbitrary BPMN XML or implement Activities, timers, Search Attributes, Continue-As-New, Worker Versioning, fault injection, or a production User Task API. Signal is the bounded M0.5 runner transport, not a final Update-versus-Signal decision.

## Run

From the repository root:

```sh
./scripts/pnpm.sh run test:temporal
```

The first run downloads the exact CLI into the ignored `.cache/temporal-cli/` directory. The complete project boundary and dependency audit are in [TEMPORAL-EXECUTION-MODEL.md](../../docs/TEMPORAL-EXECUTION-MODEL.md) and [SOURCES.md](../../docs/SOURCES.md).
