module

/-! # Profile options

One enumerated field per decision point the kernel's behaviour branches on, plus the relation identifiers as
provenance; every default is the standards reading. The kernel never reads a profile identifier. Part of
`Kernel.IL.Types`, which re-exports it.
-/

public section

namespace Kernel

inductive SubmissionRule where
  /-- BPMN 2.0.2 §10.4.1. -/
  | outputSet
  /-- CIB-EXT-0005, CIB-EXT-0010. -/
  | installsVariables
  deriving DecidableEq, Repr

inductive UndeclaredWrite where
  /-- BPMN 2.0.2 §10.4.1: a target is a declared item. -/
  | refused
  /-- CIB-EXT-0005, CIB-EXT-0007, CIB-EXT-0009, CIB-EXT-0020: each selects a CIB write that creates an undeclared name
  as a process variable (`AbstractVariableScope.setVariable`). -/
  | atInstanceRoot
  deriving DecidableEq, Repr

inductive ErrorPathOutputs where
  /-- BPMN 2.0.2 §13.3.2. -/
  | none
  /-- CIB-EXT-0004, CIB-EXT-0009, CIB-EXT-0016. -/
  | mapped
  deriving DecidableEq, Repr

/-- Whether a Call writes its output mappings when an Error or Escalation raised in its called instance reaches the
called root. -/
inductive RaisedCallOutputs where
  /-- BPMN 2.0.2 §10.3.6, §13.3.2: an abnormally ended Call maps no outputs. -/
  | none
  /-- CIB-EXT-0034: once per crossing of a called root, innermost first, before that root's catcher runs. -/
  | atCalledRoot
  deriving DecidableEq, Repr

inductive TechnicalFailure where
  /-- No BPMN meaning (§13.3.3 defines only a fault). -/
  | hostFailure
  /-- CIB-EXT-0013, CIB-OP-0008, CIB-CFG-0008. -/
  | incident
  deriving DecidableEq, Repr

inductive ContinuationFailure where
  /-- CIB-OP-0004. -/
  | rolledBack
  /-- Proposed CIB-EXT-0026. -/
  | incident
  deriving DecidableEq, Repr

inductive MessageCorrelation where
  /-- BPMN 2.0.2 §8.4.2, CIB-LIM-0002. -/
  | modeledKey
  /-- PC-MESSAGE-08. -/
  | apiCriteria
  deriving DecidableEq, Repr

inductive DeliveryVariables where
  | mappedOnly
  | installs
  deriving DecidableEq, Repr

inductive MultiInstanceFinalBody where
  /-- BPMN 2.0.2 §13.3.7. -/
  | conditionEveryCompletion
  | modeSpecific
  deriving DecidableEq, Repr

inductive MultiInstanceOutputs where
  /-- BPMN 2.0.2 §13.3.7. -/
  | aggregates
  /-- CIB-LIM-0001. -/
  | none
  deriving DecidableEq, Repr

inductive CompensationOrder where
  /-- BPMN 2.0.2 §13.5.5: a handler whose subject a Sequence Flow leads to completes before its predecessor's starts. -/
  | dependency
  /-- CIB signals every handler of a trigger at once (`CompensationUtil.java:55-88`). -/
  | allAtOnce
  deriving DecidableEq, Repr

inductive CompensationHandlerFailure where
  /-- COMPH-FAIL-01. -/
  | failsInstance
  | selected (code : String)
  /-- An Error leaving a handler propagates from the scope occurrence the trigger ran in, as CIB's compensating
  execution is a child of the throwing one (`CompensationUtil.java:62-75`). -/
  | propagatesFromTrigger
  deriving DecidableEq, Repr

/-- Whether a completed Sub-Process without a compensation handler keeps its inner records as one group. -/
inductive ImplicitCompensation where
  /-- BPMN 2.0.2 Tables 10.88 and 10.89: only an Activity with a compensation handler is compensated, so a throw
  naming such a Sub-Process is refused (`compensation.implicit`). -/
  | refused
  /-- CIB retains the inner records of every completed Sub-Process and compensates them as one group
  (`CompensationUtil.java:100-152`, `CompensationEventHandler.java:61-64`). -/
  | everySubProcess
  deriving DecidableEq, Repr

/-- What an Error leaving a Sub-Process does to the compensable work completed inside it. -/
inductive ErrorExitCompensation where
  /-- BPMN 2.0.2 §10.3.5 and presumed abort: the records end with the Sub-Process, as in CIB
  (`SubProcessActivityBehavior.java:61-66` retains only on completion). -/
  | drops
  /-- BPMN 2.0.2 §10.7.3, §13.5.5: compensation of all contained Activities runs by default. -/
  | compensatesContained
  deriving DecidableEq, Repr

/-- Which records a completed Multi-Instance Activity with a compensation handler leaves. -/
inductive MultiInstanceCompensation where
  /-- BPMN 2.0.2 §13.5.5: one per instance of a Multi-Instance Sub-Process, one for a Multi-Instance Task or Call. -/
  | perSubProcessInstance
  /-- CIB: one per completed instance of any Multi-Instance Activity (`AbstractBpmnActivityBehavior.java:69-74`). -/
  | perInstance
  deriving DecidableEq, Repr

/-- Which BPMN `transactionMethod` values a Transaction runs. -/
inductive TransactionMethods where
  /-- `##Compensate` alone. -/
  | compensateOnly
  /-- `##Store` and `##Image` run as `##Compensate`, as CIB reads no such attribute (`BpmnParse.java:3902-3915`); a
  protocol URI stays refused. -/
  | compatibilityAsCompensate
  deriving DecidableEq, Repr

/-- Where a targeted Compensation throw resolves its `activityRef`. -/
inductive CompensationReferenceScope where
  /-- BPMN 2.0.2 Tables 10.88 and 10.89: an Activity visible from the throw, at its own level or, from a Compensation
  Event Sub-Process, at its parent's. -/
  | visible
  /-- CIB: a throw in any Event Sub-Process also names an Activity of its parent's level (`BpmnParse.java:1695-1720`). -/
  | eventSubProcessParent
  deriving DecidableEq, Repr

inductive AbnormalScopeEnd where
  /-- BPMN 2.0.2 §13.3.4, §13.5.6. -/
  | withoutOutflow
  | completesNormally
  deriving DecidableEq, Repr

/-- What an Error that finds no catcher does. -/
inductive UnhandledError where
  /-- BPMN 2.0.2 Table 10.88 leaves it unspecified, "a common one being termination of the Process instance". -/
  | failsInstance
  /-- CIB-INT-0013, CIB-CFG-0010. -/
  | endsThrowingPath
  deriving DecidableEq, Repr

/-- Whether an Error catcher may name variables for the caught code and message. -/
inductive ErrorCatchVariables where
  /-- BPMN 2.0.2 defines no such variables. -/
  | refused
  /-- CIB-EXT-0028: written from the catcher's event scope, outward. -/
  | eventScope
  deriving DecidableEq, Repr

/-- When a completing occurrence's outgoing conditions are evaluated relative to its own output writes. -/
inductive ConditionOrder where
  /-- BPMN 2.0.2 §13.3: an Activity's outputs are written before it leaves. -/
  | afterOutputs
  /-- CIB-INT-0011, `BpmnActivityBehavior#performOutgoingBehavior:81-92`. -/
  | beforeOutputs
  deriving DecidableEq, Repr

inductive CallBindingTime where
  | programAssembly
  | invocation
  deriving DecidableEq, Repr

/-- The expression language the kernel evaluates. -/
inductive Evaluator where
  /-- The standards profile's Simple Boolean ([decision](../../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)). -/
  | simpleBoolean
  /-- CIB-CFG-0011: the Core JUEL level of the pinned CIB Seven 2.2.0 environment
  ([expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md)). -/
  | juel
  deriving DecidableEq, Repr

/-- Which variables a Multi-Instance loop reads its collection from and gives each instance its item in. -/
inductive MultiInstanceBinding where
  /-- BPMN 2.0.2 §10.2.8, §10.4.1: the Data Associations into the loop's Data Inputs. -/
  | dataAssociations
  /-- CIB-INT-0014: the variable `loopDataInputRef` names and the `inputDataItem`'s `name`. -/
  | loopReferences
  deriving DecidableEq, Repr

/-- What becomes of an effect result value that no output mapping consumes. -/
inductive ResultValues where
  /-- BPMN 2.0.2 §10.4.1: the result is the Activity's OutputSet, so such a value is rejected (`undeclared-output`). -/
  | outputSet
  /-- CIB-EXT-0015: the delegate writes it as an Activity local, which ends with the Activity. -/
  | activityLocals
  deriving DecidableEq, Repr

/-- Which names a Multi-Instance completion condition reads besides the instance's own locals
([expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#counter-values)). -/
inductive MultiInstanceCounters where
  /-- BPMN 2.0.2 Table 10.30 names no expression variable: no counter name resolves. -/
  | none
  /-- CIB-INT-0018: `loopCounter`, `nrOfInstances`, `nrOfActiveInstances` and `nrOfCompletedInstances` with CIB's
  values, each a Java `Integer`. -/
  | cibLocals
  deriving DecidableEq, Repr

/-- The names CIB-INT-0018 binds, in `cibLocals`' order: the instance's index, the count, the active and the completed
instances (`MultiInstanceActivityBehavior.java:49-54`). -/
def multiInstanceCounterNames : List String :=
  ["loopCounter", "nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"]

/-- What a Multi-Instance count or collection that is unavailable or of the wrong kind does. -/
inductive MultiInstanceInputFailure where
  /-- BPMN 2.0.2 §10.4.2: an unavailable input holds the occurrence; a wrong kind is a semantic failure. -/
  | hold
  /-- CIB-INT-0019: the operation fails, following the stimulus table. -/
  | rollback
  deriving DecidableEq, Repr

/-- Which values a Multi-Instance cardinality counts by. -/
inductive MultiInstanceCount where
  /-- BPMN 2.0.2 Table 10.29: the expression "MUST evaluate to an integer". -/
  | integer
  /-- CIB-EXT-0033: CIB's `resolveLoopCardinality`, which also counts a String through `Integer.parseInt` and an
  integral Decimal, at Java's `int` width. -/
  | javaInt
  deriving DecidableEq, Repr

/-- What an Activity's output mappings read besides the values its completion or effect result submits. -/
inductive OutputContext where
  /-- BPMN 2.0.2 §10.4.2: nothing; the outputs map the submitted values alone. -/
  | submission
  /-- CIB-EXT-0031: the variables visible from the Activity's own scope, its captured inputs first. -/
  | activityScope
  deriving DecidableEq, Repr

/-- What a Business Rule Task executes. -/
inductive BusinessRuleTask where
  /-- BPMN 2.0.2 §10.3.3 leaves the rule engine open, so a Business Rule Task has no meaning the kernel executes. -/
  | refused
  /-- CIB-EXT-0032: `camunda:decisionRef` names a DMN 1.3 decision table the program carries
  ([decision semantics](../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md)). -/
  | decisionTable
  deriving DecidableEq, Repr

/-- Where a position held by an element continues when a converging Inclusive Gateway asks whether it can still reach
one of its empty inputs ([flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#inclusive-join-activation-and-reach)). -/
inductive InclusiveJoinReach where
  /-- BPMN 2.0.2 Table 13.3 leaves it open; the standards reading also follows the host's Boundary Events (§10.5.4). -/
  | withBoundaries
  /-- CIB-INT-0020: `InclusiveGatewayActivityBehavior#isReachable` follows only outgoing transitions. -/
  | outgoingOnly
  deriving DecidableEq, Repr

/-- How one closure orders the branches of a split. -/
inductive BranchSchedule where
  /-- BPMN 2.0.2 Table 13.1, §13.3.1: branches are concurrent and any interleaving is permitted, so admission refuses a
  split one of whose branches writes a name another reads or writes in the closure (`flow.concurrentWrite`), and the
  closure's order is immaterial. -/
  | orderInvariant
  /-- CIB-OP-0016: in Sequence Flow declaration order, each branch to its next wait, join or end before the next starts
  (`PvmAtomicOperationTransitionDestroyScope:128-134`, `CommandInvocationContext:95,139`), an idle scope occurrence
  completing before the next token moves (`PvmAtomicOperationActivityEnd:105`). -/
  | declarationDepthFirst
  deriving DecidableEq, Repr

/-- How often a non-interrupting Conditional boundary or Event Sub-Process start fires while its condition holds
([subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#conditions)). -/
inductive ConditionalRetrigger where
  /-- BPMN 2.0.2 Tables 10.89, 10.90: it is triggered when its condition becomes true, so it fires again only after an
  evaluation found the condition false. `camunda:variableName` and `camunda:variableEvents` are refused. -/
  | edge
  /-- CIB-EXT-0035: each offered write whose evaluation is true fires it, same-value updates included, filtered by
  `camunda:variableName` and `camunda:variableEvents` (`ConditionalEventDefinition.java:91-113`). -/
  | eachWrite
  deriving DecidableEq, Repr

/-- What a literal Timer value the pinned parser cannot read does. -/
inductive MalformedTimer where
  /-- BPMN 2.0.2 Table 10.101: the value MUST conform to ISO 8601, so such a model is refused at admission. -/
  | refused
  /-- CIB-EXT-0036: the model deploys and the arming fails, rolling back the input that reached it. -/
  | rollsBackArming
  deriving DecidableEq, Repr

/-- What a Message's `name` is. -/
inductive MessageNames where
  /-- BPMN 2.0.2 Table 8.48: a text description; a Message is addressed by its identifier, so a nameless Message is
  admitted and a name is never an expression. -/
  | description
  /-- CIB-LIM-0022: CIB addresses a Message subscription by its name, which must be non-blank and unique among the
  subscriptions of one event scope, and may be an expression resolved when the subscription opens. -/
  | addresses
  deriving DecidableEq, Repr

/-- What entering an embedded Sub-Process or Transaction without a start Event does. -/
inductive ScopeStart where
  /-- BPMN 2.0.2 §13.3.4: the Scope begins its Activities and Scopes that have no incoming flow. -/
  | implicit
  /-- CIB-LIM-0024: such a Scope is refused at admission, as CIB refuses deploying a Sub-Process without a start
  Event and fails entering such a Transaction. -/
  | required
  deriving DecidableEq, Repr

/-- What addresses a Signal. -/
inductive SignalNames where
  /-- BPMN 2.0.2 Table 10.100: an event references its Signal by `signalRef`, a QName; the Signal's `name` is
  descriptive (`tSignal.name` is `xsd:string`, `Semantic.xsd:1394`). -/
  | identifier
  /-- CIB keys a Signal subscription and a throw by the Signal's `name`, an expression where it holds one
  (`BpmnParse.java:474-498`, `EventSubscriptionDeclaration#resolveExpressionOfEventName`). -/
  | addresses
  deriving DecidableEq, Repr

/-- What a Signal carries besides its address. -/
inductive SignalPayload where
  /-- BPMN 2.0.2 §10.5.1: a Signal is a broadcast trigger and carries no data to its catchers. -/
  | none
  /-- CIB installs a Signal's variables into the receiving scope and the instance a Signal start creates
  (`EventHandlerImpl.java:56-58`, `SignalEventHandler.java:56-57`, `SignalEventReceivedCmd.java:179`). -/
  | variables
  deriving DecidableEq, Repr

/-- Whom an external Signal reaches. -/
inductive SignalDelivery where
  /-- BPMN 2.0.2 Table 10.88: a Signal is broadcast to every process that can receive it. -/
  | broadcastOnly
  /-- CIB also delivers an external Signal to the one execution a request names (`SignalEventReceivedCmd.java:119-131`). -/
  | occurrenceTargeted
  deriving DecidableEq, Repr

/-- What a Conditional root start Event evaluates. -/
inductive ConditionalStart where
  /-- BPMN 2.0.2 Table 10.84: the condition's environment lies outside the process, so no start input carries it. -/
  | refused
  /-- CIB evaluates a root start condition per request over the submitted variables alone
  (`EvaluateStartConditionCmd.java:49-83`, `DefaultConditionHandler.java:44-134`). -/
  | submittedContext
  deriving DecidableEq, Repr

/-- How a Call Activity's `calledElement` names the process it calls. -/
inductive CalledElementResolution where
  /-- BPMN 2.0.2 §15.3.2 and `Semantic.xsd:149`: a QName resolved against the element's namespace bindings, whose local
  part is the called process's id. -/
  | qualifiedName
  /-- CIB reads `calledElement` as a definition key text and selects by its `calledElementBinding`
  (`BpmnParse.java:3934, 3945-3990`, `CallableElementUtil.java:75-103`). -/
  | cibKey
  deriving DecidableEq, Repr

/-- Which Message throw forms run. -/
inductive MessageThrowForms where
  /-- BPMN 2.0.2 Tables 10.88 and 10.89: a Message throw sends a Message and names no transport, so it is refused. -/
  | refused
  /-- CIB runs a Message throw with a declared implementation as a Service Task and passes on one without
  (`BpmnParse.java:1643-1659`, `3174-3189`; CIB-EXT-0039, CIB-INT-0027). -/
  | cibForms
  deriving DecidableEq, Repr

structure ProfileOptions where
  relations : List String := []
  evaluator : Evaluator := .simpleBoolean
  submission : SubmissionRule := .outputSet
  /-- When set, a User Task submission may name only variables a scope occurrence on the task's chain declares, each
  once, and its canonical JSON may take at most this many UTF-8 bytes (CIB-EXT-0020, `NSD-TASK-01`). -/
  scopeChainSubmissionBytes : Option Nat := none
  undeclaredWrite : UndeclaredWrite := .refused
  errorPathOutputs : ErrorPathOutputs := .none
  raisedCallOutputs : RaisedCallOutputs := .none
  technicalFailure : TechnicalFailure := .hostFailure
  /-- An effect incident offers `cancelIncidentProcess` (CIB-OP-0009). -/
  incidentProcessCancellation : Bool := false
  continuationFailure : ContinuationFailure := .rolledBack
  conditionOrder : ConditionOrder := .afterOutputs
  messageCorrelation : MessageCorrelation := .modeledKey
  deliveryVariables : DeliveryVariables := .mappedOnly
  multiInstanceFinalBody : MultiInstanceFinalBody := .conditionEveryCompletion
  multiInstanceOutputs : MultiInstanceOutputs := .aggregates
  compensationOrder : CompensationOrder := .dependency
  compensationHandlerFailure : CompensationHandlerFailure := .failsInstance
  implicitCompensation : ImplicitCompensation := .refused
  errorExitCompensation : ErrorExitCompensation := .drops
  multiInstanceCompensation : MultiInstanceCompensation := .perSubProcessInstance
  transactionMethods : TransactionMethods := .compensateOnly
  compensationReferenceScope : CompensationReferenceScope := .visible
  abnormalScopeEnd : AbnormalScopeEnd := .withoutOutflow
  unhandledError : UnhandledError := .failsInstance
  errorCatchVariables : ErrorCatchVariables := .refused
  callBindingTime : CallBindingTime := .programAssembly
  timerZone : Option String := none
  multiInstanceBinding : MultiInstanceBinding := .dataAssociations
  effectResultValues : ResultValues := .outputSet
  outputContext : OutputContext := .submission
  multiInstanceCounters : MultiInstanceCounters := .none
  multiInstanceInputFailure : MultiInstanceInputFailure := .hold
  multiInstanceCount : MultiInstanceCount := .integer
  businessRuleTask : BusinessRuleTask := .refused
  inclusiveJoinReach : InclusiveJoinReach := .withBoundaries
  branchSchedule : BranchSchedule := .orderInvariant
  conditionalRetrigger : ConditionalRetrigger := .edge
  malformedTimer : MalformedTimer := .refused
  messageNames : MessageNames := .description
  scopeStart : ScopeStart := .implicit
  signalNames : SignalNames := .identifier
  signalPayload : SignalPayload := .none
  signalDelivery : SignalDelivery := .broadcastOnly
  conditionalStart : ConditionalStart := .refused
  calledElementResolution : CalledElementResolution := .qualifiedName
  messageThrowForms : MessageThrowForms := .refused
  deriving Repr

end Kernel
