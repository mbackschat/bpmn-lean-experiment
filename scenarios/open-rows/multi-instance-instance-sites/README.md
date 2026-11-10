# Multi-Instance counters and item at instance sites

Neutral inputs for [PC-MI-04, PC-MI-05, PC-MI-10 and PC-MI-11](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): where CIB Seven `2.2.0` resolves the Multi-Instance counters and the item, separating CIB-INT-0018's visibility at every site inside an instance from "counters are visible only in the completion condition" ([counters and the item](../../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#counters-and-the-item-at-every-instance-site)). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and no schedule states one. Every scenario uses the `cibseven-2.2.0` profile.

The read site is the User Task `UserTask_Check` nested in a Multi-Instance Sub-Process instance, whose `camunda:inputParameter`s copy the names into task locals that the task publishes. A looping User Task has no such site inside its own instance, so these models loop a Sub-Process. No model maps the Sub-Process's own inputs: an own input reading the instance is CIB-LIM-0019's refusal, witnessed elsewhere.

## Models

| Model | Loops | `UserTask_Check` reads | Separates |
|---|---|---|---|
| [parallel-sub-process](parallel-sub-process.bpmn) | `SubProcess_Line`, parallel over `lines`, element `line` | `loopCounter`, `nrOfInstances`, `nrOfActiveInstances`, `nrOfCompletedInstances`, `line` | the counters and the item at a nested site, parallel |
| [sequential-sub-process](sequential-sub-process.bpmn) | the same loop, sequential | the same names | the same, sequential; `nrOfInstances` as the count from entry or the count generated so far (CIB-INT-0002) |
| [nested-sub-processes](nested-sub-processes.bpmn) | `SubProcess_Group`, parallel over `groups`, element `group`, around `SubProcess_Line`, parallel over `lines` | `loopCounter`, `nrOfInstances`, `line`, `group` | an inner loop's counters hiding the outer loop's, the outer item staying visible |
| [nested-output-writes-counter](nested-output-writes-counter.bpmn) | `SubProcess_Line`, sequential over `lines` | `loopCounter`; its `camunda:outputParameter` writes `loopCounter` | a counter-named target inside an instance (CIB-LIM-0020's refusal witness) |

## Schedules

User Tasks are addressed by activation, counted per begun occurrence of `UserTask_Check` in the Process instance.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [parallel-counters](parallel-counters.scenario.json) | parallel-sub-process | `lines = [a, b, c]`; tasks completed in the order 2, 1, 3 | PC-MI-05, PC-MI-10 |
| [sequential-count-from-entry](sequential-count-from-entry.scenario.json) | sequential-sub-process | `lines = [a, b, c]`; tasks completed 1 to 3 | PC-MI-04, PC-MI-10 |
| [nested-inner-hides-outer](nested-inner-hides-outer.scenario.json) | nested-sub-processes | `groups = [g1, g2, g3]`, `lines = [a, b]`, so the two loops' counts differ; tasks completed 1 to 6 | PC-MI-11 |
| [nested-output-writes-counter](nested-output-writes-counter.scenario.json) | nested-output-writes-counter | `lines = [a, b]`; tasks completed 1 and 2 | PC-MI-10 |
