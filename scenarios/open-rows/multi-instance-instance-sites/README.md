# Multi-Instance counters and item at instance sites

Neutral inputs for [PC-MI-01, PC-MI-04, PC-MI-05, PC-MI-06, PC-MI-10 and PC-MI-11](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): where CIB Seven `2.2.0` resolves the Multi-Instance counters and the item, separating CIB-INT-0018's visibility at every site inside an instance from "counters are visible only in the completion condition" ([counters and the item](../../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#counters-and-the-item-at-every-instance-site)). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and no schedule states one. Every scenario uses the `cibseven-2.2.0` profile.

The read site is the User Task `UserTask_Check` nested in a Multi-Instance Sub-Process instance, whose `camunda:inputParameter`s copy the names into task locals that the task publishes. A looping User Task has no such site inside its own instance, so these models loop a Sub-Process. This is also how PC-MI-01's zero, one, several and equal items and its cardinality form are observed with agreeing, non-refused witnesses: a looping User Task reads its own item and counters only through its own input mapping, which CIB-LIM-0019 refuses, so the Sub-Process-wrapped task is the observation point of the item and the counters, and the completion condition the one site of a looping User Task body itself ([multi-instance-user-task](../multi-instance-user-task/README.md), `parallel-quorum` and `sequential-quorum`). Three items are `parallel-counters` and `sequential-count-from-entry`. No model maps the Sub-Process's own inputs: an own input reading the instance is CIB-LIM-0019's refusal, witnessed elsewhere.

## Models

| Model | Loops | `UserTask_Check` reads | Separates |
|---|---|---|---|
| [parallel-sub-process](parallel-sub-process.bpmn) | `SubProcess_Line`, parallel over `lines`, element `line` | `loopCounter`, `nrOfInstances`, `nrOfActiveInstances`, `nrOfCompletedInstances`, `line` | the counters and the item at a nested site, parallel |
| [sequential-sub-process](sequential-sub-process.bpmn) | the same loop, sequential | the same names | the same, sequential; `nrOfInstances` as the count from entry or the count generated so far (CIB-INT-0002) |
| [nested-sub-processes](nested-sub-processes.bpmn) | `SubProcess_Group`, parallel over `groups`, element `group`, around `SubProcess_Line`, parallel over `lines` | `loopCounter`, `nrOfInstances`, `line`, `group` | an inner loop's counters hiding the outer loop's, the outer item staying visible |
| [nested-output-writes-counter](nested-output-writes-counter.bpmn) | `SubProcess_Line`, sequential over `lines` | `loopCounter`; its `camunda:outputParameter` writes `loopCounter` | a counter-named target inside an instance (CIB-LIM-0020's refusal witness) |
| [parallel-sub-process-cardinality](parallel-sub-process-cardinality.bpmn) | `SubProcess_Line`, parallel, `loopCardinality` `${count}`, no collection | the same five names; `line` is no element variable here, so it reads the Process variable of that name | the counters at a nested site under a cardinality loop, and that no item is bound |
| [sequential-sub-process-cardinality](sequential-sub-process-cardinality.bpmn) | the same loop, sequential | the same names | the same, sequential |

## Schedules

User Tasks are addressed by activation, counted per begun occurrence of `UserTask_Check` in the Process instance.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [parallel-counters](parallel-counters.scenario.json) | parallel-sub-process | `lines = [a, b, c]`; tasks completed in the order 2, 1, 3 | PC-MI-05, PC-MI-10 |
| [sequential-count-from-entry](sequential-count-from-entry.scenario.json) | sequential-sub-process | `lines = [a, b, c]`; tasks completed 1 to 3 | PC-MI-04, PC-MI-10 |
| [nested-inner-hides-outer](nested-inner-hides-outer.scenario.json) | nested-sub-processes | `groups = [g1, g2, g3]`, `lines = [a, b]`, so the two loops' counts differ; tasks completed 1 to 6 | PC-MI-11 |
| [nested-output-writes-counter](nested-output-writes-counter.scenario.json) | nested-output-writes-counter | `lines = [a, b]`; tasks completed 1 and 2 | PC-MI-10 |
| [parallel-zero-lines](parallel-zero-lines.scenario.json) | parallel-sub-process | `lines = []`; the start alone, which completes the Process | PC-MI-01, PC-MI-05 |
| [sequential-zero-lines](sequential-zero-lines.scenario.json) | sequential-sub-process | `lines = []`; the start alone | PC-MI-01, PC-MI-04 |
| [parallel-one-line](parallel-one-line.scenario.json) | parallel-sub-process | `lines = [a]`; task 1 completed | PC-MI-01, PC-MI-05 |
| [sequential-one-line](sequential-one-line.scenario.json) | sequential-sub-process | `lines = [a]`; task 1 completed | PC-MI-01, PC-MI-04 |
| [parallel-equal-lines](parallel-equal-lines.scenario.json) | parallel-sub-process | `lines = [a, a]`, two equal items that must keep their multiplicity and their own counters; tasks completed in the order 2, 1 | PC-MI-01, PC-MI-05 |
| [sequential-equal-lines](sequential-equal-lines.scenario.json) | sequential-sub-process | `lines = [a, a]`; tasks completed 1 and 2 | PC-MI-01, PC-MI-04 |
| [parallel-cardinality-two](parallel-cardinality-two.scenario.json) | parallel-sub-process-cardinality | `count = 2` and the Process variable `line = "outer-line"`; `subject` shows whether an item is bound; tasks completed in the order 2, 1 | PC-MI-01, PC-MI-06 |
| [sequential-cardinality-two](sequential-cardinality-two.scenario.json) | sequential-sub-process-cardinality | `count = 2` and `line = "outer-line"`; tasks completed 1 and 2 | PC-MI-01, PC-MI-06 |
