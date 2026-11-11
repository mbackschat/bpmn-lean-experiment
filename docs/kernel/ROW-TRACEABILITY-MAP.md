# Row traceability

Data for guard 21 ([kernel architecture](ARCHITECTURE-SPEC.md#guardrails-against-degradation)). It maps the 115 rows of the [coverage target](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) onto the kernel shape and freezes after the shape commit. Measured on 2026-11-08 against `Kernel/IL/Types.lean`, `Kernel/State.lean` and `Kernel/Hooks.lean` in the uncommitted working tree on `ee0bb468`, which already carries most of the lifecycle seam, and against the root's W0.1 correction design for Occurrence, Continuation, Leave and `Signal.complete`.

## Lifecycle fit

Every open row maps onto the lifecycle design after the ten amendments below. As written in the design, 50 rows do not map, and 7 integration rows inherit a gap from a row they consume. No gap is specific to one row, and none replaces Occurrence, Continuation, Leave or `Signal.complete`. The other 58 rows map as written. The design's named reversal condition does not fire: a join ends one activity instance per arrival, and the Multi-Instance body is expressible once its numbering stays apart (F10).

| Gap | Design element | Why the rows do not map | Amendment | Rows |
|---|---|---|---|---|
| F1 | `OpenItem.occurrence : Nat` | An armed boundary, Event Sub-Process start or Event-Based arm has no begun occurrence: CIB declares the subscription on the event scope and starts the activity instance only when the event is received (`BpmnParse:3288-3298`). One repeating subscription also starts many occurrences. | `OpenItem.owner : ItemOwner`, either a begun occurrence or a subscription with its own activation. | PC-CF-05, PC-TIMER-06, PC-TIMER-07, PC-TIMER-08, PC-MESSAGE-04, PC-MESSAGE-05, PC-MESSAGE-06, PC-MESSAGE-07, PC-SIGNAL-02, PC-SIGNAL-03, PC-CONDITION-03, PC-CONDITION-04, PC-CONDITION-05, PC-MI-12 |
| F2 | `Leave`, pipeline steps 3 and 4 | An Error exit is not a completion: it must skip retention and outflow ([BPMN 2.0.2 §13.5.5](../reference/bpmn-2.0.2/README.md), presumed abort), yet CIB applies outputs on it (CIB-EXT-0016, `BpmnExceptionHandler:107`). `clearInside` cannot write and `Signal.complete` always retains and continues. | `Leave.aborted (raising : Option Raised)`: disarm and write, then skip retention and continuation, raise, journal `ended cancelled`. | PC-AUTO-02, PC-SCOPE-06, PC-ERROR-01, PC-ERROR-03, PC-ESCALATION-03, PC-COMPENSATION-03 |
| F3 | `hooks.writeOutputs ctx occurrence writes` | A write can have no ending occurrence: a non-interrupting Escalation crossing a Call passes outputs while the Call runs on (`EscalationHandler:60`, `EscalationEventSubprocessTest#testPropagateOutputVariablesTwoTimes`), and an external variable command ends nothing. | `Signal.write (scope) (writes)` through the same Data hook, which `Signal.complete` reuses. | PC-SCOPE-06, PC-ESCALATION-03, PC-CONDITION-01, PC-CONDITION-04, PC-CONDITION-05 |
| F4 | Section 2: "boundaries apply to instances" | Boundaries belong to the Multi-Instance body: CIB sets their event scope to it (`BpmnParse:3291-3295`) and BPMN §13.5.3 cancels all instances. As written, each instance arms its own boundaries, and the raise search would catch at instance level. Compensation boundaries are the exception (`BpmnParse:891-895`). | Arm only when `Continuation` is not `.multiInstance`; `Ctx.scopeRole` tells Propagation the role, since Step alone matches `Continuation`. | PC-TIMER-08, PC-MESSAGE-04, PC-SIGNAL-03, PC-CONDITION-04, PC-ERROR-03, PC-ESCALATION-02, PC-MI-12, PC-TX-03 |
| F5 | Pipeline steps 3 and 5; `completeScope` | No step owns disposal of the scope occurrence. `hooks.completed` needs it alive for the snapshot and the inner retained records, and `leaveScope` deletes those records. CIB moves them into an event-scope tree at leave (`CompensationUtil.createEventScopeExecution`, `SubProcessActivityBehavior:63`). | A pipeline step after `hooks.completed` disposes the owned scope; `FeatureSlots.clear` drops records only on cancellation. | PC-DATA-04, PC-COMPENSATION-02, PC-COMPENSATION-03, PC-COMPENSATION-05, PC-TX-01, PC-TX-03 |
| F6 | `ScopeOccurrence.occurrence` owner list; idle completion | An Activity with input mappings owns local variables with an Activity lifetime, which outputs and Conditions read (CIB-EXT-0015, `BoundaryConditionalEventTest#testSetVariableInInputMapping`). No such owner exists, and idle completion answers `scope-occurrence-without-scope`. | Allow an Activity occurrence as owner; idle completion skips it and the F5 step disposes it. | PC-DATA-04, PC-DATA-05, PC-DATA-06, PC-HUM-01, PC-AUTO-01, PC-AUTO-02, PC-MI-10, PC-CONDITION-04 |
| F7 | Pipeline entry | `Signal.complete` can name an occurrence an earlier signal removed. CIB leaves a Signal thrower only after its receivers ran (`ThrowSignalEventActivityBehavior#execute`, `SignalEventTest#testNoContinuationWhenSignalInterruptsThrowingActivity`). The result is undefined. | An absent occurrence drops the signal. | PC-SIGNAL-03, PC-CONDITION-05 |
| F8 | "`clearInside` removes the occurrences inside" | A Terminate End runs inside the region it clears, so its own occurrence would journal `cancelled`. CIB cancels the concurrent work and then ends the End Event normally (`TerminateEndEventActivityBehavior`, `INTERRUPT_FLOW_SCOPE`). | `clearInside` takes `keep : Option Nat`. | PC-TERMINATE-01, PC-TERMINATE-02 |
| F9 | `Step.begin (element) (scope) (continuation)`; "replaces `Arrival`" | `Occurrence` drops the arrival flow that per-flow joins need. A Boundary is not an `Element`, so the begin dispatch has no arm for it. A fired catch or Link catch must begin without re-subscribing. | `Occurrence.entry : Entry` (`token flow` or `triggered values`); begin resolves boundaries through `Program.boundary?`. | PC-CF-03, PC-CF-04, PC-CF-05, PC-CF-08, PC-BASIC-02, PC-ERROR-01, PC-ERROR-02, PC-ESCALATION-02, PC-ESCALATION-03, PC-TX-02, PC-TIMER-06, PC-TIMER-07, PC-TIMER-08, PC-MESSAGE-04, PC-MESSAGE-05, PC-MESSAGE-06, PC-MESSAGE-07, PC-SIGNAL-02, PC-SIGNAL-03, PC-CONDITION-03, PC-CONDITION-04, PC-CONDITION-05 |
| F10 | Section 1: body and instances are "ordinary occurrences of the element" | One counter makes the first instance activation 2 and makes every instance identity depend on body entries. CIB gives the body its own activity id (`BpmnParse:185`, `:1808`). | Key the counter by `(instance, element, ActivationRole)`; the journal carries the role. | PC-MI-01 to PC-MI-12 |

Status of the amendments in the working tree after the W0.1 audit fixes, measured 2026-11-08:

| Gap | Status | Evidence, or what remains |
|---|---|---|
| F1 | closed | Reservation: `Occurrence.begun`, `State.reserve`; a repeating subscription reserves afresh per firing (`completeFiring`). The table cites `Occurrence.begun` instead of the `ItemOwner` first proposed. |
| F2 | closed | `Leave.raised` writes, then skips retention and continuation (`Step.complete`); the raise is a separate signal. |
| F3 | closed | `Signal.write` and `Signal.remove` write without ending an occurrence; the variable commands use them. |
| F4 | closed | Work, Scopes and Call arm no boundaries when the envelope is Multi-Instance; `arriveMultiInstance` arms them at the body, and `Ctx.scopeRole` answers `multiInstanceInstance` for an instance scope and a scope its occurrence owns. |
| F5 | closed | `hooks.completed` precedes `removeOccurrence`, and a completed Sub-Process's retained records move into `Compensable.children`. |
| F6 | closed | An Activity with inputs owns a scope occurrence (`Work.arriveActivity`); idle completion skips it (`Step.activityLocal`) and `removeOccurrence` disposes it. |
| F7 | closed | `Step.complete` and `Signal.fire` drop a signal whose occurrence or item is gone. |
| F8 | closed | `clearInside (keep)`. |
| F9 | closed | `Occurrence.incoming`, `BeginRequest.reserved`, boundaries begun through `completeFiring`. |
| F10 | closed | `State.activate` keys `(instance, element, ActivationRole)`, and the journal carries the role. |

An unavailable InputSet holds its token in `FeatureSlots.held` (BPMN 2.0.2 §10.4.2), decided by the owner on 2026-11-08 because `activity-data-input-absent` and `activity-data-input-output-absent` depend on it. Publishing the hold and releasing it when the source is set land with the rows that need them.

Inherited, through the rows they consume: PC-DELIVERY-01 (F2), PC-JOURNEY-02 (F2, F3), PC-JOURNEY-03 and PC-JOURNEY-04 (F4, F10), PC-JOURNEY-05 (F1, F9), PC-JOURNEY-06 (F1, F9), PC-JOURNEY-07 (F2, F5). A journey row carries `L.consumes` instead of the amendment tokens.

Two design claims were checked and hold. A join ends one activity instance per arriving token: each recyclable execution is ended on its own (`PvmExecutionImpl#leaveActivityViaTransitions:1062-1086`). A completed parent continues normally after an interrupting Event Sub-Process or a Terminate, because `EventSubProcessActivityBehavior#complete` falls through to `SubProcessActivityBehavior#complete`, which leaves.

## Table grammar

Each cell is a comma-separated token list; `-` means empty. A token is a Lean name. Suffix `+` means NEW, declared in [Shape delta](#shape-delta). Suffix `~` means present with a changed type. No suffix means present in the code today. `O.<field>` is a field of `ProfileOptions`. `L.*`, `X.*` and `P.*` are the points listed below. A refusal token is a stable admission code. The last column is `no`, or `yes:` and the row's clause. By owner decision of 2026-11-08 every profile selects Simple Boolean and no part of the solution depends on a JVM, so a `yes` row is owner-held for that acceptance and never closes on Simple Boolean. Fixture names resolve under `packages/kernel/test/fixtures/rows/`; `n/a` marks a row that reads no IL.

| Token | Point | State |
|---|---|---|
| `L.begin` | `Step.begin` | design |
| `L.complete.outgoing` | `Signal.complete` with `Leave.outgoing` | design |
| `L.complete.flows` | `Signal.complete` with `Leave.flows` | design |
| `L.leave` | `hooks.leave`, disarm | design |
| `L.writeOutputs` | `hooks.writeOutputs`, owned by Data | design |
| `L.completed` | `hooks.completed`, retention | design |
| `L.outflow` | `hooks.outflow` | design |
| `L.instanceCompleted` | `hooks.instanceCompleted` | design |
| `L.handlerCompleted` | `hooks.handlerCompleted` | design |
| `L.cancelled` | `hooks.cancelled` | design |
| `L.completeScope` | `hooks.completeScope` | design |
| `L.completeCall` | `hooks.completeCall` | design |
| `L.completeBody` | `hooks.completeBody` | design |
| `L.written` | `hooks.written`, drains `State.writes` | design |
| `L.clearInside` | generic subtree removal | design |
| `L.consumes` | composition of rows it consumes, no own point | n/a |
| `L.ownerSubscription+` | F1 | amendment |
| `L.complete.aborted+` | F2 | amendment |
| `L.write+` | F3 | amendment |
| `L.armBody+` | F4 | amendment |
| `L.dispose+` | F5 | amendment |
| `L.activityScope+` | F6 | amendment |
| `L.stale+` | F7 | amendment |
| `L.keepOccurrence+` | F8 | amendment |
| `L.entry+` | F9 | amendment |
| `L.bodyActivation+` | F10 | amendment |
| `L.effectAtEvent+` | effect result on a throw Event's occurrence, routed by Step | amendment |
| `X.error` | `Hooks.catches`: `Raised.error` against `Trigger.error`, exact before catch-all | present |
| `X.escalation` | `Hooks.catches`: `Raised.escalation` against `Trigger.escalation`, exact before catch-all | present |
| `X.compensation` | `Hooks.catches`: `Raised.compensation` against `Trigger.compensation` | present |
| `X.cancel` | `Hooks.catches`: `Raised.cancel` against `Trigger.cancel` | present |
| `X.eventStart` | `Hooks.eventStart` | present |
| `P.correlate` | `Hooks.correlates` through `Kernel.Population` | present |
| `P.correlateCriteria+` | Population match over `CorrelationMatch` | NEW |
| `P.start+` | start selection by trigger and definition version | NEW |
| `P.broadcast+` | Population drain of `State.outbox` | NEW |
| `P.bind+` | called-definition version binding | NEW |

## Row table

| Row | Fixture | IL fields | State slots | Inputs | Waits | Lifecycle | Options | Refusals | needs-expression-beyond-simple-boolean |
|---|---|---|---|---|---|---|---|---|---|
| PC-CF-02 | PC-CF-02.json | GatewayKind.exclusive~, Flow.condition+ | State.tokens | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.complete.flows | O.noOutgoingFlow+ | gateway.exclusive.singleConditionWithoutDefault+, gateway.exclusive.unconditionedFlow+, gateway.exclusive.noOutgoingFlow+, expression.outsideSimpleBoolean+ | yes: over typed conditions |
| PC-CF-03 | PC-CF-03.json | GatewayKind.parallel, GatewayPayload.incoming | FeatureSlots.parked, State.occurrences | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.entry+, L.complete.flows | - | - | no |
| PC-CF-04 | PC-CF-04.json | GatewayKind.inclusive~, Flow.condition+ | FeatureSlots.parked, State.occurrences | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.entry+, L.complete.flows | O.noOutgoingFlow+, O.inclusiveJoinReach+ | gateway.inclusive.noOutgoingFlow+ | no |
| PC-CF-05 | PC-CF-05.json | GatewayKind.eventBased, EventArm.target, Subscription.trigger | Occurrence.begun, OpenItem.attachedTo | Input.deliver, Input.timerFire | OpenKind.message, OpenKind.timer, OpenKind.signal+, OpenKind.conditional+ | L.begin, L.ownerSubscription+, L.entry+, L.leave, L.complete.flows | - | gateway.eventBased.receiveArm+, gateway.eventBased.linkArm+ | no |
| PC-CF-06 | PC-CF-06.json | Envelope.incoming, Envelope.outgoing | State.occurrences, State.activations~ | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.complete.outgoing | - | - | no |
| PC-CF-07 | PC-CF-07.json | Flow.condition+, Envelope.defaultFlow+, Envelope.incoming, Envelope.outgoing | State.tokens | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.complete.outgoing, L.outflow | O.noOutgoingFlow+ | flow.conditionalOutflow+ | no |
| PC-CF-08 | PC-CF-08.json | GatewayKind.parallel, GatewayKind.inclusive~, GatewayKind.eventBased | FeatureSlots.parked, State.occurrences | Input.command, Input.deliver | OpenKind.userTask, OpenKind.message | L.begin, L.entry+, L.complete.flows | - | - | no |
| PC-DATA-01 | PC-DATA-01.json | Value | State.variables | StartInput.variables | - | - | - | - | no |
| PC-DATA-02 | PC-DATA-02.json | Value | State.variables | StartInput.variables, CommandAction.completeUserTask | OpenKind.userTask | L.writeOutputs | O.submission+ | - | no |
| PC-DATA-03 | PC-DATA-03.json | Value, Mapping.source | State.variables | StartInput.variables, CommandAction.completeUserTask, EffectOutcome.success | OpenKind.userTask, OpenKind.effect | L.writeOutputs | - | - | no |
| PC-DATA-04 | PC-DATA-04.json | ScopePayload.localVariables, Envelope.inputs, Envelope.outputs | State.variables, ScopeOccurrence.occurrence, State.occurrences | CommandAction.completeUserTask, EffectOutcome.success | OpenKind.userTask, OpenKind.effect | L.begin, L.activityScope+, L.dispose+, L.writeOutputs | O.undeclaredWrite+, O.scopeChainSubmissionBytes | - | no |
| PC-DATA-05 | PC-DATA-05.json | Envelope.inputs, Mapping.dialect+, Mapping.source | State.variables, ScopeOccurrence.occurrence, EffectDetail.arguments | Input.start, Input.command | OpenKind.userTask, OpenKind.effect | L.begin, L.activityScope+ | - | mapping.dialect+, expression.outsideSimpleBoolean+ | yes: literal/reference/structured/expression input mappings |
| PC-DATA-06 | PC-DATA-06.json | Envelope.outputs, Mapping.target, Mapping.dialect+ | State.variables, ScopeOccurrence.occurrence | CommandAction.completeUserTask, EffectOutcome.success | OpenKind.userTask, OpenKind.effect | L.activityScope+, L.writeOutputs, L.complete.outgoing | O.undeclaredWrite+ | - | no |
| PC-DATA-07 | PC-DATA-07.json | Expression.foreign | - | - | - | L.begin | - | expression.outsideSimpleBoolean+ | yes: Implement the adopted bounded read-only CIB/JUEL execution binding |
| PC-DATA-08 | PC-DATA-08.json | Flow.condition+, InstanceCount.collection, InstanceCount.cardinality, MultiInstance.completionCondition | MultiInstanceRun.collection | - | - | L.outflow, L.instanceCompleted | - | expression.outsideSimpleBoolean+ | yes: Useful bounded branch, collection/cardinality and MI completion expressions |
| PC-DATA-09 | PC-DATA-09.json | Mapping.dialect+, Mapping.source | Failure.rolledBack, FeatureSlots.held | Input.effectResult | - | L.begin, L.writeOutputs | O.continuationFailure+ | expression.outsideSimpleBoolean+ | yes: wrong result type and throwing evaluator |
| PC-HUM-01 | PC-HUM-01.json | UserWork.name, Envelope.inputs, Envelope.outputs | UserTaskDetail.inputs, State.occurrences, ScopeOccurrence.occurrence | CommandAction.completeUserTask, CommandInput.occurrence | OpenKind.userTask | L.begin, L.activityScope+, L.writeOutputs, L.complete.outgoing | O.submission+, O.scopeChainSubmissionBytes | - | no |
| PC-HUM-02 | PC-HUM-02.json | UserWork.assignee, UserWork.candidateUsers, UserWork.candidateGroups, UserWork.formKey, UserWork.formFields, UserWork.dueDate, UserWork.followUpDate, UserWork.priority | UserTaskDetail.assignee+, UserTaskDetail.candidateUsers+, UserTaskDetail.candidateGroups, UserTaskDetail.formKey+, UserTaskDetail.formFields, UserTaskDetail.dueDate+, UserTaskDetail.followUpDate+, UserTaskDetail.priority+ | CommandAction.completeUserTask | OpenKind.userTask | L.begin | - | work.user.candidateGroupExpression, work.user.assignee+, work.user.formKey+, work.user.dueDate+, work.user.followUpDate+, work.user.priority+ | no |
| PC-HUM-03 | PC-HUM-03.json | ReceiveWork.message, MessageTrigger.correlation, Envelope.outputs | MessageWaitDetail.channel, MessageWaitDetail.payload | Input.deliver, DeliveryInput.payload | OpenKind.message | L.begin, L.writeOutputs, L.complete.outgoing | O.messageCorrelation+ | work.receive.correlation, work.receive.messageExpression | no |
| PC-HUM-04 | PC-HUM-04.json | Work.none | State.tokens | - | - | L.begin, L.complete.outgoing | - | - | no |
| PC-HUM-05 | PC-HUM-05.json | Work.manual, Header.sourceType | State.tokens | - | - | L.begin, L.complete.outgoing | - | - | no |
| PC-HUM-06 | PC-HUM-06.json | ReceiveWork.message, MessageTrigger.messageRef, MessageTrigger.name | MessageWaitDetail.channel, OpenItem.element | Input.deliver, DeliveryInput.occurrence | OpenKind.message | L.begin, L.complete.outgoing | - | - | no |
| PC-AUTO-01 | PC-AUTO-01.json | ServiceWork.protocol, ServiceWork.operation, Envelope.inputs, Envelope.outputs, Envelope.asyncBefore+ | EffectDetail.protocol, EffectDetail.operation, EffectDetail.arguments, ScopeOccurrence.occurrence | Input.effectResult, EffectOutcome.success | OpenKind.effect | L.begin, L.activityScope+, L.writeOutputs, L.complete.outgoing | - | activity.asyncAfter+ | no |
| PC-AUTO-02 | PC-AUTO-02.json | ServiceWork.operation, Envelope.outputs, Boundary.subscription, ErrorTrigger.code | EffectDetail.arguments, ScopeOccurrence.occurrence | EffectOutcome.businessFailure | OpenKind.effect | L.activityScope+, L.complete.aborted+, X.error | O.errorPathOutputs+ | - | no |
| PC-AUTO-03 | PC-AUTO-03.json | ServiceWork.operation | IncidentDetail.generation, IncidentDetail.cancellable, EffectDetail.failures | EffectOutcome.technicalFailure, CommandAction.retryIncident, CommandAction.cancelIncidentProcess | OpenKind.effect, OpenKind.incident | L.begin, L.cancelled | O.technicalFailure+, O.incidentProcessCancellation | - | no |
| PC-AUTO-04 | PC-AUTO-04.json | SendWork.binding~, SendWork.recipient, SendWork.correlation, SendWork.messageRef+, SendWork.operationRef+, Envelope.inputs | EffectDetail.send+ | Input.effectResult, EffectOutcome.success | OpenKind.effect | L.begin, L.complete.outgoing | - | work.send, work.send.messageRef+, work.send.operationRef+, work.send.output+ | no |
| PC-AUTO-05 | n/a | ScriptWork.format, ScriptWork.source | - | - | - | - | - | work.script, work.script.format+ | yes: Select and approve one usable Script contract |
| PC-AUTO-06 | PC-AUTO-06.json | ScriptWork.format, ScriptWork.source, ScriptWork.resultVariable | EffectDetail.arguments | Input.effectResult | OpenKind.effect | L.begin, L.writeOutputs, L.complete.outgoing | - | work.script | yes: Two source-derived transformations |
| PC-AUTO-07 | n/a | RuleWork.decision, RuleWork.binding+, RuleWork.resultMapping+ | - | - | - | - | - | work.rule, work.rule.resultMapping+ | no |
| PC-AUTO-08 | PC-AUTO-08.json | RuleWork.decision, RuleWork.resultVariable, RuleWork.resultMapping+ | EffectDetail.arguments | Input.effectResult | OpenKind.effect | L.begin, L.writeOutputs, L.outflow | - | work.rule | no |
| PC-SCOPE-01 | PC-SCOPE-01.json | ScopeKind.embedded, ScopePayload.children | State.scopes, ScopeOccurrence.occurrence | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.completeScope, L.complete.outgoing | - | - | no |
| PC-SCOPE-02 | PC-SCOPE-02.json | ScopeKind.embedded, ScopePayload.localVariables | State.scopes, State.activations~ | Input.command | OpenKind.userTask | L.begin, L.completeScope, L.complete.outgoing | - | - | no |
| PC-SCOPE-03 | PC-SCOPE-03.json | CallWork.calledElement, CallWork.binding, CallWork.tenant+, CalledProcess.definition, DefinitionRef.key, DefinitionRef.version, DefinitionRef.versionTag+, DefinitionRef.deployment+, DefinitionRef.tenant+, DefinitionRef.sourceSha256+, Header.origin+ | InstanceData.definition+ | Input.start | OpenKind.userTask | L.begin, P.bind+ | O.callBindingTime+ | work.call.binding, work.call.calledElementExpression, work.call.unresolved+, work.call.ambiguous+ | no |
| PC-SCOPE-04 | PC-SCOPE-04.json | CallWork.inputs, CallWork.outputs, Mapping.dialect+ | ScopeOccurrence.calledInstance | CommandAction.completeUserTask | OpenKind.userTask | L.begin, L.completeCall, L.complete.outgoing | - | work.call.propagateAll | no |
| PC-SCOPE-05 | PC-SCOPE-05.json | CallWork.calledElement, CallWork.inputs, CallWork.outputs | ScopeOccurrence.calledInstance, State.activations~ | Input.command, CommandInput.occurrence | OpenKind.userTask | L.begin, L.completeCall, L.complete.outgoing | - | - | no |
| PC-SCOPE-06 | PC-SCOPE-06.json | CallWork.outputs, Boundary.subscription, ErrorTrigger.code, EscalationTrigger.code | ScopeOccurrence.calledInstance | Input.command, EffectOutcome.businessFailure | OpenKind.userTask, OpenKind.effect | L.complete.aborted+, L.write+, L.cancelled, X.error, X.escalation | O.errorPathOutputs+ | - | no |
| PC-SCOPE-07 | PC-SCOPE-07.json | Boundary.interrupting, ScopeKind.embedded | State.scopes, State.occurrences, FeatureSlots.parked, FeatureSlots.held | Input.timerFire, Input.deliver | OpenKind.timer, OpenKind.message, OpenKind.userTask, OpenKind.effect | L.clearInside, L.cancelled | - | - | no |
| PC-MI-01 | PC-MI-01.json | MultiInstance.mode, MultiInstance.count, MultiInstance.elementVariable, Work.user | MultiInstanceRun.instances, State.activations~ | CommandAction.completeUserTask | OpenKind.userTask | L.begin, L.bodyActivation+, L.instanceCompleted, L.completeBody | - | multiInstance.collectionExpression, multiInstance.cardinality, multiInstance.elementVariable | no |
| PC-MI-02 | PC-MI-02.json | MultiInstance.mode, MultiInstance.count, MultiInstance.asyncBefore, MultiInstance.asyncAfter, MultiInstance.loopDataInputRef, MultiInstance.inputDataItemName, Work.service | MultiInstanceRun.instances, Iteration.completed~, EffectDetail.arguments | EffectOutcome.success, EffectOutcome.technicalFailure | OpenKind.effect, OpenKind.incident | L.begin, L.bodyActivation+, L.instanceCompleted, L.completeBody | O.multiInstanceBinding | activity.multiInstanceBody, multiInstance.instanceResult | no |
| PC-MI-03 | PC-MI-03.json | MultiInstance.mode, MultiInstance.count, Work.call, CallWork.inputs, CallWork.outputs | MultiInstanceRun.instances, ScopeOccurrence.calledInstance | CommandAction.completeUserTask | OpenKind.userTask | L.begin, L.bodyActivation+, L.completeCall, L.instanceCompleted, L.completeBody | - | activity.multiInstanceBody | no |
| PC-MI-04 | PC-MI-04.json | MultiInstance.mode, MultiInstance.count, ScopeKind.embedded, Envelope.inputs | MultiInstanceRun.instances, State.scopes | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.bodyActivation+, L.completeScope, L.instanceCompleted, L.completeBody | - | scope.multiInstance | no |
| PC-MI-05 | PC-MI-05.json | MultiInstance.mode, MultiInstance.count, ScopeKind.embedded, Envelope.inputs | MultiInstanceRun.instances, State.scopes | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.begin, L.bodyActivation+, L.completeScope, L.instanceCompleted, L.completeBody, L.cancelled | - | scope.multiInstance | no |
| PC-MI-06 | PC-MI-06.json | InstanceCount.cardinality, ScopeKind.embedded | MultiInstanceRun.instances | Input.command | OpenKind.userTask | L.begin, L.bodyActivation+, L.instanceCompleted, L.completeBody | - | multiInstance.cardinality, multiInstance.cardinalityDomain+ | no |
| PC-MI-07 | PC-MI-07.json | InstanceCount.collection, InstanceCount.cardinality, MultiInstance.elementVariable | MultiInstanceRun.collection, MultiInstanceRun.instances | - | - | L.begin, L.bodyActivation+, L.instanceCompleted | - | multiInstance.collectionExpression | yes: Useful typed collection/cardinality expressions |
| PC-MI-08 | PC-MI-08.json | MultiInstance.mutableCollection~, InstanceCount.collection | MultiInstanceRun.collection | CommandAction.completeUserTask, CommandAction.setVariables+ | OpenKind.userTask | L.bodyActivation+, L.instanceCompleted | O.continuationFailure+ | multiInstance.mutableCollection | no |
| PC-MI-09 | PC-MI-09.json | MultiInstance.completionCondition, MultiInstance.mode | MultiInstanceRun.instances | CommandAction.completeUserTask | OpenKind.userTask | L.bodyActivation+, L.instanceCompleted, L.completeBody, L.cancelled | O.multiInstanceFinalBody+ | multiInstance.completionConditionExpression | yes: Useful typed completion predicates |
| PC-MI-10 | PC-MI-10.json | Envelope.inputs, Envelope.outputs, MultiInstance.inputDataItem, MultiInstance.outputDataItem, MultiInstance.outputCollection | ScopeOccurrence.occurrence, State.variables | CommandAction.completeUserTask, EffectOutcome.success | OpenKind.userTask, OpenKind.effect | L.bodyActivation+, L.activityScope+, L.writeOutputs, L.instanceCompleted | O.multiInstanceOutputs+, O.undeclaredWrite+ | multiInstance.mappings, multiInstance.outputDataItem, multiInstance.inputDataItem | no |
| PC-MI-11 | PC-MI-11.json | MultiInstance.mode, ScopeKind.embedded | MultiInstanceRun.scope, State.activations~ | Input.command | OpenKind.userTask | L.begin, L.bodyActivation+, L.completeBody, L.cancelled | - | multiInstance.compositionCell+ | no |
| PC-MI-12 | PC-MI-12.json | Envelope.boundaries, Boundary.interrupting, MultiInstance.mode | MultiInstanceRun.scope, Occurrence.begun, OpenItem.attachedTo | Input.timerFire, Input.deliver, Input.command, Input.effectResult | OpenKind.timer, OpenKind.message, OpenKind.userTask, OpenKind.effect | L.bodyActivation+, L.ownerSubscription+, L.armBody+, L.clearInside, L.cancelled | - | - | no |
| PC-TIMER-01 | PC-TIMER-01.json | TimerSchedule.duration, TimerSchedule.date | TimerDetail.deadlineMs | Input.timerFire, TimerInput.logicalTimeMs | OpenKind.timer | L.begin, L.complete.outgoing | O.timerZone+ | timer.duration, timer.date | no |
| PC-TIMER-02 | PC-TIMER-02.json | TimerSchedule.cycle, CycleDialect.iso8601, CycleDialect.cron | TimerDetail.period~, TimerDetail.recurrence+, TimerRecurrence.remaining+ | Input.timerFire | OpenKind.timer | L.begin | O.timerZone+ | timer.cycle, timer.cron, timer.cycleNotAttached | no |
| PC-TIMER-03 | PC-TIMER-03.json | ValueSource.expression, TimerSchedule.duration, TimerSchedule.date, TimerSchedule.cycle | TimerDetail.deadlineMs, TimerDetail.recurrence+ | Input.timerFire | OpenKind.timer | L.begin | - | expression.outsideSimpleBoolean+ | yes: Data-derived timer expressions |
| PC-TIMER-04 | PC-TIMER-04.json | StartPayload.subscription, TimerSchedule.cycle, CalledProcess.definition | State.instanceId | Input.start, StartInput.trigger+ | - | L.begin, P.start+ | O.timerZone+ | start.timerExpression+ | no |
| PC-TIMER-05 | PC-TIMER-05.json | EventRole.catch, TimerSchedule.cycle | TimerDetail.deadlineMs, State.activations~ | Input.timerFire | OpenKind.timer | L.begin, L.complete.outgoing | - | - | no |
| PC-TIMER-06 | PC-TIMER-06.json | Envelope.boundaries, Boundary.interrupting, TimerSchedule.duration, TimerSchedule.cycle | Occurrence.begun, OpenItem.attachedTo, TimerDetail.recurrence+ | Input.timerFire | OpenKind.timer | L.ownerSubscription+, L.entry+, L.leave, L.clearInside | - | - | no |
| PC-TIMER-07 | PC-TIMER-07.json | ScopeKind.eventSubProcess, StartPayload.subscription, TimerSchedule.cycle | Occurrence.begun, OpenItem.passive | Input.timerFire | OpenKind.timer | L.ownerSubscription+, L.entry+, L.clearInside, X.eventStart | - | - | no |
| PC-TIMER-08 | PC-TIMER-08.json | Envelope.boundaries, ScopeKind.eventSubProcess, MultiInstance.mode, ScopeKind.transaction~ | Occurrence.begun, MultiInstanceRun.scope | Input.timerFire, Input.command | OpenKind.timer, OpenKind.userTask | L.ownerSubscription+, L.entry+, L.armBody+, L.clearInside, L.cancelled | - | - | no |
| PC-MESSAGE-01 | PC-MESSAGE-01.json | MessageTrigger.messageRef, MessageTrigger.name, MessageTrigger.operationRef, MessageTrigger.interfaceRef | MessageWaitDetail.channel | Input.deliver, DeliveryInput.trigger+ | OpenKind.message | L.begin | - | message.nameExpression, start.messageNameExpression+ | yes: selected expression-derived names at running catches |
| PC-MESSAGE-02 | PC-MESSAGE-02.json | StartPayload.subscription, MessageTrigger.messageRef, MessageTrigger.name, CalledProcess.definition | State.instanceId | Input.start, StartInput.trigger+, StartInput.variables | - | L.begin, P.start+ | O.deliveryVariables+ | start.message.duplicateName+ | no |
| PC-MESSAGE-03 | PC-MESSAGE-03.json | EventRole.catch, ReceiveWork.message, Subscription.outputs | MessageWaitDetail.payload, State.writes~ | Input.deliver, DeliveryInput.payload | OpenKind.message | L.begin, L.writeOutputs, L.complete.outgoing | O.deliveryVariables+ | - | no |
| PC-MESSAGE-04 | PC-MESSAGE-04.json | Envelope.boundaries, Boundary.interrupting, MessageTrigger.messageRef, MessageTrigger.name | Occurrence.begun, OpenItem.attachedTo | Input.deliver, Input.command, Input.effectResult | OpenKind.message, OpenKind.userTask, OpenKind.effect | L.ownerSubscription+, L.entry+, L.armBody+, L.leave, L.clearInside | - | - | no |
| PC-MESSAGE-05 | PC-MESSAGE-05.json | Boundary.interrupting, Subscription.outputs | Occurrence.begun, OpenItem.attachedTo | Input.deliver | OpenKind.message | L.ownerSubscription+, L.entry+, L.writeOutputs | - | - | no |
| PC-MESSAGE-06 | PC-MESSAGE-06.json | ScopeKind.eventSubProcess, Subscription.outputs | Occurrence.begun, OpenItem.passive | Input.deliver | OpenKind.message | L.ownerSubscription+, L.entry+, L.clearInside, L.completeScope, X.eventStart | O.abnormalScopeEnd+ | message.interruptingEventSubProcess+ | no |
| PC-MESSAGE-07 | PC-MESSAGE-07.json | ScopeKind.eventSubProcess, MultiInstance.mode | Occurrence.begun, OpenItem.passive, State.scopes | Input.deliver, Input.command | OpenKind.message, OpenKind.userTask | L.ownerSubscription+, L.entry+, L.completeScope, X.eventStart | - | - | no |
| PC-MESSAGE-08 | PC-MESSAGE-08.json | MessageTrigger.correlation, CorrelationCriterion.key, CorrelationCriterion.value | MessageWaitDetail.criteria+, InstanceData.businessKey+ | Input.deliver, DeliveryInput.correlation~ | OpenKind.message | P.correlate, P.correlateCriteria+, L.writeOutputs | O.messageCorrelation+ | message.correlation, message.correlation.keys, message.correlation.value | no |
| PC-MESSAGE-09 | PC-MESSAGE-09.json | Throw.message, MessageThrow.binding~, MessageThrow.payload | EffectDetail.send+ | Input.effectResult | OpenKind.effect | L.begin, L.effectAtEvent+, L.complete.outgoing | - | throw.message | no |
| PC-SIGNAL-01 | PC-SIGNAL-01.json | Throw.signal, SignalThrow.name, SignalThrow.payload, SignalThrow.propagateAll+, SignalThrow.localOnly+, SignalThrow.businessKey+, SignalThrow.asynchronous+ | State.outbox+ | - | - | L.begin, L.complete.outgoing, P.broadcast+ | - | throw.signal, throw.signal.asynchronous+, expression.outsideSimpleBoolean+ | yes: selected expression-derived Signal names |
| PC-SIGNAL-02 | PC-SIGNAL-02.json | StartPayload.subscription, EventRole.catch, SignalTrigger.name, GatewayKind.eventBased | Occurrence.begun, SignalWaitDetail.name+, State.outbox+ | Input.start, StartInput.trigger+, Input.deliver | OpenKind.signal+ | L.ownerSubscription+, L.entry+, L.leave, P.broadcast+, P.start+ | - | event.catch.signal, start.signal | no |
| PC-SIGNAL-03 | PC-SIGNAL-03.json | Envelope.boundaries, ScopeKind.eventSubProcess, SignalTrigger.name, MultiInstance.mode | Occurrence.begun, OpenItem.passive, SignalWaitDetail.name+ | Input.deliver, DeliveryInput.trigger+ | OpenKind.signal+ | L.ownerSubscription+, L.entry+, L.armBody+, L.stale+, L.clearInside | - | boundary.signal | no |
| PC-SIGNAL-04 | PC-SIGNAL-04.json | SignalThrow.name, SignalThrow.payload, StartPayload.subscription | State.outbox+, BroadcastIntent.name+ | Input.deliver, DeliveryInput.trigger+ | OpenKind.signal+ | P.broadcast+, P.start+ | - | - | no |
| PC-CONDITION-01 | PC-CONDITION-01.json | ConditionTrigger.condition, ConditionTrigger.variableName, ConditionTrigger.variableEvents | State.writes~, WriteEvent.kind+, ConditionalWaitDetail.lastValue+ | CommandAction.setVariables+, CommandAction.removeVariables+, CommandAction.completeUserTask, EffectOutcome.success | OpenKind.conditional+ | L.write+, L.written, L.writeOutputs | - | expression.outsideSimpleBoolean+ | yes: evaluation failure |
| PC-CONDITION-02 | PC-CONDITION-02.json | StartPayload.subscription, ConditionTrigger.condition | State.instanceId | Input.start, StartInput.trigger+, StartInput.variables | - | L.begin, P.start+ | - | start.condition | no |
| PC-CONDITION-03 | PC-CONDITION-03.json | EventRole.catch, ConditionTrigger.condition, ConditionTrigger.variableName, ConditionTrigger.variableEvents, GatewayKind.eventBased | Occurrence.begun, ConditionalWaitDetail.lastValue+, State.writes~ | CommandAction.setVariables+, CommandAction.completeUserTask | OpenKind.conditional+ | L.begin, L.ownerSubscription+, L.entry+, L.written, L.leave | O.conditionalRetrigger+ | event.condition.filter+, event.condition.variableEvents+, event.condition.foreign+ | no |
| PC-CONDITION-04 | PC-CONDITION-04.json | Envelope.boundaries, Boundary.interrupting, ConditionTrigger.condition, ConditionTrigger.variableName, ConditionTrigger.variableEvents, Envelope.inputs, Envelope.outputs | Occurrence.begun, ScopeOccurrence.occurrence, State.writes~ | CommandAction.setVariables+, CommandAction.completeUserTask, EffectOutcome.success | OpenKind.conditional+, OpenKind.userTask, OpenKind.effect | L.ownerSubscription+, L.entry+, L.armBody+, L.activityScope+, L.write+, L.written, L.writeOutputs | O.conditionalRetrigger+ | event.condition.filter+, event.condition.variableEvents+, event.condition.foreign+ | no |
| PC-CONDITION-05 | PC-CONDITION-05.json | ScopeKind.eventSubProcess, ConditionTrigger.condition | Occurrence.begun, OpenItem.passive, State.writes~ | CommandAction.setVariables+ | OpenKind.conditional+ | L.ownerSubscription+, L.entry+, L.write+, L.written, L.stale+, X.eventStart | - | start.condition | no |
| PC-ERROR-01 | PC-ERROR-01.json | Throw.error, ErrorThrow.code, ErrorThrow.message~, ErrorTrigger.code, ErrorTrigger.codeVariable, ErrorTrigger.messageVariable, Envelope.boundaries | State.failure, InstanceFailure.code | EffectOutcome.businessFailure, Input.command | OpenKind.effect, OpenKind.userTask | L.begin, L.entry+, L.complete.aborted+, L.complete.flows, X.error | O.unhandledError+, O.errorCatchVariables, O.errorPathOutputs+ | event.error.codeVariable, event.error.messageVariable, boundary.error.duplicateCode | no |
| PC-ERROR-02 | PC-ERROR-02.json | ScopeKind.eventSubProcess, ErrorTrigger.code, StartPayload.subscription | State.scopes | Input.command, EffectOutcome.businessFailure | OpenKind.userTask, OpenKind.effect | L.entry+, L.clearInside, X.error, X.eventStart | O.abnormalScopeEnd+ | start.error, start.error.nonInterrupting+, scope.eventSubProcess.errorDuplicateCode | no |
| PC-ERROR-03 | PC-ERROR-03.json | CallWork.outputs, MultiInstance.mode, ErrorTrigger.code | ScopeOccurrence.calledInstance, MultiInstanceRun.scope | EffectOutcome.businessFailure | OpenKind.effect | L.complete.aborted+, L.armBody+, L.cancelled, X.error | O.errorPathOutputs+ | - | no |
| PC-ESCALATION-01 | PC-ESCALATION-01.json | Throw.escalation, EscalationThrow.code, EscalationTrigger.code, EscalationTrigger.codeVariable | State.tokens | Input.command | OpenKind.userTask | L.begin, L.complete.outgoing, X.escalation | - | - | no |
| PC-ESCALATION-02 | PC-ESCALATION-02.json | Envelope.boundaries, Boundary.interrupting, EscalationTrigger.code, MultiInstance.mode | OpenItem.attachedTo, MultiInstanceRun.scope | Input.command | OpenKind.userTask | L.entry+, L.armBody+, L.clearInside, X.escalation | - | boundary.escalation.host, boundary.escalation.duplicate | no |
| PC-ESCALATION-03 | PC-ESCALATION-03.json | ScopeKind.eventSubProcess, EscalationTrigger.code, CallWork.outputs | State.scopes, ScopeOccurrence.calledInstance | Input.command | OpenKind.userTask | L.entry+, L.complete.aborted+, L.write+, X.escalation, X.eventStart | O.errorPathOutputs+, O.abnormalScopeEnd+ | - | no |
| PC-TERMINATE-01 | PC-TERMINATE-01.json | Throw.terminate, EventPayload.placement | State.scopes, State.occurrences | Input.command, Input.timerFire, Input.deliver, Input.effectResult | OpenKind.userTask, OpenKind.message, OpenKind.timer, OpenKind.effect, OpenKind.incident | L.begin, L.keepOccurrence+, L.complete.flows, L.clearInside, L.cancelled, L.completeScope | O.abnormalScopeEnd+ | - | no |
| PC-TERMINATE-02 | PC-TERMINATE-02.json | Throw.terminate, MultiInstance.mode, ScopeKind.eventSubProcess, Work.call | State.scopes, MultiInstanceRun.instances, ScopeOccurrence.calledInstance | Input.command | OpenKind.userTask | L.keepOccurrence+, L.complete.flows, L.clearInside, L.completeCall, L.instanceCompleted | O.abnormalScopeEnd+ | - | no |
| PC-COMPENSATION-01 | n/a | Envelope.compensationHandler, CompensationThrow.activity | Compensable.completion+ | - | - | - | O.compensationOrder+, O.compensationHandlerFailure+ | - | no |
| PC-COMPENSATION-02 | PC-COMPENSATION-02.json | Throw.compensation, CompensationThrow.activity, CompensationThrow.waitForCompletion, Trigger.compensation | Compensations.retained, CompensationRun.resume, Compensable.children+ | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.completed, L.dispose+, L.handlerCompleted, L.complete.outgoing, X.compensation | O.compensationOrder+ | throw.compensation.activity, throw.compensation.asynchronous, throw.compensation.wrongScope+ | no |
| PC-COMPENSATION-03 | PC-COMPENSATION-03.json | Envelope.compensationHandler, MultiInstance.mode, Work.call, ScopeKind.embedded | Compensable.snapshot, Compensable.occurrence+, Compensable.children+, Compensable.completion+ | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.completed, L.complete.aborted+, L.dispose+ | O.compensationOrder+ | activity.compensationHandler | no |
| PC-COMPENSATION-04 | PC-COMPENSATION-04.json | Envelope.compensationHandler, Work.user, Work.receive, Work.call, ScopeKind.embedded | CompensationRun.running, Compensations.runs | Input.command, Input.deliver, Input.effectResult | OpenKind.userTask, OpenKind.message, OpenKind.effect | L.begin, L.handlerCompleted, L.cancelled, X.compensation | O.compensationHandlerFailure+ | compensation.handlerBody+ | no |
| PC-COMPENSATION-05 | PC-COMPENSATION-05.json | ScopeKind.eventSubProcess, Trigger.compensation, MultiInstance.mode, Throw.compensation | Compensable.snapshot, Compensable.children+ | Input.command | OpenKind.userTask | L.begin, L.completed, L.dispose+, L.handlerCompleted, X.compensation, X.eventStart | O.compensationOrder+ | start.compensation | no |
| PC-TX-01 | PC-TX-01.json | ScopeKind.transaction~, TransactionScope.method+, Envelope.compensationHandler | Compensations.retained, Compensable.children+ | Input.command | OpenKind.userTask | L.completeScope, L.completed, L.dispose+, L.complete.outgoing | - | transaction.method+ | no |
| PC-TX-02 | PC-TX-02.json | Throw.cancel, Trigger.cancel, Boundary.outgoing, ScopeKind.transaction~ | Compensations.runs, CompensationRun.resume | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.entry+, L.clearInside, L.handlerCompleted, X.cancel, X.compensation | O.compensationHandlerFailure+ | throw.cancel.outsideTransaction+, boundary.cancel.host+, boundary.cancel.duplicate+ | no |
| PC-TX-03 | PC-TX-03.json | ScopeKind.transaction~, MultiInstance.mode, Trigger.cancel | Compensable.children+, MultiInstanceRun.scope | Input.command | OpenKind.userTask | L.armBody+, L.dispose+, L.clearInside, X.cancel, X.compensation | O.compensationOrder+ | - | no |
| PC-BASIC-01 | PC-BASIC-01.json | StartPayload.outgoing, Flow.condition+, Throw.none, EventPayload.placement | State.tokens | Input.start | - | L.begin, L.complete.outgoing, L.outflow | - | start.rootCombination+, start.subProcessCombination+, flow.conditionalOutflow+ | no |
| PC-BASIC-02 | PC-BASIC-02.json | EventRole.linkCatch, EventRole.linkThrow | State.tokens, State.occurrences | - | - | L.begin, L.entry+, L.complete.flows | - | link.catch+, link.duplicateCatch+, gateway.eventBased.linkArm+ | no |
| PC-BASIC-03 | PC-BASIC-03.json | Header.origin+, Header.id, MessageTrigger.messageRef, MessageTrigger.name, SignalTrigger.name, EventRole.linkThrow, ServiceWork.operation | State.tokens | - | - | - | O.branchSchedule+ | flow.concurrentWrite+ | no |
| PC-BASIC-04 | PC-BASIC-04.json | Header.origin+, Header.sourceType, ReceiveWork.instantiate, Subscription.alternatives, Subscription.parallelMultiple, EventPayload.alternativeThrows, GatewayKind.eventBased, Program.executable, CalledProcess.executable | - | - | - | - | - | work.receive.instantiate+, event.multipleDefinitions+, event.parallelMultiple+, gateway.eventBased.instantiate+, process.notExecutable+ | no |
| PC-DELIVERY-01 | PC-DELIVERY-01.json | Work.user, Work.service, GatewayKind.exclusive~, Envelope.boundaries | State.variables | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.consumes | O.errorPathOutputs+ | - | no |
| PC-JOURNEY-01 | PC-JOURNEY-01.json | Value, Work.user, Work.service, Work.rule, Work.send, GatewayKind.exclusive~ | State.variables | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.consumes | - | - | no |
| PC-JOURNEY-02 | PC-JOURNEY-02.json | Work.call, CallWork.outputs, ErrorTrigger.code | ScopeOccurrence.calledInstance | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.consumes | O.errorPathOutputs+ | - | no |
| PC-JOURNEY-03 | PC-JOURNEY-03.json | MultiInstance.mode, ScopeKind.embedded, Envelope.boundaries | MultiInstanceRun.instances | Input.command, Input.effectResult, Input.timerFire | OpenKind.userTask, OpenKind.effect, OpenKind.timer | L.consumes | - | - | no |
| PC-JOURNEY-04 | PC-JOURNEY-04.json | MultiInstance.mode, ScopeKind.embedded, Envelope.boundaries | MultiInstanceRun.instances | Input.command, Input.effectResult, Input.timerFire | OpenKind.userTask, OpenKind.effect, OpenKind.timer | L.consumes | - | - | no |
| PC-JOURNEY-05 | PC-JOURNEY-05.json | TimerSchedule.cycle, StartPayload.subscription, Boundary.interrupting, EscalationTrigger.code | TimerDetail.recurrence+ | Input.start, Input.timerFire, Input.command | OpenKind.timer, OpenKind.userTask | L.consumes | O.timerZone+ | - | no |
| PC-JOURNEY-06 | PC-JOURNEY-06.json | MessageTrigger.correlation, Boundary.interrupting, ScopeKind.eventSubProcess, Subscription.outputs | MessageWaitDetail.criteria+ | Input.deliver, DeliveryInput.correlation~ | OpenKind.message | L.consumes | O.messageCorrelation+ | - | no |
| PC-JOURNEY-07 | PC-JOURNEY-07.json | ErrorTrigger.code, Trigger.cancel, ScopeKind.transaction~, Envelope.compensationHandler | Compensations.retained, Compensations.runs | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.consumes | O.compensationOrder+ | - | no |
| PC-QUALIFY-01 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-02 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-03 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-04 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-05 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-06 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-07 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-08 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-09 | n/a | - | - | - | - | - | - | - | no |
| PC-QUALIFY-10 | PC-QUALIFY-10.json | MultiInstance.mode, Value | MultiInstanceRun.instances, State.variables | Input.command, Input.effectResult | OpenKind.userTask, OpenKind.effect | L.consumes | - | - | no |
| PC-ACCEPT-01 | n/a | - | - | - | - | - | - | - | no |
| PC-ACCEPT-02 | n/a | - | - | - | - | - | - | - | no |

## Shape delta

Landed in the working tree on 2026-11-08 with the W0.1 audit fixes, except where the [Lifecycle fit](#lifecycle-fit) status says otherwise; the blocks stay as the review record. Each block is ready to paste over the named declaration; a line comment names the rows that need the item. A block marked `-- add to` lists only the fields to add to the record as it stands in the working tree. Justifications sit beside the choice they justify; the code rule that a comment states why applies when these land.

### IL (`Kernel/IL/Types.lean`)

```lean
/-- Which syntax wrote a mapping, which settles what an unset source means: an unavailable Data Input
(BPMN 2.0.2 §10.4.2), an unresolved `camunda:inputParameter` or `outputParameter` expression, or a
`camunda:in`/`out` copy that reads null (CIB-EXT-0021). Replaces `CallWork.unsetSourceReadsNull`. -/
inductive MappingDialect where
  | dataAssociation
  | ioParameter
  | callVariable
  deriving DecidableEq, Repr

structure Mapping where
  target : String
  source : Expression
  dialect : MappingDialect := .dataAssociation      -- PC-DATA-05, PC-DATA-06, PC-DATA-09, PC-SCOPE-04
  deriving Repr

/-- The one home of a Sequence Flow condition. `ConditionalFlow` is deleted: a gateway lists candidates as flow
identifiers, in document order. -/
structure Flow where
  id : FlowId
  source : ElementId
  target : ElementId
  condition : Option Expression := none             -- PC-CF-02, PC-CF-04, PC-CF-07, PC-DATA-08, PC-BASIC-01
  deriving Repr

inductive GatewayKind where
  | exclusive (candidates : List FlowId) (default : Option FlowId)
  | parallel
  | inclusive (candidates : List FlowId) (default : Option FlowId)
  | eventBased (arms : List EventArm)
  deriving Repr

structure Envelope where
  incoming : List FlowId := []
  outgoing : List FlowId := []
  inputs : List Mapping := []
  outputs : List Mapping := []
  boundaries : List Boundary := []
  multiInstance : Option MultiInstance := none
  compensationHandler : Option ElementId := none
  defaultFlow : Option FlowId := none               -- PC-CF-07
  asyncBefore : Bool := false                       -- PC-AUTO-01; a transaction boundary `Step` reads (CIB-EXT-0027)
  asyncAfter : Bool := false                        -- a transaction boundary `Step` reads (CIB-EXT-0027)
  deriving Repr

/-- BPMN `transactionMethod`. CIB reads no such attribute (`BpmnParse#parseTransaction`). -/
inductive TransactionMethod where
  | compensate
  | store
  | image
  | other (uri : String)
  deriving DecidableEq, Repr

structure TransactionScope where
  method : TransactionMethod := .compensate         -- PC-TX-01
  deriving Repr

inductive ScopeKind where
  | embedded
  | transaction (payload : TransactionScope)
  | eventSubProcess (start : Subscription) (interrupting : Bool)
  deriving Repr

/-- `sourceId` is the identifier the model's author wrote, which publication shows. `Header.id` is unique in the
program, so that two versions of one called definition can coexist. -/
structure ElementOrigin where
  definition : Option DefinitionRef := none
  sourceId : String
  deriving Repr

structure Header where
  id : ElementId
  origin : ElementOrigin                            -- PC-SCOPE-03, PC-BASIC-03, PC-BASIC-04
  sourceType : String
  parent : Option ElementId
  deriving Repr

/-- Move `DefinitionRef` before `Header`. -/
structure DefinitionRef where
  key : String
  version : Option Nat := none
  versionTag : Option String := none                -- PC-SCOPE-03
  deployment : Option String := none                -- PC-SCOPE-03
  tenant : Option String := none                    -- PC-SCOPE-03
  sourceSha256 : Option String := none              -- PC-SCOPE-03
  deriving DecidableEq, Repr

structure EffectBinding where
  protocol : String
  operation : String
  deriving DecidableEq, Repr

structure MessageThrow where
  binding : Option EffectBinding := none            -- PC-MESSAGE-09; none is an unbound pass-through
  payload : List Mapping := []
  deriving Repr

structure SignalThrow where
  name : ValueSource
  payload : List Mapping := []
  propagateAll : Bool := false                      -- PC-SIGNAL-01
  localOnly : Bool := false                         -- PC-SIGNAL-01
  businessKey : Option Expression := none           -- PC-SIGNAL-01
  asynchronous : Bool := false                      -- PC-SIGNAL-01; refused: throw.signal.asynchronous
  deriving Repr

structure ErrorThrow where
  code : String
  message : Option ValueSource := none              -- PC-ERROR-01 (`BpmnParse:515-517`)
  deriving Repr

structure SendWork where
  binding : EffectBinding                           -- PC-AUTO-04
  recipient : Option ValueSource := none
  correlation : List CorrelationCriterion := []
  messageRef : Option String := none                -- PC-AUTO-04; refused under CIB-EXT-0023
  operationRef : Option String := none              -- PC-AUTO-04; refused under CIB-EXT-0023
  deriving Repr

inductive DecisionResultMapping where
  | singleEntry
  | singleResult
  | collectEntries
  | resultList
  deriving DecidableEq, Repr

structure RuleWork where
  decision : ValueSource
  resultVariable : Option String := none
  binding : CallBinding := .latest                  -- PC-AUTO-07
  resultMapping : DecisionResultMapping := .resultList -- PC-AUTO-07, PC-AUTO-08
  deriving Repr

structure CallWork where
  calledElement : ValueSource
  binding : CallBinding := .latest
  tenant : Option ValueSource := none               -- PC-SCOPE-03
  businessKey : Option Expression := none
  inputs : List Mapping := []
  outputs : List Mapping := []
  propagateAllInputs : Bool := false
  propagateAllOutputs : Bool := false
  deriving Repr

/-- PC-MI-08. The lowering fills it from the profile. -/
inductive CollectionRead where
  | entrySnapshot
  | sequentialReread
  deriving DecidableEq, Repr

structure MultiInstance where
  mode : MultiInstanceMode
  count : InstanceCount
  elementVariable : Option String := none
  completionCondition : Option Expression := none
  inputDataItem : Option String := none
  outputDataItem : Option String := none
  outputCollection : Option String := none
  mutableCollection : CollectionRead := .entrySnapshot
  asyncBefore : Bool := false                       -- PC-MI-02; each instance's transaction boundary (CIB-EXT-0027)
  asyncAfter : Bool := false
  loopDataInputRef : Option String := none          -- PC-MI-02; the literal binding (CIB-INT-0014)
  inputDataItemName : Option String := none
  deriving Repr
```

`ProfileOptions` becomes one record with one enumerated field per decision point, plus the relation identifiers as provenance. A register entry gets a field only when the kernel's behaviour branches on it. Environment pins (CIB-CFG-0001, -0002, -0003, -0006, -0007, -0009), host mappings (CIB-OP-0001 to -0003, -0005 to -0008, -0010, -0011) and binding grammars (CIB-EXT-0001 to -0003, -0007, -0008, -0015, -0019, -0022, -0023, CIB-EXT-0011, -0012) go only into `relations` and the admitted field set.

```lean
inductive SubmissionRule where
  | outputSet                 -- BPMN 2.0.2 §10.4.1
  | installsVariables         -- CIB-EXT-0005, CIB-EXT-0010
  deriving DecidableEq, Repr

inductive UndeclaredWrite where
  | refused                   -- BPMN 2.0.2 §10.4.1: a target is a declared item
  | atInstanceRoot            -- CIB-EXT-0020
  deriving DecidableEq, Repr

inductive ErrorPathOutputs where
  | none                      -- BPMN 2.0.2 §13.3.2
  | mapped                    -- CIB-EXT-0004, CIB-EXT-0009, CIB-EXT-0016
  deriving DecidableEq, Repr

inductive TechnicalFailure where
  | hostFailure               -- no BPMN meaning (§13.3.3 defines only a fault)
  | incident                  -- CIB-EXT-0013, CIB-OP-0008, CIB-CFG-0008
  deriving DecidableEq, Repr

inductive NoOutgoingFlow where
  | rolledBack                -- CIB-INT-0003, proposed CIB-INT-0006
  deriving DecidableEq, Repr

inductive ContinuationFailure where
  | rolledBack                -- CIB-INT-0003
  | incident                  -- proposed CIB-EXT-0026
  deriving DecidableEq, Repr

inductive MessageCorrelation where
  | modeledKey                -- BPMN 2.0.2 §8.4.2, CIB-LIM-0002
  | apiCriteria               -- PC-MESSAGE-08, proposed CIB-EXT-0025
  deriving DecidableEq, Repr

inductive DeliveryVariables where
  | mappedOnly
  | installs                  -- proposed CIB-EXT-0025
  deriving DecidableEq, Repr

inductive MultiInstanceFinalBody where
  | conditionEveryCompletion  -- BPMN 2.0.2 §13.3.7
  | modeSpecific              -- proposed CIB-INT-0009
  deriving DecidableEq, Repr

inductive MultiInstanceOutputs where
  | aggregates                -- BPMN 2.0.2 §13.3.7
  | none                      -- CIB-LIM-0001
  deriving DecidableEq, Repr

inductive CompensationOrder where
  | dependency                -- BPMN 2.0.2 §13.5.5
  | reverseCreation           -- PC-COMPENSATION-01
  deriving DecidableEq, Repr

inductive CompensationHandlerFailure where
  | failsInstance             -- COMPH-FAIL-01
  | selected (code : String)  -- PC-COMPENSATION-01
  deriving DecidableEq, Repr

inductive AbnormalScopeEnd where
  | withoutOutflow            -- BPMN 2.0.2 §13.3.4, §13.5.6
  | completesNormally         -- proposed CIB-INT-0007
  deriving DecidableEq, Repr

inductive UnhandledError where
  | failsInstance             -- BPMN 2.0.2 Table 10.88, "termination of the Process instance"
  | endsThrowingPath          -- CIB-INT-0013, CIB-CFG-0010
  deriving DecidableEq, Repr

inductive ErrorCatchVariables where
  | refused
  | eventScope                -- CIB-EXT-0028
  deriving DecidableEq, Repr

inductive CallBindingTime where
  | programAssembly
  | invocation                -- PC-SCOPE-03 selects; `CallableElementUtil#getCalledProcessDefinition`
  deriving DecidableEq, Repr

structure ProfileOptions where
  relations : List String := []
  submission : SubmissionRule := .outputSet
  scopeChainSubmissionBytes : Option Nat := none
  undeclaredWrite : UndeclaredWrite := .refused
  errorPathOutputs : ErrorPathOutputs := .none
  technicalFailure : TechnicalFailure := .hostFailure
  incidentProcessCancellation : Bool := false
  noOutgoingFlow : NoOutgoingFlow := .rolledBack
  continuationFailure : ContinuationFailure := .rolledBack
  messageCorrelation : MessageCorrelation := .modeledKey
  deliveryVariables : DeliveryVariables := .mappedOnly
  multiInstanceFinalBody : MultiInstanceFinalBody := .conditionEveryCompletion
  multiInstanceOutputs : MultiInstanceOutputs := .aggregates
  compensationOrder : CompensationOrder := .dependency
  compensationHandlerFailure : CompensationHandlerFailure := .failsInstance
  abnormalScopeEnd : AbnormalScopeEnd := .withoutOutflow
  unhandledError : UnhandledError := .failsInstance
  errorCatchVariables : ErrorCatchVariables := .refused
  callBindingTime : CallBindingTime := .programAssembly
  timerZone : Option String := none
  multiInstanceBinding : MultiInstanceBinding := .dataAssociations   -- PC-MI-02; CIB-INT-0014 selects loopReferences
  effectResultValues : ResultValues := .outputSet                     -- CIB-EXT-0015 selects activityLocals
  deriving Repr
```

Every default is the standards reading. Today `submissionInstallsVariables` defaults to `true`, which gives the standards profile a CIB extension.

### State (`Kernel/State.lean`)

```lean
structure UserTaskDetail where
  name : Option String
  assignee : Option String := none                  -- PC-HUM-02, this block
  candidateUsers : List String := []
  candidateGroups : List String := []
  formKey : Option String := none
  formFields : List (String × String) := []
  dueDate : Option String := none
  followUpDate : Option String := none
  priority : Option Int := none
  inputs : List (String × Value) := []
  deriving Repr

/-- `criteria` names what a matching delivery must supply; replaces `correlationKey`. -/
structure MessageWaitDetail where
  channel : MessageChannel
  payload : Bool := false
  criteria : List String := []                      -- PC-MESSAGE-08, PC-JOURNEY-06
  deriving Repr

structure SignalWaitDetail where
  name : String                                     -- PC-SIGNAL-02, PC-SIGNAL-03
  payload : Bool := false
  deriving Repr

/-- `lastValue` is the most recent evaluation; a false to true change and each filtered event are separate facts. -/
structure ConditionalWaitDetail where
  variableName : Option String := none              -- PC-CONDITION-01
  variableEvents : List String := []
  lastValue : Option Bool := none
  deriving Repr

/-- PC-TIMER-02. A cycle is captured once armed (PC-TIMER-03): `remaining = none` is unbounded. -/
structure TimerRecurrence where
  periodMs : Option Nat := none
  cron : Option String := none
  remaining : Option Nat := none
  deriving Repr

structure TimerDetail where
  deadlineMs : Nat
  period : Option TimerRecurrence := none
  recurrence : Option TimerRecurrence := none
  deriving Repr

structure SendDescriptor where
  recipient : Option String := none
  correlation : List (String × Value) := []
  deriving Repr

structure EffectDetail where
  protocol : String
  operation : String
  arguments : List (String × Value) := []
  failures : Nat := 0
  send : Option SendDescriptor := none              -- PC-AUTO-04, PC-MESSAGE-09
  deriving Repr

inductive OpenKind where
  | userTask (detail : UserTaskDetail)
  | message (detail : MessageWaitDetail)
  | signal (detail : SignalWaitDetail)
  | conditional (detail : ConditionalWaitDetail)
  | timer (detail : TimerDetail)
  | effect (detail : EffectDetail)
  | incident (detail : IncidentDetail)
  | evaluation (request : Nat)
  deriving Repr

/-- F10. Replaces the `(instance, element, count)` triples, so a Multi-Instance body and its instances number apart. -/
inductive ActivationRole where
  | element
  | multiInstanceBody
  deriving DecidableEq, Repr

structure ActivationCount where
  instance : String
  element : ElementId
  role : ActivationRole
  count : Nat
  deriving Repr

inductive WriteKind where
  | create
  | update
  | delete
  deriving DecidableEq, Repr

/-- Every write logs, same-value updates and entry writes included (PC-CONDITION-01, PC-CONDITION-04). Replaces the
`(scope, name)` pairs of `State.writes`. -/
structure WriteEvent where
  scope : ScopeOccurrenceId
  name : String
  kind : WriteKind
  deriving Repr

structure BroadcastIntent where
  name : String                                     -- PC-SIGNAL-01, PC-SIGNAL-04
  variables : List (String × Value) := []
  businessKey : Option String := none
  origin : OccurrenceRef
  deriving Repr

/-- `root` is the instance's root scope occurrence. PC-SCOPE-03, PC-MESSAGE-08. -/
structure InstanceData where
  root : ScopeOccurrenceId
  businessKey : Option String := none
  definition : Option DefinitionRef := none
  deriving Repr

/-- `children` keeps the records of a completed Sub-Process for later compensation (F5). `completion` orders them. -/
structure Compensable where
  subject : ElementId
  handler : ElementId
  scope : ScopeOccurrenceId
  occurrence : Option OccurrenceRef := none
  completion : Nat := 0
  snapshot : List (String × Value) := []
  children : List Compensable := []
  deriving Repr

-- add to `FeatureSlots`
structure FeatureSlots where
  instances : List InstanceData := []
  deriving Repr

-- add to `State`, changing `activations` and `writes` to the types above
structure State where
  activations : List ActivationCount := []
  writes : List WriteEvent := []
  outbox : List BroadcastIntent := []
  deriving Repr
```

### Inputs

```lean
inductive StartTrigger where
  | none
  | timer (logicalTimeMs : Nat)
  | message (channel : MessageChannel) (payload : Option Value)
  | signal (name : String) (variables : List (String × Value))
  | condition
  deriving Repr

structure StartInput where
  instanceId : String
  startEvent : Option ElementId := none
  variables : List (String × Value) := []
  trigger : StartTrigger := .none                   -- PC-TIMER-04, PC-MESSAGE-02, PC-SIGNAL-02, PC-CONDITION-02
  businessKey : Option String := none               -- PC-MESSAGE-08
  deriving Repr

inductive CommandAction where
  | completeUserTask (values : List (String × Value))
  | retryIncident
  | cancelIncidentProcess
  | setVariables (values : List (String × Value))   -- PC-MI-08, PC-CONDITION-01, PC-CONDITION-03 to 05
  | removeVariables (names : List String)           -- PC-CONDITION-01
  deriving Repr

inductive DeliveryTrigger where
  | message (channel : MessageChannel)
  | signal (name : String)
  deriving Repr

inductive CriterionTarget where
  | processVariable (name : String)
  | localVariable (name : String)
  | businessKey
  | processInstance
  deriving Repr

/-- A present null matches only a present null; an absent name matches nothing (PC-MESSAGE-08). -/
structure CorrelationMatch where
  target : CriterionTarget
  expected : Value
  deriving Repr

structure DeliveryInput where
  occurrence : OccurrenceRef
  trigger : DeliveryTrigger                         -- PC-MESSAGE-01, PC-SIGNAL-03, PC-SIGNAL-04
  correlation : List CorrelationMatch := []         -- PC-MESSAGE-08, PC-JOURNEY-06
  payload : Option Value := none
  deriving Repr

inductive Fired where
  | timer (logicalTimeMs : Nat)
  | message (delivery : DeliveryInput)
  | signal (delivery : DeliveryInput)
  | condition (write : Option WriteEvent)
  deriving Repr
```

An addressless Receive stays a delivery on the unspecified channel (CIB-INT-0004), although the proposal's input table lists it under Command; the code and the retained evidence both use delivery.

### Hooks (`Kernel/Hooks.lean`)

```lean
/-- F4: whether a scope occurrence is a Multi-Instance instance, a compensation handler or ordinary. Filled by
`Step`, which alone matches `Continuation`. Replaces `Ctx.handlerScope`. -/
inductive ScopeRole where
  | ordinary
  | multiInstanceInstance
  | compensationHandler
  deriving DecidableEq, Repr

-- add to `Ctx`
structure Ctx where
  scopeRole : ScopeOccurrenceId → ScopeRole := fun _ => .ordinary
```

The evaluator needs no change. An expression outside Simple Boolean is refused at admission, so an in-kernel evaluation can end only in a value or the absent reference `.failure "unknown-variable"`; no row outside the held set observes any other failure. Present null is a value, so PC-DATA-09's missing-versus-null clause needs nothing more. An absent reference is read by `Mapping.dialect`: `dataAssociation` holds the occurrence ([BPMN 2.0.2 §13.3.2](../reference/bpmn-2.0.2/README.md)), `ioParameter` rolls the command back and `callVariable` reads null.

## Rule basis

| Site | Rule | Basis | Gate |
|---|---|---|---|
| `State.writeOutward` | an undeclared output lands at the instance root | CIB-EXT-0020 (`AbstractVariableScope.setVariable`) | `O.undeclaredWrite` |
| `State.write` | an undeclared name lands in the writing scope | none: disagrees with `writeOutward` and with CIB's root creation (`TaskEntity.setExecutionVariables`) | one write rule under `O.undeclaredWrite`; defect |
| `Work.completionOutputs` | a submission is exactly the OutputSet | §10.4.1, §13.3.2, with a project restriction on superfluous values | `O.submission` |
| `Ctx.evaluateMappingsWith` | a mapping list evaluates in document order; the first rollback or `unsupported` ends it; a repeated target keeps its last write (PC-DATA-05, PC-DATA-06) | CIB (`BpmnParseUtil.java:89-110`, `IoMapping.java:38-48`); witnesses [mapping-order](../../scenarios/open-rows/mapping-order/README.md) | `Mapping.dialect` |
| `Ctx.outputReads` in `Work.completionOutputs`, `Scopes.completeScope`, `Propagation.interruptedOutputs` | a later output reads an earlier one's write unless an own local shadows it, and a value the frame installed outward behind it (PC-DATA-06, PC-DATA-04) | CIB-EXT-0031 (`OutputParameter.java:44-52`, `ExecutionEntity.java:521-525`); witnesses [mapping-order](../../scenarios/open-rows/mapping-order/README.md) | `O.outputContext` |
| `Work.arriveActivity`, `MultiInstance.arriveMultiInstance` | an unavailable InputSet holds the token | §10.4.2, §13.3.2 for Data Associations; for `camunda:inputParameter`, CIB-EXT-0024 (inferred) | `Mapping.dialect`; publishing and release land with their rows |
| `Work.effectResult` | a business failure writes outputs, then raises | CIB-EXT-0004, -0009, -0016; BPMN writes none (§13.3.2) | `O.errorPathOutputs` |
| `Work.effectResult` | a technical failure opens an incident | CIB-EXT-0013, CIB-CFG-0008 | `O.technicalFailure` |
| `Work.resolveIncident` | cancel ends the root as cancelled | CIB-EXT-0014, CIB-OP-0009 | `O.incidentProcessCancellation` |
| `Work.completeUserTask` | no outputs: install the submission | CIB-EXT-0005, -0010 | `O.submission` |
| `Submission.check` | names on the scope chain, byte limit | CIB-EXT-0020, `NSD-TASK-01` | `O.scopeChainSubmissionBytes` |
| `CallWork.unsetSourceReadsNull` | a `camunda:in` copy reads an unset source as null | CIB-EXT-0021 | `Mapping.dialect` |
| `MultiInstance`, `MultiInstances.entered` | body and instances numbered apart | project identity contract, CIB-OP-0001; CIB uses distinct activity ids | F10 |
| `Publish` | order of waits, tasks and interactions | project publication contract; no semantics | none |
| `Publish.publishesMultiInstances`, `Publish.failure`, `Run` trace rules | publication and trace shape | project contracts | none |
| `Subscriptions.admitFiring` | a Timer fires only at its deadline | semantic invariant: logical time is an explicit input | none |
| `Subscriptions.admitFiring` | a Message fires only on its channel | §13.5.2, §13.3.3 | none |
| `Subscriptions.admitFiring` | a payload exactly when the subscription writes | project restriction; CIB sets correlation variables regardless | `O.deliveryVariables` (E3) |
| `Subscriptions.afterFiring` | a non-interrupting subscription stays open; a cycle re-arms from the prior deadline | §13.5.3, §10.5.6; identity CIB-OP-0005 | none |
| `Timer` | lexeme grammar | CIB-LIM-0003, CIB-AGR-0021 | admission |
| `Subscriptions.timerDetail` | a cycle's first deadline is one period after arming | unclassified (E5) | admission |
| `Flow.exclusive`, `Flow.inclusiveSplit` | no selected flow rolls back | Exclusive: CIB-INT-0003, whose boundary excludes a no-match reached by an effect result; Inclusive: CIB-INT-0012 | `O.noOutgoingFlow`, `O.continuationFailure` |
| `Flow.condition` | an absent condition holds | §8.4.13, CIB-INT-0005 | none |
| `Flow.arriveGateway` | a Parallel join counts per incoming flow | §13.4.1; CIB-DEV-0001 differs, owner chose BPMN | none |
| `Propagation` | a Terminate in a Sub-Process lets the parent continue | CIB (`SubProcessActivityBehavior#complete`); BPMN says "abnormally terminated" (§13.3.4, §13.5.6); unclassified (E4) | `O.abnormalScopeEnd` |
| `Scopes.startEventSubProcess`, `Step` | an interrupted parent completes normally after its handler | same as Terminate (E4) | `O.abnormalScopeEnd` |
| `Propagation.best?`, `Subscriptions.codePrecedence` | exact before catch-all at one level | the code cites §10.5.4, which does not say this: Table 10.88 lets both catch; CIB `ErrorEventDefinition#getPrecedence`; unclassified (E6) | none |
| `Propagation.searchScopes` | Event Sub-Processes before boundaries, nearest first | §10.5.1 and Table 10.88 for nearest; ESP before boundary is CIB (`BpmnParse:1221`, precedence 10); E6 | none |
| `Propagation.unhandledError` | an uncaught Error fails the instance | §10.5.1 leaves it unresolved; Table 10.88 unspecified, "a common one being termination of the Process instance" | `O.unhandledError`: CIB-INT-0013 ends only the throwing path, CIB-LIM-0006 refused at run time |
| `Propagation.exhausted` | an uncaught Escalation or Cancel is refused | §10.5.1: an uncaught Escalation continues; refusal is a restriction until PC-ESCALATION-01 | none |
| `MultiInstance.completeInstance` | exhaustion is checked before the condition | §13.3.7 evaluates on every completion; CIB differs by mode; unclassified (E7) | `O.multiInstanceFinalBody` |
| `MultiInstance.written` | aggregation, none on early completion | §13.3.7, `PMI-FINISH-01`, `PMI-EARLY-01`; CIB-LIM-0001 | `O.multiInstanceOutputs` |
| `Compensation.advance` | dependency order, concurrent otherwise | §13.5.5; CIB uses reverse creation (PC-COMPENSATION-01 owns the entry) | `O.compensationOrder` |
| `Compensation.failCompensation` | an uncaught handler Error fails the instance | COMPH-FAIL-01; §13.3.2 leaves it open | `O.compensationHandlerFailure` |
| `Scopes.implicitStart` | Activities without incoming flow begin | §13.3.1, §13.3.4; CIB requires a start (`SubProcessActivityBehavior:43`), so the cibseven profiles refuse a Sub-Process or Transaction without a start Event ([CIB-LIM-0024](../CIB-BPMN-RELATION-REGISTER.md#cib-lim-0024--cib-needs-a-start-event-in-a-sub-process-and-a-transaction)) | `O.scopeStart`; admission: `scope.implicitStart`, `scope.withoutStart` |
| `State.calledInstanceId` | derived called instance identity | project identity; unclassified (E8) | none |
| `Population.publish` | exactly one candidate | CIB-LIM-0002 account; capsule specification | `O.messageCorrelation` |

Register entries, landed in the [relation register](../CIB-BPMN-RELATION-REGISTER.md) on 2026-11-08 with the behaviour they govern, plus CIB-INT-0011 for `ConditionOrder`:

- E1, CIB-EXT-0024: "An unresolved `camunda:inputParameter` or `outputParameter` expression raises an evaluation failure that rolls the command back; it is not an unavailable Data Input." Verify in a calibration probe before selection.
- E2, CIB-INT-0012 (landed 2026-11-09 as its own entry rather than a widening of CIB-INT-0003): "A diverging Inclusive Gateway with no selected flow and no default rolls its command back" (`InclusiveGatewayActivityBehavior:82`, Table 13.3).
- E3, CIB-EXT-0025: "Correlation criteria are API-supplied and match Process or local variables, business key or instance identity; delivered variables install without a modeled output."
- E4, CIB-INT-0007: "A Sub-Process left by a Terminate End or after an interrupting Event Sub-Process completes normally and takes its outgoing flows; BPMN says only 'abnormally terminated' and leaves the parent's continuation open."
- E5, CIB-INT-0008: "`R/<duration>` without a start date fires first one period after arming."
- E6, CIB-INT-0010: "At one catching scope an Event Sub-Process precedes a boundary and an exact code precedes a catch-all."
- E7, CIB-INT-0009: "On the final Multi-Instance completion a sequential Activity tests exhaustion first and a parallel Activity evaluates the condition first (`SequentialMultiInstanceActivityBehavior:53`, `ParallelMultiInstanceActivityBehavior:96`)."
- E8, CIB-OP-0012: "A CIB-generated called instance identifier maps to the project-derived `call:` identity."
- E9, CIB-EXT-0026, if selected: "A failure in a continuation reached by an effect result fails the job and raises an incident instead of rolling back" (the boundary of CIB-INT-0003).

## Called instances and identity

Per-instance activation counting is confirmed. BPMN gives a called Process its own instance (§13.3.4, §10.3.6), and CIB creates a separate Process instance per Call with its own activity instance tree. The counter that spans instances (`repeated-nested-concurrent-calls/natural-order.scenario.json`: activations 1, 2 and 3 across three called instances) is an old-evaluator numbering defect. The fix changes scenario stimuli as well as baselines, because commands name the activation, so those scenarios move in the shape commit.

A bound definition identity on `CalledProcess` is confirmed and insufficient alone. CIB resolves `latest`, `version`, `versionTag` and `deployment` at every invocation, tenant included (`CallableElementUtil#getCalledProcessDefinition`), so two activations of one Call can bind different versions, and a running called instance keeps the definition it started with. Three facts follow:

- The binding is recorded per called instance in `InstanceData.definition`, so recovery reads it and never re-resolves.
- `DefinitionRef` carries key, version, version tag, deployment, tenant and source digest. The working-tree `Kernel.DefinitionRef` also shares its name with `Kernel.Population.DefinitionRef`, a different type; rename one when the shape lands.
- Two versions of one key in one program collide in the flat element table, so `Header.id` must be unique and `Header.origin.sourceId` carries the author's identifier for publication.

`Program` remains a step argument, so Population can hand a step a program with more callee versions without touching existing state. `O.callBindingTime` selects assembly or invocation time, and PC-SCOPE-03's interpretation review decides it.
