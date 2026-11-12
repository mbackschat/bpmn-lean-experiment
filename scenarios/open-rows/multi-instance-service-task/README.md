# Multi-Instance Service Task bodies

Neutral inputs for [PC-MI-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Service Task bodies in both modes and both generation forms), and the Service Task parts of PC-MI-08 (mutable collection), PC-MI-09 (completion predicates), PC-MI-10 (body data) and PC-MI-12 (body boundary handling). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and no schedule states one. Every scenario uses the `cibseven-2.2.0` profile with the neutral delegate-expression effect handler of the [Service Task effect scenario](../../service-task-effect/README.md).

## Models

Each model is one Service Task `ServiceTask_Notify` with Multi-Instance loop characteristics, followed by the User Task `UserTask_Close`, so that the outer Activity's return is a visible wait. The Service Task declares `camunda:asyncBefore="true"` on its `multiInstanceLoopCharacteristics`, so each effect is a wait answered by an `effectResult` stimulus. CIB attaches an async continuation declared there to every inner instance, and one declared on the Activity to the Multi-Instance body as a whole (`BpmnParse#parseAsynchronousContinuationForActivity`), which would run every body's delegate inside one job. The kernel reads the loop-level marks as `MultiInstance.asyncBefore` and `asyncAfter`, which bound each instance ([CIB-EXT-0027](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0027--an-asynchronous-continuation-commits-the-input-at-its-boundary)).

The item reaches each inner instance the standard way, as in the registered [parallel Multi-Instance model](../../parallel-multi-instance/process.bpmn). The Service Task's `ioSpecification` declares a collection Data Input `DataInput_Recipients` and an item Data Input `DataInput_Recipient`; Data Input Associations feed them from the Data Object Reference `DataObjectReference_Recipients` and from the loop's `inputDataItem`; the loop names the collection with `loopDataInputRef` and the item with `inputDataItem`. CIB binds those two by identity and ignores the Data Object Reference and the associations (`BpmnParse#parseMultiInstanceLoopCharacteristics`): the collection is the Process variable literally named by `loopDataInputRef`, so every start variable and every `setVariables` command names the collection `DataInput_Recipients`, and the element variable is the `name` of the `inputDataItem` (`recipient`). The `cibseven-2.2.0` profile selects that binding ([CIB-INT-0014](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-int-0014--a-multi-instance-loop-binds-its-collection-and-item-by-the-loops-own-references-not-by-data-associations)).

No `camunda:inputOutput` mapping is declared on a Multi-Instance Service Task here. CIB evaluates an input mapping of an inner Activity against the parent variable scope (`IoParameter#execute`), and `BpmnParse#parseActivityInputOutput` does not make a Multi-Instance inner Activity a scope, so such a mapping cannot carry the loop's per-instance variables. That scope is classified by the [mapping-scope witnesses](../multi-instance-activity-mapping-scope/README.md) (PC-MI-10), which moved there from this directory. The cardinality models have no collection or item and so declare no mapping. No output mapping is declared on the body either, because CIB rejects `camunda:outputParameter` on Multi-Instance constructs; [sequential-output-parameter](sequential-output-parameter.bpmn) alone declares one, as the PC-MI-10 refusal witness, with the standard input form.

| Model | Mode | Generation | Beyond the body |
|---|---|---|---|
| [sequential](sequential.bpmn), [parallel](parallel.bpmn) | sequential, parallel | collection `DataInput_Recipients`, item `recipient` | none |
| [sequential-cardinality](sequential-cardinality.bpmn), [parallel-cardinality](parallel-cardinality.bpmn) | sequential, parallel | `loopCardinality` `${count}`, no element | none |
| [sequential-quorum](sequential-quorum.bpmn), [parallel-quorum](parallel-quorum.bpmn) | sequential, parallel | collection | completion condition `${nrOfCompletedInstances >= quorum}` |
| [sequential-boundary](sequential-boundary.bpmn), [parallel-boundary](parallel-boundary.bpmn) | sequential, parallel | collection | Error Boundary Event `E-REJECTED` on the body, routed to `UserTask_Rejected` |
| [sequential-output-parameter](sequential-output-parameter.bpmn) | sequential | collection | an output mapping declared on the body |
| [sequential-result-locals](sequential-result-locals.bpmn), [parallel-result-locals](parallel-result-locals.bpmn) | sequential, parallel | collection | `UserTask_Close` publishes `seenDelivered` (`${delivered}`) and `seenReceipt` (`${receipt}`), the names of the effect results, which the Process also holds as variables |
| [sequential-timer-boundary](sequential-timer-boundary.bpmn), [parallel-timer-boundary](parallel-timer-boundary.bpmn) | sequential, parallel | collection | interrupting `PT5S` Timer Boundary Event `BoundaryTimer_Notify` on the body, routed to `UserTask_TimedOut` |

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
| [sequential-result-locals-discarded](sequential-result-locals-discarded.scenario.json) | sequential-result-locals | recipients `a, b`, the Process variables `delivered = false` and `receipt = "process-receipt"`; the first result carries `delivered` and `receipt`, the second only `receipt`; the close task then shows whether any result value outlived its instance | PC-MI-10 |
| [parallel-result-locals-discarded](parallel-result-locals-discarded.scenario.json) | parallel-result-locals | the same inputs; the second body's result (`receipt` only) arrives before the first's (`delivered` and `receipt`) | PC-MI-10 |
| [sequential-timer-while-effect-pending](sequential-timer-while-effect-pending.scenario.json) | sequential-timer-boundary | recipients `a, b, c`; the first result arrives, the Timer fires with the second body's effect pending, the second body's result is sent late, then the timed-out task | PC-MI-12 |
| [parallel-timer-while-effect-pending](parallel-timer-while-effect-pending.scenario.json) | parallel-timer-boundary | recipients `a, b, c`; the second result arrives, the Timer fires, the first and third bodies' results are sent late, then the timed-out task | PC-MI-12 |
| [sequential-completion-then-timer](sequential-completion-then-timer.scenario.json) | sequential-timer-boundary | recipients `a, b`; both results arrive, then the Timer is fired | PC-MI-12 |
| [parallel-completion-then-timer](parallel-completion-then-timer.scenario.json) | parallel-timer-boundary | recipients `a, b`; the results arrive in reverse, then the Timer is fired | PC-MI-12 |
| [sequential-zero-items-timer](sequential-zero-items-timer.scenario.json) | sequential-timer-boundary | no recipients, then the Timer is fired | PC-MI-12 |

Argument and result ownership is carried by the effect occurrence each stimulus addresses; the schedules keep the effect results typed (`delivered` Boolean and `receipt` String) and distinct per body.
