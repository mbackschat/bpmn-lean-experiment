# Manual Task as an implicit split and merge

Answer-free schedules for [PC-HUM-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Manual Task with two outgoing Sequence Flows and a Manual Task with two incoming flows, so that the tokens and the occurrence of each remain observable. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) and [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#arrival-and-leaving) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay.

[site-visit](site-visit.bpmn) schedules a visit through the Manual Task *Prepare site*, whose two outgoing flows lead to the User Tasks *Inspect roof* and *Inspect cellar*. Both flow into the Manual Task *Record findings*, which leads to the User Task *Sign off*.

| Schedule | Case it separates |
|---|---|
| [roof-then-cellar](site-visit-roof-then-cellar.scenario.json) | One inspection completes and its sign-off is completed before the other inspection completes. |
| [cellar-then-roof](site-visit-cellar-then-roof.scenario.json) | Both inspections complete, in the other order, before either sign-off is completed. |

The schedules carry no expected token or state; the retained CIB evidence is the answer.
