# Nested Transaction cancellation

This directory serves [PC-TX-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Cancel in a nested Transaction against outside work, a Cancel of the outer Transaction against an unfinished and a completed nested Transaction, the unpromoted records of an unfinished nested scope, and the absence of a duplicate boundary continuation. The [nested model](nested.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Model

The outer Transaction `Transaction_Outer` forks into three branches. `UserTask_OuterWork` has a compensation Human Task `UserTask_UndoOuterWork`. The nested Transaction `Transaction_Inner` runs `UserTask_InnerWork` (handler `UserTask_UndoInnerWork`) and `UserTask_InnerDecide`, then an Exclusive Gateway on the start variable `innerCancel`: true reaches a Cancel End Event, otherwise a None End Event; a Cancel Boundary Event on it leads to `UserTask_InnerCancelled`. `UserTask_OuterDecide` leads to an Exclusive Gateway on `outerCancel` in the same way, with a Cancel Boundary Event on `Transaction_Outer` leading to `UserTask_OuterCancelled`. The normal exit of the outer Transaction leads to `UserTask_Done`.

## Schedules

| Schedule | `innerCancel` | `outerCancel` | Journey |
|---|---|---|---|
| [inner-cancel-preserves-outer-work](inner-cancel-preserves-outer-work.scenario.json) | true | false | `UserTask_OuterWork`, `UserTask_InnerWork` and `UserTask_InnerDecide` complete; the inner handler is completed twice; then `UserTask_InnerCancelled`, `UserTask_OuterDecide` and `UserTask_Done`. |
| [outer-cancel-with-unfinished-inner](outer-cancel-with-unfinished-inner.scenario.json) | false | true | `UserTask_OuterWork` and `UserTask_InnerWork` complete, `UserTask_OuterDecide` completes while the inner Transaction is open, then both handlers, `UserTask_InnerDecide` (addressed afterwards) and `UserTask_OuterCancelled`. |
| [outer-cancel-after-inner-completed](outer-cancel-after-inner-completed.scenario.json) | false | true | `UserTask_OuterWork`, `UserTask_InnerWork` and `UserTask_InnerDecide` complete (the inner Transaction ends normally), then `UserTask_OuterDecide`, both handlers and `UserTask_OuterCancelled`. |
| [inner-cancel-then-outer-cancel](inner-cancel-then-outer-cancel.scenario.json) | true | true | The inner Transaction is cancelled and its handler and `UserTask_InnerCancelled` complete; `UserTask_OuterDecide` then cancels the outer Transaction, and the outer handler, the inner handler (addressed again) and `UserTask_OuterCancelled` follow. |

The schedules carry no expected eligible set, retained record or Process state; the retained CIB evidence is the answer.
