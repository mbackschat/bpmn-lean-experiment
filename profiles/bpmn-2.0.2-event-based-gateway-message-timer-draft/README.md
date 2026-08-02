# BPMN 2.0.2 Event-Based Gateway Message/Timer draft profile

This standards profile selects one closed acyclic Exclusive Event-Based Gateway whose alternatives are one operation-addressed payload-free Intermediate Catch Message Event and one exact `PT1S` Intermediate Catch Timer Event. The first explicitly ordered matching stimulus wins, the sibling wait is withdrawn atomically, and only the winner's User Task continuation becomes active.

The [profile artifact](profile.json) names BPMN 2.0.2 Clause 10.5.4, Clause 10.6.6, Clause 13.4.4, Table 10.127, and Table 13.4 WCP-16 as normative authority. Relationships `CIB-AGR-0001` and `CIB-OP-0001` govern only the reused User Task interaction boundary. No CIB Event-Based Gateway, Message-versus-Timer race, or retained-evidence claim is selected.

The exact account, evidence boundary, and exclusions belong to the [Event-Based Gateway proposal](../../docs/capsules/EVENT-BASED-GATEWAY-PROPOSAL.md). Status remains `draft`; the profile makes no claim about physical simultaneity, coalesced host readiness, other trigger sets, repetition, general cancellation, CIB compatibility, A12 adoption, BPMN Process Execution Conformance, or production history compatibility.
