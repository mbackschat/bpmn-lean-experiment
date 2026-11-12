# Multi-Instance Call Activity bodies

Neutral inputs for [PC-MI-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Call Activity bodies in both modes and both generation forms, several instances of one definition in one closure), and the Call Activity parts of PC-MI-09 (completion predicates) and PC-MI-12 (body boundary handling, a called instance's abnormal endings). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and the `standards-*` schedules run under the `bpmn-2.0.2` profile in the kernel only.

## Models

Each Multi-Instance model is one Call Activity `CallActivity_Review` of the Process `Process_Review`, followed by the User Task `UserTask_Publish`. The Call maps the body's `loopCounter` in as `slot` and the element variable `reviewer` in under its own name, and maps the called `verdict` out as `lastVerdict` and the copied `slot` out as `lastSlot`. The called Process has one User Task `UserTask_Check` whose inputs publish `subject` and `slotSeen`; its completion writes `verdict`. A called instance is addressed by its derived identity `call:<caller>:<call>:<activation>` (byte-length-prefixed parts, as in the [repeated, nested and concurrent Calls](../../repeated-nested-concurrent-calls/README.md) sources), so the body's Nth Call activation is the Nth called instance.

| Model | Mode | Generation | Beyond the body |
|---|---|---|---|
| [sequential](sequential.bpmn), [parallel](parallel.bpmn) | sequential, parallel | collection `reviewers`, element variable `reviewer` | none |
| [sequential-cardinality](sequential-cardinality.bpmn), [parallel-cardinality](parallel-cardinality.bpmn) | sequential, parallel | `loopCardinality` `${count}`, no element | none |
| [sequential-quorum](sequential-quorum.bpmn), [parallel-quorum](parallel-quorum.bpmn) | sequential, parallel | collection | completion condition `${nrOfCompletedInstances >= quorum}` |
| [sequential-boundary](sequential-boundary.bpmn), [parallel-boundary](parallel-boundary.bpmn) | sequential, parallel | collection | interrupting `PT5S` Timer and `E-REJECTED` Error Boundary Events on the body; the called Process ends in an Error End Event when `verdict = 'reject'` |
| [fork-two-calls](fork-two-calls.bpmn) | none | none | a Parallel Gateway forks straight into two Calls of `Process_Review`, joined before `UserTask_Publish` |
| [sequential-item-out](sequential-item-out.bpmn) | sequential | collection | the Call maps only `reviewer` in and maps the called `verdict` out onto the item name `reviewer`; completion condition `${reviewer == 'stop'}` |
| [parallel-counters-in](parallel-counters-in.bpmn), [sequential-counters-in](sequential-counters-in.bpmn) | parallel, sequential | `loopCardinality` `${count}` | the Call maps `loopCounter`, `nrOfInstances`, `nrOfActiveInstances` and `nrOfCompletedInstances` in; the called Process ends at once for slot 0 and otherwise publishes the four values as `UserTask_Check` inputs |
| [parallel-child-endings](parallel-child-endings.bpmn) | parallel | collection | completion condition `${nrOfCompletedInstances >= 2}`; the called Process ends in a Terminate End Event for reviewer `terminate`, in an Error End Event `E-UNLISTED` that nothing catches for reviewer `error`, and otherwise at `UserTask_Check` |
| [sequential-worklist](sequential-worklist.bpmn) | sequential | collection | the Call maps `reviewer` in and the called `next` out onto the collection variable `reviewers`; `UserTask_Check` publishes `subject` |
| [standards-call-body](standards-call-body.bpmn), [standards-call-condition](standards-call-condition.bpmn), [standards-call-item](standards-call-item.bpmn) | parallel | `loopDataInputRef` `reviewers` with an `inputDataItem` | standards renditions under Simple Boolean: no Data Association; a completion condition `isPresent(InputDataItem_Reviewer)`; the item mapped into the Call by a Data Input Association |
| [call-sequential-structured](call-sequential-structured.bpmn), [call-parallel-structured](call-parallel-structured.bpmn) | sequential, parallel | collection `${order.lines}` (a property of a structured Process variable), element variable `line`; the Call maps the item's properties in with `camunda:in` `sourceExpression` (`${line.sku}` as `sku`, `${line.quantity}` as `quantity`) and maps the called `verdict` out as `lastVerdict`. The called `UserTask_Check` publishes `skuSeen` and `quantitySeen`. `UserTask_Publish` publishes the Process variables `line` (`outerLine`) and `sku` (`outerSku`) |

## Schedules

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [sequential-equal-reviewers](sequential-equal-reviewers.scenario.json) | sequential | reviewers `same, same, other`; the second called task is completed before it exists, the first instance's task is completed again after it returned | PC-MI-03 |
| [parallel-equal-reviewers-reversed](parallel-equal-reviewers-reversed.scenario.json) | parallel | reviewers `same, same, other` completed in the order 3, 2, 3 again, 1 | PC-MI-03 |
| [sequential-cardinality](sequential-cardinality.scenario.json) | sequential-cardinality | `count = 2` | PC-MI-03 |
| [parallel-cardinality-reversed](parallel-cardinality-reversed.scenario.json) | parallel-cardinality | `count = 2` completed in reverse | PC-MI-03 |
| [fork-two-calls-reversed](fork-two-calls-reversed.scenario.json) | fork-two-calls | the right Call's task completes before the left Call's | PC-MI-03 |
| [sequential-quorum-reached-early](sequential-quorum-reached-early.scenario.json) | sequential-quorum | `quorum = 2`, three reviewers; the third instance's task is completed after the second returned | PC-MI-09 |
| [parallel-quorum-reached-early](parallel-quorum-reached-early.scenario.json) | parallel-quorum | `quorum = 2`; instances 3 and 1 return, then instance 2's task is completed late | PC-MI-09 |
| [sequential-timer-while-work-remains](sequential-timer-while-work-remains.scenario.json) | sequential-boundary | one instance returns, the Timer fires with the second open, the second's task is completed late, then the escalation | PC-MI-12 |
| [sequential-completion-then-timer](sequential-completion-then-timer.scenario.json) | sequential-boundary | one reviewer returns, then the Timer is fired | PC-MI-12 |
| [sequential-child-error](sequential-child-error.scenario.json) | sequential-boundary | the second instance's task completes with `verdict = 'reject'` | PC-MI-12, PC-MI-03 |
| [parallel-timer-while-work-remains](parallel-timer-while-work-remains.scenario.json) | parallel-boundary | instance 2 returns, the Timer fires, instances 1 and 3 are completed late, then the escalation | PC-MI-12 |
| [parallel-child-error](parallel-child-error.scenario.json) | parallel-boundary | instance 1 returns, instance 3 completes with `verdict = 'reject'`, instance 2's task is completed afterwards | PC-MI-12, PC-MI-03 |
| [sequential-item-out](sequential-item-out.scenario.json) | sequential-item-out | reviewers `a, b, c`; the first called task returns `go`, the second `stop`, which ends the body; the third called task is completed though it never exists; the Process ends without a `reviewer` variable | PC-MI-03 |
| [parallel-counters-in](parallel-counters-in.scenario.json) | parallel-counters-in | `count = 3`; slot 0's called instance ends in the beginning closure, then the third and second called tasks complete | PC-MI-03 |
| [sequential-counters-in](sequential-counters-in.scenario.json) | sequential-counters-in | `count = 3`; slot 0's called instance ends at once, then the second and third called tasks complete in turn | PC-MI-03 |
| [parallel-child-terminates](parallel-child-terminates.scenario.json) | parallel-child-endings | reviewers `wait, terminate, terminate`; two called instances terminate, the condition ends the body with the first still waiting, whose task is completed late | PC-MI-12, PC-MI-03 |
| [parallel-child-endings](parallel-child-endings.scenario.json) | parallel-child-endings | reviewers `wait, terminate, error`; one called instance terminates and one ends its path by an uncaught Error, then the first's task is completed late | PC-MI-12, PC-ERROR-03 |
| [sequential-worklist](sequential-worklist.scenario.json) | sequential-worklist | reviewers `a, b`; the first called task returns `next = [a, z]`, so the second called instance receives `z` | PC-MI-08, PC-MI-03 |
| [standards-call-body](standards-call-body.scenario.json) | standards-call-body | reviewers `same, other`, the second called task completed first | PC-MI-03 |
| [standards-call-condition](standards-call-condition.scenario.json) | standards-call-condition | the start; the racing instances' completion condition is refused (`multiInstance.concurrentInstances`) | PC-MI-03 |
| [standards-call-item](standards-call-item.scenario.json) | standards-call-item | the start; the item's Data Input Association into the Call is refused (`work.call.multiInstanceDataInput`) | PC-MI-03 |
| [call-sequential-structured-equal-lines](call-sequential-structured-equal-lines.scenario.json) | call-sequential-structured | the Process variables `line = "outer-line"`, `sku = "process-sku"` and the structured `order.lines` of three Maps, two of them equal; the second called task is completed before it exists, the first is completed, then again after it returned, then the second and third are completed, then the publish task | PC-MI-07, PC-MI-03 |
| [call-parallel-structured-equal-lines](call-parallel-structured-equal-lines.scenario.json) | call-parallel-structured | the same variables; the called tasks of the three lines completed in the order 3, 1, 2, then the publish task | PC-MI-07, PC-MI-03 |

The Timer is one outer deadline over the whole body, so its occurrence is addressed as `BoundaryTimer_Review` activation 1 throughout.
