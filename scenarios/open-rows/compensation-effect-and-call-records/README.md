# Effects and Calls as compensation subjects

This directory serves [PC-COMPENSATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (eligibility of effects and Call Activities, failed work) and the effect and Call handler parts of [PC-COMPENSATION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Models

| Model | Shape |
|---|---|
| [effect-records](effect-records.bpmn) | The Service Task `ServiceTask_Reserve` (the runner's delegate binding, asynchronous before) with a Compensation Boundary Event associated with the Service Task `ServiceTask_Release`, and an Error Boundary Event for `RESERVE_FAILED` leading to `UserTask_Recover`. Both paths merge into an untargeted Intermediate throw and `UserTask_After`. |
| [call-records](call-records.bpmn) | The Call Activity `CallActivity_Child` of `Process_Child` with a Compensation Boundary Event associated with `UserTask_UndoCall`, then an untargeted Intermediate throw and `UserTask_After`. `Process_Child` runs `UserTask_ChildWork`, which has its own Compensation Boundary Event associated with `UserTask_UndoChildWork`. |

## Schedules

| Schedule | Model | Journey |
|---|---|---|
| [success-then-throw](success-then-throw.scenario.json) | effect-records | The reservation succeeds, the release effect succeeds, then `UserTask_After`. |
| [business-failure-ineligible](business-failure-ineligible.scenario.json) | effect-records | The reservation fails with `RESERVE_FAILED`, `UserTask_Recover` completes, the release effect is then addressed, then `UserTask_After`. |
| [call-completed-then-throw](call-completed-then-throw.scenario.json) | call-records | `UserTask_ChildWork` completes in the called instance, `UserTask_UndoChildWork` is addressed in that instance, then `UserTask_UndoCall` and `UserTask_After` complete. |

The schedules carry no expected eligible set, handler or Process state; the retained CIB evidence is the answer.
