# Compensation Event Sub-Processes in Multi-Instance Sub-Processes

This directory serves [PC-COMPENSATION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Compensation Event Sub-Process in a sequential and in a parallel Multi-Instance Sub-Process, distinct snapshots for distinct bodies, consumption of the event and explicit rethrow to a deeper handler. The two models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Models

[parallel-esp](parallel-esp.bpmn) and [sequential-esp](sequential-esp.bpmn) differ only in `isSequential`. The Sub-Process `SubProcess_Visits` runs over the collection `items` with the element variable `stop`. Its body runs the Human Task `UserTask_Visit`, which has a Compensation Boundary Event associated with `UserTask_UndoVisit` (input `seenStop` reads `stop`). The body also holds a Compensation Event Sub-Process running `UserTask_UndoVisitParent` (input `seenParent` reads `stop`), which rethrows an untargeted Compensation event when the start variable `rethrow` is true. After the Multi-Instance Sub-Process, `UserTask_Pause` leads to an untargeted Intermediate throw and `UserTask_After`. The Process starts with `items = [s1, s2, s3]` and `stop = outside`.

## Schedules

Bodies are addressed by activation in generation order. After the bodies complete, `stop` is set to `late` at `UserTask_Pause`; the handlers `UserTask_UndoVisitParent` (activation 3, 2, 1) and `UserTask_UndoVisit` (activation 1, 2, 3) are then addressed, followed by `UserTask_After`.

| Schedule | Model | Body completion order | `rethrow` |
|---|---|---|---|
| [parallel-out-of-order-consumed](parallel-out-of-order-consumed.scenario.json) | parallel-esp | 2, 3, 1 | false |
| [parallel-out-of-order-rethrown](parallel-out-of-order-rethrown.scenario.json) | parallel-esp | 2, 3, 1 | true |
| [sequential-in-turn-consumed](sequential-in-turn-consumed.scenario.json) | sequential-esp | 1, 2, 3 | false |
| [sequential-in-turn-rethrown](sequential-in-turn-rethrown.scenario.json) | sequential-esp | 1, 2, 3 | true |

The Compensation start events are written `isInterrupting="false"`, the form the existing project models use; whether the omitted attribute (the XML Schema default `true`) changes CIB's behavior is not separated here. The schedules carry no expected snapshot, handler order or Process state; the retained CIB evidence is the answer.
