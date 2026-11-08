module

/-! # Kernel IL

The kernel's program representation: a flat table of elements keyed by identifier, fixed for every row of the
[coverage target](../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md). Each element is a header plus one payload record.
A field the admitted surface does not cover is refused by `Kernel.Admission`, never left out of these types
([forward-compatible restrictions](../../CLAUDE.md#forward-compatible-restrictions)).

Data values (`Value`) are the one nested inductive: element, scope and state structure is flat and refers by
identifier, but a business value is a tree on the wire and kernel logic never recurses through it.
-/

public section

namespace Kernel

structure ElementId where
  value : String
  deriving DecidableEq, Hashable, Repr, Inhabited

structure FlowId where
  value : String
  deriving DecidableEq, Hashable, Repr, Inhabited

/-- A typed data value, as the scenario contract's `variableValue` carries it. -/
inductive Value where
  | null
  | bool (value : Bool)
  | int (value : Int)
  | decimal (coefficient : Int) (scale : Nat)
  | string (value : String)
  | stringList (items : List String)
  | list (items : List Value)
  | map (entries : List (String × Value))
  deriving Repr, Inhabited

/-- The Simple Boolean subset, evaluated inside the kernel
([decision](../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)). -/
inductive SimpleBoolean where
  | literal (value : Bool)
  | isPresent (name : String)
  | isNull (name : String)
  | stringEquals (name value : String)
  deriving DecidableEq, Repr

/-- An expression. `literal`, `simpleBoolean` and `variable` are evaluated by the kernel; `foreign` is answered by
the profile's evaluator through an evaluation request. -/
inductive Expression where
  | literal (value : Value)
  | simpleBoolean (body : SimpleBoolean)
  | variable (name : String)
  | foreign (language source : String)
  deriving Repr

/-- A configuration value given either literally or by an expression. -/
inductive ValueSource where
  | literal (value : String)
  | expression (body : Expression)
  deriving Repr

/-- `target := source`, evaluated in the scope the owning element names. -/
structure Mapping where
  target : String
  source : Expression
  deriving Repr

/-! ## Subscriptions -/

inductive CycleDialect where
  | iso8601
  | cron
  deriving DecidableEq, Repr

inductive TimerSchedule where
  | duration (value : ValueSource)
  | date (value : ValueSource)
  | cycle (value : ValueSource) (dialect : CycleDialect)
  deriving Repr

structure TimerTrigger where
  schedule : TimerSchedule
  deriving Repr

structure CorrelationCriterion where
  key : String
  value : Expression
  deriving Repr

/-- `name` is the BPMN Message's identifier, `none` for an unspecified Message (a Receive Task without
`messageRef`, which only its waiting occurrence addresses); `interfaceRef` and `operationRef` name the Operation that
carries it, when the model gives one. -/
structure MessageTrigger where
  name : Option ValueSource
  correlation : List CorrelationCriterion := []
  interfaceRef : Option String := none
  operationRef : Option String := none
  deriving Repr

structure SignalTrigger where
  name : ValueSource
  deriving Repr

structure ConditionTrigger where
  condition : Expression
  variableName : Option String := none
  variableEvents : List String := []
  deriving Repr

/-- `code = none` catches every Error. -/
structure ErrorTrigger where
  code : Option String
  codeVariable : Option String := none
  messageVariable : Option String := none
  deriving Repr

/-- `code = none` catches every Escalation. -/
structure EscalationTrigger where
  code : Option String
  codeVariable : Option String := none
  deriving Repr

/-- Guarded type: `Kernel.Feature.Subscriptions` owns matching on it. -/
inductive Trigger where
  | timer (payload : TimerTrigger)
  | message (payload : MessageTrigger)
  | signal (payload : SignalTrigger)
  | condition (payload : ConditionTrigger)
  | error (payload : ErrorTrigger)
  | escalation (payload : EscalationTrigger)
  | compensation
  | cancel
  deriving Repr

structure Subscription where
  trigger : Trigger
  outputs : List Mapping := []
  deriving Repr

structure Boundary where
  id : ElementId
  subscription : Subscription
  interrupting : Bool
  outgoing : List FlowId
  deriving Repr

/-! ## Throws -/

structure MessageThrow where
  binding : String
  payload : List Mapping := []
  deriving Repr

structure SignalThrow where
  name : ValueSource
  payload : List Mapping := []
  deriving Repr

structure ErrorThrow where
  code : String
  message : Option String := none
  deriving Repr

structure EscalationThrow where
  code : String
  deriving Repr

structure CompensationThrow where
  activity : Option ElementId
  waitForCompletion : Bool
  deriving Repr

/-- Guarded type: `Kernel.Feature.Propagation` owns matching on it. -/
inductive Throw where
  | none
  | message (payload : MessageThrow)
  | signal (payload : SignalThrow)
  | error (payload : ErrorThrow)
  | escalation (payload : EscalationThrow)
  | compensation (payload : CompensationThrow)
  | cancel
  | terminate
  deriving Repr

/-! ## Work -/

structure UserWork where
  name : Option String := none
  assignee : Option ValueSource := none
  candidateUsers : List ValueSource := []
  candidateGroups : List ValueSource := []
  formKey : Option String := none
  formFields : List (String × String) := []
  dueDate : Option ValueSource := none
  followUpDate : Option ValueSource := none
  priority : Option ValueSource := none
  deriving Repr

structure ReceiveWork where
  message : MessageTrigger
  deriving Repr

structure ServiceWork where
  protocol : String
  operation : String
  deriving Repr

structure SendWork where
  binding : String
  recipient : Option ValueSource := none
  correlation : List CorrelationCriterion := []
  deriving Repr

structure ScriptWork where
  format : String
  source : String
  resultVariable : Option String := none
  deriving Repr

structure RuleWork where
  decision : ValueSource
  resultVariable : Option String := none
  deriving Repr

inductive CallBinding where
  | latest
  | deployment
  | version (value : ValueSource)
  | versionTag (value : ValueSource)
  deriving Repr

structure CallWork where
  calledElement : ValueSource
  binding : CallBinding := .latest
  businessKey : Option Expression := none
  inputs : List Mapping := []
  outputs : List Mapping := []
  propagateAllInputs : Bool := false
  propagateAllOutputs : Bool := false
  deriving Repr

/-- Guarded type: `Kernel.Feature.Work` owns matching on it. -/
inductive Work where
  | none
  | manual
  | user (payload : UserWork)
  | receive (payload : ReceiveWork)
  | service (payload : ServiceWork)
  | send (payload : SendWork)
  | script (payload : ScriptWork)
  | rule (payload : RuleWork)
  | call (payload : CallWork)
  deriving Repr

/-! ## Multi-Instance and the shared activity envelope -/

inductive MultiInstanceMode where
  | sequential
  | parallel
  deriving DecidableEq, Repr

inductive InstanceCount where
  | collection (items : Expression)
  | cardinality (count : Expression)
  deriving Repr

structure MultiInstance where
  mode : MultiInstanceMode
  count : InstanceCount
  elementVariable : Option String := none
  completionCondition : Option Expression := none
  inputDataItem : Option String := none
  outputDataItem : Option String := none
  outputCollection : Option String := none
  mutableCollection : Bool := false
  deriving Repr

structure Envelope where
  incoming : List FlowId := []
  outgoing : List FlowId := []
  inputs : List Mapping := []
  outputs : List Mapping := []
  boundaries : List Boundary := []
  multiInstance : Option MultiInstance := none
  compensationHandler : Option ElementId := none
  deriving Repr

/-! ## Elements -/

structure ActivityPayload where
  work : Work
  envelope : Envelope := {}
  deriving Repr

/-- Guarded type: `Kernel.Feature.Scopes` owns matching on it. -/
inductive ScopeKind where
  | embedded
  | transaction
  | eventSubProcess (start : Subscription) (interrupting : Bool)
  deriving Repr

structure ScopePayload where
  kind : ScopeKind
  children : List ElementId
  localVariables : List String := []
  envelope : Envelope := {}
  deriving Repr

inductive Placement where
  | intermediate
  | finish
  deriving DecidableEq, Repr

inductive EventRole where
  | catch (subscription : Subscription)
  | throw (record : Throw)
  | linkCatch (name : String)
  | linkThrow (name : String)
  deriving Repr

structure EventPayload where
  role : EventRole
  placement : Placement
  incoming : List FlowId := []
  outgoing : List FlowId := []
  deriving Repr

structure ConditionalFlow where
  flow : FlowId
  condition : Option Expression
  deriving Repr

/-- An Event-Based Gateway arm is a catch Event or a Receive Task, named by identifier. -/
structure EventArm where
  target : ElementId
  deriving Repr

/-- Guarded type: `Kernel.Feature.Flow` owns matching on it. Conditional candidates keep document order. -/
inductive GatewayKind where
  | exclusive (candidates : List ConditionalFlow) (default : Option FlowId)
  | parallel
  | inclusive (candidates : List ConditionalFlow) (default : Option FlowId)
  | eventBased (arms : List EventArm)
  deriving Repr

structure GatewayPayload where
  kind : GatewayKind
  incoming : List FlowId := []
  outgoing : List FlowId := []
  deriving Repr

structure StartPayload where
  subscription : Option Subscription
  outgoing : List FlowId := []
  deriving Repr

structure Header where
  id : ElementId
  sourceType : String
  parent : Option ElementId
  deriving Repr

/-- Guarded type: `Kernel.Step` owns matching on it. -/
inductive Element where
  | activity (header : Header) (payload : ActivityPayload)
  | scope (header : Header) (payload : ScopePayload)
  | event (header : Header) (payload : EventPayload)
  | gateway (header : Header) (payload : GatewayPayload)
  | start (header : Header) (payload : StartPayload)
  deriving Repr

structure Flow where
  id : FlowId
  source : ElementId
  target : ElementId
  deriving Repr

structure ProgramIdentity where
  processId : String
  sourceSha256 : String
  profile : String
  deriving Repr

/-- The behaviour a profile selects where CIB Seven and the standard differ, as typed data the lowering fills from
the profile's relation identifiers; the kernel never reads a profile identifier. -/
structure ProfileOptions where
  /-- A User Task completion without output mappings writes its submitted values as Process variables
  (CIB-EXT-0005); otherwise a submission must be exactly the task's OutputSet. -/
  submissionInstallsVariables : Bool := true
  /-- An effect incident offers `cancelIncidentProcess` (CIB-OP-0009). -/
  incidentProcessCancellation : Bool := false
  deriving Repr

structure Program where
  identity : ProgramIdentity
  options : ProfileOptions := {}
  elements : List Element
  flows : List Flow
  deriving Repr

end Kernel
