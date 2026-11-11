# Compensation handler bodies without a Receive handler

This directory serves [PC-COMPENSATION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the handler bodies of [compensation-handler-bodies](../compensation-handler-bodies/README.md) with the Receive Task handler replaced by a Human Task, so that a Sub-Process with an effect, a Call Activity and a Human Task are the handler forms and the Receive form no longer decides the journey. The model is project-authored MIT source for the `cibseven-2.2.0` profile and, through the `-standards` schedules, for the [`bpmn-2.0.2` profile](../../../profiles/bpmn-2.0.2/README.md); every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer for the `cibseven-2.2.0` ones.

## Model

[handler-bodies](handler-bodies.bpmn): the Sub-Process `SubProcess_Wrap` forks into three Human Tasks, each with a Compensation Boundary Event whose handler has a different form. `UserTask_Plan` is associated with the Sub-Process `SubProcess_UndoPlan` (Human Task `UserTask_UndoPlanReview`, then the Service Task `ServiceTask_UndoPlanNotify`, answered by `effectResult`); `UserTask_Quote` with the Human Task `UserTask_UndoQuote`; `UserTask_Ship` with the Call Activity `CallActivity_UndoShip` of `Process_UndoShip` (Human Task `UserTask_Reverse`). After the join, an untargeted Intermediate throw and `UserTask_After` end the Sub-Process, followed by `UserTask_Wrapped`. An interrupting `PT60S` Timer Boundary Event `Boundary_Abandon` on the Sub-Process leads to `UserTask_Abandoned`. The called instance is addressed by its derived identity `call:10:Instance_1:21:CallActivity_UndoShip:1`.

## Schedules

| Schedule | Journey | Question it separates |
|---|---|---|
| [all-forms-complete](all-forms-complete.scenario.json), [-standards](all-forms-complete-standards.scenario.json) | The three Human Tasks complete; then the review task, `UserTask_UndoQuote`, the called `UserTask_Reverse` and the notify effect complete, then `UserTask_After` and `UserTask_Wrapped`. | Do all three handler forms run and join before the trigger continues once? |
| [abandoned-while-handlers-wait](abandoned-while-handlers-wait.scenario.json), [-standards](abandoned-while-handlers-wait-standards.scenario.json) | After the review task and `UserTask_UndoQuote`, `Boundary_Abandon` fires at 60 000 ms while the notify effect and the called task wait; their results are addressed afterwards, then `UserTask_Abandoned`. | What happens to a running Call handler and a running effect handler when the interrupting boundary abandons the run, and are their late results stale? |

The schedules carry no expected handler, run state or Process state; the retained CIB evidence is the answer. The `-standards` schedules select no CIB oracle.
