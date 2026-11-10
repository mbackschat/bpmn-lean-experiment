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
  /-- BPMN 2.0.2 §13.5.5. -/
  | dependency
  | reverseCreation
  deriving DecidableEq, Repr

inductive CompensationHandlerFailure where
  /-- COMPH-FAIL-01. -/
  | failsInstance
  | selected (code : String)
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
  deriving Repr

end Kernel
