# Engine gateway

`@bpmn-lean/platform-engine-gateway` is Product 2's only concrete semantic-consumption boundary. It narrows Product 1 compilation, start, scheduling, observation, work, and incident operations into platform-facing ports while keeping Temporal and Semantic Process representations private.

## What you can do

Compile exact source, prepare and recover exact-definition starts, manage Timer and Message Start host intent, observe Work and Operations facts through opaque locators, and submit published commands without exposing Workflow handles, Run IDs, Task Queues, Event History, or semantic anchors.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-engine-gateway test
```

## Learn more

- [Architecture](../../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product dependency boundary.
- [Engine API](../../../packages/engine-api/README.md) is the Product 1 boundary consumed here.
- [Production lifecycle specification](../../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns start, recovery, and command behavior.
- [Implementation map](../../../docs/IMPLEMENTATION-MAP.md) records the exact current gateway surface.
