# BPMN 2.0.2 resumption-bounded User Task cycle draft profile

The [profile artifact](profile.json) selects one root-scope Sequence Flow cycle whose every directed cycle crosses the admitted User Task resumption edge. It includes one converging Exclusive Gateway with pass-through merge behavior, one divergent Exclusive Gateway with two ordered Simple Boolean v1 conditional back-edges and a conditionless default exit, repeated exact User Task occurrences, and finite automatic closure between stimuli.

BPMN 2.0.2 is the normative authority. The exact selected meaning, forward-compatible admission restriction, proof obligations, and exclusions are owned by the [cyclic-control-flow capsule](../../docs/capsules/CYCLIC-CONTROL-FLOW-PROPOSAL.md).

`CIB-AGR-0001` and `CIB-OP-0001` are inherited only for the already established one-live-User-Task lifecycle and host mapping. They establish no CIB cycle, repeated-activation, Exclusive Merge, condition, or routing claim, and this standards-only profile has no CIB target or retained CIB evidence.
