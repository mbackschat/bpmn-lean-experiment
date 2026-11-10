# Call outputs when a raised Error reaches the called root

This directory serves [PC-SCOPE-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the contract "Call outputs when a raised event reaches the called root" of [the scopes semantics](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md) (CIB-EXT-0034), items 3 and 4. The [busy-root model](busy-called-root.bpmn) and the [shared-name model](catch-shares-out-target.bpmn) are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The other PC-SCOPE-06 cases are in [call-exceptional-return](../call-exceptional-return/README.md).

## Busy-root model

The root `Process_Assembly` calls `Process_Build` from `CallActivity_Build`, which maps `progress` out as `progress`, then runs the Human Task `UserTask_AfterBuild`. `Process_Build` forks into the Human Tasks `UserTask_Frame`, which ends normally, and `UserTask_Wiring`, which ends in an Error End `PART_FAILED`. The called Process declares an interrupting Error Event Sub-Process for `PART_FAILED` whose body is the Human Task `UserTask_Recover`. The Error End runs directly at the called root, and that root's Event Sub-Process catches it.

| Schedule | Case it exercises |
|---|---|
| [error-caught-at-busy-root](error-caught-at-busy-root.scenario.json) | `UserTask_Wiring` writes `progress` and fails while `UserTask_Frame` is still open, so the called root holds another path when its own Event Sub-Process catches (item 4); `UserTask_Recover` writes `progress` again and the Call returns normally. |
| [error-caught-after-sibling-ended](error-caught-after-sibling-ended.scenario.json) | `UserTask_Frame` completes first, so the failing path is the only one at the called root when the same Error is caught; the rest of the schedule is the same. |

## Shared-name model

The root `Process_Dispatch` calls `Process_Ship` from `CallActivity_Ship`, which maps `note` out as `reason` and carries an interrupting `SHIP_FAILED` Error boundary whose `camunda:errorCodeVariable` is also `reason`; the boundary leads to the Human Task `UserTask_Inspect`, the normal return to `UserTask_Delivered`. `Process_Ship` runs the Human Task `UserTask_Pack` and an Exclusive Gateway on `outcome`: `failed` ends in an Error End `SHIP_FAILED`, anything else ends normally.

| Schedule | Case it exercises |
|---|---|
| [ship-failed-catch-after-pass](ship-failed-catch-after-pass.scenario.json) | `UserTask_Pack` writes `note` and `outcome` `failed`, so the Call's output and the boundary's code variable both write `reason` in one crossing (item 3). |
| [ship-returned-normally](ship-returned-normally.scenario.json) | `UserTask_Pack` writes `note` and a shipped `outcome`, so `reason` comes from the normal return alone. |

Called instances are addressed by the kernel's derived identifier. The schedules carry no expected variables, route or Process state; the retained CIB evidence is the answer.
