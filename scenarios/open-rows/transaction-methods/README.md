# Transaction `method` metadata

This directory serves [PC-TX-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the selected method metadata of a Transaction. The three models are identical except for the `method` attribute of the Transaction and are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

Each model runs one Transaction whose body is the Human Task `UserTask_Step` (a Compensation Boundary Event associated with `UserTask_UndoStep`) followed by a Cancel End Event. The Transaction has a Cancel Boundary Event leading to `UserTask_Cancelled`. Every schedule completes `UserTask_Step`, `UserTask_UndoStep` and `UserTask_Cancelled`.

| Schedule | Model | `method` |
|---|---|---|
| [compensate-method](compensate-method.scenario.json) | [compensate-method](compensate-method.bpmn) | `##Compensate` |
| [image-method](image-method.scenario.json) | [image-method](image-method.bpmn) | `##Image` |
| [store-method](store-method.scenario.json) | [store-method](store-method.bpmn) | `##Store` |

Models that omit `method` are the Transaction models of [transaction-paths](../transaction-paths/README.md) and the directories that follow it. The schedules carry no expected behavior; the retained CIB evidence is the answer.
