# Multi-Instance Service Task bodies

Neutral inputs for [PC-MI-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Service Task bodies in both modes and both generation forms), and the Service Task parts of PC-MI-08 (mutable collection), PC-MI-09 (completion predicates), PC-MI-10 (body data) and PC-MI-12 (body boundary handling). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and no schedule states one. Every scenario uses the `cibseven-2.2.0` profile with the neutral delegate-expression effect handler of the [Service Task effect scenario](../../service-task-effect/README.md).

## Models

Each model is one Service Task `ServiceTask_Notify` with Multi-Instance loop characteristics, followed by the User Task `UserTask_Close`, so that the outer Activity's return is a visible wait. The Service Task declares `camunda:asyncBefore="true"` on its `multiInstanceLoopCharacteristics`, so each effect is a wait answered by an `effectResult` stimulus. CIB attaches an async continuation declared there to every inner instance, and one declared on the Activity to the Multi-Instance body as a whole (`BpmnParse#parseAsynchronousContinuationForActivity`), which would run every body's delegate inside one job. The kernel reader refuses the loop-level placement today (`reader.factNotCarried`), so these witnesses fix CIB's answer before PC-MI-02 carries it. The input mappings `address` (the element variable) and `position` (`loopCounter`) are the body's arguments; no output mapping is declared on the body, because CIB rejects `camunda:outputParameter` on Multi-Instance constructs.

| Model | Mode | Generation | Beyond the body |
|---|---|---|---|
| [sequential](sequential.bpmn), [parallel](parallel.bpmn) | sequential, parallel | collection `${recipients}`, element variable `recipient` | none |
| [sequential-cardinality](sequential-cardinality.bpmn), [parallel-cardinality](parallel-cardinality.bpmn) | sequential, parallel | `loopCardinality` `${count}`, no element | none |
| [sequential-quorum](sequential-quorum.bpmn), [parallel-quorum](parallel-quorum.bpmn) | sequential, parallel | collection | completion condition `${nrOfCompletedInstances >= quorum}` |
| [sequential-boundary](sequential-boundary.bpmn), [parallel-boundary](parallel-boundary.bpmn) | sequential, parallel | collection | Error Boundary Event `E-REJECTED` on the body, routed to `UserTask_Rejected` |
| [sequential-output-parameter](sequential-output-parameter.bpmn) | sequential | collection | an output mapping declared on the body |

## Schedules

Effect results are addressed by the Service Task's activation, counted per begun inner instance in generation order. Rows served are named per schedule.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [sequential-equal-items](sequential-equal-items.scenario.json) | sequential | recipients `same, same, other`; the three effects complete in order | PC-MI-02 |
| [sequential-premature-and-stale-effects](sequential-premature-and-stale-effects.scenario.json) | sequential | two equal recipients; the second body's result is sent before the first body ends, the first body's result is sent again after it ended | PC-MI-02 |
| [sequential-technical-failure-retry](sequential-technical-failure-retry.scenario.json) | sequential | incidents enabled; the first body fails technically, the second body's result is sent meanwhile, the incident is retried, then both bodies succeed | PC-MI-02 |
| [sequential-missing-result](sequential-missing-result.scenario.json) | sequential | three recipients; the first result arrives, the third body's result is sent while the second has none | PC-MI-02 |
| [parallel-reverse-equal-items](parallel-reverse-equal-items.scenario.json) | parallel | recipients `same, same, other`; results arrive in reverse generation order | PC-MI-02 |
| [parallel-missing-result-and-stale](parallel-missing-result-and-stale.scenario.json) | parallel | three recipients; results 1 and 3 arrive, result 3 is sent again, result 2 arrives last | PC-MI-02 |
| [parallel-technical-failure-retry](parallel-technical-failure-retry.scenario.json) | parallel | incidents enabled; the second body fails technically while the first succeeds, the incident is retried, then the second succeeds | PC-MI-02 |
| [sequential-cardinality](sequential-cardinality.scenario.json) | sequential-cardinality | `count = 2`; both effects complete in order | PC-MI-02 |
| [parallel-cardinality-reversed](parallel-cardinality-reversed.scenario.json) | parallel-cardinality | `count = 2`; results arrive in reverse order | PC-MI-02 |
| [sequential-quorum-reached-early](sequential-quorum-reached-early.scenario.json) | sequential-quorum | `quorum = 2`, three recipients; two results, then the third body's result is sent | PC-MI-09 |
| [sequential-quorum-initially-true](sequential-quorum-initially-true.scenario.json) | sequential-quorum | `quorum = 0`; the first result, then the second body's result is sent | PC-MI-09 |
| [sequential-quorum-lowered-between-bodies](sequential-quorum-lowered-between-bodies.scenario.json) | sequential-quorum | `quorum = 3` lowered to 2 by a `setVariables` command on the second body's wait before its result | PC-MI-09 |
| [parallel-quorum-reached-early](parallel-quorum-reached-early.scenario.json) | parallel-quorum | `quorum = 2`, three recipients; results 3 and 1 arrive, then the cancelled second body's result is sent | PC-MI-09 |
| [parallel-quorum-initially-true](parallel-quorum-initially-true.scenario.json) | parallel-quorum | `quorum = 0`; the second body's result arrives, then the first body's | PC-MI-09 |
| [parallel-quorum-lowered-between-bodies](parallel-quorum-lowered-between-bodies.scenario.json) | parallel-quorum | `quorum = 3` lowered to 2 on the second body's wait after the first result; then the second result, then the third body's | PC-MI-09 |
| [sequential-business-error](sequential-business-error.scenario.json) | sequential-boundary | the first body succeeds, the second raises `E-REJECTED`, the third body's result is sent | PC-MI-12 |
| [parallel-business-error](parallel-business-error.scenario.json) | parallel-boundary | result 1, then body 3 raises `E-REJECTED`, then body 2's result is sent | PC-MI-12 |
| [sequential-collection-shrunk-then-restored](sequential-collection-shrunk-then-restored.scenario.json) | sequential | the collection is replaced by `[a]` before the first result, restored to `[a, b]`, and the first result is sent again | PC-MI-08 |
| [sequential-output-parameter-on-body](sequential-output-parameter-on-body.scenario.json) | sequential-output-parameter | one recipient; a body-level output mapping is declared | PC-MI-10 |

Argument and result ownership is carried by the effect occurrence each stimulus addresses; the schedules keep the effect results typed (`delivered` Boolean and `receipt` String) and distinct per body.
