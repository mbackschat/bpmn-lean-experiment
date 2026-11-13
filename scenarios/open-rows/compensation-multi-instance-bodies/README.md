# Multi-Instance bodies as compensation subjects

This directory serves [PC-COMPENSATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the completed bodies of sequential and parallel Multi-Instance Activities, preservation of occurrence multiplicity, body-local snapshots, and the effect of data written after the bodies completed. Handlers of Compensation Event Sub-Processes in a Multi-Instance Sub-Process are in [compensation-event-subprocess-multi-instance](../compensation-event-subprocess-multi-instance/README.md). The models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Models

Each model runs the Multi-Instance Activity over the collection `items` with the element variable `stop`, then `UserTask_Pause`, an untargeted Intermediate throw and `UserTask_After`. Every handler is a Human Task whose input `seenStop` reads `stop`; the Process also starts with `stop = outside`.

| Model | Mode | Multi-Instance Activity | Compensable by |
|---|---|---|---|
| [parallel-tasks](parallel-tasks.bpmn), [sequential-tasks](sequential-tasks.bpmn) | parallel, sequential | the Human Task `UserTask_Visit` | a Compensation Boundary Event on the Human Task associated with `UserTask_UndoVisit` |
| [parallel-regions](parallel-regions.bpmn), [sequential-regions](sequential-regions.bpmn) | parallel, sequential | the Sub-Process `SubProcess_Visits`, whose body runs `UserTask_Work` | no handler on the Sub-Process; `UserTask_Work` has a Compensation Boundary Event associated with `UserTask_UndoWork` |
| [parallel-regions-counters](parallel-regions-counters.bpmn), [sequential-regions-counters](sequential-regions-counters.bpmn) | parallel, sequential | as the regions models, closing once `${nrOfCompletedInstances >= 1}` holds | as the regions models; `UserTask_UndoWork` reads `nrOfInstances`, `nrOfActiveInstances` and `nrOfCompletedInstances` into `seenInstances`, `seenActive` and `seenCompleted` instead of `stop` |

## Schedules

The start variable `items` is the list `s1, s2, s3`. Bodies are addressed by activation in generation order. After the bodies, a variable update sets `stop = late` at `UserTask_Pause`; the handlers are then completed by activation 3, 2, 1.

| Schedule | Model | Body completion order |
|---|---|---|
| [tasks-parallel-out-of-order](tasks-parallel-out-of-order.scenario.json) | parallel-tasks | 2, 3, 1 |
| [tasks-sequential-in-turn](tasks-sequential-in-turn.scenario.json) | sequential-tasks | 1, 2, 3 |
| [regions-parallel-out-of-order](regions-parallel-out-of-order.scenario.json) | parallel-regions | 2, 3, 1 |
| [regions-sequential-in-turn](regions-sequential-in-turn.scenario.json) | sequential-regions | 1, 2, 3 |

The counters models ([#106](https://github.com/mbackschat/bpmn-lean-experiment/issues/106)) read the body's counters as its compensation snapshot holds them, after the completion that leaves the body; each compensates one instance, so no handler order or item restoration (CIB-INT-0040, CIB-DEV-0011, CIB-DEV-0014) enters their answer. Neither sets `stop`.

| Schedule | Model | `items` | Body completions | Path out of the body |
|---|---|---|---|---|
| [counters-sequential-last](counters-sequential-last.scenario.json) | sequential-regions-counters | `s1` | 1 | the last instance completes |
| [counters-parallel-early](counters-parallel-early.scenario.json) | parallel-regions-counters | `s1, s2, s3` | 2 | the completion condition closes the body early |

Service Task handlers are not used in these models: the retained runner cannot order two concurrent waits of one Service Task element, so every handler here is a Human Task.

The schedules carry no expected handler count, handler input or Process state; the retained CIB evidence is the answer.
