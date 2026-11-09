# Completed, unfinished and interrupted work

This directory serves [PC-COMPENSATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): which work a Compensation throw can reach (completed activities only), preservation of multiplicity for one element completed several times, and the exclusion of unfinished and interrupted work. Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Models

| Model | Shape |
|---|---|
| [repeated-visits](repeated-visits.bpmn) | A Parallel fork. One branch is a cycle of the Human Task `UserTask_Visit` (a Compensation Boundary Event associated with `UserTask_UndoVisit`, whose input `seenStop` reads `stop`) and an Exclusive Gateway that loops while `again` is true. The other branch is `UserTask_Trigger`, an untargeted Intermediate throw, `UserTask_Checkpoint`, a second untargeted throw and `UserTask_Done`. |
| [interrupted-work](interrupted-work.bpmn) | `UserTask_Work` with a Compensation Boundary Event (handler `UserTask_UndoWork`) and an interrupting `PT5S` Timer Boundary Event leading to `UserTask_TimedOut`. Both paths merge into an untargeted Intermediate throw and `UserTask_After`. |

## Schedules

Every `UserTask_Visit` completion writes `again` and `stop`; the visit number is the activation, and `stop` becomes `s1`, `s2`, `s3` by visit. The Process starts with `again = true` and `stop = s0`.

| Schedule | Model | Journey |
|---|---|---|
| [two-records-live-data](two-records-live-data.scenario.json) | repeated-visits | Visits 1 and 2 complete (the second ends the cycle), `UserTask_Trigger` completes, the handlers of visits 2 and 1 are completed in that order, then `UserTask_Checkpoint` and `UserTask_Done`. |
| [unfinished-third-ineligible](unfinished-third-ineligible.scenario.json) | repeated-visits | Visits 1 and 2 complete with `again` true, so visit 3 is open. `UserTask_Trigger` completes, the handlers of visits 1 and 2 are completed, `UserTask_Checkpoint` and `UserTask_Done` complete, and visit 3 completes last. |
| [late-third-second-throw](late-third-second-throw.scenario.json) | repeated-visits | As above, but visit 3 completes between the first throw's handlers and `UserTask_Checkpoint`; the handler of visit 3 is then completed before `UserTask_Done`. |
| [completed-then-throw](completed-then-throw.scenario.json) | interrupted-work | `UserTask_Work` completes, then its handler and `UserTask_After`. |
| [interrupted-then-throw](interrupted-then-throw.scenario.json) | interrupted-work | The Timer fires at 5 000 ms, `UserTask_Work` is then addressed, `UserTask_TimedOut` completes, then the handler and `UserTask_After` are addressed. |

The schedules carry no expected eligible set, handler count or Process state; the retained CIB evidence is the answer.
