# Kernel status map

## Status

Living map of what the kernel implements per row of the [Practical CIB7 Coverage target](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), its open proof lanes and its assurance and adoption state. Measured 2026-11-09 on the W0 kernel, the pilot rows PC-MI-02, PC-ERROR-01 and PC-AUTO-02 on 2026-11-10; it changes only at a milestone or track closure, or at a stop. It replaces the deleted implementation, assurance-and-adoption, Temporal hosting and Temporal test evidence maps ([assurance and adoption map](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [Temporal hosting map](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [Temporal test evidence map](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/TEMPORAL-TEST-EVIDENCE-MAP.md), [router](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/IMPLEMENTATION-MAP.md)), whose claims rested on the deleted stack and are not carried over. Row states are the coverage target's; required meaning is the [kernel semantics documents](semantics/)'.

## Row status

The kernel column reads: `accepted`, the row is `done` and the listed kernel scenarios still witness its acceptance; `slice`, the Lean and TypeScript kernels execute the listed scenarios, which cover part of the row, and the rest of its acceptance is open; `refused`, every listed scenario is refused at admission with the code shown; `absent`, no kernel scenario exercises the row. Scenarios are discovered from `scenarios/` and `packages/differential/test/fixtures/`; the [kernel behavior oracle](../../packages/differential/test/kernel-behavior-oracle.integration-test.ts) (guard 16) holds the Lean and TypeScript kernels to the same result on every one, and the kernel to the retained CIB Seven result on the 27 scenarios that carry a `*cibseven-evidence.json` sibling (counted 2026-11-09). Lean and TypeScript agreement is a transcription check, never evidence of meaning. A scenario marked "does not complete" ran on the TypeScript kernel on 2026-11-09 to a rejected `undeclared-output` command, and for `concurrent-scope-data` to a semantic failure `undeclared-write`, before its last stimulus; W0.2's parity classification owns whether that is a kernel defect.

[PC-DATA-02](../PRACTICAL-CIB7-COVERAGE-TARGET.md#business-data-and-expressions) is open: the kernel has no per-profile scenario value admission ([admission semantics](semantics/ADMISSION-SEMANTICS-SPEC.md#open-rows)).

| Row | Kernel | Kernel scenario evidence | Open proof lanes |
|---|---|---|---|
| PC-CF-02 | accepted | [`mixed-task-control-flow`](../../scenarios/mixed-task-control-flow/README.md); [`exclusive-choice-arity`](../../scenarios/exclusive-choice-arity/README.md); [`exclusive-choice-without-default`](../../scenarios/exclusive-choice-without-default/README.md); [`exclusive-choice-compositions`](../../scenarios/open-rows/exclusive-choice-compositions/README.md); [`flow-simple-boolean-outflow`](../../scenarios/open-rows/flow-simple-boolean-outflow/README.md) | — |
| PC-CF-03 | slice | [`embedded-subprocess-completion`](../../scenarios/embedded-subprocess-completion/README.md); [`root-parallel-forks`](../../scenarios/root-parallel-forks/README.md); [`single-scope-models`](../../scenarios/single-scope-models/README.md); [`terminal-forks`](../../scenarios/terminal-forks/README.md); [`data-declaring-terminal-branches`](../../scenarios/data-declaring-terminal-branches/README.md) | concurrency |
| PC-CF-04 | slice | [`inclusive-gateway-regions`](../../scenarios/inclusive-gateway-regions/README.md) | concurrency |
| PC-CF-05 | slice | [`event-based-gateway-message-timer`](../../scenarios/event-based-gateway-message-timer/README.md) | concurrency, cancellation |
| PC-CF-06 | accepted | [`mixed-task-control-flow`](../../scenarios/mixed-task-control-flow/README.md); [`scope-reentry`](../../scenarios/scope-reentry/README.md); [`user-task-cycle`](../../scenarios/user-task-cycle/README.md) (does not complete: `undeclared-output` rejections); [`cycle-compositions`](../../scenarios/open-rows/cycle-compositions/README.md) | — |
| PC-CF-07 | slice | [`structured-process-composition`](../../scenarios/structured-process-composition/README.md); [`pass-through-implicit-split-merge`](../../scenarios/pass-through-implicit-split-merge/README.md); [`activity-host-split`](../../scenarios/activity-host-split/README.md); [`activity-host-merge`](../../scenarios/activity-host-merge/README.md) | — |
| PC-CF-08 | slice | [`structured-process-composition`](../../scenarios/structured-process-composition/README.md); [`inclusive-gateway-regions`](../../scenarios/inclusive-gateway-regions/README.md) | concurrency |
| PC-DATA-01 | accepted | [`portable-business-values-handoff`](../../scenarios/portable-business-values-handoff/README.md); [`portable-business-effect-data`](../../scenarios/portable-business-effect-data/README.md); [`portable-business-message-payload`](../../scenarios/portable-business-message-payload/README.md) | — |
| PC-DATA-02 | absent | — | — |
| PC-DATA-03 | accepted | [`concurrent-structured-scope-data`](../../scenarios/concurrent-structured-scope-data/README.md); [`root-parallel-forks`](../../scenarios/root-parallel-forks/README.md); [`structured-order-values`](../../scenarios/open-rows/structured-order-values/README.md); [`structured-value-bounds`](../../scenarios/open-rows/structured-value-bounds/README.md) | — |
| PC-DATA-04 | accepted | [`call-activity-data-boundaries`](../../scenarios/call-activity-data-boundaries/README.md); [`concurrent-scope-data`](../../scenarios/concurrent-scope-data/README.md) (does not complete: `undeclared-output` rejections); [`concurrent-mapped-calls`](../../scenarios/concurrent-mapped-calls/README.md) (does not complete: `undeclared-output` rejections); [`scope-reentry`](../../scenarios/scope-reentry/README.md); [`mapping-failure-sites`](../../scenarios/open-rows/mapping-failure-sites/README.md); [`scope-data-visibility`](../../scenarios/open-rows/scope-data-visibility/README.md) | concurrency |
| PC-DATA-05 | slice | [`serial-business-task-composition`](../../scenarios/serial-business-task-composition/README.md); [`concurrent-mapped-calls`](../../scenarios/concurrent-mapped-calls/README.md) (does not complete: `undeclared-output` rejections); [`concurrent-structured-scope-data`](../../scenarios/concurrent-structured-scope-data/README.md); [`root-parallel-forks`](../../scenarios/root-parallel-forks/README.md); [`activity-data-input-user-task`](../../scenarios/activity-data-input-user-task/README.md); [`activity-data-input-output-user-task`](../../scenarios/activity-data-input-output-user-task/README.md) | — |
| PC-DATA-06 | slice | [`serial-business-task-composition`](../../scenarios/serial-business-task-composition/README.md); [`concurrent-mapped-calls`](../../scenarios/concurrent-mapped-calls/README.md) (does not complete: `undeclared-output` rejections); [`concurrent-structured-scope-data`](../../scenarios/concurrent-structured-scope-data/README.md); [`root-parallel-forks`](../../scenarios/root-parallel-forks/README.md); [`activity-data-output-user-task`](../../scenarios/activity-data-output-user-task/README.md); [`activity-data-input-output-user-task`](../../scenarios/activity-data-input-output-user-task/README.md) | — |
| PC-DATA-07 | slice | [`exclusive-gateway-simple-boolean`](../../scenarios/exclusive-gateway-simple-boolean/README.md); [`user-task-boolean-completion`](../../scenarios/user-task-boolean-completion/README.md) | — |
| PC-DATA-08 | absent | — | — |
| PC-DATA-09 | slice | [`structured-process-composition`](../../scenarios/structured-process-composition/README.md) | — |
| PC-HUM-01 | slice | [`scope-reentry`](../../scenarios/scope-reentry/README.md); [`user-task-discovery-completion`](../../scenarios/user-task-discovery-completion/README.md); [`user-task-cycle`](../../scenarios/user-task-cycle/README.md) (does not complete: `undeclared-output` rejections) | — |
| PC-HUM-02 | accepted | [`user-task-assignment-form-metadata`](../../scenarios/user-task-assignment-form-metadata/README.md); [`parallel-user-task-metadata-composition`](../../scenarios/parallel-user-task-metadata-composition/README.md); [`human-task-metadata-composition`](../../scenarios/open-rows/human-task-metadata-composition/README.md) | — |
| PC-HUM-03 | slice | [`message-addressed-receive-task`](../../scenarios/message-addressed-receive-task/README.md) | — |
| PC-HUM-04 | accepted | [`data-declaring-terminal-branches`](../../scenarios/data-declaring-terminal-branches/README.md); [`pass-through-task`](../../scenarios/pass-through-task/README.md); [`pass-through-parallel-branches`](../../scenarios/pass-through-parallel-branches/README.md); [`single-scope-models`](../../scenarios/single-scope-models/README.md); [`terminal-forks`](../../scenarios/terminal-forks/README.md) | — |
| PC-HUM-05 | accepted | [`pass-through-task`](../../scenarios/pass-through-task/README.md); [`pass-through-parallel-branches`](../../scenarios/pass-through-parallel-branches/README.md); [`single-scope-models`](../../scenarios/single-scope-models/README.md); [`terminal-forks`](../../scenarios/terminal-forks/README.md); [`data-declaring-terminal-branches`](../../scenarios/data-declaring-terminal-branches/README.md); [`pass-through-implicit-split-merge`](../../scenarios/pass-through-implicit-split-merge/README.md); [`manual-task-split-merge`](../../scenarios/open-rows/manual-task-split-merge/README.md) | — |
| PC-HUM-06 | accepted | [`addressless-receive-task`](../../scenarios/addressless-receive-task/README.md); [`addressless-receive-compositions`](../../scenarios/open-rows/addressless-receive-compositions/README.md) | — |
| PC-AUTO-01 | slice | [`serial-business-task-composition`](../../scenarios/serial-business-task-composition/README.md); [`service-task-effect`](../../scenarios/service-task-effect/README.md); [`mapped-success-service-task`](../../scenarios/mapped-success-service-task/README.md); [`configured-task`](../../scenarios/configured-task/README.md) | — |
| PC-AUTO-02 | accepted | [`mixed-task-business-error`](../../scenarios/mixed-task-business-error/README.md); [`mapped-boundary-error-service-task`](../../scenarios/mapped-boundary-error-service-task/README.md); [`automation-business-error-routing`](../../scenarios/open-rows/automation-business-error-routing/README.md); [`automation-business-error-non-ancestor`](../../scenarios/open-rows/automation-business-error-non-ancestor/README.md); [`error-java-class-codes`](../../scenarios/open-rows/error-java-class-codes/README.md) | — |
| PC-AUTO-03 | slice | [`service-task-incident`](../../scenarios/service-task-incident/README.md); [`service-task-incident-cancellation`](../../scenarios/service-task-incident-cancellation/README.md) | cancellation |
| PC-AUTO-04 | slice | [`send-task`](../../scenarios/send-task/README.md) | — |
| PC-AUTO-05 | absent | — | — |
| PC-AUTO-06 | absent | — | — |
| PC-AUTO-07 | accepted | [`business-rule-hit-policies`](../../scenarios/open-rows/business-rule-hit-policies/README.md) | — |
| PC-AUTO-08 | accepted | [`business-rule-routing`](../../scenarios/open-rows/business-rule-routing/README.md) | — |
| PC-SCOPE-01 | slice | [`embedded-subprocess-completion`](../../scenarios/embedded-subprocess-completion/README.md); [`concurrent-scope-data`](../../scenarios/concurrent-scope-data/README.md) (does not complete: `undeclared-output` rejections); [`nested-embedded-scope-control`](../../scenarios/nested-embedded-scope-control/README.md); [`nested-embedded-scope-data`](../../scenarios/nested-embedded-scope-data/README.md); [`scope-host-split`](../../scenarios/scope-host-split/README.md) | — |
| PC-SCOPE-02 | slice | [`embedded-subprocess-completion`](../../scenarios/embedded-subprocess-completion/README.md); [`concurrent-embedded-activations`](../../scenarios/concurrent-embedded-activations/README.md); [`concurrent-scope-data`](../../scenarios/concurrent-scope-data/README.md) (does not complete: `undeclared-output` rejections); [`scope-reentry`](../../scenarios/scope-reentry/README.md) | concurrency |
| PC-SCOPE-03 | slice | [`called-process-call-activity`](../../scenarios/called-process-call-activity/README.md) | — |
| PC-SCOPE-04 | accepted | [`call-variable-mapping`](../../scenarios/call-variable-mapping/README.md); [`call-activity-data-boundaries`](../../scenarios/call-activity-data-boundaries/README.md) | — |
| PC-SCOPE-05 | accepted | [`repeated-nested-concurrent-calls`](../../scenarios/repeated-nested-concurrent-calls/README.md); [`call-activity-data-boundaries`](../../scenarios/call-activity-data-boundaries/README.md) | concurrency |
| PC-SCOPE-06 | slice | [`call-activity-data-boundaries`](../../scenarios/call-activity-data-boundaries/README.md) | — |
| PC-SCOPE-07 | absent | — | cancellation |
| PC-MI-01 | slice | [`sequential-multi-instance`](../../scenarios/sequential-multi-instance/README.md); [`parallel-multi-instance`](../../scenarios/parallel-multi-instance/README.md) | Multi-Instance |
| PC-MI-02 | slice | [`multi-instance-service-task`](../../scenarios/open-rows/multi-instance-service-task/README.md) (collection form, identity-level ownership; open: the cardinality generation form, refused, and per-instance argument and result values, deferred to PC-MI-10's mapping surface) | Multi-Instance |
| PC-MI-03 | absent | — | Multi-Instance |
| PC-MI-04 | absent | — | Multi-Instance |
| PC-MI-05 | absent | — | concurrency, Multi-Instance |
| PC-MI-06 | absent | — | Multi-Instance |
| PC-MI-07 | absent | — | Multi-Instance |
| PC-MI-08 | absent | — | Multi-Instance |
| PC-MI-09 | slice | [`sequential-multi-instance`](../../scenarios/sequential-multi-instance/README.md) | Multi-Instance |
| PC-MI-10 | absent | — | Multi-Instance |
| PC-MI-11 | absent | — | concurrency, Multi-Instance |
| PC-MI-12 | slice | [`sequential-multi-instance`](../../scenarios/sequential-multi-instance/README.md); [`parallel-multi-instance`](../../scenarios/parallel-multi-instance/README.md) | cancellation, Multi-Instance |
| PC-TIMER-01 | slice | [`intermediate-catch-timer`](../../scenarios/intermediate-catch-timer/README.md); [`intermediate-catch-timer-alarm-debounce`](../../scenarios/intermediate-catch-timer-alarm-debounce/README.md) | — |
| PC-TIMER-02 | absent | — | — |
| PC-TIMER-03 | absent | — | — |
| PC-TIMER-04 | slice | [`timer-start-event`](../../scenarios/timer-start-event/README.md) | — |
| PC-TIMER-05 | absent | — | — |
| PC-TIMER-06 | slice | [`activity-boundary-timer`](../../scenarios/activity-boundary-timer/README.md); [`non-interrupting-boundary-timer`](../../scenarios/non-interrupting-boundary-timer/README.md); [`subprocess-boundary-timer`](../../scenarios/subprocess-boundary-timer/README.md); [`timer-user-task-composition`](../../scenarios/timer-user-task-composition/README.md); [`repeatable-event-subscriptions`](../../scenarios/repeatable-event-subscriptions/README.md) (refused: `profile.abnormalScopeEnd.withoutOutflow`) | cancellation |
| PC-TIMER-07 | absent | — | concurrency, cancellation |
| PC-TIMER-08 | absent | — | cancellation |
| PC-MESSAGE-01 | absent | — | — |
| PC-MESSAGE-02 | slice | [`message-start-event`](../../scenarios/message-start-event/README.md) | — |
| PC-MESSAGE-03 | slice | [`intermediate-catch-message`](../../scenarios/intermediate-catch-message/README.md); [`message-payload-catch`](../../scenarios/message-payload-catch/README.md); [`portable-business-message-payload`](../../scenarios/portable-business-message-payload/README.md) | — |
| PC-MESSAGE-04 | slice | [`activity-boundary-message`](../../scenarios/activity-boundary-message/README.md) | cancellation |
| PC-MESSAGE-05 | slice | [`repeatable-event-subscriptions`](../../scenarios/repeatable-event-subscriptions/README.md) | — |
| PC-MESSAGE-06 | absent | — | cancellation |
| PC-MESSAGE-07 | absent | — | concurrency |
| PC-MESSAGE-08 | slice | [`message-key-correlation`](../../scenarios/message-key-correlation/README.md) | — |
| PC-MESSAGE-09 | absent | — | — |
| PC-SIGNAL-01 | absent | — | — |
| PC-SIGNAL-02 | absent | — | — |
| PC-SIGNAL-03 | absent | — | cancellation |
| PC-SIGNAL-04 | absent | — | concurrency |
| PC-CONDITION-01 | absent | — | — |
| PC-CONDITION-02 | absent | — | — |
| PC-CONDITION-03 | absent | — | — |
| PC-CONDITION-04 | absent | — | cancellation |
| PC-CONDITION-05 | absent | — | cancellation |
| PC-ERROR-01 | accepted | [`mapped-boundary-error-service-task`](../../scenarios/mapped-boundary-error-service-task/README.md); [`mixed-task-business-error`](../../scenarios/mixed-task-business-error/README.md); [`subprocess-error-propagation`](../../scenarios/subprocess-error-propagation/README.md); [`error-boundary-candidates`](../../scenarios/open-rows/error-boundary-candidates/README.md); [`error-ancestor-search`](../../scenarios/open-rows/error-ancestor-search/README.md); [`error-null-message`](../../scenarios/open-rows/error-null-message/README.md); [`error-catch-variables`](../../scenarios/open-rows/error-catch-variables/README.md); [`error-esp-catch-variables`](../../scenarios/open-rows/error-esp-catch-variables/README.md); [`error-non-interrupting-declarations`](../../scenarios/open-rows/error-non-interrupting-declarations/README.md); [`error-java-class-codes`](../../scenarios/open-rows/error-java-class-codes/README.md); [`error-unhandled`](../../scenarios/open-rows/error-unhandled/README.md); [`error-unhandled-standards`](../../scenarios/open-rows/error-unhandled-standards/README.md); [`error-unhandled-outcomes`](../../scenarios/open-rows/error-unhandled-outcomes/README.md) | cancellation |
| PC-ERROR-02 | absent | — | cancellation |
| PC-ERROR-03 | absent | — | cancellation, Multi-Instance |
| PC-ESCALATION-01 | absent | — | — |
| PC-ESCALATION-02 | absent | — | cancellation |
| PC-ESCALATION-03 | absent | — | cancellation |
| PC-TERMINATE-01 | slice | [`terminate-end-event`](../../scenarios/terminate-end-event/README.md) | cancellation |
| PC-TERMINATE-02 | absent | — | cancellation, Multi-Instance |
| PC-COMPENSATION-01 | absent | — | Compensation and Transaction |
| PC-COMPENSATION-02 | slice | [`compensation`](../../scenarios/compensation/README.md) | Compensation and Transaction |
| PC-COMPENSATION-03 | slice | [`compensation`](../../scenarios/compensation/README.md) | Compensation and Transaction, Multi-Instance |
| PC-COMPENSATION-04 | absent | — | Compensation and Transaction |
| PC-COMPENSATION-05 | absent | — | Compensation and Transaction, Multi-Instance |
| PC-TX-01 | absent | — | Compensation and Transaction |
| PC-TX-02 | slice | [`transaction-cancellation`](../../scenarios/transaction-cancellation/README.md) | Compensation and Transaction |
| PC-TX-03 | absent | — | Compensation and Transaction, Multi-Instance |
| PC-BASIC-01 | accepted | [`none-intermediate-throw`](../../scenarios/none-intermediate-throw/README.md); [`single-scope-models`](../../scenarios/single-scope-models/README.md); [`terminal-forks`](../../scenarios/terminal-forks/README.md); [`data-declaring-terminal-branches`](../../scenarios/data-declaring-terminal-branches/README.md); [`pass-through-implicit-split-merge`](../../scenarios/pass-through-implicit-split-merge/README.md); [`none-event-compositions`](../../scenarios/open-rows/none-event-compositions/README.md) | — |
| PC-BASIC-02 | slice | [`link-events`](../../scenarios/link-events/README.md) | — |
| PC-BASIC-03 | absent | — | — |
| PC-BASIC-04 | accepted | [`user-task-preserved-notation`](../../scenarios/user-task-preserved-notation/README.md); [`user-task-process-data-preserved-notation`](../../scenarios/user-task-process-data-preserved-notation/README.md); [`event-reference-forms`](../../scenarios/open-rows/event-reference-forms/README.md); [`interchange-reference-forms`](../../scenarios/open-rows/interchange-reference-forms/README.md) | — |
| PC-DELIVERY-01 | slice (held) | [`serial-classification`](../../packages/differential/test/fixtures/serial-classification.scenario.json); [`mixed-invoice-rework`](../../packages/differential/test/fixtures/mixed-invoice-rework.scenario.json); [`business-error`](../../packages/differential/test/fixtures/business-error.scenario.json) | — |
| PC-JOURNEY-01 | absent | — | — |
| PC-JOURNEY-02 | slice | [`expense-exception-review`](../../scenarios/expense-exception-review/README.md) (does not complete: `undeclared-output` rejections) | — |
| PC-JOURNEY-03 | absent | — | — |
| PC-JOURNEY-04 | absent | — | — |
| PC-JOURNEY-05 | absent | — | — |
| PC-JOURNEY-06 | absent | — | — |
| PC-JOURNEY-07 | absent | — | — |
| PC-QUALIFY-01 | absent | — | — |
| PC-QUALIFY-02 | absent | — | — |
| PC-QUALIFY-03 | absent (held) | — | — |
| PC-QUALIFY-04 | absent | — | — |
| PC-QUALIFY-05 | absent | — | — |
| PC-QUALIFY-06 | absent | — | — |
| PC-QUALIFY-07 | absent | — | — |
| PC-QUALIFY-08 | absent | — | — |
| PC-QUALIFY-09 | absent | — | — |
| PC-QUALIFY-10 | absent | — | — |
| PC-ACCEPT-01 | absent | — | — |
| PC-ACCEPT-02 | absent | — | — |

### Absent surface

What a row needs beyond a slice is refused at admission with a stable code, never left out of the IL ([forward-compatible restrictions](../../CLAUDE.md#forward-compatible-restrictions)). The codes each admission module can return, read from `Kernel/Admission/` and `Kernel/AdmissionRegistry.lean` on 2026-11-10; the owning [semantics document](semantics/ADMISSION-SEMANTICS-SPEC.md) states when each applies:

| Admission module | Refusal codes |
|---|---|
| [Data](../../Kernel/Admission/Data.lean) | `activity.defaultFlow`, `element.origin.definition`, `element.origin.sourceId`, `flow.condition.foreign`, `mapping.expression` |
| [Flow](../../Kernel/Admission/Flow.lean) | `flow.conditionalOutflow`, `gateway.eventBased.linkArm`, `gateway.eventBased.receiveArm`, `gateway.exclusive.singleConditionWithoutDefault`, `gateway.exclusive.unconditionedFlow`, `gateway.inclusive.conditionalWithoutDefault`, `gateway.inclusive.join`, `il.reference`, `link.catch.incoming`, `link.catch`, `link.duplicateCatch` |
| [Work](../../Kernel/Admission/Work.lean) | `activity.compensationHandler`, `activity.inputMappings`, `activity.multiInstanceBody`, `activity.outputMappings`, `work.call.binding`, `work.call.businessKey`, `work.call.calledElementExpression`, `work.call.calledProcessMissing`, `work.call.dataCorrespondence`, `work.call.multiInstanceCounterOutput`, `work.call.propagateAll`, `work.call.rootProcess`, `work.call.tenant`, `work.receive.correlation`, `work.receive.messageExpression`, `work.rule`, `work.script`, `work.send`, `work.service.unboundImplementation`, `work.user.assignee`, `work.user.candidateGroupExpression`, `work.user.candidateUsers`, `work.user.dueDate`, `work.user.followUpDate`, `work.user.formKey`, `work.user.priority` |
| [Scopes](../../Kernel/Admission/Scopes.lean) | `compensation.implicit`, `compensation.recursive`, `il.reference`, `scope.eventSubProcess.boundary`, `scope.implicitStart`, `scope.localVariableWithoutInput`, `scope.multiInstance`, `scope.transaction.method` |
| [Subscriptions](../../Kernel/Admission/Subscriptions.lean) | `boundary.cancel.host`, `boundary.cancel.nonInterrupting`, `boundary.error.duplicateCode`, `boundary.error.nonInterrupting`, `boundary.signal`, `event.catch.cancel`, `event.catch.compensation`, `event.catch.error`, `event.catch.escalation`, `event.catch.signal`, `event.condition.filter`, `event.condition.foreign`, `event.condition.variableEvents`, `event.error.codeVariable`, `event.error.messageVariable`, `event.escalation.codeVariable`, `event.outputs`, `expression.outsideSimpleBoolean`, `message.correlation.channel`, `message.correlation.keys`, `message.correlation.output`, `message.correlation.value`, `message.correlation`, `message.duplicateName`, `message.nameExpression`, `message.unnamed`, `message.unspecified`, `scope.eventSubProcess.interruptingMessage`, `start.cancel`, `start.compensation`, `start.condition`, `start.error.nonInterrupting`, `start.error`, `start.escalation`, `start.message.outputs`, `start.messageNameExpression`, `start.signal`, `timer.cron`, `timer.cycle`, `timer.cycleNotAttached`, `timer.date`, `timer.duration` |
| [Multi-Instance](../../Kernel/Admission/MultiInstance.lean) | `expression.outsideSimpleBoolean`, `multiInstance.cardinality`, `multiInstance.collectionExpression`, `multiInstance.completionConditionExpression`, `multiInstance.elementVariable`, `multiInstance.inputDataItem`, `multiInstance.instanceResult`, `multiInstance.mappings`, `multiInstance.mutableCollection`, `multiInstance.outputDataItem` |
| [Propagation](../../Kernel/Admission/Propagation.lean) | `throw.cancel.outsideTransaction`, `throw.compensation.activity`, `throw.compensation.asynchronous`, `throw.error.message`, `throw.message`, `throw.signal` |
| [Admission registry](../../Kernel/AdmissionRegistry.lean) | `activity.compensationHandler.input`, `compensation.handlerMultiInstance`, `compensation.handlerWork`, `process.definition.binding`, `scope.implicitStart` |
| [Profile options](../../Kernel/Admission/Profile.lean) | `profile.abnormalScopeEnd.withoutOutflow`, `profile.callBindingTime.invocation`, `profile.compensationHandlerFailure.selected`, `profile.compensationOrder.reverseCreation`, `profile.deliveryVariables.installs`, `profile.evaluator.juel`, `profile.messageCorrelation.apiCriteria`, `profile.timerZone` |

## Open proof lanes

The kernel has no `Kernel.Laws` or `Kernel.Proofs` module (2026-11-09); Lean is the executable specification every scenario checks. The four lanes the 2026-10-14 assurance rule made `proved` are deliberately open until the coverage rows close, when the proof wave proves `Step` sound against the `Laws` ([Lean assurance lane](ARCHITECTURE-SPEC.md#lean-assurance-lane), [owner decision](ARCHITECTURE-SPEC.md#owner-decisions-on-the-path)). The row table names the lanes each row depends on.

| Lane | Covers | Reopen trigger |
|---|---|---|
| concurrency | order invariance of concurrent branches, regions, races and concurrent occurrences | coverage closure (PC-ACCEPT-01) |
| cancellation | subtree removal, interruption and late-result rejection | coverage closure (PC-ACCEPT-01) |
| Compensation and Transaction | completed-work retention, snapshots, handler order and Cancel propagation | coverage closure (PC-ACCEPT-01) |
| Multi-Instance | body identity, completion accounting, isolation and outer interruption | coverage closure (PC-ACCEPT-01) |

The rows that stay `done` closed on lanes of the deleted library; their former theorems are open lanes on the kernel, with the same reopen trigger:

| Row | Former lane | Former evidence |
|---|---|---|
| PC-DATA-01 | checked: portable value domain and wire admission | [portable business values](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#lean-assurance-lane) |
| PC-HUM-04 | checked: pass-through lowering and admission checks; the closure burst bound was never proved | [pass-through Tasks](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/capsules/PASS-THROUGH-TASK-SPEC.md#lean-assurance-lane) |
| PC-HUM-04 | proved: the declared terminal-branch entry pair law | [data-declaring terminal branches](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/capsules/DATA-DECLARING-TERMINAL-BRANCHES-SPEC.md#lean-assurance-lane) |
| PC-SCOPE-04 | proved: input snapshot installation, caller/callee isolation, nearest-owner output writes and frame retirement | [Call variable mapping](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/capsules/CALL-VARIABLE-MAPPING-SPEC.md#lean-assurance-lane) |
| PC-SCOPE-05 | proved: called-process association validity and invocation and return soundness | [repeated, nested and concurrent Calls](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#lean-assurance-lane) |

## Assurance and adoption

| Subject | State on 2026-11-09 |
|---|---|
| Lean and TypeScript kernels | agree on every discovered scenario and population scenario ([oracle](../../packages/differential/test/kernel-behavior-oracle.integration-test.ts)); admission refusals are tested per feature under `packages/kernel/test/admission-refusals-*.test.ts` |
| CIB Seven evidence | retained for 27 scenarios and compared at the CIB observation boundary; every other scenario has none, so its CIB relation is unwitnessed |
| Temporal host | the W0.3b witnesses are [host.temporal-test.ts](../../packages/temporal-host/test/host.temporal-test.ts) (start, effect and command; delivery; timer; chain handoff; correlated delivery; schedule start; replay determinism) and [temporal-host-target.temporal-test.ts](../../packages/differential/test/temporal-host-target.temporal-test.ts) (the host returns the kernel's result on every single-instance scenario); they run only in the hosted lane, and their result is W0's hosted exit evidence in [PLAN](../PLAN.md#w0-the-kernel) |
| Temporal defects | TD-001 to TD-005 keep their dispositions in the [Temporal defects ledger](../TEMPORAL-DEFECTS-LEDGER.md); PC-DELIVERY-01 and PC-QUALIFY-03 stay held and are re-qualified against the generic Temporal host ([owner decision](ARCHITECTURE-SPEC.md#owner-decisions-on-the-path)) |
| Product 2 | consumes the engine API on the kernel host; disclosure per row comes from the generated capability catalog ([definition of done](ARCHITECTURE-SPEC.md#definition-of-done-for-a-row)) |
| A12 adoption | none claimed; the [A12 adoption fixtures](../../adoption/a12/current/README.md) keep the pre-kernel scenario shape and CIB 2.0.0 draft profiles, so no kernel runner reads them; the [A12 add-on boundary](../A12-ADD-ON-BOUNDARY-SPEC.md) owns any future add-on |
