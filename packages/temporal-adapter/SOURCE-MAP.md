# Temporal adapter source map

This contributor map assigns package responsibilities and Temporal SDK ownership. Human orientation and commands start in the [README](README.md); lifecycle semantics and current evidence remain in the linked specifications and evidence map.

| Package | Responsibility | Temporal SDK ownership |
|---|---|---|
| [`protocol/`](protocol/) | Project-owned hosting contracts, identities, admission, transport, and lifecycle results | None |
| [`client/`](client/) | Workflow start, Query, Update, Signal, Schedule, description, and client connection boundaries | `@temporalio/client` |
| [`workflow/`](workflow/) | Deterministic Workflow implementation and Workflow-owned scheduling | `@temporalio/workflow` |
| [`worker/`](worker/) | Worker connection and Workflow bundling | `@temporalio/worker` |
| [`runner/`](runner/) | Product 1 command and host-interaction driver | No direct SDK dependency |
| [`testkit/`](testkit/) | Ephemeral servers, differential runners, mutations, probes, and replay evidence | Client, testing, Worker, and Workflow SDK packages |

There is no umbrella package export. Product 2 reaches the client only through [`platform/foundation/engine-gateway`](../../platform/foundation/engine-gateway/README.md); it does not import the Workflow, Worker, runner, protocol, or testkit packages directly. The [adapter architecture](../../docs/ARCHITECTURE.md#temporal-adapter-subsystem) owns dependency direction.
