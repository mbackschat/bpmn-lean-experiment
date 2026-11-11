# Consumption of compensation records by handlers

This directory serves [PC-COMPENSATION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): what happens to the compensable work inside a completed Sub-Process when the Sub-Process's own handler runs. The three models are project-authored MIT source for the `cibseven-2.2.0` profile and, through the `-standards` schedules, for the [`bpmn-2.0.2` profile](../../../profiles/bpmn-2.0.2/README.md); every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer for the `cibseven-2.2.0` ones.

## Models

| Model | Shape |
|---|---|
| [esp-consumes-one-of-two](esp-consumes-one-of-two.bpmn) | The Sub-Process `SubProcess_Group` runs `UserTask_A` and `UserTask_B` in sequence, each with a Compensation Boundary Event and a Human Task handler (`UserTask_UndoA`, `UserTask_UndoB`). Its Compensation Event Sub-Process runs `UserTask_UndoGroup` into an Intermediate throw whose `activityRef` is `UserTask_A`. After `SubProcess_Group`, `UserTask_Pause` leads to an untargeted throw and `UserTask_After`. |
| [boundary-task-handler](boundary-task-handler.bpmn) | `SubProcess_Group` runs `UserTask_Inner` (Compensation Boundary Event, handler `UserTask_UndoInner`) and has its own Compensation Boundary Event associated with the Human Task `UserTask_UndoGroup`. Then `UserTask_Pause`, an untargeted throw and `UserTask_After`. |
| [boundary-subprocess-handler](boundary-subprocess-handler.bpmn) | The same, with the Sub-Process `SubProcess_UndoGroup` (Human Task `UserTask_UndoGroupReview`) as the handler of `SubProcess_Group`. |

## Schedules

| Schedule | Model | Journey | Question it separates |
|---|---|---|---|
| [esp-consumes-one-of-two](esp-consumes-one-of-two.scenario.json), [-standards](esp-consumes-one-of-two-standards.scenario.json) | esp-consumes-one-of-two | `UserTask_A`, `UserTask_B` and `UserTask_Pause` complete; then `UserTask_UndoGroup`, `UserTask_UndoA`, `UserTask_UndoB` (attempted) and `UserTask_After`. | When the group's handler compensates one inner Activity, is the other inner Activity's record compensated too, or dropped? |
| [task-handler-over-inner-record](task-handler-over-inner-record.scenario.json), [-standards](task-handler-over-inner-record-standards.scenario.json) | boundary-task-handler | `UserTask_Inner` and `UserTask_Pause` complete; then `UserTask_UndoGroup`, `UserTask_UndoInner` (attempted) and `UserTask_After`. | When a Sub-Process has a Task as its boundary handler, does the untargeted throw also compensate the inner record? |
| [subprocess-handler-over-inner-record](subprocess-handler-over-inner-record.scenario.json), [-standards](subprocess-handler-over-inner-record-standards.scenario.json) | boundary-subprocess-handler | `UserTask_Inner` and `UserTask_Pause` complete; then `UserTask_UndoGroupReview` activations 1 and 2, `UserTask_UndoInner` and `UserTask_After`. | The same with a Sub-Process handler: how often does the handler start, and is the inner record compensated? |

The schedules carry no expected handler, open wait or Process state; the retained CIB evidence is the answer. The `-standards` schedules select no CIB oracle.
