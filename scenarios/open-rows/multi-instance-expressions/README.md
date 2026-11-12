# Multi-Instance collection and cardinality expressions

Neutral inputs for [PC-MI-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (typed collection and cardinality expressions) on User Task bodies in both modes. The other body kinds select their collections and counts by the shared CIB loop parser, so their own directories vary the form instead: a collection variable name and a `${...}` reference for [User Task](../multi-instance-user-task/README.md) and Service Task bodies (their scenarios join with the PC-MI-02 pilot), a `${count}` reference for [Call Activity](../multi-instance-call-activity/README.md) and [Sub-Process](../multi-instance-sub-process/README.md) bodies, and a computed cardinality over Sub-Process bodies. The schedules are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result.

## Models

| Model | Mode | Expression forms |
|---|---|---|
| [sequential-structured](sequential-structured.bpmn), [parallel-structured](parallel-structured.bpmn) | sequential, parallel | collection `${order.lines}` (a property of a structured Process variable), element variable `line`; the task publishes `sku` (`${line.sku}`), `quantity` (`${line.quantity}`) and `position` |
| [sequential-forms](sequential-forms.bpmn), [parallel-forms](parallel-forms.bpmn) | sequential, parallel | three User Tasks in series with the cardinality as a literal `2` (`UserTask_Literal`), a reference `${count}` (`UserTask_Reference`) and a computed `${count + 1}` (`UserTask_Computed`) |
| [sequential-structured-sub-process](sequential-structured-sub-process.bpmn), [parallel-structured-sub-process](parallel-structured-sub-process.bpmn) | sequential, parallel | the Sub-Process `SubProcess_Line` loops over the structured lines with element variable `line`: the parallel model over the collection `${order.lines}`, the sequential one over the list variable `lines`, chosen while the kernel refused a sequential collection expression, which it now reads again before each later instance (CIB-INT-0043); the nested task `UserTask_Line` publishes `sku` (`${line.sku}`), `quantity` (`${line.quantity}`) and `position` |
| [portable-sequential-forms](portable-sequential-forms.bpmn), [portable-parallel-forms](portable-parallel-forms.bpmn) | sequential, parallel | the forms models without the looping tasks' own `camunda:inputParameter` reads of `${loopCounter}` and `${nrOfInstances}` ([CIB-LIM-0019](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0019-a-looping-activitys-own-input-mapping-that-reads-its-counters-or-item-is-refused)), so CIB admits them; the count's effect is the number of open tasks |
| [portable-sequential-structured](portable-sequential-structured.bpmn), [portable-parallel-structured](portable-parallel-structured.bpmn) | sequential, parallel | the structured models without the own input mapping: collection `${order.lines}`, element variable `line`. The per-body item is observed through a completion condition reading the item's property: parallel `${line.sku == 'B'}`, sequential `${line.sku == 'A' && loopCounter == 1}`. `UserTask_Publish` publishes the Process variables `line` (`outerLine`) and `sku` (`outerSku`), so a leaked element variable would show |

## Schedules

The `structured-sub-process` models read the same lines at an admitted site: a looping User Task's own input mapping that reads the item is CIB-LIM-0019's refusal, so the read moves to the task nested in a looping Sub-Process, whose instance holds the item.

The structured schedules start with the Process variables `order` (a Map whose `lines` List holds two equal Maps `{sku: A, quantity: 1}` and one `{sku: B, quantity: 2}`), `line = "outer-line"` and `sku = "process-sku"`: the element variable and the `sku` input have the names of existing Process variables.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [sequential-structured-equal-lines](sequential-structured-equal-lines.scenario.json) | sequential-structured | the three lines completed in order | PC-MI-07 |
| [parallel-structured-equal-lines](parallel-structured-equal-lines.scenario.json) | parallel-structured | the three lines completed in the order 3, 1, 2 | PC-MI-07 |
| [sequential-structured-wrong-collection-type](sequential-structured-wrong-collection-type.scenario.json) | sequential-structured | `order.lines` is a String, not a collection | PC-MI-07 |
| [parallel-structured-wrong-collection-type](parallel-structured-wrong-collection-type.scenario.json) | parallel-structured | `order.lines` is a String, not a collection | PC-MI-07 |
| [sequential-structured-sub-process-equal-lines](sequential-structured-sub-process-equal-lines.scenario.json) | sequential-structured-sub-process | the Process variables `line = "outer-line"`, `sku = "process-sku"` and the list `lines` of the same three Maps, two of them equal; the three lines completed in order, each writing `verdict`, then the publish task | PC-MI-07, PC-MI-04 |
| [parallel-structured-sub-process-equal-lines](parallel-structured-sub-process-equal-lines.scenario.json) | parallel-structured-sub-process | the Process variables of the structured schedules; the three lines completed in the order 3, 1, 2, each writing `verdict`, then the publish task | PC-MI-07, PC-MI-05 |
| [sequential-forms](sequential-forms.scenario.json) | sequential-forms | `count = 1`; literal, referenced and computed counts each completed in order | PC-MI-07 |
| [parallel-forms](parallel-forms.scenario.json) | parallel-forms | `count = 1`; each count's bodies completed in reverse | PC-MI-07 |
| [portable-sequential-forms](portable-sequential-forms.scenario.json) | portable-sequential-forms | the stimuli of `sequential-forms` on the model without own input reads | PC-MI-07 |
| [portable-parallel-forms](portable-parallel-forms.scenario.json) | portable-parallel-forms | the stimuli of `parallel-forms` on the model without own input reads | PC-MI-07 |
| [portable-sequential-structured-equal-lines](portable-sequential-structured-equal-lines.scenario.json) | portable-sequential-structured | the Process variables of the structured schedules; lines 1 and 2 (both `A`) completed, which ends the loop at index 1, then the third line's task is completed though it never exists, then the publish task | PC-MI-07 |
| [portable-parallel-structured-equal-lines](portable-parallel-structured-equal-lines.scenario.json) | portable-parallel-structured | the same variables; bodies 2, 1 and 3 completed in that order, so only the third completion holds `B` and ends the loop, then the publish task | PC-MI-07 |
| [portable-sequential-structured-wrong-collection-type](portable-sequential-structured-wrong-collection-type.scenario.json) | portable-sequential-structured | `order.lines` is a String, not a collection | PC-MI-07 |
| [portable-parallel-structured-wrong-collection-type](portable-parallel-structured-wrong-collection-type.scenario.json) | portable-parallel-structured | `order.lines` is a String, not a collection | PC-MI-07 |

A wrong cardinality type is exercised on the Sub-Process bodies of [multi-instance-sub-process](../multi-instance-sub-process/README.md) (`sequential-computed-malformed`).
