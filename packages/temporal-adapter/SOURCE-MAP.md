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

### Message key-correlation ownership

- Protocol: [`correlation-ingress.ts`](protocol/src/correlation-ingress.ts) owns complete address identity, protocol version, and fixed production capacity; [`correlation-candidate-registration.ts`](protocol/src/correlation-candidate-registration.ts) owns prepare/finalize identity and candidate/activity/future-result charges; [`correlation-candidate-scan.ts`](protocol/src/correlation-candidate-scan.ts) owns begin/finish identity and the all-or-complete Activity vector; and [`correlation-publication-admission.ts`](protocol/src/correlation-publication-admission.ts) owns publication identity, queue, ledger, reservation, status, capacity, ordinal, target, and stored resolution.

- Client: [`correlation-ingress-client.ts`](client/src/correlation-ingress-client.ts) owns shared start-or-recover and unconditional exact-echo validation.

- Workflow registration and scan: [`correlation-candidate-registration.ts`](workflow/src/correlation-candidate-registration.ts) owns pending/active/quarantined state and mutually exclusive barriers; [`correlation-ingress-scan.ts`](workflow/src/correlation-ingress-scan.ts) installs and retains the barrier around the bounded [`correlation-candidate-scan-activity.ts`](workflow/src/correlation-candidate-scan-activity.ts) proxy.

- Workflow publication: [`correlation-publication-admission.ts`](workflow/src/correlation-publication-admission.ts) atomically reserves admission and assigns FIFO ordinals; [`correlation-publication-settlement.ts`](workflow/src/correlation-publication-settlement.ts) validates the complete barrier vector before exact-cardinality matching, zero/ambiguous replacement, or sole-target retention.

- Worker and composition: [`correlation-candidate-scan-activity.ts`](worker/src/correlation-candidate-scan-activity.ts) describes and Queries every finalized Process locator without partial success; [`correlation-ingress-workflow.ts`](workflow/src/correlation-ingress-workflow.ts) composes the transitions one ordinal at a time without target delivery.

[`process-correlation-registration.ts`](protocol/src/process-correlation-registration.ts) owns the strict Process candidate Query, registration Activity, staged continuation, and typed resolution contracts. The Workflow [staging owner](workflow/src/process-correlation-registration.ts) derives one exact pre-state/successor transaction, while the [cycle owner](workflow/src/process-correlation-registration-cycle.ts) keeps prepare, atomic successor installation, finalize, retry, and host failure exhaustive and side-effect free until its caller applies the result. The Worker [Activity owner](worker/src/correlation-registration-activities.ts) ensures the exact ingress, runs prepare or finalize, and verifies the Process candidate Query before finalization; [`workflow-implementation.ts`](workflow/src/workflow-implementation.ts) only composes that cycle with retained publication, recovery, and Message ledgers.

## Dependency boundary

There is no umbrella package export. Product 2 reaches the client only through [`platform/foundation/engine-gateway`](../../platform/foundation/engine-gateway/README.md); it does not import the Workflow, Worker, runner, protocol, or testkit packages directly. The [adapter architecture](../../docs/ARCHITECTURE.md#temporal-adapter-subsystem) owns dependency direction.
