# Resumption-bounded User Task cycle scenario

The [answer-free scenario](scenario.json) executes the byte-identical [BPMN source](process.bpmn) admitted by the [BPMN 2.0.2 cycle profile](../../profiles/bpmn-2.0.2-user-task-cycle-draft/profile.json) and governed by the [cyclic-control-flow capsule](../../docs/capsules/CYCLIC-CONTROL-FLOW-PROPOSAL.md).

The schedule starts `Process_CyclicControlFlow`, completes `Review` activation 1 with `route = "repeat"`, completes activation 2 with `route = "rework"`, and completes activation 3 with `route = "exit"`. The first two values exercise both conditional back-edges, while the third matches neither condition and selects the default exit.

The scenario contains source identity and semantic inputs only. It carries no expected result, CIB runner target, retained CIB evidence, or CIB cycle claim; its CIB provenance names only the reused User Task boundary.
