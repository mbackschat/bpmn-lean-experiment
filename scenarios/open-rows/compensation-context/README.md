# Context available to compensation handlers

This directory serves [PC-COMPENSATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (scope visibility and context capture), [PC-COMPENSATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (body-local snapshots, no capture of later data) and the restoration case of [PC-COMPENSATION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). The [capture model](capture.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Model

The Process starts with the variables `receipt`, `parcel`, `crate` and `lot`. Four compensable pieces run in sequence, then `UserTask_Pause`, an untargeted Intermediate throw and `UserTask_After`. Every compensation handler is a Human Task whose input parameter reads one variable by name, so each handler's published input shows what it could see.

| Piece | Compensable by | Handler input |
|---|---|---|
| `UserTask_Charge` | a Compensation Boundary Event associated with `UserTask_UndoCharge` | `seenReceipt` reads `receipt` |
| `SubProcess_Boundaried`, which declares the local `parcel` from `receipt` and runs `UserTask_PackBoundaried` | a Compensation Boundary Event on the Sub-Process associated with `UserTask_UndoBoundaried` | `seenParcel` reads `parcel` |
| `SubProcess_Snapshotted`, which declares the local `crate` from `receipt` and runs `UserTask_PackSnapshotted` | a Compensation Event Sub-Process inside it, running `UserTask_UndoSnapshotted` | `seenCrate` reads `crate` |
| `SubProcess_Plain`, which declares the local `lot` from `receipt` and runs `UserTask_PackPlain` | no handler of its own; `UserTask_PackPlain` has a Compensation Boundary Event associated with `UserTask_UndoPackPlain` | `seenLot` reads `lot` |

## Schedules

| Schedule | Journey |
|---|---|
| [late-data-after-completion](late-data-after-completion.scenario.json) | `UserTask_Charge` completes writing `receipt`, and each Pack task writes its Sub-Process local (`parcel`, `crate`, `lot`). Variables of the same four names are then set at `UserTask_Pause`, `UserTask_Pause` completes, and the four handlers and `UserTask_After` follow. |
| [no-late-data](no-late-data.scenario.json) | The same journey without the variable update at `UserTask_Pause`. |

The schedules carry no expected handler input or Process state; the retained CIB evidence is the answer.
