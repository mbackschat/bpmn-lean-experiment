# Compensation handler failure at a wait

This directory serves [PC-COMPENSATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-COMPENSATION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): what an Error or an Escalation that a compensation handler raises after it has waited does to the compensation run, to its trigger and to the catchers around the compensated Sub-Process; the failure paths of [PC-TX-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) are the same question under a Transaction. The four models are project-authored MIT source for the `cibseven-2.2.0` profile and, through the `-standards` schedules, for the [`bpmn-2.0.2` profile](../../../profiles/bpmn-2.0.2/README.md); every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer for the `cibseven-2.2.0` ones.

## Models

The four models differ only in what the handler raises and in whether a catcher exists. The Sub-Process `SubProcess_Outer` runs the Sub-Process `SubProcess_Work` (the User Task `UserTask_Work`). A Compensation Boundary Event on `SubProcess_Work` is associated with the Sub-Process `SubProcess_Undo`, which runs the User Task `UserTask_UndoReview` into an End Event that raises the Error `UNDO_FAILED` or the Escalation `UNDO_ESCALATED`. After `SubProcess_Work`, an untargeted Intermediate Compensation throw leads to `UserTask_After`; `SubProcess_Outer` then leads to `UserTask_Settle`. The Process has no other handler.

| Model | Raised by the handler | Catcher |
|---|---|---|
| [error-caught](error-caught.bpmn) | Error End Event | Error Boundary Event on `SubProcess_Outer` for the same code, leading to `UserTask_Caught` |
| [error-uncaught](error-uncaught.bpmn) | Error End Event | none |
| [escalation-caught](escalation-caught.bpmn) | Escalation End Event | interrupting Escalation Boundary Event on `SubProcess_Outer` for the same code, leading to `UserTask_Caught` |
| [escalation-uncaught](escalation-uncaught.bpmn) | Escalation End Event | none |

## Schedules

Each schedule completes `UserTask_Work` (the subject completes and the throw follows), completes the handler's `UserTask_UndoReview`, and then addresses what could follow: `UserTask_After`, `UserTask_Settle` and, in the caught variants, `UserTask_Caught`. A stimulus that addresses a wait that is not open is part of the schedule, not a mistake in it.

| Schedule | Model | Question it separates |
|---|---|---|
| [error-caught-handler-fails-after-wait](error-caught-handler-fails-after-wait.scenario.json), [-standards](error-caught-handler-fails-after-wait-standards.scenario.json) | error-caught | Does the Error leave the handler context, does the enclosing boundary take it, and does the trigger continue? |
| [error-uncaught-handler-fails-after-wait](error-uncaught-handler-fails-after-wait.scenario.json), [-standards](error-uncaught-handler-fails-after-wait-standards.scenario.json) | error-uncaught | What happens to the run, the trigger and the instance when nothing catches the Error? |
| [escalation-caught-handler-fails-after-wait](escalation-caught-handler-fails-after-wait.scenario.json), [-standards](escalation-caught-handler-fails-after-wait-standards.scenario.json) | escalation-caught | Does the Escalation reach the enclosing boundary, and does an interrupting catch abandon the run and its trigger? |
| [escalation-uncaught-handler-fails-after-wait](escalation-uncaught-handler-fails-after-wait.scenario.json), [-standards](escalation-uncaught-handler-fails-after-wait-standards.scenario.json) | escalation-uncaught | Does an Escalation nobody catches leave the handler, the run and the trigger as they were? |

The schedules carry no expected open wait, run state or instance status; the retained CIB evidence is the answer. The `-standards` schedules select no CIB oracle.
