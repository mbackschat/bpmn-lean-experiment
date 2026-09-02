# Semantic core source map

This contributor map assigns source-file responsibilities inside `@bpmn-lean/semantic-core`. Package purpose and usage start in the [README](README.md); semantic contracts and current support remain in the linked specifications and implementation map.

## Source ownership

| Source owner | Responsibility |
|---|---|
| [semantic-value-contract.ts](src/semantic-value-contract.ts) | Shared immutable value shapes carried by checked graphs and programs |
| [contract.ts](src/contract.ts) | Scenario, stimulus, outcome, and public identity wire shapes |
| [wire.ts](src/wire.ts) | Exact non-normalized wire strings, rejecting lone UTF-16 surrogates |
| [deep-readonly.ts](src/deep-readonly.ts) | The project-owned deeply immutable contract utility |
| [semantic-process-state.ts](src/semantic-process-state.ts) | Committed runtime-state shape: control tokens, scopes, waits, and occurrence records |
| [checked-process-contract.ts](src/checked-process-contract.ts) | Project-owned checked BPMN graph contract |
| [semantic-process-contract.ts](src/semantic-process-contract.ts) | Immutable Semantic Process IL contract |
| [compensation-activity-retention-contract.ts](src/compensation-activity-retention-contract.ts) | Hidden boundary Compensation declaration, completion facts, retained-record, and refusal contracts |
| [compensation-activity-retention-state-validation.ts](src/compensation-activity-retention-state-validation.ts) | Exact declaration and hidden-register validity plus canonical retained-record byte measurement |
| [compensation-activity-retention.ts](src/compensation-activity-retention.ts) | Pure bounded eligibility classification, append-only retention, and root-register initialization |
| [compensation-activity-retention-producers.ts](src/compensation-activity-retention-producers.ts) | Pre-mutation retention staging for exact ordinary and current Multi-Instance completion producers, including zero-item outer identity issuance |
| [compensation-event-sub-process-snapshot-contract.ts](src/compensation-event-sub-process-snapshot-contract.ts) | Hidden Compensation Event Sub-Process snapshot declaration, runtime retention, and defect contracts |
| [compensation-event-sub-process-snapshot.ts](src/compensation-event-sub-process-snapshot.ts) | Pure bounded reservation, completion-time promotion, unsuccessful-parent purge, and containing-root disposition |
| [compensation-event-sub-process-snapshot-state-validation.ts](src/compensation-event-sub-process-snapshot-state-validation.ts) | Exact declaration and lifecycle validity, declaration-derived dormant-handler facts, and canonical retention byte measurement |
| [compensation-trigger-handler-contract.ts](src/compensation-trigger-handler-contract.ts) | Closed Program declaration for Compensation subjects, single-effect handler bodies, dependencies, and trigger limits |
| [compensation-trigger-handler-program-admission.ts](src/compensation-trigger-handler-program-admission.ts) | Exact Program-only root, trigger, retention/snapshot coverage, identity, dependency, and limit admission while execution remains dormant |
| [semantic-process-admission.ts](src/semantic-process-admission.ts) | Structural scenario and program validation plus identity admission |
| [semantic-process-operation-admission.ts](src/semantic-process-operation-admission.ts) | Closed operation-shape, payload, reference, and origin validation |
| [semantic-command-admission.ts](src/semantic-command-admission.ts) | Whether one submitted external command commits, and to which successor state |
| [semantic-process-graph-admission.ts](src/semantic-process-graph-admission.ts) | Producer and consumer consistency, reachability, co-reachability, cycle-policy validation, and the private declaration-derived dormant-handler composition seam |
| [semantic-process-graph-policy.ts](src/semantic-process-graph-policy.ts) | Profile-owned graph policy shared by checked-source and Semantic Process admission |
| [semantic-process-profile.ts](src/semantic-process-profile.ts) | Profile-selected operation capabilities |
| [checked-process-profile-shape.ts](src/checked-process-profile-shape.ts) | Profile-selected checked-node shapes |
| [semantic-program-profile-shape.ts](src/semantic-program-profile-shape.ts) | Profile-selected operation shapes |
| [semantic-profile-catalog.ts](src/semantic-profile-catalog.ts) | Semantic profile identities |
| [semantic-profile-observations.ts](src/semantic-profile-observations.ts) | The exact observation request order retained by profiles predating Multi-Instance support |
| [source-overlay-identity.ts](src/source-overlay-identity.ts) | Exact identity of an optional data-only source overlay selected at compilation |
| [semantic-profile-value-domain.ts](src/semantic-profile-value-domain.ts) | Profile-sensitive value admission by command surface |
| [simple-boolean-expression.ts](src/simple-boolean-expression.ts) | Evaluation of one admitted Simple Boolean v1 AST over complete Process bindings |
| [simple-boolean-choice-admission.ts](src/simple-boolean-choice-admission.ts) | Exact program admission for the Simple Boolean conditional-choice surface |
| [exact-balanced-two-branch-topology.ts](src/exact-balanced-two-branch-topology.ts) | The exact entry, balanced two-branch split/join, and end control shape |
| [user-task-metadata.ts](src/user-task-metadata.ts) | Assignment-only User Task metadata, wire-distinct from the legacy form-bearing arm |
| [variable-value.ts](src/variable-value.ts) | Representation-neutral variable-value validation, cloning, ordering, and equality |
| [semantic-process-data.ts](src/semantic-process-data.ts) | Effect-occurrence input mappings and Activity variable-scope lifecycle |
| [local-data-owner.ts](src/local-data-owner.ts) | Closed effect-or-Activity ownership identity for Activity-local variable scopes |
| [call-activity-admission.ts](src/call-activity-admission.ts) | Cross-definition invocation and return pairing |
| [semantic-process-call-runtime.ts](src/semantic-process-call-runtime.ts) | Called-instance lifecycle and subtree cleanup |
| [effect-transport-material.ts](src/effect-transport-material.ts) | Definition fields stable across compiler-only changes, deliberately distinct from semantic identity |
| [semantic-process-error-runtime.ts](src/semantic-process-error-runtime.ts) | Error propagation and handler selection |
| [semantic-process-scope-cancellation.ts](src/semantic-process-scope-cancellation.ts) | Shared scope-subtree classification and regional cancellation |
| [semantic-process-termination-runtime.ts](src/semantic-process-termination-runtime.ts) | Containing-scope termination |
| [semantic-process-bounded-scope-runtime.ts](src/semantic-process-bounded-scope-runtime.ts) | Bounded-scope entry, deadline withdrawal, and interruption |
| [semantic-process-control-flow-runtime.ts](src/semantic-process-control-flow-runtime.ts) | Control-flow token transitions owning no wait, occurrence, or scope lifecycle |
| [semantic-process-cyclic-control-flow-runtime.ts](src/semantic-process-cyclic-control-flow-runtime.ts) | Exclusive Merge token movement for the resumption-bounded cyclic capsule |
| [semantic-process-scope-runtime.ts](src/semantic-process-scope-runtime.ts) | Token consumption at a scope-hosting Activity |
| [semantic-process-wait-runtime.ts](src/semantic-process-wait-runtime.ts) | Ordinary User Task, Timer, and Effect arming entry points over the shared exact local-edit patch |
| [bounded-wait-admission.ts](src/bounded-wait-admission.ts) | Well-formedness of the three boundary-deadline operations and their shared deadline arm |
| [semantic-process-user-task-runtime.ts](src/semantic-process-user-task-runtime.ts) | The ordinary non-specialized User Task completion arm |
| [semantic-process-activity-arming.ts](src/semantic-process-activity-arming.ts) | Shared exact Activity record, User Task wait, and attached Timer arming for both boundary-task families |
| [semantic-process-bounded-task-runtime.ts](src/semantic-process-bounded-task-runtime.ts) | A User Task occurrence owning an interrupting boundary Timer |
| [semantic-process-message-bounded-task-runtime.ts](src/semantic-process-message-bounded-task-runtime.ts) | A User Task occurrence owning an interrupting boundary Message subscription |
| [semantic-process-monitored-task-runtime.ts](src/semantic-process-monitored-task-runtime.ts) | A User Task occurrence owning a non-interrupting boundary Timer |
| [semantic-process-activity-data-input-runtime.ts](src/semantic-process-activity-data-input-runtime.ts) | A User Task occurrence whose entry waits on one Process binding and copies it into the Activity's own scope |
| [activity-data-input-contract.ts](src/activity-data-input-contract.ts) | The Task-neutral value describing one direct Data Input Association |
| [activity-data-input-observation.ts](src/activity-data-input-observation.ts) | The one-element selected-input collection an open task publishes |
| [semantic-process-activity-data-output-runtime.ts](src/semantic-process-activity-data-output-runtime.ts) | A User Task occurrence whose accepted completion fills one declared output and writes it through the association |
| [activity-data-output-contract.ts](src/activity-data-output-contract.ts) | The Task-neutral value describing one direct Data Output Association |
| [catch-event-payload-contract.ts](src/catch-event-payload-contract.ts) | The Event-owned output and direct association identities for one payload-bearing catch Event |
| [correlation-scalar-path.ts](src/correlation-scalar-path.ts) | Closed decoded Message-payload and Process-property selector values for key correlation |
| [message-key-correlation.ts](src/message-key-correlation.ts) | Complete immutable definition address, exact candidate projection and matching, and content-bound per-instance correlated Message delivery |
| [event-race-admission.ts](src/event-race-admission.ts) | Well-formedness of the event-race await operation |
| [semantic-process-event-race-runtime.ts](src/semantic-process-event-race-runtime.ts) | Atomic replacement of one Gateway token with both waits and their ownership record |
| [inclusive-gateway-admission.ts](src/inclusive-gateway-admission.ts) | Standalone contract and pairing admission for selected-branch synchronization |
| [semantic-process-inclusive-gateway-runtime.ts](src/semantic-process-inclusive-gateway-runtime.ts) | Selected-branch split and join for structured Inclusive Gateway regions |
| [message-channel.ts](src/message-channel.ts) | Closed Message-channel validation and equality |
| [semantic-process-message.ts](src/semantic-process-message.ts) | Message activation, delivery, refusal, and projection |
| [semantic-process-incident-validation.ts](src/semantic-process-incident-validation.ts) | Incident-state validation before dispatch |
| [semantic-process-incident-runtime.ts](src/semantic-process-incident-runtime.ts) | Effect-failure reporting and incident retry |
| [semantic-process-incident-cancellation.ts](src/semantic-process-incident-cancellation.ts) | Incident-gated root cancellation |
| [semantic-process-triggered-start.ts](src/semantic-process-triggered-start.ts) | Shared triggered-start occurrence and token mechanics |
| [semantic-process-message-start.ts](src/semantic-process-message-start.ts) | Message-start admission and initiation |
| [semantic-process-timer-start.ts](src/semantic-process-timer-start.ts) | Timer-start admission and initiation |
| [runtime-state-identity-bound.ts](src/runtime-state-identity-bound.ts) | User Task, Timer, and Activity live-identity bounds against matching activation counters |
| [runtime-state-well-formedness.ts](src/runtime-state-well-formedness.ts) | Aggregate runtime-state invariant validation, monotone-regression detection, and the gated defect set |
| [activity-occurrence.ts](src/activity-occurrence.ts) | One runtime record per Activity occurrence owning state beyond its body |
| [activity-body-turnover.ts](src/activity-body-turnover.ts) | Replacing what an Activity occurrence owns without replacing the occurrence |
| [runtime-state-defect.ts](src/runtime-state-defect.ts) | Stable classes of malformed committed runtime state |
| [runtime-state-collection-ordering.ts](src/runtime-state-collection-ordering.ts) | Internal canonical ordering for commutation-affected RuntimeState collections |
| [internal-commutation-census.ts](src/internal-commutation-census.ts) | Exhaustive operation-family and cross-language RuntimeState atom-domain classification without enabling a transition |
| [internal-transition-alternative.ts](src/internal-transition-alternative.ts) | Exact operation and Exclusive Gateway merge-input alternative keys with canonical discriminator-first ordering |
| [internal-transition-attempt.ts](src/internal-transition-attempt.ts) | Pre-mutation Compensation Event Sub-Process reservation and promotion staging for the evaluator's private three-arm attempt |
| [internal-transition-activity-association.ts](src/internal-transition-activity-association.ts) | Private conflict predicate over Activity identity, body-member ownership, and attached-Timer ownership |
| [internal-transition-activity-arming-preparation.ts](src/internal-transition-activity-arming-preparation.ts) | Exact boundary-task Activity, body wait, attached Timer, activation, public-anchor, association, and token footprint without applying the transition |
| [internal-transition-bounded-scope-preparation.ts](src/internal-transition-bounded-scope-preparation.ts) | Exact bounded Sub-Process child, parent relation, Activity, deadline, activation, public-anchor, and token footprint without applying the transition |
| [internal-transition-end-preparation.ts](src/internal-transition-end-preparation.ts) | Exact ordinary None End token and commutative End-increment state footprint without applying the transition |
| [internal-transition-error-preparation.ts](src/internal-transition-error-preparation.ts) | Exact Error-interruption region, throwing token, and parent-handler-output state footprint without applying the transition |
| [internal-transition-event-race-preparation.ts](src/internal-transition-event-race-preparation.ts) | Exact Event-Based Gateway race, paired waits, activations, public anchors, association, and token footprint without applying the transition |
| [internal-transition-local-control-preparation.ts](src/internal-transition-local-control-preparation.ts) | Exact Parallel, Exclusive, and Inclusive Gateway alternatives with complete token, condition-read, and selected-branch pre-state footprints |
| [internal-transition-merge-preparation.ts](src/internal-transition-merge-preparation.ts) | Every exact offered Exclusive Gateway merge-input alternative and its pre-state token footprint without list-order selection |
| [internal-transition-parallel-multi-instance-preparation.ts](src/internal-transition-parallel-multi-instance-preparation.ts) | Exact zero-item or armed parallel Multi-Instance entry with controller presence, indexed snapshot and child slots, Activity, task waits, deadline, data, activation, public-anchor, and token footprints |
| [internal-transition-region.ts](src/internal-transition-region.ts) | Exact pre-state occurrence ownership through scope-parent and caller-to-called-root edges without applying a transition |
| [internal-transition-return-preparation.ts](src/internal-transition-return-preparation.ts) | Exact Call-return region, association, and caller-output state footprint without applying the transition |
| [internal-transition-scope-completion-preparation.ts](src/internal-transition-scope-completion-preparation.ts) | Exact scope-completion region, parent/root continuation, bounded Activity, and deadline state footprint without applying the transition |
| [internal-transition-scope-creation-preparation.ts](src/internal-transition-scope-creation-preparation.ts) | Exact child-scope and Call invocation alternatives with fresh occurrence, parent or caller, activation, association, and token footprints |
| [internal-transition-sequential-multi-instance-preparation.ts](src/internal-transition-sequential-multi-instance-preparation.ts) | Exact zero-item or armed sequential Multi-Instance entry with controller presence, indexed snapshot, Activity, body wait, deadline, data, activation, public-anchor, and token footprints |
| [internal-transition-termination-preparation.ts](src/internal-transition-termination-preparation.ts) | Exact Terminate End retained-root region, offered token, and commutative End-increment state footprint without applying the transition |
| [internal-transition-token-preparation.ts](src/internal-transition-token-preparation.ts) | Shared exact pre-state token-bucket predicates for prepared transitions |
| [internal-transition-wait-census.ts](src/internal-transition-wait-census.ts) | Complete ordinary and composite wait-declarer census plus untagged open-anchor exclusion |
| [internal-transition-footprint-vocabulary.ts](src/internal-transition-footprint-vocabulary.ts) | Closed internal state and publication atom discriminators |
| [internal-transition-footprint-ordering.ts](src/internal-transition-footprint-ordering.ts) | Canonical atom and paired-publication ordering without locale collation |
| [internal-transition-footprint.ts](src/internal-transition-footprint.ts) | Exact-prestate footprint derivation and sufficient two-operation non-interference classification |
| [internal-transition-initiation-preparation.ts](src/internal-transition-initiation-preparation.ts) | Exact singleton Process-initiation footprint, local patch, and numbering-free instantaneous publication derived from the pre-state |
| [internal-transition-initiation-patch.ts](src/internal-transition-initiation-patch.ts) | Shared local Process-initiation edits for None, Message, and Timer starts without whole-state replacement |
| [internal-publication-template.ts](src/internal-publication-template.ts) | Private numbering-free transition and lifecycle templates with canonical alternative sorting and late command, transition, and local-index instantiation |
| [internal-transition-ordinary-arming-preparation.ts](src/internal-transition-ordinary-arming-preparation.ts) | Exact ordinary User Task, Message, Timer, and Effect arming footprints plus numbering-free transition and wait-lifecycle publications derived from the pre-state |
| [internal-transition-ordinary-arming-patch.ts](src/internal-transition-ordinary-arming-patch.ts) | Exact local edits for ordinary wait arming, shared by pre-frontier preparation and the existing evaluator without whole-state replacement or successor-state inference |
| [semantic-process-closure.ts](src/semantic-process-closure.ts) | Bounded closure over single-enabled and reviewed exact-two internal frontiers with whole-batch refusal precedence |
| [semantic-process-runtime.ts](src/semantic-process-runtime.ts) | Runtime state, three-arm internal-operation dispatch, whole-stimulus rollback, and `applyStimulus` |
| [semantic-transition-trace.ts](src/semantic-transition-trace.ts) | Committed transition facts and trace replay validation |
| [flow-node-occurrence-candidates.ts](src/flow-node-occurrence-candidates.ts) | Program-selected element and Process resolution for occurrence owners |
| [flow-node-occurrence-lifecycle.ts](src/flow-node-occurrence-lifecycle.ts) | Flow-node lifecycle derivation and fold validation |
| [flow-node-occurrence-open-set.ts](src/flow-node-occurrence-open-set.ts) | Open flow-node occurrence projection |
| [flow-node-occurrence-publication-completeness.ts](src/flow-node-occurrence-publication-completeness.ts) | Internal-transition publication completeness |
| [flow-node-occurrence-publication-external-completeness.ts](src/flow-node-occurrence-publication-external-completeness.ts) | External-stimulus and cancellation publication completeness |
| [flow-node-occurrence-sequential-multi-instance.ts](src/flow-node-occurrence-sequential-multi-instance.ts) | Sequential Multi-Instance inner-instance occurrence accounting |
| [flow-node-occurrence-boundary-starts.ts](src/flow-node-occurrence-boundary-starts.ts) | Candidate lifecycle starts derived independently at one evaluator transition boundary |
| [flow-node-occurrence-retained-pairing.ts](src/flow-node-occurrence-retained-pairing.ts) | The retained half of the Activity occurrence record for state-free consumers |
| [sequential-multi-instance-contract.ts](src/sequential-multi-instance-contract.ts) | Registered sequential Multi-Instance profile identity across source, IL, runtime, and host |
| [sequential-multi-instance-controller.ts](src/sequential-multi-instance-controller.ts) | The outer sequential controller, storing generators rather than counters |
| [sequential-multi-instance-binding.ts](src/sequential-multi-instance-binding.ts) | The exact program-to-runtime binding of one open sequential controller |
| [sequential-multi-instance-admission.ts](src/sequential-multi-instance-admission.ts) | Well-formedness of the sequential Multi-Instance await operation |
| [sequential-multi-instance-command-data-admission.ts](src/sequential-multi-instance-command-data-admission.ts) | The sequential Multi-Instance operation selected by the registered program shape |
| [semantic-process-sequential-multi-instance-runtime.ts](src/semantic-process-sequential-multi-instance-runtime.ts) | Sequential Multi-Instance entry, iteration, completion, and interruption transitions |
| [sequential-multi-instance-observation.ts](src/sequential-multi-instance-observation.ts) | Public progress projection for open sequential Multi-Instance Activities |
| [parallel-multi-instance-contract.ts](src/parallel-multi-instance-contract.ts) | Registered parallel Multi-Instance profile identity across source, IL, runtime, and host |
| [parallel-multi-instance-controller.ts](src/parallel-multi-instance-controller.ts) | One outer parallel Activity with immutable input order and fixed index-owned slots |
| [parallel-multi-instance-binding.ts](src/parallel-multi-instance-binding.ts) | The complete program-to-runtime binding of every open parallel controller |
| [parallel-multi-instance-admission.ts](src/parallel-multi-instance-admission.ts) | Well-formedness of the parallel Multi-Instance await and complete operations |
| [parallel-multi-instance-command-data-admission.ts](src/parallel-multi-instance-command-data-admission.ts) | Admitted parallel input collection, completion policy, and child result |
| [parallel-multi-instance-state-validation.ts](src/parallel-multi-instance-state-validation.ts) | Controller defect facts decidable from one committed state and its complete program |
| [semantic-process-parallel-multi-instance-runtime.ts](src/semantic-process-parallel-multi-instance-runtime.ts) | Parallel Multi-Instance entry, child completion, and interruption transitions |
| [parallel-multi-instance-observation.ts](src/parallel-multi-instance-observation.ts) | Public progress derived from the exact indexed parallel controller binding |
| [multi-instance-observation.ts](src/multi-instance-observation.ts) | Composition root for the additive sequential and parallel progress union |
| [flow-node-occurrence-parallel-multi-instance-lifecycle.ts](src/flow-node-occurrence-parallel-multi-instance-lifecycle.ts) | Exact starts created by one atomic parallel entry transition |
| [flow-node-occurrence-parallel-multi-instance-open-set.ts](src/flow-node-occurrence-parallel-multi-instance-open-set.ts) | Exact current-open bindings for parallel Multi-Instance task and boundary waits |
| [flow-node-occurrence-parallel-multi-instance-publication.ts](src/flow-node-occurrence-parallel-multi-instance-publication.ts) | Publication completeness for parallel Multi-Instance child lifecycles |
| [control-position-projection.ts](src/control-position-projection.ts) | Public control-position projection and transition deltas |
| [scenario.ts](src/scenario.ts) | Stable observation and scenario evaluation |
| [stimulus.ts](src/stimulus.ts) | Stimulus validation, command identity, and equality |
| [index.ts](src/index.ts) | The package's public export surface |

## Test ownership

Tests under [`test/`](test/) mirror these owners by contract or semantic family. The [testing specification](../../docs/TESTING-SPEC.md) selects the applicable focused and repository gates.
