# BPMN 2.0.2 structured Inclusive Gateway draft profile

This standards profile selects one closed acyclic Inclusive Gateway split/task/join region. It evaluates two Simple Boolean v1 conditions from the same committed Process bindings, activates every true branch or the conditionless default when neither is true, and synchronizes all and only the branches selected for that split occurrence.

External value-domain declaration: `processStart = String | Null`.

The [profile artifact](profile.json) names BPMN 2.0.2 Clause 10.6.3, Clause 13.4.3, Table 10.124, and Table 13.3 as normative authority. Its `CIB-AGR-0001` and `CIB-OP-0001` relationships govern only the reused User Task interaction boundary. No CIB Inclusive Gateway relationship, executable oracle, retained evidence, JUEL meaning, or CIB graph algorithm is selected.

The exact semantic account, finite witnesses, evidence boundary, and exclusions belong to the [Inclusive Gateway specification](../../docs/capsules/INCLUSIVE-GATEWAY-SPEC.md). Status remains `draft`; this profile makes no general Inclusive Gateway reachability, arbitrary-graph synchronization, CIB compatibility, A12 adoption, BPMN Process Execution Conformance, or production-history claim.
