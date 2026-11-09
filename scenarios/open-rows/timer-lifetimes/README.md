# Timer lifetimes across Multi-Instance bodies, called children and Transactions

Answer-free schedules for [PC-TIMER-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a deadline local to one Multi-Instance body beside its siblings, a body-local Timer Event Sub-Process, an outer deadline over every inner Timer, a Call Activity whose child owns Timers, and a Transaction under a deadline, each interleaved with completion in both orders. The outer Timer over a Multi-Instance Activity is witnessed by the [Multi-Instance Sub-Process](../multi-instance-sub-process/README.md) schedules; these add the body-local Timers. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The models are project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [parallel-body-timers.bpmn](parallel-body-timers.bpmn) | The Sub-Process `SubProcess_Bodies` runs once per item of the String list `items` (parallel). Each body holds the Human Task `Inspect` with an interrupting Timer boundary `Body_Deadline` (`PT5S`) to the Human Task `Body_Late`, and a non-interrupting Timer Event Sub-Process `ESP_Body` (`PT3S`, handler `Body_Note`). An interrupting Timer boundary `Outer_Deadline` (`PT50S`) on `SubProcess_Bodies` leads to `Outer_Late`; normal completion leads to `Publish`. |
| [sequential-body-timers.bpmn](sequential-body-timers.bpmn) | The Sub-Process `SubProcess_Bodies` runs once per item of the String list `items` (sequential). Each body holds the Human Task `Inspect` with an interrupting Timer boundary `Body_Deadline` (`PT5S`) to the Human Task `Body_Late`, and a non-interrupting Timer Event Sub-Process `ESP_Body` (`PT3S`, handler `Body_Note`). An interrupting Timer boundary `Outer_Deadline` (`PT50S`) on `SubProcess_Bodies` leads to `Outer_Late`; normal completion leads to `Publish`. |
| [call-and-transaction-timers.bpmn](call-and-transaction-timers.bpmn) | After a Parallel fork the Call Activity `Call_Child` of `Process_TimedChild` runs beside the Transaction `Transaction_Booking`. `Process_TimedChild` runs the Human Task `Child_Task` (with a non-interrupting `Child_Boundary`, `PT6S`, to `Child_Note`) and then the Timer catch `Child_Wait` (`PT20S`). `Call_Child` has an interrupting boundary `Call_Deadline` (`PT40S`) to `Call_Late` and returns to `After_Call`. The Transaction runs the Human Tasks `Reserve` and `Pay` under an interrupting boundary `Tx_Deadline` (`PT30S`) to `Tx_Late` and ends in `After_Tx`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [parallel-one-body-deadline](parallel-one-body-deadline.scenario.json) | parallel-body-timers | PC-TIMER-08 | Three bodies; body 2's `Body_Deadline` fires at 5,000, its handler completes, bodies 1 and 3 complete, then body 1's deadline is fired again and `Publish` completes. |
| [parallel-outer-deadline](parallel-outer-deadline.scenario.json) | parallel-body-timers | PC-TIMER-08 | Three bodies; `Outer_Deadline` fires at 50,000; body 1's deadline and Event Sub-Process Timer and `Inspect` are then addressed and `Outer_Late` completes. |
| [parallel-completion-then-deadline](parallel-completion-then-deadline.scenario.json) | parallel-body-timers | PC-TIMER-08 | Three bodies; body 2 completes, its deadline is then fired, body 1's Event Sub-Process Timer fires at 3,000 and its deadline at 5,000, and the handlers, `Inspect` of body 3 and `Publish` complete. |
| [sequential-first-body-deadline-arms-second](sequential-first-body-deadline-arms-second.scenario.json) | sequential-body-timers | PC-TIMER-08 | Two bodies; the first body's deadline fires at 5,000 and its handler completes; that deadline is fired again; the second body's deadline is fired at 10,000 and its handler and `Publish` complete. |
| [sequential-outer-deadline-after-first-body](sequential-outer-deadline-after-first-body.scenario.json) | sequential-body-timers | PC-TIMER-08 | Two bodies; the first body's `Inspect` completes, `Outer_Deadline` fires at 50,000, the second body's deadline is addressed at 5,000 and `Outer_Late` completes. |
| [call-outer-deadline-removes-child-timers](call-outer-deadline-removes-child-timers.scenario.json) | call-and-transaction-timers | PC-TIMER-08 | The child's `Child_Boundary` fires at 6,000; `Call_Deadline` fires at 40,000; the child's `Child_Note` and `Child_Task` are then addressed and `Call_Late` completes. |
| [call-child-completes-before-outer](call-child-completes-before-outer.scenario.json) | call-and-transaction-timers | PC-TIMER-08 | The child's `Child_Task` completes; `Child_Boundary` is then fired, `Child_Wait` fires at 20,000, `Call_Deadline` is fired at 40,000 and `After_Call` completes. |
| [transaction-deadline-while-work-open](transaction-deadline-while-work-open.scenario.json) | call-and-transaction-timers | PC-TIMER-08 | `Reserve` completes; `Tx_Deadline` fires at 30,000 with `Pay` open; `Pay` is then addressed and `Tx_Late` completes. |
| [transaction-completes-first](transaction-completes-first.scenario.json) | call-and-transaction-timers | PC-TIMER-08 | `Reserve` and `Pay` complete; `Tx_Deadline` is then fired at 30,000 and `After_Tx` completes. |

## Notes for the target runners

- Inner tasks and boundaries of a Multi-Instance body are addressed by activation, counted per begun occurrence of the element in the Process instance: a body's `Inspect` is the next activation of `Inspect`. A stimulus that addresses a wait that is not open is part of the schedule.
- The Timers of every parallel body are armed at the start (logical time zero); a sequential body's Timers are armed when the body begins, so the second body's `Body_Deadline` is armed at the logical time of the first body's end.
- `ESP_Body` is addressed by its Start Event `Start_Body_Note`, which the CIB runner numbers through a host that has no activity instance before the start fires; every body of the two Multi-Instance models arms it from the start, so every schedule over those models can fail as a harness failure until the runner names the declaring scope as the host.
- The called instance is addressed by the derived identity `call:<len>:Instance_1:<len>:Call_Child:1`.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
