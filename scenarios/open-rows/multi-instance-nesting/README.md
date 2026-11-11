# Nested Multi-Instance composition

Neutral inputs for [PC-MI-11](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (nested and repeated Multi-Instance composition in the four mode cells, and re-entry through a Sequence Flow cycle). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result.

## Models

Every model but `parallel-sequential-sites` nests a Multi-Instance User Task `UserTask_Member` (collection `members`, element `member`, completion condition `${nrOfCompletedInstances >= innerQuorum}`) in a Multi-Instance Sub-Process `SubProcess_Group` (collection `groups`, element `group`). The Sub-Process maps its element and counter into the body-local inputs `outerGroup` and `outerPosition`, and the task publishes them as `group` and `groupPosition` beside its own `subject`, `position` and `instances`, so every inner task names its outer and inner membership. The model name is `<outer mode>-<inner mode>`.

| Model | Outer | Inner | Beyond the nesting |
|---|---|---|---|
| [sequential-sequential](sequential-sequential.bpmn) | sequential | sequential | none |
| [sequential-parallel](sequential-parallel.bpmn) | sequential | parallel | none |
| [parallel-sequential](parallel-sequential.bpmn) | parallel | sequential | none |
| [parallel-parallel](parallel-parallel.bpmn) | parallel | parallel | none |
| [parallel-sequential-reentry](parallel-sequential-reentry.bpmn) | parallel | sequential | `UserTask_Decide` and an Exclusive Gateway on `${again == true}` loop back into the Sub-Process |
| [parallel-sequential-sites](parallel-sequential-sites.bpmn) | parallel | sequential | the agreeing, non-refused cell: no looping Activity maps its own instance. `Task_MarkGroup` in the outer body writes `outerMark` (`${group}`) and `outerPosition` (`${loopCounter}`); the innermost User Task `UserTask_Check` publishes `subject` (`${member}`), `position` (`${loopCounter}`, the inner counter), `instances` (`${nrOfInstances}`, the inner count), `owner` (`${group}`, the outer item directly), and `mark` and `groupPosition` (the variables the outer body wrote) |

The first five models read the outer element and counter in the outer Sub-Process's own input mappings and the inner ones in the looping task's own input mappings, which is CIB-LIM-0019's refusal ([instance sites](../multi-instance-instance-sites/README.md)); `parallel-sequential-sites` reads the instance only at nested sites, which are admitted, so it witnesses the composition the row asks for where those do not. The inner counters hide the outer ones, so the outer counter is reached through `outerPosition`; the outer item is visible directly. `outerMark` is written without a declared local, so whether the second inner instance of a group reads its own group's write or the other group's is part of the answer.

## Schedules

All schedules but the last two use `groups = [g, g]` and, unless stated, `members = [m, m]`: equal items at both levels. Inner tasks are addressed by activation, counted per begun occurrence of `UserTask_Member` (`UserTask_Check` in `parallel-sequential-sites`) in the Process instance. A stimulus that addresses a wait that is not open (a cancelled or finished task) is part of the schedule, not a mistake in it.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [sequential-sequential-equal-items](sequential-sequential-equal-items.scenario.json) | sequential-sequential | the four inner tasks completed 1 to 4 | PC-MI-11 |
| [sequential-parallel-equal-items](sequential-parallel-equal-items.scenario.json) | sequential-parallel | completed in the order 2, 1, 4, 3 | PC-MI-11 |
| [parallel-sequential-equal-items](parallel-sequential-equal-items.scenario.json) | parallel-sequential | completed in the order 2, 1, 4, 3 | PC-MI-11 |
| [parallel-parallel-equal-items](parallel-parallel-equal-items.scenario.json) | parallel-parallel | completed in the order 4, 3, 2, 1 | PC-MI-11 |
| [sequential-parallel-inner-early](sequential-parallel-inner-early.scenario.json) | sequential-parallel | `innerQuorum = 1`; task 1 completes, task 2 is completed late, task 3 completes | PC-MI-11, PC-MI-09 |
| [parallel-sequential-inner-early](parallel-sequential-inner-early.scenario.json) | parallel-sequential | `innerQuorum = 1`; task 1 completes and is completed again, then task 2 completes | PC-MI-11, PC-MI-09 |
| [parallel-sequential-reentry](parallel-sequential-reentry.scenario.json) | parallel-sequential-reentry | `members = [m]`; both outer bodies complete, `again = true`, the second outer activation starts and task 1 is completed again, tasks 3 and 4 complete, `again = false` | PC-MI-11 |
| [parallel-sequential-sites-in-order](parallel-sequential-sites-in-order.scenario.json) | parallel-sequential-sites | `groups = [g1, g2]`, `members = [m, m]` (equal inner items); inner tasks completed in the order 1, 3, 2, 4 (activations 1 and 2 are the first inner instances of the two groups, 3 and 4 their second), then the publish task | PC-MI-11 |
| [parallel-sequential-sites-interleaved](parallel-sequential-sites-interleaved.scenario.json) | parallel-sequential-sites | the same inputs; completed in the order 2, 1, 4, 3, then the publish task | PC-MI-11 |
