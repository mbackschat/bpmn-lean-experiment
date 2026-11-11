# Compensation throws inside Event Sub-Processes

This directory serves [PC-COMPENSATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (which completed work a throw reaches) and [PC-COMPENSATION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Compensation Event Sub-Processes): throws inside a Compensation Event Sub-Process and inside an interrupting Error Event Sub-Process, targeted at an Activity of the parent Sub-Process, at an Activity of a nested Sub-Process, and untargeted. The five models are project-authored MIT source for the `cibseven-2.2.0` profile; the schedules with a `-standards` entry below also run under the [`bpmn-2.0.2` profile](../../../profiles/bpmn-2.0.2/README.md). Every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer for the `cibseven-2.2.0` ones.

## Models

| Model | Shape |
|---|---|
| [throw-parent-activity](throw-parent-activity.bpmn) | The Sub-Process `SubProcess_Group` runs `UserTask_Task`, which has a Compensation Boundary Event associated with `UserTask_UndoTask`. Its Compensation Event Sub-Process runs `UserTask_UndoGroup` into an Intermediate Compensation throw whose `activityRef` is `UserTask_Task`. After `SubProcess_Group`, `UserTask_Pause` leads to an untargeted throw and `UserTask_After`. |
| [throw-nested-activity](throw-nested-activity.bpmn) | As above, but the Task is `UserTask_Deep` inside the nested Sub-Process `SubProcess_Inner` of `SubProcess_Group` (compensation handler `UserTask_UndoDeep`), and the Event Sub-Process throw names `UserTask_Deep`. |
| [error-esp-untargeted](error-esp-untargeted.bpmn) | `SubProcess_Group` runs `UserTask_Task` (handler `UserTask_UndoTask`) and `UserTask_Check` into an Error End Event. An interrupting Error Event Sub-Process for that code runs `UserTask_Recover` into an untargeted Intermediate Compensation throw and `UserTask_Recovered`. `SubProcess_Group` leads to `UserTask_Settle`. |
| [error-esp-targeted](error-esp-targeted.bpmn) | The same, with the throw's `activityRef` set to `UserTask_Task`. |
| [error-esp-completes-then-outer-throw](error-esp-completes-then-outer-throw.bpmn) | `SubProcess_Group` as in `error-esp-untargeted`, but its interrupting Error Event Sub-Process runs `UserTask_Recover` into an End Event without compensating. After `SubProcess_Group`, `UserTask_Pause` leads to an untargeted Process-level throw and `UserTask_After`. |

## Schedules

| Schedule | Model | Journey | Question it separates |
|---|---|---|---|
| [throws-parent-activity](throws-parent-activity.scenario.json), [-standards](throws-parent-activity-standards.scenario.json) | throw-parent-activity | `UserTask_Task` and `UserTask_Pause` complete; then `UserTask_UndoGroup`, `UserTask_UndoTask` and `UserTask_After`. | Does a throw inside a Compensation Event Sub-Process reach an Activity of its parent Sub-Process? |
| [throws-nested-activity](throws-nested-activity.scenario.json), [-standards](throws-nested-activity-standards.scenario.json) | throw-nested-activity | `UserTask_Deep` and `UserTask_Pause` complete; then `UserTask_UndoGroup`, `UserTask_UndoDeep` and `UserTask_After`. | Is a reference to an Activity of a nested Sub-Process a deployment question, and if it deploys, does it compensate that Activity? |
| [error-esp-throws-untargeted](error-esp-throws-untargeted.scenario.json) | error-esp-untargeted | `UserTask_Task` and `UserTask_Check` complete (the Error is raised); then `UserTask_Recover`, `UserTask_UndoTask`, `UserTask_Recovered` and `UserTask_Settle`. | Does an untargeted throw in an Error Event Sub-Process compensate the completed work of the Sub-Process it handles? |
| [error-esp-throws-targeted](error-esp-throws-targeted.scenario.json) | error-esp-targeted | The same journey. | Does the same throw, targeted at the Task, compensate it? |
| [error-esp-completes-then-outer-throw](error-esp-completes-then-outer-throw.scenario.json), [-standards](error-esp-completes-then-outer-throw-standards.scenario.json) | error-esp-completes-then-outer-throw | `UserTask_Task` and `UserTask_Check` complete; `UserTask_Recover` completes; `UserTask_UndoTask` is attempted; then `UserTask_Pause`, `UserTask_UndoTask` and `UserTask_After`. | When the Error Event Sub-Process completes without compensating and the Sub-Process completes, does the later Process-level throw compensate the records the Error left? |

The schedules carry no expected open wait, handler or Process state; the retained CIB evidence is the answer. The `-standards` schedules select no CIB oracle.
