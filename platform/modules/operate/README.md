# Operate module

`@bpmn-lean/platform-operate` owns Product 2 cross-instance discovery, committed-execution projection, incident operations, and exact-definition flow-node metrics. It keeps private engine locators behind the module boundary and never treats platform persistence or Temporal Event History as semantic authority.

## What you can do

Register confirmed Process instances, search them by public identity, inspect committed execution, retry or cancel published incidents, export complete bounded per-instance operator audit, and aggregate version-bound flow-node frequency and duration when the authoritative projection is complete.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-operate test
```

## Learn more

- [Process-instance search specification](../../../docs/BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) owns discovery and paging.
- [Incident-operations specification](../../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns authorization, actions, reconciliation, and audit.
- [Committed-execution publication specification](../../../docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) owns history and current-position projection.
- [Flow-node occurrence metrics specification](../../../docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) owns aggregate availability and calculations.
- [Architecture](../../../docs/ARCHITECTURE.md#modules) and [implementation map](../../../docs/IMPLEMENTATION-MAP.md) own module placement and current coverage.
