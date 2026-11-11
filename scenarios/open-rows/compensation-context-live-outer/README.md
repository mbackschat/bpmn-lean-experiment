# Live outer data in compensation handlers

This directory serves [PC-COMPENSATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (context capture) and [PC-COMPENSATION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): whether a handler that runs in a Sub-Process's restored context reads and writes a Process variable live or as it stood when the Sub-Process completed, for a Compensation Event Sub-Process and for default compensation of a Sub-Process without a handler. Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. They extend [compensation-context](../compensation-context/README.md).

## Models

The Process starts with the Process variable `shared`. The Sub-Process `SubProcess_Work` declares the local `note` from `shared` and runs `UserTask_Work`. After it, `UserTask_Pause`, an untargeted Intermediate throw and `UserTask_After` follow; `UserTask_After`'s input `finalShared` reads `shared`. The handler Human Task `UserTask_UndoWork` has the inputs `seenNote` (reads `note`) and `seenShared` (reads `shared`) and an output that writes the Process variable `shared`.

| Model | Handler |
|---|---|
| [esp-reads-and-writes-outer](esp-reads-and-writes-outer.bpmn) | `UserTask_UndoWork` is the Human Task of a Compensation Event Sub-Process inside `SubProcess_Work`. |
| [default-reads-and-writes-outer](default-reads-and-writes-outer.bpmn) | `SubProcess_Work` has no handler of its own; `UserTask_Work` has a Compensation Boundary Event associated with `UserTask_UndoWork`. |

## Schedules

| Schedule | Model | Journey | Question it separates |
|---|---|---|---|
| [esp-handler-reads-and-writes-outer](esp-handler-reads-and-writes-outer.scenario.json) | esp-reads-and-writes-outer | `shared = s0` at start; `UserTask_Work` completes writing `note = n1` and `shared = s1`; `shared` is set to `s2` at `UserTask_Pause`, which completes; then `UserTask_UndoWork` and `UserTask_After`. | Does the handler read `shared` as `s1` (when the Sub-Process completed) or `s2`, does it read `note` from its restored context, and does its output reach the Process variable that `UserTask_After` reads? |
| [default-handler-reads-and-writes-outer](default-handler-reads-and-writes-outer.scenario.json) | default-reads-and-writes-outer | The same journey. | The same questions for the inner boundary handler that default compensation of a handler-less Sub-Process reaches. |

The schedules carry no expected input value or Process state; the retained CIB evidence is the answer.
