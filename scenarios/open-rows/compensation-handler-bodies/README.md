# Reusable compensation handler bodies

This directory serves [PC-COMPENSATION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): handler bodies containing human work, effects, Receive work, Calls and Sub-Process flow, typed data reaching a handler, the main continuation waiting for every required handler, stale or repeated handler results, and cancellation of running handlers. Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Failure of handlers is in [compensation-handler-failures](../compensation-handler-failures/README.md).

## Models

| Model | Shape |
|---|---|
| [handler-bodies](handler-bodies.bpmn) | The Sub-Process `SubProcess_Wrap` holds a Parallel fork into three Human Tasks, each with a Compensation Boundary Event whose handler has a different form: `UserTask_Plan` is associated with the Sub-Process `SubProcess_UndoPlan` (Human Task `UserTask_UndoPlanReview`, then the Service Task `ServiceTask_UndoPlanNotify`, answered by `effectResult`); `UserTask_Quote` with the Receive Task `ReceiveTask_UndoQuote` (message `quoteWithdrawn`); `UserTask_Ship` with the Call Activity `CallActivity_UndoShip` of `Process_UndoShip` (Human Task `UserTask_Reverse`). After the join, an untargeted Intermediate throw and `UserTask_After` end the Sub-Process, followed by `UserTask_Wrapped`. An interrupting `PT60S` Timer Boundary Event `Boundary_Abandon` on the Sub-Process leads to `UserTask_Abandoned`. |
| [typed-handler](typed-handler.bpmn) | `UserTask_Work` with a Compensation Boundary Event and a compensation Human Task whose inputs read the Integer `count`, the Boolean `flag`, the Decimal `ratio` and the String List `tags`; then the Sub-Process `SubProcess_Typed`, which declares locals `snapCount`, `snapFlag`, `snapRatio` and `snapTags` from them, runs `UserTask_Inside` and holds a Compensation Event Sub-Process `UserTask_UndoTyped` reading those locals; then `UserTask_Pause`, an untargeted throw and `UserTask_After`. The Process also starts with root-level `snapCount`, `snapFlag`, `snapRatio` and `snapTags`, so that the snapshot inputs resolve under any visibility rule. |

## Schedules

| Schedule | Model | Journey |
|---|---|---|
| [all-forms-complete](all-forms-complete.scenario.json) | handler-bodies | The three Human Tasks complete; then the review task, the message to the Receive Task, the called `UserTask_Reverse` (called instance `call:10:Instance_1:21:CallActivity_UndoShip:1`) and the notify effect complete in that order, then `UserTask_After` and `UserTask_Wrapped`. |
| [premature-and-stale-handler-results](premature-and-stale-handler-results.scenario.json) | handler-bodies | After the review task and the message, the message is delivered a second time, the review task is addressed again and `UserTask_After` is attempted. The called task completes, the notify effect is answered twice, then `UserTask_After` and `UserTask_Wrapped`. |
| [abandoned-while-handlers-wait](abandoned-while-handlers-wait.scenario.json) | handler-bodies | After the review task, `Boundary_Abandon` fires at 60 000 ms; the notify effect, the message and the called task are addressed afterwards, then `UserTask_Abandoned`. |
| [typed-data-reaches-handlers](typed-data-reaches-handlers.scenario.json) | typed-handler | The Process starts with `count = 3`, `flag = true`, `ratio = 12.50` and `tags = [x, y]`. `UserTask_Work` completes writing `count = 4`, `UserTask_Inside` completes, then `flag`, `ratio` and `tags` are set at `UserTask_Pause` to `false`, `5` and `[z]`; both handlers and `UserTask_After` follow. |

The schedules carry no expected handler, input value or Process state; the retained CIB evidence is the answer.
