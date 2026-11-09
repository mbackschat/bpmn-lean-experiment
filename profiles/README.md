# Semantic profiles

This directory contains the reviewed semantic-profile artifacts. A profile identifies behavioural meaning for one declared target: a set of CIB-BPMN [relationship](../docs/CIB-BPMN-RELATION-REGISTER.md) identifiers, the BPMN 2.0.2 normative references it cites, and the CIB Seven oracle and environment retained evidence is checked against. It is not a generic wire-format version, and it carries no per-variant feature list: the kernel IL plus its admission is the admitted field set.

## Artifact registry

- [BPMN 2.0.2 standards profile](bpmn-2.0.2/README.md) binds every scenario and corpus model whose result needs no CIB option; its relationships select none.
- [CIB Seven 2.2.0 cumulative profile](cibseven-2.2.0/README.md) binds every scenario and corpus model that needs a CIB option but not the scope-chain restriction; its relationships are the union of every retired per-variant profile's plus `CIB-INT-0007`, without `CIB-EXT-0020`.
- [CIB Seven 2.2.0 scope-chain profile](cibseven-2.2.0-scope-chain/README.md) is the cumulative profile plus `CIB-EXT-0020`, whose User Task submission restriction is exclusive with the root install of `CIB-EXT-0005`; it binds the scenarios and models whose account selects it.

The kernel's behaviour options derive from a profile's relationship identifiers alone (`kernelProfileOptions` in the [kernel reader](../packages/bpmn-source/src/kernel-reader/wire.ts)), never from its identity. A relationship becomes a profile member in the same change as the behaviour it selects, and a pair of relationships that select different values for one decision point belongs in two cumulative profiles, never one.

The [profile schema](../contracts/schemas/semantic-profile.schema.json) owns the document shape, and the [contracts README](../contracts/README.md) owns how scenarios and retained evidence bind a profile by identity and content digest.

## Specifications behind the relationships

- The [profile-parameterized admission specification](../docs/kernel/semantics/ADMISSION-SEMANTICS-SPEC.md) owns the reusable production admission boundary.
- The [flow specification](../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns gateway, fork and join meaning.
- The [subscription specification](../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) owns Timer and Message meaning and its fidelity boundaries.
- The [work specification](../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) owns User Task and Service Task effect meaning and the CIB host-realization boundary.
- The [propagation specification](../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md) owns Error catch and propagation.
- The [scope specification](../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md) owns embedded Sub-Process completion and scope lifecycle.

## Status and evolution

The project is pre-release. Artifact-shape changes replace the current schema and all consumers together; they do not create parallel profiles. A new profile `id` is required only when a decision point needs a second value under one declared target.

`status: "immutable"` would mean that an exact calibration artifact used by retained evidence is frozen; it does not mean that a production deployment/history baseline exists. Every profile is `draft` while it grows with the reviewed feature surface.

The first immutable production deployment/history baseline must satisfy the [profile release-readiness gate](../docs/kernel/ENGINEERING-POLICY.md#profile-release-readiness) and the [pre-release evolution decision](../docs/PROJECT-DESIGN.md#pre-release-evolution-policy). Until then, no retained Temporal history or speculative legacy reader constrains the design.
