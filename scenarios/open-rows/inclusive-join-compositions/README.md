# Inclusive selection and join compositions

Answer-free schedules for [PC-CF-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Inclusive selection and synchronization at structured, unpaired, looping and scope-fed joins, the cell of [PC-CF-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that places an Inclusive join after a Sub-Process, a Call and a Multi-Instance body, and the Inclusive part of [PC-BASIC-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (declaration permutation). The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#inclusive-gateway) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay; conditions are JUEL over Boolean start variables, and every wait is a User Task.

## Models

| Model | What it holds |
|---|---|
| [structured-regions](structured-regions.bpmn) | The Inclusive split *Choose checks* with three conditioned candidates (`${credit}`, `${fraud}`, `${identity}`) and a default, all four branches joined at *Checks complete* before *Decide*. |
| [structured-regions-permuted](structured-regions-permuted.bpmn) | The same source with the declaration order of every element and Sequence Flow reversed. |
| [unpaired-merge](unpaired-merge.bpmn) | An Exclusive split over *Handle urgent* and *Handle routine* whose two branches meet at an Inclusive Gateway. |
| [parallel-fed-join](parallel-fed-join.bpmn) | A Parallel fork over *Review A* and *Review B* that meet at an Inclusive Gateway. |
| [unselected-path](unselected-path.bpmn) | A Parallel fork over *Review A*, which reaches an Inclusive join, and *Review B*, which completes with a `retry` value and then either returns to the same join or ends in its own None End. |
| [loop-reentry](loop-reentry.bpmn) | An Exclusive merge, an Inclusive split with a default, an Inclusive join and the User Task *Review round*, whose completion sets `a`, `b` and `again` and may return to the merge. |
| [scoped-join](scoped-join.bpmn) | An Inclusive split over a Sub-Process, a Call Activity of `Process_Audit`, a parallel Multi-Instance User Task over `items`, and a default User Task, all joined before *Decide*. |
| [no-default-split](no-default-split.bpmn) | An Inclusive split whose two flows are both conditioned and which has no default, joined before *Decide*. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [one-selected](structured-regions-one-selected.scenario.json) | structured-regions | Exactly one candidate holds. |
| [two-selected-credit-first](structured-regions-two-selected-credit-first.scenario.json) | structured-regions | Two candidates hold and the first one declared completes first. |
| [two-selected-fraud-first](structured-regions-two-selected-fraud-first.scenario.json) | structured-regions | The same two candidates complete in the other order. |
| [none-selected-default](structured-regions-none-selected-default.scenario.json) | structured-regions | No candidate holds. |
| [two-selected-credit-first](structured-regions-permuted-two-selected-credit-first.scenario.json) | structured-regions-permuted | The inputs of the original schedule with the same name, on the permuted source. |
| [urgent](unpaired-merge-urgent.scenario.json) | unpaired-merge | The urgent branch is taken. |
| [routine](unpaired-merge-routine.scenario.json) | unpaired-merge | The routine branch is taken. |
| [a-then-b](parallel-fed-join-a-then-b.scenario.json) | parallel-fed-join | One branch arrives at the join while the other branch's task is still open. |
| [b-then-a](parallel-fed-join-b-then-a.scenario.json) | parallel-fed-join | The same two arrivals in the other order. |
| [parked-then-unselected](unselected-path-parked-then-unselected.scenario.json) | unselected-path | *Review A* has arrived at the join, then *Review B* completes with `retry` false. |
| [unselected-then-parked](unselected-path-unselected-then-parked.scenario.json) | unselected-path | *Review B* completes with `retry` false before *Review A* completes. |
| [selected-path](unselected-path-selected-path.scenario.json) | unselected-path | *Review A* has arrived at the join, then *Review B* completes with `retry` true. |
| [both-then-a-only](loop-reentry-both-then-a-only.scenario.json) | loop-reentry | The first round selects two branches; the review then selects only the first for the second round. |
| [a-only-then-both](loop-reentry-a-only-then-both.scenario.json) | loop-reentry | The first round selects one branch; the review then selects two for the second round. |
| [all-selected](scoped-join-all-selected.scenario.json) | scoped-join | The Sub-Process, the Call and the Multi-Instance branch are all selected and complete in that order. |
| [scope-only](scoped-join-scope-only.scenario.json) | scoped-join | Only the Sub-Process branch is selected. |
| [call-and-batch-reversed](scoped-join-call-and-batch-reversed.scenario.json) | scoped-join | The Call and the Multi-Instance branch are selected; the second body completes before the first, and the Call's task completes last. |
| [none-selected](no-default-split-none-selected.scenario.json) | no-default-split | No candidate holds. |
| [one-selected](no-default-split-one-selected.scenario.json) | no-default-split | One candidate holds. |

## Kernel restrictions these inputs reconcile

The [unpaired-merge](unpaired-merge.bpmn), [parallel-fed-join](parallel-fed-join.bpmn), [unselected-path](unselected-path.bpmn), [loop-reentry](loop-reentry.bpmn) and [scoped-join](scoped-join.bpmn) models are the witnesses for `gateway.inclusive.join`, and [no-default-split](no-default-split.bpmn) for `gateway.inclusive.conditionalWithoutDefault`, of the [flow semantics restrictions](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#restrictions), so that CIB's answer to each shape is fixed before the row decides whether to keep refusing it.

Notes for the target runners:

- The Call's called instance is addressed by its derived identity `call:10:Instance_1:9:AuditCall:1`.
- [none-selected](no-default-split-none-selected.scenario.json) has an engine step that can fail inside the start; the CIB runner records such a step as the command outcome.
- The Multi-Instance branch is collection-driven by the start value `items`, a String List of two members.

The schedules carry no expected route or state; the retained CIB evidence is the answer.
