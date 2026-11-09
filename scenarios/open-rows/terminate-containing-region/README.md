# Terminate End across waits, child scopes and handler work

This directory serves [PC-TERMINATE-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Terminate End at the Process root, in a Sub-Process and in a nested Sub-Process, across Human, Message, Timer, effect and incident waits, a child scope and live Event Sub-Process handler work, with outside siblings around it. The registered [terminate end event](../../terminate-end-event/README.md) scenarios hold the one-level shape. The [review desk model](review-desk.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, the root runs the Human Task `Outside`, the Human Task `Abort` leading to a Terminate End at the Process root, and the Sub-Process `Region`, followed by the Human Task `AfterRegion`. `Region` forks into eight branches:

| Branch of `Region` | Wait |
|---|---|
| `Trigger` | Human Task leading to a Terminate End of `Region` |
| `Review` | Human Task |
| `Reply` | Receive Task for the Message `replyReceived` |
| `Deadline` | Intermediate Timer catch, `PT1H` |
| `Notify`, `Archive` | two Service Tasks answered by `effectResult` |
| `Child` | Sub-Process holding the Human Tasks `ChildTrigger` (leading to a Terminate End of `Child`) and `ChildWork` |
| `Raise` | Human Task, then an Intermediate Escalation throw `ALERT` caught by a non-interrupting Event Sub-Process of `Region` whose body is the Human Task `Handle` |

Schedules that report a technical failure of `Archive` declare `options.incidents`.

| Schedule | Case it exercises |
|---|---|
| [region-terminate-with-incident](region-terminate-with-incident.scenario.json) | `Raise` starts a live handler and `Archive` fails with an incident; `Trigger` completes. Every other wait of `Region`, the incident's retry and the handler are then addressed, and `AfterRegion`, `Outside` and `Abort` complete. |
| [root-terminate](root-terminate.scenario.json) | The same live handler and incident, then `Abort` completes; `Notify`, `Handle`, `Trigger` and `Outside` are addressed afterwards. |
| [inner-scope-terminate](inner-scope-terminate.scenario.json) | `ChildTrigger` completes in the nested scope, `ChildWork` is addressed afterwards, then `Review`, `Reply` and `Trigger` complete in `Region`. |

The schedules carry no expected open wait, continuation or Process state; the retained CIB evidence is the answer.
