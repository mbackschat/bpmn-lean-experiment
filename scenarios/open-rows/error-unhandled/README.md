# Errors without a catcher

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the defined outcome of a raised Error that finds no catcher, for a typed business failure with a non-matching boundary and for an Error End with no boundary anywhere. The [refund model](claim-refund.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, one branch runs the Sub-Process `Settlement`, whose Service Task `PayOut` has one exact `FUNDS_FROZEN` boundary, then the Human Task `Archive`. The other branch runs the Human Task `Audit` into an Error End `AUDIT_FINDING` that no boundary or Event Sub-Process names.

| Scenario | Case it exercises |
|---|---|
| [effect-wrong-code](effect-wrong-code.scenario.json) | A typed business failure of `PayOut` whose code its only boundary does not name, then completion of the sibling branch. |
| [error-end-no-catcher](error-end-no-catcher.scenario.json) | The uncaught Error End first, then the ordinary success path of the other branch to its end. |

The schedules carry no expected outcome, route or Process state; the retained CIB evidence is the answer. The [propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#open-rows) name the defined unhandled outcome as the decision owed.
