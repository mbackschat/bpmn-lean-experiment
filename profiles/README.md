# Semantic profiles

This directory contains reviewed semantic-profile artifacts. A profile identifies behavioral meaning and a concrete compatibility target; it is not a generic wire-format version.

The current artifacts are the [CIB Seven 2.2.0 User Task draft profile](cibseven-2.2.0-user-task-draft/README.md) and the normative [parallel fork/join draft profile](parallel-fork-join-draft/README.md). Both pin the oracle revision and environment, their bounded BPMN feature and observation surfaces, exclusions, and stable references into the [CIB–BPMN relationship register](../docs/CIB-BPMN-RELATION-REGISTER.md). Their status is `draft`, so results are calibration evidence rather than an immutable compatibility or conformance claim.

The [parallel fork/join proposal](../docs/capsules/PARALLEL-FORK-JOIN-PROPOSAL.md) owns the approved normative per-incoming-Sequence-Flow meaning and the remaining evidence needed to graduate that profile. The CIB User Task profile remains unchanged and makes no parallel compatibility claim. A separate profile for observed pinned-CIB count behavior remains deferred until it has a concrete consumer.

The project is pre-release. Artifact-shape changes replace the current schema and all consumers together; they do not create parallel profiles. A new profile `id` is required only when reviewed semantic meaning, compatibility target, configuration, feature surface, interpretation, extension, deviation, or observation boundary changes.

The first immutable profile must define the evolution and compatibility policy required by the [architecture and assurance handoff](../docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md). Until then, no retained Temporal history or speculative legacy reader constrains the design.
