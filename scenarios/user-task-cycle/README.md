# Resumption-bounded User Task cycle scenario

The [answer-free scenario](scenario.json) executes the byte-identical [BPMN source](process.bpmn) admitted by the [BPMN 2.0.2 cycle profile](../../profiles/bpmn-2.0.2/profile.json) and governed by the [cyclic-control-flow specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md).

`Review` declares one required `DataOutput`, `Review_route`, in its `OutputSet`, and a `DataOutputAssociation` writes it into the Process `Property` `route`, which the `Choice` conditions read. The output is declared because the standards profile refuses a completion value the task does not declare (`undeclared-output`); an undeclared submission is not how a User Task result reaches Process data.

The schedule starts `Process_CyclicControlFlow`, completes `Review` activation 1 with `Review_route = "repeat"`, completes activation 2 with `Review_route = "rework"`, and completes activation 3 with `Review_route = "exit"`. The first two values exercise both conditional back-edges, while the third matches neither condition and selects the default exit.

The scenario contains source identity and semantic inputs only. It carries no expected result, CIB runner target, retained CIB evidence, or CIB cycle claim; its CIB provenance names only the reused User Task boundary.
