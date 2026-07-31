# BPMN 2.0.2 Timer and User Task composition draft profile

This standards profile selects one finite acyclic linear Process containing exactly one literal `PT1S` Intermediate Catch Timer Event and one User Task between one None Start Event and one None End Event. Both mechanism orders are admitted by graph facts; the retained end-to-end scenario selects Timer then User Task, and focused source/Lean/core checks cover the reverse order. It exists to prove that production admission composes already implemented mechanisms through profile-selected cardinalities and graph facts rather than recognizing another complete model topology.

The [profile artifact](profile.json) uses BPMN 2.0.2 as normative authority. Its CIB relationship identifiers disclose the separately calibrated timer and User Task mechanisms; CIB does not execute the composition scenario, produce retained evidence for it, or establish the project’s structural-admission rule.

The exact admission, preservation, host-capability, evidence, and exclusion boundary is owned by the [profile-parameterized admission specification](../../docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Status remains `draft`; the profile makes no general serial-composition, CIB composition-compatibility, A12 adoption, or BPMN Process Execution Conformance claim.
