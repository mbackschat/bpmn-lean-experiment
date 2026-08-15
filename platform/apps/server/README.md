# Platform server

`@bpmn-lean/platform-server` is the Node composition root for Product 2's public HTTP API. It wires platform modules, SQLite owners, the engine gateway, recovery, and local configuration without owning BPMN meaning or module business rules.

## What you can do

Run the local API used by the web application for definition deployment and start, source and diagram retrieval, schedules, Message Start, Process search and execution, human work, incidents, audit, and metrics.

## Quick start

With Temporal available at the configured address, run:

```sh
./scripts/pnpm.sh run platform:serve
```

The default listener is `http://127.0.0.1:3000`, with local state under ignored `.data/platform/`. Environment-variable configuration and startup recovery are owned by the application source and verified by its focused tests.

## Learn more

- [Platform web application](../web/README.md) is the browser client for this API.
- [Architecture](../../../docs/ARCHITECTURE.md#applications) owns composition, dependency direction, and deployment shape.
- [Platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md) owns the public product contract.
- [Implementation map](../../../docs/IMPLEMENTATION-MAP.md) records the exact current server surface.
- [M1 showcase](../../../showcase/m1-definition-deployment/README.md) provides the first complete real-host journey.

Run the package gate with `./scripts/pnpm.sh --filter @bpmn-lean/platform-server test`.
