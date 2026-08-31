# Temporal adapter source map

This contributor map assigns package responsibilities and Temporal SDK ownership. Human orientation and commands start in the [README](README.md); lifecycle semantics and current evidence remain in the linked specifications and evidence map.

## Package ownership

| Package | Responsibility | Temporal SDK ownership |
|---|---|---|
| [`protocol/`](protocol/) | Project-owned hosting contracts, identities, admission, transport, and lifecycle results | None |
| [`client/`](client/) | Workflow start, Query, Update, Signal, Schedule, description, and client connection boundaries | `@temporalio/client` |
| [`workflow/`](workflow/) | Deterministic Workflow implementation and Workflow-owned scheduling | `@temporalio/workflow` |
| [`worker/`](worker/) | Worker connection and Workflow bundling | `@temporalio/worker` |
| [`runner/`](runner/) | Product 1 command and host-interaction driver | No direct SDK dependency |
| [`testkit/`](testkit/) | Ephemeral servers, differential runners, mutations, probes, and replay evidence | Client, testing, Worker, and Workflow SDK packages |

The Workflow package keeps each managed readiness family in its own module. [`message-bounded-activity-readiness-scheduler.ts`](workflow/src/message-bounded-activity-readiness-scheduler.ts) owns exact Activity/Message pairing, Signal/Update co-readiness, and wakeup of inexact callbacks that semantic admission must refuse; [`activation-tagged-readiness.ts`](workflow/src/activation-tagged-readiness.ts) owns only the shared activation-closing batch mechanism; [`workflow-command-ingress.ts`](workflow/src/workflow-command-ingress.ts), [`workflow-host-readiness.ts`](workflow/src/workflow-host-readiness.ts), and [`workflow-implementation.ts`](workflow/src/workflow-implementation.ts) compose those mechanisms without defining BPMN winners. [`activity-boundary-message-temporal-support.ts`](testkit/test/activity-boundary-message-temporal-support.ts) binds the shared exact-source fixture used by the [direct-VM witness](testkit/test/activity-boundary-message-temporal-witness.ts) and the [real-service refinement witness](testkit/test/activity-boundary-message-refinement.temporal-test.ts); the latter owns forced continuation, Worker replacement, typed coalescence failure, Event History assertions, and replay evidence.

## Dependency boundary

There is no umbrella package export. Product 2 reaches the client only through [`platform/foundation/engine-gateway`](../../platform/foundation/engine-gateway/README.md); it does not import the Workflow, Worker, runner, protocol, or testkit packages directly. The [adapter architecture](../../docs/ARCHITECTURE.md#temporal-adapter-subsystem) owns dependency direction.
