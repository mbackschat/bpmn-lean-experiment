# Call outputs that target Multi-Instance counters

This directory holds the witness for the reconciliation refusal `work.call.multiInstanceCounterOutput` (a Call output targeting `nrOfInstances`, `nrOfActiveInstances` or `nrOfCompletedInstances`), which the [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#restrictions) attribute to [PC-SCOPE-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). The [intake model](intake.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; the schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The root `Process_Intake` runs the Call `Review` of `Process_Review` with four `camunda:out` mappings of the called `result`: as `outcome` and as each of the three counter names. The called Process runs the Human Task `Assess`, whose completion writes `result`, and the root then runs the Human Task `Decide`. The Call is not Multi-Instance.

| Schedule | Case it exercises |
|---|---|
| [counter-outputs-dropped](counter-outputs-dropped.scenario.json) | `Assess` completes with `result = "accepted"`, then `Decide` completes. |

The schedule carries no expected variable or Process state; the retained CIB evidence is the answer.
