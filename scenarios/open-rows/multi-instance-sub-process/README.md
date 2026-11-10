# Multi-Instance Sub-Process bodies

Neutral inputs for [PC-MI-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (collection-driven sequential Sub-Process), PC-MI-05 (collection-driven parallel Sub-Process and its 16-body capacity) and PC-MI-06 (cardinality-driven Sub-Process bodies), and the Sub-Process parts of PC-MI-07 (cardinality domain), PC-MI-09 (completion predicates), PC-MI-10 (body data) and PC-MI-12 (outer Timer). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result.

## Models

Every model wraps one embedded Sub-Process `SubProcess_Item` in Multi-Instance loop characteristics between a Start Event and the User Task `UserTask_Publish`, so that the outer Activity's return is a visible wait.

| Model | Mode | Generation | Body and extras |
|---|---|---|---|
| [sequential](sequential.bpmn), [parallel](parallel.bpmn) | sequential, parallel | collection `invoices`, element `invoice`; completion condition `${nrOfCompletedInstances >= quorum}` | Parallel Gateway into the User Task `UserTask_Commercial` and the chain `UserTask_Compliance`, async effect `ServiceTask_Validate`, ending at separate End Events. The Sub-Process declares body-local inputs `status` (`pending`), `note` (`${note}`, a String or present null) and `decision` (`unset`); the effect maps its result to `decision` (body-local name) and `summary` (not declared locally). Both user tasks publish `seenInvoice`, `seenStatus`, `seenNote` and `position`. |
| [parallel-simple](parallel-simple.bpmn) | parallel | collection `items`; the same completion condition | one User Task `UserTask_Inspect`; the capacity vehicle |
| [sequential-cardinality](sequential-cardinality.bpmn), [parallel-cardinality](parallel-cardinality.bpmn) | sequential, parallel | `loopCardinality` `${count}` | `UserTask_Inspect` publishing `position` and `instances` |
| [sequential-computed](sequential-computed.bpmn) | sequential | `loopCardinality` `${(count - offset) / divisor}` | the same body; the cardinality-domain vehicle |
| [sequential-boundary](sequential-boundary.bpmn), [parallel-boundary](parallel-boundary.bpmn) | sequential, parallel | collection `items` | interrupting `PT5S` Timer Boundary Event on the Sub-Process, routed to `UserTask_Escalation` |
| [parallel-entry-read](parallel-entry-read.bpmn) | parallel | collection `items`, element `item`, no completion condition | `SubProcess_Lot` declares the body-local input `prior` (`${last}`). The body is `Task_Mark`, which writes `last` from `item`, then the User Task `UserTask_Check`, which publishes `seenPrior` and `position`. |
| [parallel-early-completion](parallel-early-completion.bpmn) | parallel | collection `items`, element `item`; completion condition `${nrOfCompletedInstances >= 1}` | The body is `Task_Mark`, which writes `last` from `item`, and ends without a wait. `UserTask_After` publishes `seenLast`. |
| [parallel-beside-branch](parallel-beside-branch.bpmn) | parallel | collection `items`, element `item` | A Parallel Gateway whose first Sequence Flow reaches `SubProcess_Lot`, the body of `parallel-entry-read`, and whose second reaches `Task_Flag`, which writes `last` from `fresh`, then the User Task `UserTask_Sibling`. |

## Schedules

Inner tasks and effects are addressed by activation, counted per begun occurrence of the element in the Process instance. A stimulus that addresses a wait that is not open (a body not yet generated, a finished body, a cancelled body) is part of the schedule, not a mistake in it.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [sequential-two-bodies](sequential-two-bodies.scenario.json) | sequential | invoices `a, b`, `note = "n0"`; the first body completes through all three inner steps writing `status`, the second returns a null result | PC-MI-04, PC-MI-10 |
| [sequential-null-note-and-result](sequential-null-note-and-result.scenario.json) | sequential | `note` is a present null; the first body's result is null, the second's a String | PC-MI-04, PC-MI-10 |
| [sequential-multi-output-and-stale](sequential-multi-output-and-stale.scenario.json) | sequential | the commercial completion writes `extra`, `status` and `summary` together, then is sent again | PC-MI-04 |
| [sequential-first-end-mutation](sequential-first-end-mutation.scenario.json) | sequential | the compliance branch reaches its End Event first, writing `summary`, before the commercial branch completes | PC-MI-04 |
| [sequential-early-after-quiescence](sequential-early-after-quiescence.scenario.json) | sequential | `quorum = 1`; both inner branches and the effect complete, then the second body's commercial task is completed | PC-MI-04, PC-MI-09 |
| [parallel-two-bodies-natural](parallel-two-bodies-natural.scenario.json) | parallel | body 1 runs through its inner steps before body 2 | PC-MI-05, PC-MI-10 |
| [parallel-two-bodies-reversed](parallel-two-bodies-reversed.scenario.json) | parallel | body 2 runs through its inner steps before body 1 | PC-MI-05, PC-MI-10 |
| [parallel-early-cancel-keeps-sibling-write](parallel-early-cancel-keeps-sibling-write.scenario.json) | parallel | `quorum = 1`; body 1's commercial task writes `commercialNote`, body 2 completes, then body 1's compliance task is completed late | PC-MI-05, PC-MI-09, PC-MI-12 |
| [parallel-sixteen-bodies-natural](parallel-sixteen-bodies-natural.scenario.json) | parallel-simple | sixteen items completed 1 to 16 | PC-MI-05 |
| [parallel-sixteen-bodies-reversed](parallel-sixteen-bodies-reversed.scenario.json) | parallel-simple | sixteen items completed 16 to 1 | PC-MI-05 |
| [parallel-seventeen-bodies](parallel-seventeen-bodies.scenario.json) | parallel-simple | seventeen items, one more than the capacity the row names; bodies 17 and 1 are completed | PC-MI-05 |
| [parallel-early-cancel-of-fourteen](parallel-early-cancel-of-fourteen.scenario.json) | parallel-simple | sixteen items, `quorum = 2`; bodies 3 and 8 complete, body 1 is completed late | PC-MI-05, PC-MI-09 |
| [sequential-cardinality-zero](sequential-cardinality-zero.scenario.json) | sequential-cardinality | `count = 0` | PC-MI-06 |
| [sequential-cardinality-two](sequential-cardinality-two.scenario.json) | sequential-cardinality | `count = 2` | PC-MI-06 |
| [sequential-cardinality-changed-after-entry](sequential-cardinality-changed-after-entry.scenario.json) | sequential-cardinality | `count = 2`, set to 5 on the first body's wait, then bodies 1, 2 and 3 are completed | PC-MI-06 |
| [parallel-cardinality-zero](parallel-cardinality-zero.scenario.json) | parallel-cardinality | `count = 0` | PC-MI-06 |
| [parallel-cardinality-two-reversed](parallel-cardinality-two-reversed.scenario.json) | parallel-cardinality | `count = 2` completed in reverse | PC-MI-06 |
| [parallel-cardinality-changed-after-entry](parallel-cardinality-changed-after-entry.scenario.json) | parallel-cardinality | `count = 2`, set to 5 after both bodies exist | PC-MI-06 |
| [sequential-computed-two](sequential-computed-two.scenario.json) | sequential-computed | `count = 2`, `offset = 0`, `divisor = 1` | PC-MI-06, PC-MI-07 |
| [sequential-computed-negative](sequential-computed-negative.scenario.json) | sequential-computed | `count = 0`, `offset = 1`, `divisor = 1` | PC-MI-06 |
| [sequential-computed-noninteger](sequential-computed-noninteger.scenario.json) | sequential-computed | `count = 3`, `offset = 0`, `divisor = 2` | PC-MI-06 |
| [sequential-computed-numeric-text](sequential-computed-numeric-text.scenario.json) | sequential-computed | `count` is the String `"2"` | PC-MI-06, PC-MI-07 |
| [sequential-computed-malformed](sequential-computed-malformed.scenario.json) | sequential-computed | `count` is the String `"two"` | PC-MI-06, PC-MI-07 |
| [sequential-timer-while-work-remains](sequential-timer-while-work-remains.scenario.json) | sequential-boundary | one body completes, the Timer fires with the second open, the second is completed late, then the escalation | PC-MI-12 |
| [sequential-completion-then-timer](sequential-completion-then-timer.scenario.json) | sequential-boundary | one item completes, then the Timer is fired | PC-MI-12 |
| [sequential-zero-items-timer](sequential-zero-items-timer.scenario.json) | sequential-boundary | empty collection, then the Timer is fired | PC-MI-12 |
| [parallel-timer-while-work-remains](parallel-timer-while-work-remains.scenario.json) | parallel-boundary | body 2 completes, the Timer fires, bodies 1 and 3 are completed late, then the escalation | PC-MI-12 |
| [parallel-completion-then-timer](parallel-completion-then-timer.scenario.json) | parallel-boundary | both bodies complete, then the Timer is fired | PC-MI-12 |
| [parallel-entry-reads-earlier-instance](parallel-entry-reads-earlier-instance.scenario.json) | parallel-entry-read | items `a, b`, `last = "none"`; the two checks and `UserTask_Publish` complete. Separates a second instance whose entry read sees the first instance's write from one that begins before any body writes. No evidence yet. | PC-MI-05, PC-MI-10 |
| [parallel-first-instance-completes-early](parallel-first-instance-completes-early.scenario.json) | parallel-early-completion | items `a, b, c`; the first body completes at once and the condition holds, then `UserTask_After` completes. Separates instances that never begin from instances that all run `Task_Mark`. No evidence yet. | PC-MI-05, PC-MI-09 |
| [parallel-body-above-sibling-branch](parallel-body-above-sibling-branch.scenario.json) | parallel-beside-branch | items `a, b`, `last = "none"`, `fresh = "new"`; the two checks, the sibling review and the publish complete. Separates every instance beginning before the sibling branch's write from an instance beginning after it. No evidence yet. | PC-MI-05 |

The three schedules `parallel-entry-reads-earlier-instance`, `parallel-first-instance-completes-early` and `parallel-body-above-sibling-branch` separate the begin order of [CIB-OP-0016](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-op-0016--a-splits-branches-run-in-declaration-order-each-to-its-next-wait-join-or-end) from one that begins every instance at entry; they have no retained evidence yet.

The Timer is one outer deadline over the whole body, so its occurrence is addressed as `BoundaryTimer_Item` activation 1 throughout. The `parallel-sixteen-bodies-*` schedules carry sixteen completion commands each.
