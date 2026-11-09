# Business failure whose code only a sibling boundary names

Answer-free schedule for [PC-AUTO-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), the typed business failure of a Service Task and the Error path it selects. [automation-business-error-routing](../automation-business-error-routing/README.md) separates the ancestor and the later non-ancestor case; this schedule separates a sibling whose Error boundary is open at the time of the failure. The [model](sibling-handler.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; the retained CIB Seven `2.2.0` answer is the row's target.

After a Parallel fork, the async Service Task `Check` has no boundary and no output mapping, so its unhandled failure is not masked by an output-mapping failure. The other branch runs the async Service Task `Verify`, which has an exact `CHECK_FAILED` boundary leading to the Human Task `Recheck`. Both Service Tasks are delegated effects answered by `effectResult` stimuli.

| Schedule | Case it separates |
|---|---|
| [sibling-boundary-active](sibling-boundary-active.scenario.json) | A business failure of `Check` with the code `CHECK_FAILED` while `Verify` and its boundary are open, then a success of `Verify`, so a sibling boundary that matches the code is told apart from an ancestor. |

The schedule carries no expected route or Process state; the retained CIB evidence is the answer.
