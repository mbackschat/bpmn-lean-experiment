# Timer expressions derived from Process data

Answer-free schedules for [PC-TIMER-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): where and when a Timer expression reads Process data, which result types the Timer accepts, what a failing evaluation does to the command that armed the Timer, and whether a later write to the variable moves a deadline that is already armed. The retained CIB Seven `2.2.0` answer is the target. CIB's explicit recalculation APIs have no scenario input and stay outside these schedules. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [derived-deadlines.bpmn](derived-deadlines.bpmn) | A None Start, the Human Task `Prepare` and an Exclusive Gateway that routes on the String variable `route`. `catch` runs the Intermediate Timer `Catch_Delay` with the duration expression `${delay}`; `boundary` runs the Human Task `Host_Work` with an interrupting boundary `Limit` whose duration is `${limit}`; `date` runs the Timer catch `Catch_Due` with the date expression `${due}`; `cycle` runs the Human Task `Host_Remind` with a non-interrupting boundary `Cadence` whose cycle is `${cadence}`. Each route leads to a Human Task that follows the Timer or its handler. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [catch-value-at-start](catch-value-at-start.scenario.json) | derived-deadlines | PC-TIMER-03 | `delay` is `PT10S` from the start; `Prepare` completes, the Timer fires at 10,000 and `Proceed_Catch` completes. |
| [catch-value-written-by-completion](catch-value-written-by-completion.scenario.json) | derived-deadlines | PC-TIMER-03 | `delay` is absent at the start and `Prepare` completes writing `PT20S`; the Timer fires at 20,000. |
| [catch-change-after-arming](catch-change-after-arming.scenario.json) | derived-deadlines | PC-TIMER-03 | `delay` is `PT10S` when the Timer is armed and is set to `PT30S` afterwards; a firing at 30,000 is attempted, then the firing at 10,000, then `Proceed_Catch`. |
| [catch-absent-variable](catch-absent-variable.scenario.json) | derived-deadlines | PC-TIMER-03 | `delay` is never written; `Prepare` completes. |
| [catch-integer-value](catch-integer-value.scenario.json) | derived-deadlines | PC-TIMER-03 | `delay` is the Integer 5; `Prepare` completes. |
| [catch-null-value](catch-null-value.scenario.json) | derived-deadlines | PC-TIMER-03 | `delay` is a present null; `Prepare` completes. |
| [catch-malformed-text](catch-malformed-text.scenario.json) | derived-deadlines | PC-TIMER-03 | `delay` is the String `soon`; `Prepare` completes. |
| [boundary-value-at-host-entry](boundary-value-at-host-entry.scenario.json) | derived-deadlines | PC-TIMER-03 | `limit` is `PT15S`; `Prepare` completes, the boundary fires at 15,000 and the handler completes. |
| [boundary-change-after-host-entry](boundary-change-after-host-entry.scenario.json) | derived-deadlines | PC-TIMER-03 | `limit` is `PT15S` when the host starts and is set to `PT5S` on the host afterwards; a firing at 5,000 is attempted, then the firing at 15,000, then the handler completes. |
| [date-value-at-arming](date-value-at-arming.scenario.json) | derived-deadlines | PC-TIMER-03 | `due` is `1970-01-01T01:00:00Z`; `Prepare` completes and the Timer fires at 3,600,000. |
| [cycle-value-at-host-entry](cycle-value-at-host-entry.scenario.json) | derived-deadlines | PC-TIMER-03, PC-TIMER-02 | `cadence` is `R2/PT10S`; `Prepare` completes and the boundary fires at 10,000 and 20,000, a third firing at 30,000 is attempted. |

## Notes for the target runners

- The Timer arms when its route is entered, which is the command that completes `Prepare`, so a failing expression belongs to that command; a command that fails ends the run at it.
- Deadlines are relative to the arming instant, which is logical time zero in every schedule here.
- A variable written after arming is addressed to the open Timer wait or to the host Human Task.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
