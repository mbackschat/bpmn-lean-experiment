# Engine gateway

`@bpmn-lean/platform-engine-gateway` is Product 2's only concrete semantic-consumption boundary. It narrows Product 1 compilation, start, scheduling, correlation, observation, work, and incident operations into platform-facing ports while keeping Temporal and Semantic Process representations private. Its correlated Message host recompiles exact stored bytes for capability discovery and publication, selects only the engine-projected catch-event address, and removes the full semantic address plus subscription identity from the Product 2 result.

## What you can do

Compile exact source, prepare and recover exact-definition starts, discover and publish definition-scoped correlated Messages, manage Timer and Message Start host intent, observe Work and Operations facts through opaque locators, and submit published commands without exposing Workflow handles, Run IDs, Task Queues, Event History, or semantic anchors.

The composition runtime remains lazy, exposes an explicit `ensureConnected()` readiness probe, and owns one idempotent close operation for its shared Temporal connection.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-engine-gateway test
```

## Learn more

- [Architecture](../../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product dependency boundary.
- [Engine API](../../../packages/engine-api/README.md) is the Product 1 boundary consumed here.
- [Production lifecycle specification](../../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns start, recovery, and command behavior.
- [`implementation-status-owner:BPM-PLATFORM`](../../../docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md) records the exact current gateway surface.
