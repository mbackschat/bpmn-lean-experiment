# Escalation on Multi-Instance hosts

This directory serves [PC-ESCALATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and the Multi-Instance part of [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Escalations raised inside Multi-Instance Call Activities and Sub-Processes and caught by a boundary of the host or by an Event Sub-Process (ESP) of an enclosing Sub-Process. Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Every Multi-Instance Activity here uses a loop cardinality of 2.

The [call model](review-items.bpmn) forks into two Call Activities of the Process `Process_ItemCheck`, whose children run the Human Task `Inspect`, an Intermediate throw `FLAGGED` and the Human Task `Finish`. `ReviewParallel` is parallel with an interrupting exact `FLAGGED` boundary on the host; `ReviewSequential` is sequential with a non-interrupting exact `FLAGGED` boundary on the host. Children are addressed by the kernel's derived called-instance identifier, whose activation counts the instances of the Call Activity.

The [Sub-Process model](review-batches.bpmn) forks into four Multi-Instance regions. Every handler leads to its own Human Task.

| Region | Ordinary work per instance | Handler |
|---|---|---|
| parallel Sub-Process `ReviewParallelBatch` | `Check`, Intermediate throw `OVERDUE`, `FinishCheck` | interrupting exact `OVERDUE` boundary on the host |
| sequential Sub-Process `ReviewSequentialBatch` | `Verify`, Intermediate throw `LATE`, `FinishVerify` | non-interrupting exact `LATE` boundary on the host |
| parallel User Task `Approve` | the Human Task itself, which raises nothing | non-interrupting exact `HELP` boundary on the host |
| Sub-Process `Campaign` ⊃ parallel Sub-Process `Wave` | `Step`, Intermediate throw `STALLED`, `FinishStep` | non-interrupting exact `STALLED` ESP in `Campaign` |

| Scenario | Model | Case it exercises |
|---|---|---|
| [parallel-interrupting](parallel-interrupting.scenario.json) | call | The second of two concurrent children raises, then the first child's task is addressed after that. |
| [sequential-non-interrupting](sequential-non-interrupting.scenario.json) | call | The first child raises and completes in turn, so the next instance starts and raises again. |
| [parallel-subprocess-interrupting](parallel-subprocess-interrupting.scenario.json) | Sub-Process | The second of two concurrent instances raises, then the first instance's task is addressed after that. |
| [sequential-subprocess-non-interrupting](sequential-subprocess-non-interrupting.scenario.json) | Sub-Process | The first instance raises and completes in turn, so the next instance starts and raises again. |
| [user-task-wrapper-declared](user-task-wrapper-declared.scenario.json) | Sub-Process | A Multi-Instance User Task host with a boundary that is declared and never raised: both instances complete. |
| [instances-throw-to-enclosing-handler](instances-throw-to-enclosing-handler.scenario.json) | Sub-Process | Both instances of the inner Multi-Instance Sub-Process raise toward the ESP of the enclosing Sub-Process. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
