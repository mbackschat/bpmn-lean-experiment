# Engine API

`@bpmn-lean/engine-api` is Product 1's narrow entry point for Product 2. It exposes compilation, start preparation and recovery, committed observation, scheduling, Message Start, human-work commands, and incident operations without exposing Semantic Process programs or Temporal SDK identities.

## What you can do

Use the API from the Product 2 engine gateway to compile exact source, start an exact deployed definition, observe published engine facts, and submit content-bound commands through opaque Process locators. Callers receive closed engine-neutral results rather than Workflow handles, Run IDs, Task Queues, Event History, or private semantic anchors.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/engine-api test
```

## Learn more

- [Architecture](../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product dependency boundary.
- [Production lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns durable start, command, and recovery behavior.
- [Committed-execution publication specification](../../docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) owns the published execution contract.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 completion-value boundary; this package derives that payload from the shared semantic contract and detaches caller storage without defining a second value union.
- [Implementation map](../../docs/IMPLEMENTATION-MAP.md) records the exact currently available operations and evidence.
