# Intermediate Timer waits in a repeated branch

Answer-free schedules for [PC-TIMER-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Intermediate Timer waits on a branch that is entered again, beside a branch with its own Timer and a Receive Task, and the reached-occurrence behavior of a cycle expression at an Intermediate catch. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [review-loop.bpmn](review-loop.bpmn) | After a Parallel fork one branch loops and the other waits. The loop is an Exclusive merge, the Human Task `Draft`, the Timer catch `Catch_Wait` (`PT10S`), the Human Task `Review`, the Timer catch `Catch_Cycle` (`R3/PT10S`), the Human Task `Approve` and an Exclusive Gateway that returns to the merge on `${again == true}` and otherwise ends. The other branch is the Timer catch `Catch_Branch` (`PT25S`) followed by the Receive Task `Await_Docs` on the Message `documents`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [single-round](single-round.scenario.json) | review-loop | PC-TIMER-05 | One pass through the loop: `Catch_Wait` fires at 10,000, `Catch_Cycle` at 20,000, and `Approve` completes with `again` false. |
| [two-rounds-with-stale-deadlines](two-rounds-with-stale-deadlines.scenario.json) | review-loop | PC-TIMER-05 | A first round sends the work back; the supplier Timer fires at 25,000 between the second round's arming and its deadline; the first round's activation and then the first round's deadline are named against the second round's wait before its own deadline; the second round completes and the Receive Task is delivered. |

## Notes for the target runners

- A wait's deadline is its arming instant plus its period. The second round's waits are armed after the first round's firings, so their deadlines differ from the first round's; the schedules name those instants.
- A stimulus that addresses an activation that is not open, or a deadline other than the open wait's, is part of the schedule.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
