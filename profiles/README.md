# Semantic profiles

This directory contains reviewed semantic-profile artifacts. A profile identifies behavioral meaning and exactly one normative or executable-oracle authority; it is not a generic wire-format version.

## Artifact registry

- [BPMN 2.0.2 Activity boundary Message draft](bpmn-2.0.2-activity-boundary-message-draft/README.md)
- [BPMN 2.0.2 Activity boundary Timer draft](bpmn-2.0.2-activity-boundary-timer-draft/README.md)
- [BPMN 2.0.2 Activity data-input User Task draft](bpmn-2.0.2-activity-data-input-user-task-draft/README.md)
- [BPMN 2.0.2 Activity data-output User Task draft](bpmn-2.0.2-activity-data-output-user-task-draft/README.md)
- [BPMN 2.0.2 BPMN Lean configured Task effect draft](bpmn-2.0.2-bpmn-lean-configured-task-effect-draft/README.md)
- [BPMN 2.0.2 BPMN Lean structured Human Work draft](bpmn-2.0.2-bpmn-lean-structured-human-work-draft/README.md)
- [BPMN 2.0.2 bounded called-Process Call Activity draft](bpmn-2.0.2-called-process-call-activity-draft/README.md)
- [BPMN 2.0.2 Event-Based Gateway Message/Timer draft](bpmn-2.0.2-event-based-gateway-message-timer-draft/README.md)
- [BPMN 2.0.2 structured Inclusive Gateway draft](bpmn-2.0.2-inclusive-gateway-selected-branches-draft/README.md)
- [BPMN 2.0.2 Intermediate Catch Message draft](bpmn-2.0.2-intermediate-catch-message-draft/README.md)
- [BPMN 2.0.2 Message payload catch mediation draft](bpmn-2.0.2-message-payload-catch-draft/README.md)
- [BPMN 2.0.2 Message Start Event draft](bpmn-2.0.2-message-start-event-draft/README.md)
- [BPMN 2.0.2 non-interrupting boundary Timer draft](bpmn-2.0.2-non-interrupting-boundary-timer-draft/README.md)
- [BPMN 2.0.2 parallel Multi-Instance User Task draft](bpmn-2.0.2-parallel-multi-instance-user-task-draft/README.md)
- [BPMN 2.0.2 sequential Multi-Instance User Task draft](bpmn-2.0.2-sequential-multi-instance-user-task-draft/README.md)
- [BPMN 2.0.2 Simple Boolean Exclusive Gateway draft](bpmn-2.0.2-simple-boolean-exclusive-gateway-draft/README.md)
- [BPMN 2.0.2 Sub-Process boundary Timer draft](bpmn-2.0.2-subprocess-boundary-timer-draft/README.md)
- [BPMN 2.0.2 Terminate End Event draft](bpmn-2.0.2-terminate-end-event-draft/README.md)
- [BPMN 2.0.2 Timer Start Event draft](bpmn-2.0.2-timer-start-event-draft/README.md)
- [BPMN 2.0.2 Timer/User Task composition draft](bpmn-2.0.2-timer-user-task-composition-draft/README.md)
- [BPMN 2.0.2 resumption-bounded User Task cycle draft](bpmn-2.0.2-user-task-cycle-draft/README.md)
- [BPMN 2.0.2 User Task with preserved notation draft](bpmn-2.0.2-user-task-preserved-notation-draft/README.md)
- [CIB Seven 2.0.0 mapped-boundary-Error Service Task draft](cibseven-2.0.0-mapped-boundary-error-service-task-draft/README.md)
- [CIB Seven 2.0.0 mapped-success Service Task draft](cibseven-2.0.0-mapped-success-service-task-draft/README.md)
- [CIB Seven 2.2.0 embedded Sub-Process completion draft](cibseven-2.2.0-embedded-subprocess-completion-draft/README.md)
- [CIB Seven 2.2.0 Intermediate Catch Timer draft](cibseven-2.2.0-intermediate-catch-timer-draft/README.md)
- [CIB Seven 2.2.0 Message-addressed Receive Task draft](cibseven-2.2.0-message-addressed-receive-task-draft/README.md)
- [CIB Seven 2.2.0 parallel User Task metadata draft](cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft/README.md)
- [CIB Seven 2.2.0 Service Task effect draft](cibseven-2.2.0-service-task-effect-draft/README.md)
- [CIB Seven 2.2.0 Service Task incident cancellation draft](cibseven-2.2.0-service-task-incident-cancellation-draft/README.md)
- [CIB Seven 2.2.0 Service Task incident draft](cibseven-2.2.0-service-task-incident-draft/README.md)
- [CIB Seven 2.2.0 Sub-Process Error propagation draft](cibseven-2.2.0-subprocess-error-propagation-draft/README.md)
- [CIB Seven 2.2.0 User Task assignment and form metadata draft](cibseven-2.2.0-user-task-assignment-form-metadata-draft/README.md)
- [CIB Seven 2.2.0 Boolean User Task completion-data draft](cibseven-2.2.0-user-task-boolean-completion-data-draft/README.md)
- [CIB Seven 2.2.0 User Task Process data with preserved notation draft](cibseven-2.2.0-user-task-process-data-preserved-notation-draft/README.md)
- [CIB Seven 2.2.0 User Task Process-data draft](cibseven-2.2.0-user-task-process-data-draft/README.md)
- [Normative parallel fork/join draft](parallel-fork-join-draft/README.md)

The standards profiles name BPMN 2.0.2 as their authority and use CIB relationships only as separate behavioral calibration or for already-implemented interaction boundaries; the Inclusive Gateway rules themselves select no CIB relationship. Each executable-oracle profile retains its exact CIB revision and environment, bounded BPMN feature and observation surfaces, exclusions, and stable references into the [CIB-BPMN relationship register](../docs/CIB-BPMN-RELATION-REGISTER.md).

The [CIB Seven 2.2.0 User Task Process data with preserved notation draft profile](cibseven-2.2.0-user-task-process-data-preserved-notation-draft/README.md) composes the exact String/Null Process-data and User Task execution boundary with the standard source-preservation capability under one closed profile identity.

The [CIB Seven 2.2.0 parallel User Task metadata draft profile](cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft/README.md) composes the existing balanced two-branch Parallel Gateway lifecycle with two passive assignment/form metadata blocks and distinct Boolean completion keys.

The registry also contains the [BPMN 2.0.2 resumption-bounded User Task cycle draft profile](bpmn-2.0.2-user-task-cycle-draft/README.md). BPMN 2.0.2 owns its cycle and Exclusive Merge meaning; `CIB-AGR-0001` and `CIB-OP-0001` apply only to the reused User Task boundary, and the profile declares no CIB cycle target.

The [CIB Seven 2.2.0 Service Task incident profile](cibseven-2.2.0-service-task-incident-draft/README.md) is the configured successor to the success-only Service Task effect profile. It reuses the exact source shape and selects one failed-effect incident plus one exact retry.

The [CIB Seven 2.2.0 Service Task incident cancellation profile](cibseven-2.2.0-service-task-incident-cancellation-draft/README.md) is the additive successor that preserves the exact executable definition shape while selecting one string Process-start variable and incident-gated root Process cancellation.

The [BPMN 2.0.2 Message Start Event draft profile](bpmn-2.0.2-message-start-event-draft/README.md) selects one payload-free, top-level, operation-addressed Message Start Event. Its exact Message, Interface Operation, Start Event, and semantic instance identities are resolved before Process creation, and it declares no CIB Message Start target.

The [BPMN 2.0.2 Timer Start Event draft profile](bpmn-2.0.2-timer-start-event-draft/README.md) selects one top-level exact-`PT1S` Timer Start Event. One resolved occurrence identifies the Start Event and semantic instance before Process creation, while schedule timing and lifecycle remain host and product policy, and the profile declares no CIB Timer Start target.

The [BPMN 2.0.2 Terminate End Event draft profile](bpmn-2.0.2-terminate-end-event-draft/README.md) selects one exact Terminate End Event inside one ordinary embedded Sub-Process. It terminates the containing child scope occurrence, preserves the parent Process, and reuses ordinary scope completion to continue once to the Outer User Task. The profile declares no CIB Terminate target.

The [BPMN 2.0.2 BPMN Lean configured Task effect draft profile](bpmn-2.0.2-bpmn-lean-configured-task-effect-draft/README.md) selects one exact extension binding from expanded namespace and handler type to the existing Activity/Probe effect descriptor. It preserves a distinct checked configured Task, empty mappings, and no BPMN Error route, and declares no CIB configured Task target.

The [BPMN 2.0.2 Activity boundary Message draft profile](bpmn-2.0.2-activity-boundary-message-draft/README.md) selects one payload-free operation-addressed Message subscription owned by one User Task occurrence. Exact task completion and Message delivery withdraw each other, later losing stimuli are rejected with stable state, and no CIB Message Boundary target is selected.

The [profile-parameterized admission specification](../docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) owns the Timer/User Task, Message/User Task, ordinary embedded Sub-Process, and direct Error-propagation capabilities plus the reusable production admission boundary. The [parallel fork/join spec](../docs/capsules/PARALLEL-FORK-JOIN-SPEC.md) owns the normative per-incoming-Sequence-Flow meaning and evidence boundary. The [Intermediate Catch Timer spec](../docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) owns timer meaning, cross-target firing, and fidelity boundaries. The [Intermediate Catch Message spec](../docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) owns direct payload-free subscription delivery and its Signal refinement. The [Service Task effect spec](../docs/capsules/SERVICE-TASK-EFFECT-SPEC.md) owns the bounded success-only effect meaning and explicit CIB host-realization boundary. The [boundary-error spec](../docs/capsules/BOUNDARY-ERROR-SPEC.md) owns the bounded exact-code Error catch, CIB caught-path mapping extension, and host-specific evidence relation. The [ordinary embedded Sub-Process completion specification](../docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) owns the implemented exact one-level normal-scope lifecycle, and the [Error propagation specification](../docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) owns its direct-parent exceptional follow-on. The CIB User Task profile makes no parallel, timer, Message, Service Task, Error, or Sub-Process compatibility claim. A separate profile for observed pinned-CIB count behavior remains deferred until it has a concrete consumer.

The project is pre-release. Artifact-shape changes replace the current schema and all consumers together; they do not create parallel profiles. A new profile `id` is required only when reviewed semantic meaning, compatibility target, configuration, feature surface, interpretation, extension, deviation, or observation boundary changes.

`status: "immutable"` means that an exact calibration artifact used by retained evidence is frozen; it does not mean the enclosing semantic capsule is no longer an evidence-closed draft or that a production deployment/history baseline exists. Some pre-release profile IDs retain their original `-draft` identity after their content is frozen because renaming an evidence-bound profile would create a different semantic identity rather than clarify its status.

The first immutable production deployment/history baseline must satisfy the [profile release-readiness gate](../docs/TESTING-SPEC.md#profile-release-readiness-gate) and the [pre-release evolution decision](../docs/PROJECT-DESIGN.md#pre-release-evolution-policy). Until then, no retained Temporal history or speculative legacy reader constrains the design.
