# Semantic profiles

This directory contains reviewed semantic-profile artifacts. A profile identifies behavioral meaning and a concrete compatibility target; it is not a generic wire-format version.

The artifact registry contains the [CIB Seven 2.2.0 User Task draft profile](cibseven-2.2.0-user-task-draft/README.md), the normative [parallel fork/join draft profile](parallel-fork-join-draft/README.md), the [literal `PT1S` Intermediate Catch Timer draft profile](cibseven-2.2.0-intermediate-catch-timer-draft/README.md), and the [exact Service Task effect draft profile](cibseven-2.2.0-service-task-effect-draft/README.md). Each pins its oracle revision and environment, bounded BPMN feature and observation surfaces, exclusions, and stable references into the [CIB–BPMN relationship register](../docs/CIB-BPMN-RELATION-REGISTER.md).

The [parallel fork/join spec](../docs/capsules/PARALLEL-FORK-JOIN-SPEC.md) owns the normative per-incoming-Sequence-Flow meaning and evidence boundary. The [Intermediate Catch Timer spec](../docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) owns timer meaning, cross-target firing, and fidelity boundaries. The [Service Task effect spec](../docs/capsules/SERVICE-TASK-EFFECT-SPEC.md) owns the bounded success-only effect meaning and explicit CIB host-realization boundary. The CIB User Task profile makes no parallel, timer, or Service Task compatibility claim. A separate profile for observed pinned-CIB count behavior remains deferred until it has a concrete consumer.

The project is pre-release. Artifact-shape changes replace the current schema and all consumers together; they do not create parallel profiles. A new profile `id` is required only when reviewed semantic meaning, compatibility target, configuration, feature surface, interpretation, extension, deviation, or observation boundary changes.

The first immutable profile must define the evolution and compatibility policy required by the [architecture and assurance handoff](../docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md). Until then, no retained Temporal history or speculative legacy reader constrains the design.
