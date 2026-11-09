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

inductive UnhandledError where
  | refused
  /-- CIB-CFG-0004. -/
  | endsThrowingPath
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

inductive Evaluator where
  | simpleBoolean
  | juel
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
  unhandledError : UnhandledError := .refused
  callBindingTime : CallBindingTime := .programAssembly
  timerZone : Option String := none
  deriving Repr

end Kernel
