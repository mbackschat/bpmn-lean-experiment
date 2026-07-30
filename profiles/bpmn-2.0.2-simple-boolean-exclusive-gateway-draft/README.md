# BPMN 2.0.2 Simple Boolean Exclusive Gateway draft profile

This draft standards profile selects one divergent Exclusive Gateway with two ordered conditional Sequence Flows, one conditionless default, and three distinct User Task branch tails. Its semantic authority is BPMN 2.0.2 Clause 13.4.2 and Table 13.2 under the project-owned [Simple Boolean expression language](../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md).

The [profile artifact](profile.json) uses normative authority rather than an executable oracle. CIB relationships `CIB-AGR-0006` and `CIB-INT-0001` record separate calibration that pinned CIB also selects the first true condition, otherwise the default, in process-level Sequence Flow declaration order. CIB does not parse or evaluate this project language, does not produce retained expected results for this profile, and is not a differential target for its scenarios.

The exact meaning, evidence boundary, and exclusions are owned by the [Exclusive Gateway conditional routing specification](../../docs/capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md). Status remains `draft`; the profile makes no general expression-language, Exclusive Gateway, CIB JUEL, A12 adoption, or BPMN Process Execution Conformance claim.
