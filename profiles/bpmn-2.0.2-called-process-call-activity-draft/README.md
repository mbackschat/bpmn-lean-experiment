# BPMN 2.0.2 bounded called-Process Call Activity draft profile

This standards profile selects one exact in-document global Process call: the caller transfers control through one Call Activity to one distinct called Process instance, waits for its normal empty-data completion, and then continues to one caller User Task.

The [profile artifact](profile.json) names BPMN 2.0.2 Clauses 10.3.6 and 13.3.4 and Table 10.23 as normative authority. Its `CIB-AGR-0001` and `CIB-OP-0001` relationships govern only the reused User Task interaction boundary. No CIB Call Activity relationship, executable oracle, retained evidence, deployment-resolution behavior, or tenant/version selection is claimed.

The exact QName admission, semantic instance identity, return rule, finite evidence, and exclusions belong to the [Call Activity proposal](../../docs/capsules/CALL-ACTIVITY-PROPOSAL.md). Status remains `draft`; this profile makes no general Call Activity, recursive-call, data-mapping, Child Workflow, A12 adoption, BPMN Process Execution Conformance, or production-history claim.
