# Structured order values through mappings and results

Answer-free schedules for [PC-DATA-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): typed structured lists and maps, with nested values and collection multiplicity, through input mappings, a Human completion, a Service effect argument and result, and the published Process variables. The portable value domain and the copy-by-value rule are owned by the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md); the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay. The same journey under `bpmn-2.0.2` is witnessed by [portable-business-values-handoff](../../portable-business-values-handoff/README.md); these schedules are the CIB-shaped counterparts, so that one retained answer exists per case. The over-bound cases are in [structured-value-bounds](../structured-value-bounds/README.md).

[order-handoff.bpmn](order-handoff.bpmn) runs the User Task *Review order*, the Service Task *Archive order* (`${bpmnLeanEffectHandler}`, `asyncBefore`) and the User Task *Confirm receipt*. *Review order* publishes the whole `order` and four of its parts (`city`, `firstLine`, `lineCount`, `note`, `total`) as inputs and its completion writes `reviewed`. *Archive order* captures `reviewed` and `reviewed.lines` and maps its `result` to `receipt`. *Confirm receipt* publishes `receipt` and `reviewed`. Every schedule starts with `order` and runs the four commands in order.

| Schedule | Case it separates | Row |
|---|---|---|
| [nested-order](nested-order.scenario.json) | An order with two equal line items and one other, a nested address with a present-Null field, a present-Null note and an exact Decimal total; the review reorders the lines and the archive receipt nests a List. | PC-DATA-03, PC-DATA-05 |
| [revised-order](revised-order.scenario.json) | An order with ordered unequal lines, a negative Decimal total and a present empty String; the review returns the lines in the other order and the receipt carries an empty List and an empty Map. | PC-DATA-03, PC-DATA-05 |
| [absent-and-null-fields](absent-and-null-fields.scenario.json) | An order whose `note` is a present Null and whose `memo`, `total` and `address` no Map holds; the review returns a Map whose only field is a present Null. | PC-DATA-03, PC-DATA-05 |
| [empty-containers](empty-containers.scenario.json) | An order whose customer is an empty Map, whose lines are an empty List and whose note is an empty String; the review returns an empty List and the receipt an empty Map. | PC-DATA-03, PC-DATA-05 |

[root-list-completion](root-list-completion.scenario.json) reuses the [sequential User Task source](../../user-task-discovery-completion/process.bpmn): the completion of *Approve* writes two root Lists that are not Lists of Strings, `quantities` with the Integers 3, 3 and 1, and `checks` with a String, a present Null, a Boolean, a List and a Map. The other schedules complete a User Task with Lists only inside a Map, and a root List of Strings is observed as `stringList` (`CIB-OP-0015`).

Notes for the target runners:

- Gap: List, Map and Decimal values at every surface.
- Gap: a negative Decimal.
- Gap: List and Map values at every surface.
- Restoration is a host property with no schedule here.
