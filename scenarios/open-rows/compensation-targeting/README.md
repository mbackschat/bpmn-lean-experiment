# Targeted and untargeted Compensation throws

This directory serves [PC-COMPENSATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): targeted and untargeted Intermediate and End Compensation throws, empty eligible sets, repeated throws, records already consumed by an earlier throw, and the join before the continuation. Every model is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Wrong-scope `activityRef` forms are in [compensation-activity-ref-refusals](../compensation-activity-ref-refusals/README.md), and nested regions in [compensation-regions](../compensation-regions/README.md).

## Models

| Model | Shape |
|---|---|
| [linear-throws](linear-throws.bpmn) | Human Tasks `UserTask_Reserve`, `UserTask_Ship` and `UserTask_Bill` in sequence, each with a Compensation Boundary Event associated with its own compensation Human Task (`UserTask_UndoReserve`, `UserTask_UndoShip`, `UserTask_UndoBill`). An Exclusive Gateway reads the start variable `mode`. `chain` runs a throw targeted at `UserTask_Ship`, `UserTask_CheckpointOne`, an untargeted throw, `UserTask_CheckpointTwo`, a second untargeted throw, `UserTask_CheckpointThree`, and then a Compensation End Event targeted at `UserTask_Reserve`. `end` goes straight to that targeted Compensation End Event. Any other value goes to an untargeted Compensation End Event. |
| [empty-throws](empty-throws.bpmn) | An untargeted Intermediate throw with nothing completed, an Intermediate throw targeted at `UserTask_Later` before it has run, then `UserTask_Later` with its compensation Human Task, a throw targeted at it, and `UserTask_Done`. |
| [unwaited-throw](unwaited-throw.bpmn) | `UserTask_Work` with a compensation Human Task, then an Intermediate throw whose `waitForCompletion` is `false`, then `UserTask_After`. |

## Schedules

| Schedule | Model | Journey |
|---|---|---|
| [chain-handlers-forward](chain-handlers-forward.scenario.json) | linear-throws, `chain` | The three tasks complete, then each checkpoint and compensation Human Task is completed in the order the Process offers it, with the two handlers of the untargeted throw completed Reserve first. |
| [chain-handlers-reversed](chain-handlers-reversed.scenario.json) | linear-throws, `chain` | The first checkpoint is attempted before its handler, the targeted handler is completed twice, and the handlers of the untargeted throw are completed Bill first, with the second checkpoint attempted before Reserve's handler. |
| [end-targeted-only](end-targeted-only.scenario.json) | linear-throws, `end` | The three tasks complete, then the handlers of Ship, Bill and Reserve are addressed in turn. |
| [end-untargeted](end-untargeted.scenario.json) | linear-throws, any other `mode` | The three tasks complete, then the handlers of Bill, Ship and Reserve are completed in turn. |
| [empty-then-targeted](empty-then-targeted.scenario.json) | empty-throws | `UserTask_Later`, its handler and `UserTask_Done` complete in turn. |
| [unwaited-handler-open](unwaited-handler-open.scenario.json) | unwaited-throw | `UserTask_Work` completes, `UserTask_After` is attempted before the handler, the handler completes, and `UserTask_After` is attempted again. |

The `chain` schedules start with `mode = chain`, `end-targeted-only` with `mode = end` and `end-untargeted` with `mode = all`. The schedules carry no expected open wait, consumption or Process state; the retained CIB evidence is the answer.
