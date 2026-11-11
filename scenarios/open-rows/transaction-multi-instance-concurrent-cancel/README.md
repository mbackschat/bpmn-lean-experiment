# Multi-Instance Transactions with concurrent Cancel

This directory serves [PC-TX-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and complements [transaction-multi-instance](../transaction-multi-instance/README.md): two bodies of a parallel Multi-Instance Transaction that reach a Cancel End Event before either compensation run completes, a sequential Multi-Instance Transaction whose Cancel comes before a later body has begun, and a completion condition that ends the Activity while a Cancel run waits. The three models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Models

The three models share one shape. The Transaction `Transaction_Lot` runs over the collection `lots` with the element variable `lot`. Its body runs `UserTask_Process` (a Compensation Boundary Event associated with `UserTask_UndoProcess`, input `seenLot` reads `lot`) and `UserTask_Check`, then an Exclusive Gateway: when the condition holds the body reaches a Cancel End Event, otherwise a None End Event. A Cancel Boundary Event on the Multi-Instance Transaction leads to `UserTask_BatchCancelled`; its normal exit leads to `UserTask_BatchDone`. The Process starts with `lots = [a, b, c]` and `lot = outside`.

| Model | Mode | Cancel condition | Completion condition |
|---|---|---|---|
| [parallel-two-cancel](parallel-two-cancel.bpmn) | parallel | `lot != goodLot`, with `goodLot = b`: bodies 1 and 3 cancel | none |
| [sequential-second-cancels](sequential-second-cancels.bpmn) | sequential | `lot == badLot`, with `badLot = b` | none |
| [parallel-completion-condition](parallel-completion-condition.bpmn) | parallel | `lot == badLot`, with `badLot = a` | `nrOfCompletedInstances >= 1` |

## Schedules

Bodies are addressed by activation in generation order.

| Schedule | Model | Journey | Question it separates |
|---|---|---|---|
| [concurrent-cancel-first-run-completes-first](concurrent-cancel-first-run-completes-first.scenario.json) | parallel-two-cancel | All three `UserTask_Process` complete; `UserTask_Check` of bodies 1 and 3 complete (two Cancels, no run finished); `UserTask_UndoProcess` activation 1 completes; `UserTask_Check` 2 and `UserTask_UndoProcess` 2 are addressed; then `UserTask_BatchCancelled`. | Do two concurrent Cancels run two compensation runs, and does the first run to finish interrupt the other run and its handler? |
| [concurrent-cancel-second-run-completes-first](concurrent-cancel-second-run-completes-first.scenario.json) | parallel-two-cancel | The same, with `UserTask_UndoProcess` activation 2 completing first and activation 1 addressed afterwards. | Does which run finishes first change what is cancelled or how often the boundary continues? |
| [sequential-cancel-before-third-body-begins](sequential-cancel-before-third-body-begins.scenario.json) | sequential-second-cancels | Bodies 1 and 2 complete `UserTask_Process` and `UserTask_Check` (body 2 cancels); `UserTask_Process` 3 is addressed while the run waits; `UserTask_UndoProcess` 1 and 2 are addressed; `UserTask_Process` 3 is addressed again; then `UserTask_BatchCancelled`. | Is body 3 ever generated once body 2 cancels, and whose handlers does the run open? |
| [completion-condition-closes-while-run-waits](completion-condition-closes-while-run-waits.scenario.json) | parallel-completion-condition | All three `UserTask_Process` complete; `UserTask_Check` 1 completes (body 1 cancels and its run waits); `UserTask_Check` 2 completes (body 2 ends normally); then `UserTask_UndoProcess` 1, `UserTask_Check` 3, `UserTask_BatchDone` and `UserTask_BatchCancelled` are addressed. | When the completion condition becomes true during a Cancel run, does the Activity end normally, and what happens to the run and to the Cancel Boundary? |

The schedules carry no expected eligible set, body state or Process state; the retained CIB evidence is the answer.
