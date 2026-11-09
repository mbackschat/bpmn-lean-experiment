# Compensation across nested regions

This directory serves [PC-COMPENSATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (explicit scope visibility through nested regions, targeting by Sub-Process, records consumed by an earlier throw) and the handler-less Sub-Process cases of [PC-COMPENSATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). Its Sub-Processes carry no handler of their own, so the model is the witness for the implicit and recursive compensation of the open BPMN21-403 interpretation recorded in the [compensation semantics](../../../docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md). The [regions model](regions.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

## Model

`UserTask_Outer` (with a compensation Human Task `UserTask_UndoOuter`) leads to the Sub-Process `SubProcess_Region`. Inside it, `UserTask_InnerA` (handler `UserTask_UndoInnerA`) leads to the nested Sub-Process `SubProcess_Deep`, which runs `UserTask_DeepWork` (handler `UserTask_UndoDeepWork`), and then to an Exclusive Gateway. When the start variable `throwInside` is true, an untargeted Intermediate throw inside the region runs before `UserTask_InnerAfter`. After the region, `UserTask_Mid` leads to a second Exclusive Gateway: when `targetRegion` is true, an Intermediate throw targeted at `SubProcess_Region`; otherwise an untargeted Intermediate throw. Both lead to `UserTask_Tail`. Neither Sub-Process has a Compensation Boundary Event or a Compensation Event Sub-Process.

## Schedules

| Schedule | `throwInside` | `targetRegion` | Journey |
|---|---|---|---|
| [inner-throw-then-outer-all](inner-throw-then-outer-all.scenario.json) | true | false | The three tasks complete, the handlers of the inner throw complete, `UserTask_InnerAfter` and `UserTask_Mid` complete, the outer untargeted throw's handler is completed, then `UserTask_Tail`. |
| [outer-all-without-inner-throw](outer-all-without-inner-throw.scenario.json) | false | false | The three tasks and `UserTask_Mid` complete, then the handlers of Deep, InnerA and Outer are completed in turn, then `UserTask_Tail`. |
| [region-targeted-after-completion](region-targeted-after-completion.scenario.json) | false | true | The three tasks and `UserTask_Mid` complete, the handlers of InnerA and Deep are completed, `UserTask_UndoOuter` is attempted, then `UserTask_Tail`. |
| [inner-throw-then-region-targeted](inner-throw-then-region-targeted.scenario.json) | true | true | The inner throw's handlers and `UserTask_InnerAfter` complete, `UserTask_Mid` completes, `UserTask_UndoInnerA` is attempted again, then `UserTask_Tail`. |

The schedules carry no expected eligible set, open wait or Process state; the retained CIB evidence is the answer.
