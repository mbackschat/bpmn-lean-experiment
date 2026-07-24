# Semantic profiles

This directory contains versioned semantic-profile artifacts and their lifecycle state.

The [CIB Seven 2.2.0 Milestone 0 spike profile](cibseven-2.2.0-spike.1/README.md) is an approved walking-skeleton input but remains explicitly `draft`. It must not label compatibility or conformance evidence.

The [CIB Seven 2.2.0 User Task interaction spike profile](cibseven-2.2.0-spike.2/README.md) adds only structured task-instance discovery and completion to the same pinned oracle environment. It also remains explicitly `draft`.

Both artifacts use profile-document schema `0.1.0`; their distinct `id` values carry semantic-profile evolution. Scenario syntax, canonical trace shape, executable IR, and Temporal replay markers are separate version dimensions described by the [shared wire contracts](../contracts/README.md).

The first immutable profile must identify the exact CIB Seven release and source, environment, supported BPMN surface, static and runtime rules, observation boundary, nondeterminism policy, interpretations, deviations, unsupported features, and evolution rules described by the [architecture and assurance handoff](../docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md).

The current JSON representation is provisional until the CIB, Lean, and TypeScript consumers establish the smallest common contract. File format or runner framing changes do not themselves change semantics.
