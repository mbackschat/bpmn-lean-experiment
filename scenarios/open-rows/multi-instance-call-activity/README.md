# Multi-Instance Call Activity bodies

Neutral inputs for [PC-MI-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Call Activity bodies in both modes and both generation forms, several instances of one definition in one closure), and the Call Activity parts of PC-MI-09 (completion predicates) and PC-MI-12 (body boundary handling). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result.

## Models

Each Multi-Instance model is one Call Activity `CallActivity_Review` of the Process `Process_Review`, followed by the User Task `UserTask_Publish`. The Call maps the body's `loopCounter` in as `slot` and the element variable `reviewer` in under its own name, and maps the called `verdict` out as `lastVerdict` and the copied `slot` out as `lastSlot`. The called Process has one User Task `UserTask_Check` whose inputs publish `subject` and `slotSeen`; its completion writes `verdict`. A called instance is addressed by its derived identity `call:<caller>:<call>:<activation>` (byte-length-prefixed parts, as in the [repeated, nested and concurrent Calls](../../repeated-nested-concurrent-calls/README.md) sources), so the body's Nth Call activation is the Nth called instance.

| Model | Mode | Generation | Beyond the body |
|---|---|---|---|
| [sequential](sequential.bpmn), [parallel](parallel.bpmn) | sequential, parallel | collection `reviewers`, element variable `reviewer` | none |
| [sequential-cardinality](sequential-cardinality.bpmn), [parallel-cardinality](parallel-cardinality.bpmn) | sequential, parallel | `loopCardinality` `${count}`, no element | none |
| [sequential-quorum](sequential-quorum.bpmn), [parallel-quorum](parallel-quorum.bpmn) | sequential, parallel | collection | completion condition `${nrOfCompletedInstances >= quorum}` |
| [sequential-boundary](sequential-boundary.bpmn), [parallel-boundary](parallel-boundary.bpmn) | sequential, parallel | collection | interrupting `PT5S` Timer and `E-REJECTED` Error Boundary Events on the body; the called Process ends in an Error End Event when `verdict = 'reject'` |
| [fork-two-calls](fork-two-calls.bpmn) | none | none | a Parallel Gateway forks straight into two Calls of `Process_Review`, joined before `UserTask_Publish` |

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

The Timer is one outer deadline over the whole body, so its occurrence is addressed as `BoundaryTimer_Review` activation 1 throughout.
