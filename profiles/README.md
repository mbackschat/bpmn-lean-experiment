# Semantic profiles

This directory contains versioned semantic-profile artifacts and their lifecycle state.

The [CIB Seven 2.2.0 Milestone 0 spike profile](cibseven-2.2.0-spike.1/README.md) is an approved walking-skeleton input but remains explicitly `draft`. It must not label compatibility or conformance evidence.

The first immutable profile must identify the exact CIB Seven release and source, environment, supported BPMN surface, static and runtime rules, observation boundary, nondeterminism policy, interpretations, deviations, unsupported features, and evolution rules described by the [architecture and assurance handoff](../docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md).

The current JSON representation is provisional until the CIB, Lean, and TypeScript consumers establish the smallest common contract. File format or runner framing changes do not themselves change semantics.
