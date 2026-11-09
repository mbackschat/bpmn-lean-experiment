# Multi-Instance User Task bodies

Neutral inputs for [PC-MI-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (User Task bodies, both modes, collection and cardinality generation) and the User Task parts of PC-MI-08 (mutable collection), PC-MI-09 (completion predicates), PC-MI-10 (body data) and PC-MI-12 (outer Timer). They complement the standards-only [sequential](../../sequential-multi-instance/README.md) and [parallel](../../parallel-multi-instance/README.md) scenarios with the CIB attribute forms. They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result.

## Models

Each model is one User Task `UserTask_Review` with Multi-Instance loop characteristics between a Start Event and the User Task `UserTask_Publish`, so that the outer Activity's return is a visible wait. The task's input mappings publish the body's context at its start: `subject` is the element variable `item`, `position` is `loopCounter`, and `instances`, `active` and `completed` are `nrOfInstances`, `nrOfActiveInstances` and `nrOfCompletedInstances`. Task completions write Process variables through the `verdict` result and, in the halting models, through the body-local names `status` and `note`.

| Model | Mode | Generation | Beyond the body |
|---|---|---|---|
| [sequential](sequential.bpmn), [parallel](parallel.bpmn) | sequential, parallel | collection `items`, element variable `item` | none |
| [sequential-cardinality](sequential-cardinality.bpmn), [parallel-cardinality](parallel-cardinality.bpmn) | sequential, parallel | `loopCardinality` `${count}`, no element | none |
| [sequential-both](sequential-both.bpmn), [parallel-both](parallel-both.bpmn) | sequential, parallel | `loopCardinality` `${count}` together with collection `items` and element variable `item` | none |
| [sequential-halting](sequential-halting.bpmn), [parallel-halting](parallel-halting.bpmn) | sequential, parallel | collection | completion condition `${halt}`; inputs `status` (literal `pending`) and `note` (`${null}`) are body-local |
| [sequential-boundary](sequential-boundary.bpmn), [parallel-boundary](parallel-boundary.bpmn) | sequential, parallel | collection | interrupting `PT5S` Timer Boundary Event on the body, routed to `UserTask_Escalation`; a Parallel Gateway at the start also opens `UserTask_Sibling`, a task outside the Multi-Instance Activity |

## Schedules

Task completions address the inner User Task by activation, counted per begun inner instance in generation order. A stimulus that addresses a wait that is not open (a body not yet generated, a finished body, a cancelled body) is part of the schedule, not a mistake in it.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [sequential-zero-items](sequential-zero-items.scenario.json) | sequential | empty collection | PC-MI-01 |
| [sequential-one-item](sequential-one-item.scenario.json) | sequential | one item | PC-MI-01 |
| [sequential-equal-items](sequential-equal-items.scenario.json) | sequential | items `same, same, other`; the second body is completed before the first exists, then all three in order | PC-MI-01 |
| [parallel-zero-items](parallel-zero-items.scenario.json) | parallel | empty collection | PC-MI-01 |
| [parallel-one-item](parallel-one-item.scenario.json) | parallel | one item | PC-MI-01 |
| [parallel-equal-items](parallel-equal-items.scenario.json) | parallel | items `same, same, other` completed 2, 3, 2 again, 1; every completion writes `verdict` | PC-MI-01, PC-MI-10 |
| [sequential-cardinality](sequential-cardinality.scenario.json) | sequential-cardinality | `count = 2` | PC-MI-01 |
| [sequential-cardinality-zero](sequential-cardinality-zero.scenario.json) | sequential-cardinality | `count = 0` | PC-MI-01 |
| [parallel-cardinality](parallel-cardinality.scenario.json) | parallel-cardinality | `count = 2` completed in reverse | PC-MI-01 |
| [parallel-cardinality-zero](parallel-cardinality-zero.scenario.json) | parallel-cardinality | `count = 0` | PC-MI-01 |
| [sequential-collection-grown](sequential-collection-grown.scenario.json) | sequential | `[a, b]` replaced by `[a, c, d]` on the first body's wait, then completions 1, 2 and 3 | PC-MI-08 |
| [sequential-collection-shrunk-then-restored](sequential-collection-shrunk-then-restored.scenario.json) | sequential | `[a, b]` replaced by `[a]` before the first completion, restored, then completions 1 and 2 | PC-MI-08 |
| [sequential-collection-removed](sequential-collection-removed.scenario.json) | sequential | the `items` variable is removed before the first completion | PC-MI-08 |
| [parallel-collection-replaced-after-entry](parallel-collection-replaced-after-entry.scenario.json) | parallel | `[a, b]` replaced by `[a, z]` after both bodies exist | PC-MI-08 |
| [sequential-both-count-below-items](sequential-both-count-below-items.scenario.json) | sequential-both | `count = 2` with three items, completed 1, 2 and 3 | PC-MI-01 |
| [parallel-both-count-below-items](parallel-both-count-below-items.scenario.json) | parallel-both | `count = 2` with three items, completed 2, 1 and 3 | PC-MI-01 |
| [sequential-halting-initially-true](sequential-halting-initially-true.scenario.json) | sequential-halting | `halt = true` from the start, three items | PC-MI-09 |
| [sequential-halting-data-flips](sequential-halting-data-flips.scenario.json) | sequential-halting | `halt` false, set true on the second body's wait | PC-MI-09 |
| [sequential-halting-final-body-non-boolean](sequential-halting-final-body-non-boolean.scenario.json) | sequential-halting | two items; `halt` becomes the String `maybe` before the final body completes | PC-MI-09 |
| [sequential-halting-final-body-unresolvable](sequential-halting-final-body-unresolvable.scenario.json) | sequential-halting | two items; `halt` is removed before the final body completes | PC-MI-09 |
| [sequential-halting-nonfinal-non-boolean](sequential-halting-nonfinal-non-boolean.scenario.json) | sequential-halting | three items; `halt` becomes `maybe` before the second body completes, is reset, and the run continues | PC-MI-09 |
| [parallel-halting-initially-true](parallel-halting-initially-true.scenario.json) | parallel-halting | `halt = true`; body 2 completes, then body 1 completes late | PC-MI-09 |
| [parallel-halting-data-flips](parallel-halting-data-flips.scenario.json) | parallel-halting | `halt` false, set true on body 1's wait after body 3 completed | PC-MI-09 |
| [parallel-halting-final-body-non-boolean](parallel-halting-final-body-non-boolean.scenario.json) | parallel-halting | two items; `halt` becomes `maybe` before the final body completes, is reset, and the completion repeats | PC-MI-09 |
| [parallel-halting-final-body-unresolvable](parallel-halting-final-body-unresolvable.scenario.json) | parallel-halting | two items; `halt` is removed before the final body completes, restored, and the completion repeats | PC-MI-09 |
| [sequential-body-locals-reset](sequential-body-locals-reset.scenario.json) | sequential-halting | the first body completes writing `note`, `status` and `verdict`; the second body's inputs follow | PC-MI-10 |
| [parallel-body-locals-isolated](parallel-body-locals-isolated.scenario.json) | parallel-halting | body 2 writes `note`, `status` and `verdict`; bodies 3 and 1 follow, each writing `verdict` | PC-MI-10 |
| [sequential-timer-while-work-remains](sequential-timer-while-work-remains.scenario.json) | sequential-boundary | one completion, the Timer fires with the second body open, a late completion of that body, then the escalation | PC-MI-12 |
| [sequential-completion-then-timer](sequential-completion-then-timer.scenario.json) | sequential-boundary | one item completes, then the Timer is fired | PC-MI-12 |
| [sequential-zero-items-timer](sequential-zero-items-timer.scenario.json) | sequential-boundary | empty collection, then the Timer is fired | PC-MI-12 |
| [parallel-timer-while-work-remains](parallel-timer-while-work-remains.scenario.json) | parallel-boundary | body 2 completes, the Timer fires, bodies 1 and 3 complete late, then the escalation | PC-MI-12 |
| [parallel-completion-then-timer](parallel-completion-then-timer.scenario.json) | parallel-boundary | both bodies complete, then the Timer is fired | PC-MI-12 |

The Timer is one outer deadline over the whole body, so its occurrence is addressed as `BoundaryTimer_Review` activation 1 throughout. Every boundary schedule ends by completing the sibling task.
