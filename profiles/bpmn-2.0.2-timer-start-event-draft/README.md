# BPMN 2.0.2 Timer Start Event draft profile

The [profile artifact](profile.json) selects one top-level Timer Start Event whose exact `PT1S` duration is resolved before it instantiates one private executable Process. The admitted linear Process continues through one User Task and one None End Event.

BPMN 2.0.2 is the normative authority. The exact selected meaning, forward-compatible admission restriction, resolved-occurrence boundary, host refinement, and exclusions are owned by the [Timer Start Event proposal](../../docs/capsules/TIMER-START-EVENT-PROPOSAL.md).

`CIB-AGR-0001` and `CIB-OP-0001` apply only to the already established trailing User Task boundary. They establish no CIB Timer Start compatibility claim, and this standards-only profile has no CIB target or retained CIB evidence.
