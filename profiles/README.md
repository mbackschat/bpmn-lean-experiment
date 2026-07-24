# Semantic profiles

This directory contains reviewed semantic-profile artifacts. A profile identifies behavioral meaning and a concrete compatibility target; it is not a generic wire-format version.

The only current artifact is the [CIB Seven 2.2.0 User Task draft profile](cibseven-2.2.0-user-task-draft/README.md). It pins the oracle revision and environment, the bounded BPMN feature and observation surface, exclusions, and stable references into the [CIB–BPMN relationship register](../docs/CIB-BPMN-RELATION.md). Its status is `draft`, so its results are calibration evidence rather than an immutable compatibility or conformance claim.

The project is pre-release. Artifact-shape changes replace the current schema and all consumers together; they do not create parallel profiles. A new profile `id` is required only when reviewed semantic meaning, compatibility target, configuration, feature surface, interpretation, extension, deviation, or observation boundary changes.

The first immutable profile must define the evolution and compatibility policy required by the [architecture and assurance handoff](../docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md). Until then, no retained Temporal history or speculative legacy reader constrains the design.
