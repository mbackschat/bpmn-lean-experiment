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

The Workflow package keeps each managed readiness family in its own module. [`message-bounded-activity-readiness-scheduler.ts`](workflow/src/message-bounded-activity-readiness-scheduler.ts) owns exact Activity/Message pairing and Signal/Update co-readiness; [`activation-tagged-readiness.ts`](workflow/src/activation-tagged-readiness.ts) owns only the shared activation-closing batch mechanism; [`workflow-command-ingress.ts`](workflow/src/workflow-command-ingress.ts), [`workflow-host-readiness.ts`](workflow/src/workflow-host-readiness.ts), and [`workflow-implementation.ts`](workflow/src/workflow-implementation.ts) compose those mechanisms without defining BPMN winners.

There is no umbrella package export. Product 2 reaches the client only through [`platform/foundation/engine-gateway`](../../platform/foundation/engine-gateway/README.md); it does not import the Workflow, Worker, runner, protocol, or testkit packages directly. The [adapter architecture](../../docs/ARCHITECTURE.md#temporal-adapter-subsystem) owns dependency direction.
