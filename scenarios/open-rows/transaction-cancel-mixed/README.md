# Cancel over mixed, data-bearing Transaction work

This directory serves [PC-TX-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Cancel End and Cancel Boundary over mixed work with several eligible subjects and waiting handlers, the empty, successful and failing outcomes, the join before the single boundary continuation, and ordinary interruption that is not a Cancel. The [order model](order.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Model

The Transaction `Transaction_Order` forks into four branches. `UserTask_Pick` has a compensation Human Task `UserTask_UndoPick` (input `seenPicked` reads `picked`). `ServiceTask_Charge` (the runner's delegate binding, asynchronous before, answered by `effectResult`) has the Service Task `ServiceTask_Refund` as handler. `SubProcess_Pack` declares the local `crate` from `picked` and runs `UserTask_PackItems`; its Compensation Event Sub-Process runs `UserTask_Unpack` (input `seenCrate` reads `crate`). `UserTask_Decide` leads to an Exclusive Gateway on the start variable `cancel`: true reaches a Cancel End Event, otherwise a None End Event; the other three branches end in None End Events. The Transaction has a Cancel Boundary Event (`UserTask_Cancelled`), an Error Boundary Event for `ORDER_FAULT` (`UserTask_Fault`) and an interrupting `PT30S` Timer Boundary Event (`UserTask_TimedOut`); its normal exit leads to `UserTask_Confirm`. The Process starts with `picked = p0` and a root-level `crate`, so that the Unpack input resolves under any visibility rule.

## Schedules

The forward prefix `UserTask_Pick` (writing `picked = p1`), `ServiceTask_Charge` (success) and `UserTask_PackItems` (writing `crate`) is written as "the three subjects complete".

| Schedule | `cancel` | Journey |
|---|---|---|
| [empty-cancel](empty-cancel.scenario.json) | true | `UserTask_Decide` completes first, then the three subjects are addressed, then `UserTask_Cancelled`. |
| [subjects-effect-first](subjects-effect-first.scenario.json) | true | The three subjects complete, `UserTask_Decide` completes, then Refund succeeds, `UserTask_UndoPick` completes, `UserTask_Cancelled` is attempted, `UserTask_Unpack` completes, `UserTask_Cancelled` completes. |
| [subjects-user-first](subjects-user-first.scenario.json) | true | The same, with `UserTask_UndoPick` and `UserTask_Unpack` before Refund and `UserTask_Cancelled` attempted before Refund. |
| [refund-business-failure](refund-business-failure.scenario.json) | true | The three subjects complete, `UserTask_Decide` completes, Refund fails with `ORDER_FAULT`, `UserTask_UndoPick` is addressed, then `UserTask_Fault`. |
| [refund-incident-retried](refund-incident-retried.scenario.json) | true | With incidents enabled and not cancellable, Refund fails technically, its incident is retried and succeeds, then `UserTask_UndoPick`, `UserTask_Unpack` and `UserTask_Cancelled`. |
| [deadline-interrupts](deadline-interrupts.scenario.json) | true | The three subjects complete, the Timer fires at 30 000 ms, then `UserTask_Decide` and `UserTask_UndoPick` are addressed, then `UserTask_TimedOut`. |
| [normal-completion](normal-completion.scenario.json) | false | The three subjects complete, then `UserTask_Decide` and `UserTask_Confirm`. |
| [cancel-with-effect-unanswered](cancel-with-effect-unanswered.scenario.json) | true | `UserTask_Pick` completes, `UserTask_Decide` completes while the charge effect is unanswered, the charge is answered afterwards, then `UserTask_UndoPick` and `UserTask_Cancelled`. |
| [deadline-passes-while-cancel-compensates](deadline-passes-while-cancel-compensates.scenario.json) | true | `UserTask_Pick` completes, `UserTask_Decide` completes while the charge effect is unanswered, the Timer is fired at 30 000 ms while `UserTask_UndoPick` waits, then `UserTask_UndoPick`, `UserTask_Cancelled` and `UserTask_TimedOut` are addressed. |

The schedules carry no expected eligible set, handler or Process state; the retained CIB evidence is the answer.
