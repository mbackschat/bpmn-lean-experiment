# Implicit Activity split and merge

Answer-free schedules for [PC-CF-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Activity with several outgoing Sequence Flows (conditioned, defaulted or plain) and an Activity with several incoming flows, in the root, an embedded Sub-Process, a called Process and a Multi-Instance body. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#arrival-and-leaving) own the meaning, and [CIB-INT-0011](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-int-0011--an-activitys-outgoing-conditions-evaluate-before-its-output-writes) records the order of an Activity's outgoing conditions and output writes; these inputs only exercise them, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay; conditions are JUEL over Boolean or String variables.

## Models

| Model | What it holds |
|---|---|
| [review-split](review-split.bpmn) | The User Task *Review*, which declares the Boolean fields `a` and `b`, with the conditioned flows `${a}` and `${b}` and a default flow to three follow-up User Tasks, all of which flow into the User Task *Archive* without a gateway. |
| [review-split-no-default](review-split-no-default.bpmn) | The same *Review* with only the two conditioned flows, each to its own follow-up and End. |
| [review-output-order](review-output-order.bpmn) | The User Task *Review* with a `verdict` field, an output mapping of `verdict` to `route`, a flow conditioned on `${route == 'fast'}` and a default flow, to *Fast lane* and *Slow lane*. |
| [embedded-split](embedded-split.bpmn) | The split and merge of *review-split* inside the Sub-Process *Inspection*, whose first task *Measure* has the flows `${a}` and `${b}` and a default to *File report*. |
| [called-split](called-split.bpmn) | A Call Activity of `Process_Inspect` that passes `a` and `b` in; the called Process holds the same split and merge. |
| [mi-body-split](mi-body-split.bpmn) | A sequential Multi-Instance Sub-Process over `items` whose body *Check* has two unconditioned outgoing flows, to *Log A* and *Log B*, which both flow into *Seal*. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [both-flows](review-split-both-flows.scenario.json) | review-split | Both conditions hold, so the merging task is completed twice. |
| [one-flow](review-split-one-flow.scenario.json) | review-split | One condition holds. |
| [default-flow](review-split-default-flow.scenario.json) | review-split | Neither condition holds. |
| [completion-values-read](review-split-completion-values-read.scenario.json) | review-split | Both start values are false and the completion of *Review* supplies a true value for `a`. |
| [no-flow-true](review-split-no-default-no-flow-true.scenario.json) | review-split-no-default | Neither condition holds and there is no default. |
| [mapped-output-and-condition](review-output-order-mapped-output-and-condition.scenario.json) | review-output-order | `route` is `slow` at the start and the completion supplies `verdict` `fast`; both lanes are then completed in turn. |
| [both-flows](embedded-split-both-flows.scenario.json) | embedded-split | Both conditions hold inside the Sub-Process. |
| [both-flows](called-split-both-flows.scenario.json) | called-split | Both conditions hold inside the called instance, addressed as `call:10:Instance_1:11:InspectCall:1`. |
| [one-body-two-outputs](mi-body-split-one-body-two-outputs.scenario.json) | mi-body-split | One body instance, both unconditioned outputs and both arrivals at the merging task. |

Notes for the target runners:

- [no-flow-true](review-split-no-default-no-flow-true.scenario.json) has an engine step that can fail inside the completion; the CIB runner records such a step as the command outcome.
- The kernel executes these shapes on Simple Boolean ([flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md)); their JUEL conditions wait for M2's core level, and a condition on an Activity's default flow stays refused as `flow.conditionalOutflow`.

The schedules carry no expected route or state; the retained CIB evidence is the answer.
