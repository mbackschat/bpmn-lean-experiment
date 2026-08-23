# Semantic core source map

This contributor map assigns source-file responsibilities inside `@bpmn-lean/semantic-core`. Package purpose and usage start in the [README](README.md); semantic contracts and current support remain in the linked specifications and implementation map.

| Source owner | Responsibility |
|---|---|
| [semantic-value-contract.ts](src/semantic-value-contract.ts) | Shared immutable value shapes carried by checked graphs and programs |
| [checked-process-contract.ts](src/checked-process-contract.ts) | Project-owned checked BPMN graph contract |
| [semantic-process-contract.ts](src/semantic-process-contract.ts) | Immutable Semantic Process IL contract |
| [semantic-process-admission.ts](src/semantic-process-admission.ts) | Structural scenario and program validation plus identity admission |
| [semantic-process-operation-admission.ts](src/semantic-process-operation-admission.ts) | Closed operation-shape, payload, reference, and origin validation |
| [semantic-process-graph-admission.ts](src/semantic-process-graph-admission.ts) | Producer and consumer consistency, reachability, co-reachability, and cycle-policy validation |
| [semantic-process-profile.ts](src/semantic-process-profile.ts) | Profile-selected operation capabilities |
| [checked-process-profile-shape.ts](src/checked-process-profile-shape.ts) | Profile-selected checked-node shapes |
| [semantic-program-profile-shape.ts](src/semantic-program-profile-shape.ts) | Profile-selected operation shapes |
| [semantic-profile-catalog.ts](src/semantic-profile-catalog.ts) | Semantic profile identities |
| [semantic-profile-value-domain.ts](src/semantic-profile-value-domain.ts) | Profile-sensitive value admission by command surface |
| [variable-value.ts](src/variable-value.ts) | Representation-neutral variable-value validation, cloning, ordering, and equality |
| [call-activity-admission.ts](src/call-activity-admission.ts) | Cross-definition invocation and return pairing |
| [semantic-process-call-runtime.ts](src/semantic-process-call-runtime.ts) | Called-instance lifecycle and subtree cleanup |
| [semantic-process-error-runtime.ts](src/semantic-process-error-runtime.ts) | Error propagation and handler selection |
| [semantic-process-scope-cancellation.ts](src/semantic-process-scope-cancellation.ts) | Shared scope-subtree classification and regional cancellation |
| [semantic-process-termination-runtime.ts](src/semantic-process-termination-runtime.ts) | Containing-scope termination |
| [semantic-process-bounded-scope-runtime.ts](src/semantic-process-bounded-scope-runtime.ts) | Bounded-scope entry, deadline withdrawal, and interruption |
| [message-channel.ts](src/message-channel.ts) | Closed Message-channel validation and equality |
| [semantic-process-message.ts](src/semantic-process-message.ts) | Message activation, delivery, refusal, and projection |
| [semantic-process-incident-validation.ts](src/semantic-process-incident-validation.ts) | Incident-state validation before dispatch |
| [semantic-process-incident-runtime.ts](src/semantic-process-incident-runtime.ts) | Effect-failure reporting and incident retry |
| [semantic-process-incident-cancellation.ts](src/semantic-process-incident-cancellation.ts) | Incident-gated root cancellation |
| [semantic-process-triggered-start.ts](src/semantic-process-triggered-start.ts) | Shared triggered-start occurrence and token mechanics |
| [semantic-process-message-start.ts](src/semantic-process-message-start.ts) | Message-start admission and initiation |
| [semantic-process-timer-start.ts](src/semantic-process-timer-start.ts) | Timer-start admission and initiation |
| [semantic-process-runtime.ts](src/semantic-process-runtime.ts) | Runtime state, stimulus admission, operation dispatch, closure, and `applyStimulus` |
| [semantic-transition-trace.ts](src/semantic-transition-trace.ts) | Committed transition facts and trace replay validation |
| [flow-node-occurrence-candidates.ts](src/flow-node-occurrence-candidates.ts) | Program-selected element and Process resolution for occurrence owners |
| [flow-node-occurrence-lifecycle.ts](src/flow-node-occurrence-lifecycle.ts) | Flow-node lifecycle derivation and fold validation |
| [flow-node-occurrence-open-set.ts](src/flow-node-occurrence-open-set.ts) | Open flow-node occurrence projection |
| [flow-node-occurrence-publication-completeness.ts](src/flow-node-occurrence-publication-completeness.ts) | Internal-transition publication completeness |
| [flow-node-occurrence-publication-external-completeness.ts](src/flow-node-occurrence-publication-external-completeness.ts) | External-stimulus and cancellation publication completeness |
| [flow-node-occurrence-sequential-multi-instance.ts](src/flow-node-occurrence-sequential-multi-instance.ts) | Sequential Multi-Instance inner-instance occurrence accounting |
| [control-position-projection.ts](src/control-position-projection.ts) | Public control-position projection and transition deltas |
| [scenario.ts](src/scenario.ts) | Stable observation and scenario evaluation |
| [stimulus.ts](src/stimulus.ts) | Stimulus validation, command identity, and equality |

Tests under [`test/`](test/) mirror these owners by contract or semantic family. The [testing specification](../../docs/TESTING-SPEC.md) selects the applicable focused and repository gates.
