# CIB Seven 2.2.0 scope-chain profile

The [profile artifact](profile.json) is the [cibseven-2.2.0 cumulative profile](../cibseven-2.2.0/README.md) plus `CIB-EXT-0020`, which selects the one option the cumulative profile leaves at its standards reading: `scopeChainSubmissionBytes` is `16384`, so a User Task completion may name only variables a scope occurrence on the task's chain declares and the canonical JSON of the submission may take at most that many UTF-8 bytes (NSD-TASK-01 of the [nested embedded scope data specification](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md)).

That restriction is a project admission restriction, not CIB behaviour: CIB's root install under `CIB-EXT-0005` creates a root binding for an undeclared name. The two cannot hold under one profile, so every scenario and corpus model whose account selects `CIB-EXT-0020` binds this profile, and every other CIB scenario binds `cibseven-2.2.0`. The [register](../../docs/CIB-BPMN-RELATION-REGISTER.md) names this profile as the only one selecting the relationship.

Every other kernel option is the cumulative profile's, derived from the relationship identifiers by `kernelProfileOptions` in the [kernel reader](../../packages/bpmn-source/src/kernel-reader/wire.ts).

The profile names no CIB Seven oracle or environment, because no retained CIB evidence binds a scenario of this profile and a profile claims an oracle only while retained evidence binds it. [BPMN 2.0.2](../../docs/BPMN-CONFORMANCE-TARGET.md) stays the normative authority.

The per-variant profile this one grew from retired with the others at the profile consolidation (#42); it remains in Git history at the parent of the consolidation commit.
