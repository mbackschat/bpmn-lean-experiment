module

public import Kernel.IL.Types.Options
public import Kernel.IL.Types.Juel
public import Kernel.IL.Types.Expression
public import Kernel.IL.Types.Decision
public import Kernel.IL.Types.Lexical
public import Kernel.IL.Types.Reference
public import Kernel.IL.Types.MultiInstance
public import Kernel.IL.Types.Message
public import Kernel.IL.Types.Work

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

/-- `signalRef` is the Signal the event references, `none` when the model names none; `name` is that Signal's `name`
(BPMN 2.0.2 Table 10.100), `none` when it has none. -/
structure SignalTrigger where
  signalRef : Option QName := none
  name : Option ValueSource := none
  deriving Repr

/-- A variable write a Conditional Event's `camunda:variableEvents` filter can name (`ConditionalEventDefinition.java:91-113`):
the kind of every write the kernel logs. -/
inductive VariableEvent where
  | create
  | update
  | delete
  deriving DecidableEq, Repr

/-- The `camunda:variableEvents` name of an event. -/
def VariableEvent.name : VariableEvent → String
  | .create => "create"
  | .update => "update"
  | .delete => "delete"

/-- Whether `name` names a variable event; the filter's names stay source text, so admission refuses any other. -/
def VariableEvent.named (name : String) : Bool :=
  [VariableEvent.create, .update, .delete].any (·.name == name)

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

/-- `sourceId` is the identifier the model's author wrote, which publication shows; `id` is unique in the program, as
`Header.id` is. -/
structure Boundary where
  id : ElementId
  sourceId : String
  subscription : Subscription
  interrupting : Bool
  outgoing : List FlowId
  deriving Repr

/-! ## Throws -/

/-- `binding = none` is an unbound pass-through (PC-MESSAGE-09); `handlerKey` as `ServiceWork.handlerKey`. -/
structure MessageThrow where
  binding : Option EffectBinding := none
  handlerKey : Option String := none
  payload : List Mapping := []
  deriving Repr

/-- `signalRef` and `name` as `SignalTrigger`'s; `propagateAll` is the position among `payload` at which
`camunda:in variables="all"` copies every visible variable (PC-SIGNAL-01). -/
structure SignalThrow where
  signalRef : Option QName := none
  name : Option ValueSource := none
  payload : List Mapping := []
  propagateAll : Option Nat := none
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

/-! ## The shared activity envelope -/

structure Envelope where
  incoming : List FlowId := []
  outgoing : List FlowId := []
  inputs : List Mapping := []
  outputs : List Mapping := []
  boundaries : List Boundary := []
  multiInstance : Option MultiInstance := none
  /-- The Activities and Scopes an Association names as this element's compensation handlers; admission admits at most
  one (`compensation.handlerCount`), the list keeps a second for that refusal. -/
  compensationHandlers : List ElementId := []
  /-- BPMN `isForCompensation` (Table 10.3): the element is a compensation handler, outside the normal flow. -/
  forCompensation : Bool := false
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
  /-- The item names the Scope declares, which exist per Scope occurrence (BPMN 2.0.2 §10.4.1): its Properties, Data
  Objects and their references. Admission refuses every reference to one (`data.scopedItem`). -/
  items : List String := []
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

/-- The throw of a throw Event. -/
def EventPayload.throw? (payload : EventPayload) : Option Throw :=
  match payload.role with
  | .throw record => some record
  | .catch _ => none
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

/-- What a throw is read for outside its owners: whether it terminates its scope or throws Compensation, the Signal it
references, whose name `Kernel.Admission.Subscriptions.signalDefinitionNames` compares, and the effect a bound Message
throw opens (PC-MESSAGE-09). The IL's one match on `Throw`. -/
structure ThrowView where
  terminates : Bool := false
  compensates : Bool := false
  signal : Option SignalTrigger := none
  effect : Option EffectBinding := none

def throwView : Throw → ThrowView
  | .terminate => { terminates := true }
  | .compensation _ => { compensates := true }
  | .signal record => { signal := some { signalRef := record.signalRef, name := record.name } }
  | .message record => { effect := record.binding }
  | .none => {}
  | .error _ => {}
  | .escalation _ => {}
  | .cancel => {}

/-- The effect a bound Message throw opens, as a Service Task's. -/
def Throw.effect? (thrown : Throw) : Option EffectBinding := (throwView thrown).effect

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

/-- One trigger, read uniformly: the payload of its kind, `none` for every other. The IL's one match on `Trigger`; a
reader outside its owners takes the field it is about. -/
structure TriggerView where
  timer : Option TimerTrigger := none
  message : Option MessageTrigger := none
  signal : Option SignalTrigger := none
  condition : Option ConditionTrigger := none

def triggerView : Trigger → TriggerView
  | .timer payload => { timer := some payload }
  | .message payload => { message := some payload }
  | .signal payload => { signal := some payload }
  | .condition payload => { condition := some payload }
  | .error _ => {}
  | .escalation _ => {}
  | .compensation => {}
  | .cancel => {}

/-- The Timer of a trigger, if it is one. -/
def Trigger.timer? (trigger : Trigger) : Option TimerTrigger := (triggerView trigger).timer

/-- The Message of a trigger, if it is one. -/
def Trigger.message? (trigger : Trigger) : Option MessageTrigger := (triggerView trigger).message

/-- The Conditional trigger of a trigger, if it is one. -/
def Trigger.condition? (trigger : Trigger) : Option ConditionTrigger := (triggerView trigger).condition

/-- The start subscription of an Event Sub-Process scope, if it is one. -/
def ScopeKind.start? : ScopeKind → Option Subscription
  | .eventSubProcess start _ => some start
  | .embedded => none
  | .transaction _ => none

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

/-- The carried processes a Call's selector admits for a caller deployed at `callerDeployment` (`CallWork.selects`);
admission requires exactly one. Two versions of one key coexist because `Header.id` stays unique (PC-SCOPE-03). -/
def calledProcessFor (program : Program) (resolution : CalledElementResolution) (callerDeployment : Option Nat)
    (work : CallWork) : List CalledProcess :=
  let chosen := work.selects resolution callerDeployment (program.processes.map (·.definition))
  program.processes.filter (chosen.contains ·.definition)

/-- Whether a Call names the root process: by QName under `qualifiedName`, by key text under `cibKey`. -/
def callsRoot (program : Program) (resolution : CalledElementResolution) (work : CallWork) : Bool :=
  work.namesDefinition resolution { key := program.identity.processId, «namespace» := program.identity.«namespace» }

/-- The decision a DMN resource the program carries declares under `key`; admission refuses a key two resources
declare (`decision.duplicateId`). -/
def decision? (program : Program) (key : String) : Option Decision :=
  (program.decisionResources.flatMap (·.decisions)).find? (·.id == key)

/-- Whether an element begins when its parent Scope is entered without a none start Event: it has no incoming flow, is
no compensation handler, whether an Association names it or it is only marked `isForCompensation`, and is no Event
Sub-Process (BPMN 2.0.2 §10.7.1, §13.3.4, §13.5.5). -/
def beginsImplicitly (program : Program) (element : Element) : Bool :=
  let handler := program.elements.any fun other =>
    ((other.envelope?.map (·.compensationHandlers)).getD []).contains element.header.id
  let marked := (element.envelope?.map (·.forCompensation)).getD false
  let eventSubProcess := ((element.scope?).bind fun (_, payload) => payload.kind.start?).isSome
  element.incoming.isEmpty && element.start?.isNone && !handler && !marked && !eventSubProcess

/-- The process-level elements of a called process. -/
def processChildren (program : Program) (process : CalledProcess) : List Element :=
  process.children.filterMap program.element?

/-- The elements on the level of `header`'s element: its parent's children, or at a process's top level that process's
own, since `children none` is only the root process's and a called Process behaves as a normal Process (BPMN 2.0.2
§13.3.4). -/
def siblings (program : Program) (header : Header) : List Element :=
  match header.parent, program.processes.find? (·.children.contains header.id) with
  | none, some process => program.processChildren process
  | parent, _ => program.children parent

/-- The called process `header`'s element belongs to: the one whose top level holds the element or its outermost
enclosing element; `none` for an element of the root process. -/
def processOf (program : Program) (header : Header) : Option CalledProcess :=
  let rec outermost : Nat → ElementId → ElementId
    | 0, id => id
    | fuel + 1, id =>
      match (program.element? id).bind (·.header.parent) with
      | some parent => outermost fuel parent
      | none => id
  let top := outermost program.elements.length header.id
  program.processes.find? (·.children.contains top)

/-- The deploy ordinal a Call on `header`'s element binds at: its copy's, for an element of another deployment's process
the program carries, else the program's own, so a process binds the same callees in every program that carries it
(PC-SCOPE-03). -/
def callerDeployment (program : Program) (header : Header) : Option Nat :=
  ((program.processOf header).bind (·.definition.deployment)).orElse fun _ => program.identity.deployment

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

/-- The identifier publication and addressing show for an element or boundary: the one its author wrote. -/
def publicId (program : Program) (id : ElementId) : ElementId :=
  match program.element? id with
  | some element => ⟨element.header.origin.sourceId⟩
  | none => ((program.boundary? id).map fun (_, boundary) => ⟨boundary.sourceId⟩).getD id

end Program

end Kernel
