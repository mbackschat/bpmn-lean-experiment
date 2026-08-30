# Neutral scenarios

This directory contains implementation-neutral BPMN resources, semantic stimuli, provenance, and requested observations. Target scenario documents never contain expected outcomes or traces.

## Scenario families

- The [User Task discovery and completion capsule](user-task-discovery-completion/README.md) owns one exact BPMN file and three separating scenarios: exact completion, wrong activation, and stale completion.
- The [parallel fork/join scenarios](parallel-fork-join/README.md) add one content-addressed balanced source plus explicit A-then-B and B-then-A completion orders under their separate normative draft profile.
- The [Intermediate Catch Timer scenario](intermediate-catch-timer/README.md) supplies the exact `PT1S` source and answer-free `fireTimer` input used across Lean, the TypeScript core, controlled-clock CIB, and committed-state-derived Temporal firing.
- The [Timer/User Task composition scenario](timer-user-task-composition/README.md) is the first profile-parameterized structural-admission witness and compares Lean, the core, and Temporal without a CIB composition target.
- The [User Task with preserved notation scenario](user-task-preserved-notation/README.md) is the first source carrying material the engine retains without executing, and its executed content is deliberately identical to the User Task discovery source so the two form a twin pair.
- The [User Task Process-data with preserved notation scenario](user-task-process-data-preserved-notation/README.md) composes the same execution projection with String/Null start and completion data under one named profile.
- The [Intermediate Catch Message scenario](intermediate-catch-message/README.md) supplies the exact payload-free Message/Interface/Operation reference chain and direct `deliverMessage` input for Lean, the core, and durable Temporal Signal delivery without a CIB Message target.
- The [Message payload catch mediation scenarios](message-payload-catch/README.md) supply the exact shared ItemDefinition, operation-addressed Message, Event-owned required DataOutput, OutputSet membership, direct Process Property association, and three answer-free scalar, explicit-null, and absent-payload schedules for the full Lean/core/Temporal pipeline.
- The [Message-addressed Receive Task scenario](message-addressed-receive-task/README.md) supplies the exact direct-Message source and answer-free delivery shared by retained CIB evidence, independent Lean/core execution, the four-target differential, and Temporal Signal/replay evidence.
- The [Service Task effect scenario](service-task-effect/README.md) supplies the exact extension-bound source and answer-free `completeEffect` input whose Temporal realization is derived only after Activity success.
- The [Simple Boolean Exclusive Gateway scenario](exclusive-gateway-simple-boolean/README.md) is a standards-profile Lean/core/Temporal witness with CIB retained only as separate order calibration.
- The [structured Inclusive Gateway scenarios](inclusive-gateway-selected-branches/README.md) distinguish one true branch, both selected branches in both completion orders, and the default under a standards-only Lean/core/Temporal target set.
- The [Event-Based Gateway scenarios](event-based-gateway-message-timer/README.md) order the exact Message delivery and the exact `PT1S` firing first in turn, carrying no winner annotation.
- The [interrupting Activity boundary Timer scenarios](activity-boundary-timer/README.md) register the bounded-task completion and the exact `PT1S` deadline firing over one source whose two routes reach distinct follow-on User Tasks. The refused pre-due firing, which is the only discriminator of this capsule's recorded arming instant, remains a Lean-only witness and is **not** a registered scenario.
- The [interrupting Sub-Process boundary Timer scenarios](subprocess-boundary-timer/README.md) register the child-scope quiescent completion and the exact `PT1S` deadline firing over one source whose two routes reach distinct follow-on User Tasks. Two witnesses stay outside the registry for distinct structural reasons: the refused pre-due firing, because the host derives its instant from the wait's own committed deadline, and the post-victory stale refusal, because only completion stimuli reach Temporal and a stale completion after the deadline races the host's own firing.
- The [non-interrupting boundary Timer source](non-interrupting-boundary-timer/README.md) holds the exact `cancelActivity="false"` source whose firing spawns a concurrent handler branch beside its still-active host; its answer-free schedules follow the capsule's semantic checkpoint and are not registered yet.
- The [Sequential Multi-Instance User Task scenarios](sequential-multi-instance/README.md) review three ordered items naturally or interrupt the second generated task through one outer-lifetime `PT1S` Timer, preserving exact `DataObjectReference` Process bindings and carrying no CIB Multi-Instance target.
- The [parallel Multi-Instance User Task scenarios](parallel-multi-instance/README.md) assess three risk dimensions concurrently, distinguish all-complete, first-complete, and deadline-interrupted schedules, preserve source-index result order under out-of-order completion, and carry no CIB Multi-Instance target.
- The [Activity data-input User Task scenarios](activity-data-input-user-task/README.md) start one invoice review with a present String, an explicit-null, or an absent Process Property, so an unavailable required Data Input Association is separated from an available one carrying null, and carry no CIB Data Association target.
- The [Activity data-output User Task scenarios](activity-data-output-user-task/README.md) complete one credit underwriting with a supplied String, a supplied explicit null, or no submitted output at all, so a routed Data Output Association write is separated from a name-merged one and an unavailable required output refuses completion, and carry no CIB Data Association target.
- The [called-Process Call Activity scenario](called-process-call-activity/README.md) supplies the exact two-Process source and the derived called semantic instance identity.
- The [ordinary embedded Sub-Process suite](embedded-subprocess-completion/README.md) covers both child orders and stale commands around quiescent child completion; the [Sub-Process Error-propagation suite](subprocess-error-propagation/README.md) covers both child orders plus stale sibling refusal after regional cancellation.
- The [mapped-success Service Task](mapped-success-service-task/README.md) and [mapped-boundary-Error Service Task](mapped-boundary-error-service-task/README.md) scenarios retain the two bounded mapping mechanisms under product-neutral CIB Seven `2.0.0` profiles.

The [resumption-bounded User Task cycle scenario](user-task-cycle/README.md) runs the same task definition through fresh activations 1, 2, and 3, exercises both conditional back-edges, and then takes the default exit. Its target remains answer-free and has no CIB cycle lane.

The [Service Task incident and retry scenario](service-task-incident/README.md) reuses the exact Service Task effect source and adds one answer-free literal-generation report, exact retry, and final success schedule.

The [Service Task incident root cancellation scenario](service-task-incident-cancellation/README.md) reuses that source with one committed string Process variable, a literal-generation report, and the exact incident-gated root cancellation command.

The [Message Start Event scenario](message-start-event/README.md) uses an exact operation-addressed `triggerMessageStart` stimulus to create one semantic Process instance, then completes the resulting User Task. It remains answer-free and has no CIB Message Start lane.

The [Timer Start Event scenario](timer-start-event/README.md) uses one exact resolved `triggerTimerStart` occurrence to create a semantic Process instance from a top-level `PT1S` Timer Start Event, then completes the resulting User Task. It remains answer-free, carries no due time or schedule policy, and has no CIB Timer Start lane.

The [Terminate End Event scenarios](terminate-end-event/README.md) cover Trigger-first containing-scope termination, Sibling-first completion before termination, and refusal of the canceled captured Sibling occurrence after termination. They are answer-free and select no CIB Terminate target.

The [configured Task scenario](configured-task/README.md) binds the byte-identical approved extension source to one empty-success effect completion followed by one User Task completion. It remains answer-free, reuses the existing Probe effect handler, and selects no CIB configured Task target.

The [Boolean User Task completion scenario](user-task-boolean-completion/README.md) reuses the byte-identical sequential User Task source and submits primitive Boolean `true` through the existing completion command. Its retained CIB evidence is separate, while Lean, the core, differential, and Temporal consume the same answer-free target.

The [User Task assignment and form metadata scenario](user-task-assignment-form-metadata/README.md) carries one literal group candidate and one Boolean generated-form field through the same existing User Task wait and completion command. Its source is byte-identical to the approved checkpoint fixture, and its target remains answer-free.

The [parallel User Task metadata composition scenarios](parallel-user-task-metadata-composition/README.md) use one independently authored balanced content-and-risk review model and exercise both task-completion orders. Both targets remain answer-free and retain their CIB evidence separately.

The [expense exception review scenarios](expense-exception-review/README.md) add bounded non-negative integer and ordered String-list completion data, assignment-only passive metadata, opaque Rendering, and three existing String-equality gateway outcomes. They remain answer-free standards-profile Lean, TypeScript, differential, and Temporal targets with no retained CIB terminal result.

Document shape is owned by the current [shared wire contracts](../contracts/README.md); semantic meaning is owned by the selected profile and capsule. Because the project is pre-release, a contract change replaces all scenario producers and consumers atomically instead of preserving parallel prototype formats.

A scenario must have the same meaning for every target its profile declares. It must not expose CIB database entities, Lean constructors, Temporal histories, future commands as current capabilities, or other host internals. A standards-only scenario does not acquire a CIB target merely because its provenance links a separate CIB calibration.

Each CIB evidence artifact references SHA-256 digests of its exact scenario and profile files. Verification loads evidence only after target input has been separated and never rewrites evidence during an ordinary run.
