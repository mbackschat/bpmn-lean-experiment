# Terminate End inside a compensation handler

This directory serves [PC-COMPENSATION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the meaning of a Terminate End Event on one path of a Sub-Process that is a compensation handler while another path inside the handler still waits. The model is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Model

[handler-terminate](handler-terminate.bpmn): `UserTask_Work` has a Compensation Boundary Event associated with the Sub-Process `SubProcess_Undo`. After `UserTask_Work`, an untargeted Intermediate throw leads to `UserTask_After`. The handler Sub-Process forks after its Start Event into two paths: `UserTask_UndoQuick` into a Terminate End Event, and `UserTask_UndoSlow` into a None End Event.

## Schedules

| Schedule | Journey | Question it separates |
|---|---|---|
| [terminate-first](terminate-first.scenario.json) | `UserTask_Work` completes; `UserTask_UndoQuick` completes (the Terminate End); `UserTask_UndoSlow` is addressed afterwards; then `UserTask_After`. | Does the Terminate End end only the handler Sub-Process, is the waiting parallel path cancelled, and does the compensation run continue? |
| [slow-first](slow-first.scenario.json) | `UserTask_Work` completes; `UserTask_UndoSlow` completes; `UserTask_After` is attempted; then `UserTask_UndoQuick` and `UserTask_After`. | Does the handler Sub-Process wait for the path that has not ended, so that the trigger cannot continue early? |

The schedules carry no expected open wait or run state; the retained CIB evidence is the answer.
