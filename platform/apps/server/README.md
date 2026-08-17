# Platform server

`@bpmn-lean/platform-server` is the Node composition root for Product 2's public HTTP API. It selects one complete local or shared storage mode and wires platform modules and the engine gateway without owning BPMN meaning or module business rules.

## What you can do

Run the local API used by the web application for definition deployment and start, source and diagram retrieval, schedules, Message Start, Process search and execution, human work, incidents, Work and incident audit, per-instance operator-audit export, and metrics.

## Quick start

With Temporal available at the configured address, run:

```sh
./scripts/pnpm.sh run platform:serve
```

The default listener is `http://127.0.0.1:3000`, with local SQLite and filesystem state under ignored `.data/platform/`. Local mode retains its single-node startup recovery behavior.

Shared mode requires `PLATFORM_STORAGE_MODE=shared`, `PLATFORM_POSTGRESQL_RUNTIME_URL`, and `PLATFORM_PROJECTION_MAX_AGE_MS`. It uses only PostgreSQL adapters, performs one bounded PostgreSQL 18 and schema-epoch-9 readiness query plus one engine connection check, and performs no startup population reconciliation. The separate recovery worker owns background projection, lifecycle, and audit delivery. Successful shared projection reads carry the public freshness headers; request paths never perform fleet-wide Product 1 queries.

## Learn more

- [Platform web application](../web/README.md) is the browser client for this API.
- [Architecture](../../../docs/ARCHITECTURE.md#applications) owns composition, dependency direction, and deployment shape.
- [Platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md) owns the public product contract.
- [Shared persistence and projection proposal](../../../docs/BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md) owns the two storage modes and horizontally safe read/recovery boundary.
- [Implementation map](../../../docs/IMPLEMENTATION-MAP.md) records the exact current server surface.
- [M1 showcase](../../../showcase/m1-definition-deployment/README.md) provides the first complete real-host journey.

Run the package gate with `./scripts/pnpm.sh --filter @bpmn-lean/platform-server test`.
