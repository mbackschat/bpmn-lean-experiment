# Link Events, their explicit-flow twins and their refusals

Answer-free schedules for [PC-BASIC-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Link throw and catch continuation equivalence, several sources of one name, repeated occurrences, and the constraints a Link pair must meet, plus the Link part of [PC-BASIC-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (identifier renaming). The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#link-events) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay. Every Link name is shared by the throw's and the catch's definition, except in [name-mismatch](name-mismatch.bpmn).

## Models

| Model | What it holds |
|---|---|
| [go-to-links](go-to-links.bpmn) | The User Task *Triage* routes to *Handle billing* or *Handle other*; each ends in a throwing Link of the name `resolution`, whose one catching Link leads to *Resolve*. *Resolve* may return to *Triage* (`${again == 'yes'}`). |
| [go-to-flows](go-to-flows.bpmn) | The explicit-flow twin: both handlers flow into *Resolve* directly, with no Link Event. |
| [go-to-links-renamed](go-to-links-renamed.bpmn) | [go-to-links](go-to-links.bpmn) with every identifier renamed, the Link Event identifiers included; the Link name `resolution`, the labels and the variable names are kept. |
| [fan-in-links](fan-in-links.bpmn) | A Parallel fork over *Prepare A* and *Prepare B*, each ending in a throwing Link of the name `merge-point`, with one catching Link leading to *Handle*. |
| [fan-in-flows](fan-in-flows.bpmn) | The explicit-flow twin: both preparations flow into *Handle* directly. |
| [catch-with-incoming](catch-with-incoming.bpmn) | A Parallel fork whose first branch enters the catching Link `entry` on a Sequence Flow of its own and whose second branch ends in the matching throw; the catch leads to *Work*. |
| [missing-catch](missing-catch.bpmn) | A throwing Link whose name has no catching Link. |
| [duplicate-catch](duplicate-catch.bpmn) | One throwing Link and two catching Links of the same name. |
| [cross-scope](cross-scope.bpmn) | A throwing Link inside a Sub-Process whose catching Link is in the enclosing process. |
| [after-event-gateway](after-event-gateway.bpmn) | An Event-Based Gateway whose first arm is a catching Link and whose second is a Timer catch. |
| [same-name-two-scopes](same-name-two-scopes.bpmn) | One Link name used by a throw and a catch in the process and again by a throw and a catch inside a Sub-Process. |
| [name-mismatch](name-mismatch.bpmn) | A throw and a catch of the name `proceed` whose catching Event is labelled `resume`, and whose throw is labelled `go on`. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [billing-then-other-reopened](go-to-links-billing-then-other-reopened.scenario.json) | go-to-links | The billing route, a reopening, then the other route with a closing resolution: both sources, and the catch twice. |
| [billing-then-other-reopened](go-to-flows-billing-then-other-reopened.scenario.json) | go-to-flows | The same stimuli as the schedule of that name on go-to-links. |
| [billing-then-other-reopened](go-to-links-renamed-billing-then-other-reopened.scenario.json) | go-to-links-renamed | The same stimuli through the renamed identifiers. |
| [both-sources](fan-in-links-both-sources.scenario.json) | fan-in-links | One preparation completes and its continuation is completed before the other preparation completes. |
| [both-sources](fan-in-flows-both-sources.scenario.json) | fan-in-flows | The same stimuli as the schedule of that name on fan-in-links. |
| [both-arrivals](catch-with-incoming-both-arrivals.scenario.json) | catch-with-incoming | *Work* is completed twice, by activations 1 and 2. |
| [through-the-pair](name-mismatch-through-the-pair.scenario.json) | name-mismatch | The first task and the task after the pair are completed in turn. |
| [start](missing-catch-start.scenario.json) | missing-catch | The start alone, which is where CIB meets the deployment. |
| [start](duplicate-catch-start.scenario.json) | duplicate-catch | The start alone, which is where CIB meets the deployment. |
| [start](cross-scope-start.scenario.json) | cross-scope | The start alone, which is where CIB meets the deployment. |
| [start](after-event-gateway-start.scenario.json) | after-event-gateway | The start alone, which is where CIB meets the deployment. |
| [start](same-name-two-scopes-start.scenario.json) | same-name-two-scopes | The start alone, which is where CIB meets the deployment. |

## Kernel restrictions these inputs reconcile

The [missing-catch](missing-catch.bpmn) and [cross-scope](cross-scope.bpmn) models are witnesses for `link.catch`, [duplicate-catch](duplicate-catch.bpmn) and [same-name-two-scopes](same-name-two-scopes.bpmn) for `link.duplicateCatch`, [catch-with-incoming](catch-with-incoming.bpmn) for `link.catch.incoming`, and [after-event-gateway](after-event-gateway.bpmn) for `gateway.eventBased.linkArm`, all of the [flow semantics restrictions](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#restrictions), so that CIB's answer to each shape is fixed before the row decides whether to keep refusing it. [same-name-two-scopes](same-name-two-scopes.bpmn) separates the standard's per-level Link name resolution from CIB's resource-wide pairing.

The schedules carry no expected route or state; the retained CIB evidence is the answer.
