# Multi-Instance Transactions

This directory serves [PC-TX-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Cancel inside one body of a parallel and of a sequential Multi-Instance Transaction, the effect on the other bodies, their handlers and the single Cancel Boundary continuation, and the all-bodies-succeed path. The two models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Models

[parallel-batch](parallel-batch.bpmn) and [sequential-batch](sequential-batch.bpmn) differ only in `isSequential`. The Transaction `Transaction_Lot` runs over the collection `lots` with the element variable `lot`. Its body runs `UserTask_Process` (a Compensation Boundary Event associated with `UserTask_UndoProcess`, input `seenLot` reads `lot`) and `UserTask_Check`, then an Exclusive Gateway: when `lot` equals the start variable `badLot` the body reaches a Cancel End Event, otherwise a None End Event. A Cancel Boundary Event on the Multi-Instance Transaction leads to `UserTask_BatchCancelled`; its normal exit leads to `UserTask_BatchDone`. The Process starts with `lots = [a, b, c]` and `lot = outside`.

## Schedules

Bodies are addressed by activation in generation order. `badLot` is `b` unless stated.

| Schedule | Model | Journey |
|---|---|---|
| [parallel-all-bodies-succeed](parallel-all-bodies-succeed.scenario.json) | parallel-batch, `badLot = none` | All three `UserTask_Process` and all three `UserTask_Check` complete, then `UserTask_BatchDone`. |
| [parallel-cancel-after-others-checked](parallel-cancel-after-others-checked.scenario.json) | parallel-batch | All three `UserTask_Process` complete; `UserTask_Check` of bodies 1 and 3 complete (their bodies end), then body 2's `UserTask_Check`; the handlers of bodies 1, 2 and 3 are addressed, then `UserTask_BatchCancelled`. |
| [parallel-cancel-with-others-unchecked](parallel-cancel-with-others-unchecked.scenario.json) | parallel-batch | All three `UserTask_Process` complete; only body 2's `UserTask_Check` completes; the handlers of bodies 1, 2 and 3 are addressed, then body 1's `UserTask_Check` and `UserTask_BatchCancelled`. |
| [sequential-second-body-cancels](sequential-second-body-cancels.scenario.json) | sequential-batch | Body 1 completes `UserTask_Process` and `UserTask_Check`; body 2 completes `UserTask_Process` and `UserTask_Check`; the handlers of bodies 1 and 2 are addressed, then `UserTask_BatchCancelled` and body 3's `UserTask_Process`. |

The schedules carry no expected eligible set, body state or Process state; the retained CIB evidence is the answer.
