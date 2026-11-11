# Transaction Cancel with waiting handlers

This directory serves [PC-TX-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Cancel End Event in a Transaction whose compensation run has a Human Task handler and an effect handler waiting at once, while an unanswered effect inside the Transaction is cancelled. The model is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Model

[cancel-with-waiting-handlers](cancel-with-waiting-handlers.bpmn): the Transaction `Transaction_Order` forks into four branches. `UserTask_Pick` has the compensation Human Task `UserTask_UndoPick`. `ServiceTask_Charge` (the runner's delegate binding, asynchronous before, answered by `effectResult`) has the Service Task `ServiceTask_Refund` as handler. `ServiceTask_Slow` is an effect without a handler. `UserTask_Decide` leads to a Cancel End Event. A Cancel Boundary Event on the Transaction leads to `UserTask_Cancelled`; its normal exit leads to `UserTask_Confirm`.

## Schedules

Every schedule completes `UserTask_Pick` and answers the charge effect, so that two records exist; it leaves `ServiceTask_Slow` unanswered; and it completes `UserTask_Decide`, which raises the Cancel.

| Schedule | After `UserTask_Decide` | Question it separates |
|---|---|---|
| [handlers-user-first](handlers-user-first.scenario.json) | `UserTask_UndoPick` completes, the refund effect is answered, the interior `ServiceTask_Slow` result is sent, then `UserTask_Cancelled`. | Do both handlers wait at once, does the boundary continue only after both, and is the cancelled interior effect's late result stale? |
| [handlers-effect-first](handlers-effect-first.scenario.json) | The refund effect is answered, `UserTask_UndoPick` completes, the interior result is sent, then `UserTask_Cancelled`. | Does the order in which the handlers finish change anything? |
| [stale-interior-result-while-handlers-wait](stale-interior-result-while-handlers-wait.scenario.json) | The interior `ServiceTask_Slow` result is sent while both handlers wait; then `UserTask_UndoPick`, the refund effect and `UserTask_Cancelled`. | Is the interior effect already cancelled when the compensation run starts, so that its result cannot disturb the run? |

The schedules carry no expected open wait, handler order or Process state; the retained CIB evidence is the answer.
