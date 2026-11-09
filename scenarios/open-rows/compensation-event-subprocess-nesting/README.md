# Compensation Event Sub-Processes in nested parents

This directory serves [PC-COMPENSATION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Compensation Event Sub-Processes of nested Sub-Process parents, restoration of each completed parent's data, precedence and consumption of the compensation event, and explicit rethrow. The recursive-compensation case of the open BPMN21-403 interpretation recorded in the [compensation semantics](../../../docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md) is the rethrow from a handler body. The [nested model](nested-esp.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Model

`SubProcess_Outer` declares the local `outerLocal` from `receipt` and runs `UserTask_OuterWork` (a Compensation Boundary Event associated with `UserTask_UndoOuterWork`, input `seenOuterWork` reads `outerLocal`), then the nested `SubProcess_Inner`. `SubProcess_Inner` declares `innerLocal` from `receipt` and runs `UserTask_InnerWork` (handler `UserTask_UndoInnerWork`, input `seenInnerWork` reads `innerLocal`). Each parent holds a Compensation Event Sub-Process: `EventSubProcess_Inner` runs `UserTask_UndoInner` (input `seenInner` reads `innerLocal`) and rethrows an untargeted Compensation event when the start variable `rethrowInner` is true; `EventSubProcess_Outer` runs `UserTask_UndoOuter` (input `seenOuter` reads `outerLocal`) and, by the start variable `rethrowOuter`, rethrows an untargeted event (`all`), an event targeted at `SubProcess_Inner` (`inner`) or nothing (any other value). After the outer parent, `UserTask_Mid` leads to an untargeted Intermediate throw at the Process level and `UserTask_After`. The Process also starts with root-level variables `outerLocal` and `innerLocal`, so that every handler input resolves under any visibility rule.

## Schedules

In every schedule `UserTask_OuterWork` completes writing `outerLocal`, `UserTask_InnerWork` completes writing `innerLocal`, and `receipt` is then set at `UserTask_Mid`. After `UserTask_Mid`, the handlers `UserTask_UndoOuter`, `UserTask_UndoInner`, `UserTask_UndoOuterWork` and `UserTask_UndoInnerWork` are addressed in that order, then `UserTask_After`.

| Schedule | `rethrowOuter` | `rethrowInner` |
|---|---|---|
| [consume-without-rethrow](consume-without-rethrow.scenario.json) | `none` | false |
| [outer-rethrows-everything](outer-rethrows-everything.scenario.json) | `all` | false |
| [outer-rethrows-inner-only](outer-rethrows-inner-only.scenario.json) | `inner` | false |
| [both-rethrow](both-rethrow.scenario.json) | `all` | true |

The schedules carry no expected handler, restored value or Process state; the retained CIB evidence is the answer.
