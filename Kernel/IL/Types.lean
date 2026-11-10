module

public import Kernel.IL.Types.Options
public import Kernel.IL.Types.Juel
public import Kernel.IL.Types.Expression
public import Kernel.IL.Types.Decision

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

/-- `alternatives` are a Multiple Event's definitions after the first, in document order, and `parallelMultiple` its
Parallel Multiple mark (BPMN 2.0.2 §10.5.1); admission refuses both (CIB-LIM-0008). -/
structure Subscription where
  trigger : Trigger
  outputs : List Mapping := []
  alternatives : List Trigger := []
  parallelMultiple : Bool := false
  deriving Repr

structure Boundary where
  id : ElementId
  subscription : Subscription
  interrupting : Bool
  outgoing : List FlowId
  deriving Repr

/-! ## Throws -/

structure EffectBinding where
  protocol : String
  operation : String
  deriving DecidableEq, Repr

/-- `binding = none` is an unbound pass-through (PC-MESSAGE-09). -/
structure MessageThrow where
  binding : Option EffectBinding := none
  payload : List Mapping := []
  deriving Repr

structure SignalThrow where
  name : ValueSource
  payload : List Mapping := []
  propagateAll : Bool := false
  localOnly : Bool := false
  businessKey : Option Expression := none
  asynchronous : Bool := false
  deriving Repr

structure ErrorThrow where
  code : String
  message : Option ValueSource := none
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

/-- `instantiate` marks a Receive Task that instantiates its Process (BPMN 2.0.2 §10.3.3, Table 10.10). -/
structure ReceiveWork where
  message : MessageTrigger
  instantiate : Bool := false
  deriving Repr

structure ServiceWork where
  protocol : String
  operation : String
  deriving Repr

structure SendWork where
  binding : EffectBinding
  recipient : Option ValueSource := none
  correlation : List CorrelationCriterion := []
  messageRef : Option String := none
  operationRef : Option String := none
  deriving Repr

structure ScriptWork where
  format : String
  source : String
  resultVariable : Option String := none
  deriving Repr

inductive CallBinding where
  | latest
  | deployment
  | version (value : ValueSource)
  | versionTag (value : ValueSource)
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
  binding : CallBinding := .latest
  resultMapping : DecisionResultMapping := .resultList
  tenant : Option ValueSource := none
  deriving Repr

structure CallWork where
  calledElement : ValueSource
  binding : CallBinding := .latest
  tenant : Option ValueSource := none
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
  /-- Both a cardinality and a collection, which CIB reads together (`MultiInstanceActivityBehavior:84-89`, `:107-110`);
  admission refuses it (`multiInstance.countAndCollection`). -/
  | countAndCollection (count : Expression) (items : Expression)
  deriving Repr

/-- Whether the input collection is read once on entry or re-read by a sequential Activity (PC-MI-08). -/
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
  /-- A transaction boundary before each instance begins and after it completes, declared on the loop
  characteristics; the envelope's marks are the body's (CIB-EXT-0027, `BpmnParse#parseMultiInstanceLoopCharacteristics`). -/
  asyncBefore : Bool := false
  asyncAfter : Bool := false
  /-- The element `loopDataInputRef` names and the `inputDataItem`'s `name`, which `MultiInstanceBinding.loopReferences`
  binds instead of the Data Associations (CIB-INT-0014). -/
  loopDataInputRef : Option String := none
  inputDataItemName : Option String := none
  deriving Repr

structure Envelope where
  incoming : List FlowId := []
  outgoing : List FlowId := []
  inputs : List Mapping := []
  outputs : List Mapping := []
  boundaries : List Boundary := []
  multiInstance : Option MultiInstance := none
  compensationHandler : Option ElementId := none
  /-- PC-CF-07. -/
  defaultFlow : Option FlowId := none
  /-- A transaction boundary before the element begins and after it completes (CIB-EXT-0027). -/
  asyncBefore : Bool := false
  asyncAfter : Bool := false
  deriving Repr

/-! ## Elements -/

structure ActivityPayload where
  work : Work
  envelope : Envelope := {}
  deriving Repr

/-- BPMN `transactionMethod`. CIB reads no such attribute (`BpmnParse#parseTransaction`). -/
inductive TransactionMethod where
  | compensate
  | store
  | image
  | other (uri : String)
  deriving DecidableEq, Repr

structure TransactionScope where
  method : TransactionMethod := .compensate
  deriving Repr

/-- Guarded type: `Kernel.Feature.Scopes` owns matching on it. -/
inductive ScopeKind where
  | embedded
  | transaction (payload : TransactionScope)
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

/-- `alternativeThrows` are a Multiple throw Event's definitions after the first, in document order (BPMN 2.0.2
§10.5.1). -/
structure EventPayload where
  role : EventRole
  placement : Placement
  incoming : List FlowId := []
  outgoing : List FlowId := []
  alternativeThrows : List Throw := []
  deriving Repr

/-- How an Event-Based Gateway begins (BPMN 2.0.2 §10.6.6): `instantiate="false"` is `none`; `instantiate="true"` is
`exclusive`, or `parallel` with `eventGatewayType="Parallel"`, which also reads `parallel` without `instantiate`. -/
inductive EventGatewayInstantiation where
  | none
  | exclusive
  | parallel
  deriving Repr

/-- Guarded type: `Kernel.Feature.Flow` owns matching on it. Conditional candidates keep document order; a Sequence
Flow's condition lives on the `Flow`. An Event-Based Gateway's arms are the targets of its outgoing flows. -/
inductive GatewayKind where
  | exclusive (candidates : List FlowId) (default : Option FlowId)
  | parallel
  | inclusive (candidates : List FlowId) (default : Option FlowId)
  | eventBased (instantiation : EventGatewayInstantiation)
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

/-- The definition a called process is bound to. `version` to `tenant` name a binding of a Call Activity, `none` for
the process this program carries; `sourceSha256` pins the source (PC-SCOPE-03). -/
structure DefinitionRef where
  key : String
  version : Option Nat := none
  versionTag : Option String := none
  deployment : Option String := none
  tenant : Option String := none
  sourceSha256 : Option String := none
  deriving DecidableEq, Repr

/-- `sourceId` is the identifier the model's author wrote, which publication shows. `Header.id` is unique in the
program, so that two versions of one called definition can coexist. -/
structure ElementOrigin where
  definition : Option DefinitionRef := none
  sourceId : String
  deriving Repr

structure Header where
  id : ElementId
  origin : ElementOrigin
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
  condition : Option Expression := none
  deriving Repr

structure ProgramIdentity where
  processId : String
  sourceSha256 : String
  profile : String
  deriving Repr

/-- A process the program carries besides its root process, for a Call Activity to call: its bound definition and
its process-level elements, which have no parent. -/
structure CalledProcess where
  definition : DefinitionRef
  children : List ElementId
  /-- The item names the process declares: its Properties, Data Objects and their references, and its own Data Inputs
  and Outputs. They are declared at the instance root before any value is bound (BPMN 2.0.2 §10.4.1). -/
  variables : List String := []
  /-- Table 10.1 `isExecutable`, absent read as `false`. -/
  executable : Bool := true
  deriving Repr

/-- `processes` lists the called processes; every other parentless element belongs to the root process, whose
declared item names are `variables` (as `CalledProcess.variables`). -/
structure Program where
  identity : ProgramIdentity
  options : ProfileOptions := {}
  elements : List Element
  flows : List Flow
  variables : List String := []
  processes : List CalledProcess := []
  /-- Table 10.1 `isExecutable` of the root process, absent read as `false`. -/
  executable : Bool := true
  /-- The DMN resources deployed with the source, which a Business Rule Task's `decisionRef` names. -/
  decisionResources : List DecisionResource := []

/-! ## Queries

Read-only projections of a `Program`, in this module so that no module beyond the three hubs has more than five
direct importers (guard 15). They project; they never dispatch on what an element means, so matching here does not
compete with the dispatch owners.
-/

def Element.header : Element → Header
  | .activity header _ => header
  | .scope header _ => header
  | .event header _ => header
  | .gateway header _ => header
  | .start header _ => header

/-- The envelope of an Activity or Scope; other elements have none. -/
def Element.envelope? : Element → Option Envelope
  | .activity _ payload => some payload.envelope
  | .scope _ payload => some payload.envelope
  | .event _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

def Element.activity? : Element → Option (Header × ActivityPayload)
  | .activity header payload => some (header, payload)
  | .scope _ _ => none
  | .event _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

def Element.scope? : Element → Option (Header × ScopePayload)
  | .scope header payload => some (header, payload)
  | .activity _ _ => none
  | .event _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

def Element.event? : Element → Option (Header × EventPayload)
  | .event header payload => some (header, payload)
  | .activity _ _ => none
  | .scope _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

def Element.gateway? : Element → Option (Header × GatewayPayload)
  | .gateway header payload => some (header, payload)
  | .activity _ _ => none
  | .scope _ _ => none
  | .event _ _ => none
  | .start _ _ => none

def Element.start? : Element → Option (Header × StartPayload)
  | .start header payload => some (header, payload)
  | .activity _ _ => none
  | .scope _ _ => none
  | .event _ _ => none
  | .gateway _ _ => none

/-- The subscription of a catch Event. -/
def EventPayload.catch? (payload : EventPayload) : Option Subscription :=
  match payload.role with
  | .catch subscription => some subscription
  | .throw _ => none
  | .linkCatch _ => none
  | .linkThrow _ => none

/-- The Link name of a throwing Link Event. -/
def EventPayload.linkThrow? (payload : EventPayload) : Option String :=
  match payload.role with
  | .linkThrow name => some name
  | .catch _ => none
  | .throw _ => none
  | .linkCatch _ => none

/-- The Link name of a catching Link Event. -/
def EventPayload.linkCatch? (payload : EventPayload) : Option String :=
  match payload.role with
  | .linkCatch name => some name
  | .catch _ => none
  | .throw _ => none
  | .linkThrow _ => none

/-- The outgoing flows of an element, boundaries' flows excluded. -/
def Element.outgoing : Element → List FlowId
  | .activity _ payload => payload.envelope.outgoing
  | .scope _ payload => payload.envelope.outgoing
  | .event _ payload => payload.outgoing
  | .gateway _ payload => payload.outgoing
  | .start _ payload => payload.outgoing

/-- The incoming flows of an element; a start Event has none. -/
def Element.incoming : Element → List FlowId
  | .activity _ payload => payload.envelope.incoming
  | .scope _ payload => payload.envelope.incoming
  | .event _ payload => payload.incoming
  | .gateway _ payload => payload.incoming
  | .start _ _ => []

/-- The Timer of a trigger, if it is one. -/
def Trigger.timer? : Trigger → Option TimerTrigger
  | .timer payload => some payload
  | .message _ => none
  | .signal _ => none
  | .condition _ => none
  | .error _ => none
  | .escalation _ => none
  | .compensation => none
  | .cancel => none

/-- The Message of a trigger, if it is one. -/
def Trigger.message? : Trigger → Option MessageTrigger
  | .message payload => some payload
  | .timer _ => none
  | .signal _ => none
  | .condition _ => none
  | .error _ => none
  | .escalation _ => none
  | .compensation => none
  | .cancel => none

/-- The Call a work record names, if it is one. -/
def Work.call? : Work → Option CallWork
  | .call work => some work
  | Work.none => Option.none
  | .manual => Option.none
  | .user _ => Option.none
  | .receive _ => Option.none
  | .service _ => Option.none
  | .send _ => Option.none
  | .script _ => Option.none
  | .rule _ => Option.none

/-- Whether the work opens a host effect (a Service Task). -/
def Work.isService : Work → Bool
  | .service _ => true
  | Work.none => false
  | .manual => false
  | .user _ => false
  | .receive _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

/-- Whether the work opens a User Task. -/
def Work.isUser : Work → Bool
  | .user _ => true
  | Work.none => false
  | .manual => false
  | .receive _ => false
  | .service _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

/-- The Message a work record waits for, if it does. -/
def Work.receive? : Work → Option MessageTrigger
  | .receive work => some work.message
  | Work.none => Option.none
  | .manual => Option.none
  | .user _ => Option.none
  | .service _ => Option.none
  | .send _ => Option.none
  | .script _ => Option.none
  | .rule _ => Option.none
  | .call _ => Option.none

/-- The start subscription of an Event Sub-Process scope, if it is one. -/
def ScopeKind.start? : ScopeKind → Option Subscription
  | .eventSubProcess start _ => some start
  | .embedded => none
  | .transaction _ => none

/-- The published name of a Multi-Instance mode. -/
def MultiInstanceMode.name : MultiInstanceMode → String
  | .sequential => "sequential"
  | .parallel => "parallel"

def ValueSource.literal? : ValueSource → Option String
  | .literal value => some value
  | .expression _ => none

namespace Program

def element? (program : Program) (id : ElementId) : Option Element :=
  program.elements.find? (fun element => element.header.id == id)

def flow? (program : Program) (id : FlowId) : Option Flow :=
  program.flows.find? (·.id == id)

def target? (program : Program) (flow : FlowId) : Option ElementId :=
  (program.flows.find? (·.id == flow)).map (·.target)

def source? (program : Program) (flow : FlowId) : Option ElementId :=
  (program.flows.find? (·.id == flow)).map (·.source)

/-- Whether `element` is a process-level element of a called process. -/
def inCalledProcess (program : Program) (element : ElementId) : Bool :=
  program.processes.any (·.children.contains element)

/-- The elements whose parent is `parent`; `none` is the root process level. -/
def children (program : Program) (parent : Option ElementId) : List Element :=
  program.elements.filter fun element =>
    element.header.parent == parent && !(parent.isNone && program.inCalledProcess element.header.id)

/-- Whether the process an instance runs declares the item `name`: the root process for `none`, else the called
process of the definition its Call bound. -/
def declares (program : Program) (definition : Option DefinitionRef) (name : String) : Bool :=
  match definition with
  | none => program.variables.contains name
  | some bound => program.processes.any fun process => process.definition == bound && process.variables.contains name

/-- The called process of `key` the latest binding selects: the highest version the program carries, a process without
a version counting lowest. Two versions of one key coexist because `Header.id` stays unique (PC-SCOPE-03). -/
def calledProcess? (program : Program) (key : String) : Option CalledProcess :=
  (program.processes.filter (·.definition.key == key)).foldl (fun chosen process =>
    match chosen with
    | none => some process
    | some current =>
      if (current.definition.version.getD 0) < (process.definition.version.getD 0) then some process else chosen) none

/-- The decision a DMN resource the program carries declares under `key`; admission refuses a key two resources
declare (`decision.duplicateId`). -/
def decision? (program : Program) (key : String) : Option Decision :=
  (program.decisionResources.flatMap (·.decisions)).find? (·.id == key)

/-- The identifier publication and addressing show for an element: the one its author wrote. A boundary has no header
and keeps its identifier. -/
def publicId (program : Program) (id : ElementId) : ElementId :=
  ((program.element? id).map fun element => ⟨element.header.origin.sourceId⟩).getD id

/-- Whether an element begins when its parent Scope is entered without a none start Event: it has no incoming flow, is
no compensation handler, and is no Event Sub-Process (BPMN 2.0.2 §13.3.4, §13.5.5). -/
def beginsImplicitly (program : Program) (element : Element) : Bool :=
  let handler := program.elements.any fun other => (other.envelope?.bind (·.compensationHandler)) == some element.header.id
  let eventSubProcess := ((element.scope?).bind fun (_, payload) => payload.kind.start?).isSome
  element.incoming.isEmpty && element.start?.isNone && !handler && !eventSubProcess

/-- The process-level elements of a called process. -/
def processChildren (program : Program) (process : CalledProcess) : List Element :=
  process.children.filterMap program.element?

/-- The source element type of an element or boundary, which semantic publication shows. A boundary has no header; BPMN
has one element type for it. -/
def sourceType? (program : Program) (id : ElementId) : Option String :=
  match program.element? id with
  | some element => some element.header.sourceType
  | none => (program.elements.find? fun element =>
      (element.envelope?.any (·.boundaries.any (·.id == id)))).map fun _ => "boundaryEvent"

/-- A boundary by its id, with the element it is attached to. -/
def boundary? (program : Program) (id : ElementId) : Option (Element × Boundary) :=
  program.elements.findSome? fun element =>
    (element.envelope?.bind fun envelope => envelope.boundaries.find? (·.id == id)).map (element, ·)

end Program

end Kernel
