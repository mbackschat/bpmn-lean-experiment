module

public import Kernel.IL.Footprint

/-! # Laws of flow: the closure walk, restated over the IL

The visit rules of the closure walk (`Kernel.Admission.Flow.closureWalk`) as an inductive relation over the IL
(`Reaches`), and a unit's `Account`: its footprint (`Kernel.IL.Footprint`'s reads and writes) and the work it begins,
completes, removes, resumes and compensates. `Kernel.Laws.Flow.Concurrent` pairs the units one closure may hold
together and states `Apart` over their accounts. The restatement keeps the walk's over-approximations, so it is no
stronger than what admission enforces: any work raise meets any catcher around it, a Signal throw resumes every Signal
subscription, a write arms every Conditional, a Compensation throw may begin every handler of its level. The readings
other owners' guarded types give the walk (`Kernel.AdmissionRegistry.reading`) appear as constructor hypotheses on
`Work`, `Throw`, `Trigger`, `ScopeKind` and `MultiInstanceMode`, never as a match. The relations assume admission's
well-formed IL: identifiers unique (`il.reference`) and parents that resolve to enclosing Scopes
(`Admission.Scopes.membership`), so the parent chain is finite. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Flow

open Kernel

/-! ## The IL's structure -/

/-- `outer` encloses `inner`: `inner`'s parent chain reaches it through elements the program holds. -/
inductive Within (program : Program) : ElementId → ElementId → Prop where
  | parent {inner outer : ElementId} {element : Element} : program.element? inner = some element →
      element.header.parent = some outer → Within program inner outer
  | trans {inner middle outer : ElementId} : Within program inner middle → Within program middle outer →
      Within program inner outer

/-- `ancestor` is an element enclosing `element`. -/
def Ancestor (program : Program) (element ancestor : Element) : Prop :=
  Within program element.header.id ancestor.header.id ∧ program.element? ancestor.header.id = some ancestor

/-- `top` is the process-level element `element` lies in, or `element` itself at a process's top level. -/
def Top (program : Program) (element top : Element) : Prop :=
  (element.header.parent = none ∧ top = element) ∨ (Ancestor program element top ∧ top.header.parent = none)

/-- `flow` leads to `target`. -/
def Targets (program : Program) (flow : FlowId) (target : Element) : Prop :=
  ∃ id, program.target? flow = some id ∧ program.element? id = some target

/-- A flow a token leaving `element` continues on: an outgoing flow, or for a throwing Link an outgoing flow of the
catching Link of its name among its siblings (`Kernel.onward`). -/
def Onward (program : Program) (element : Element) (flow : FlowId) : Prop :=
  flow ∈ element.outgoing ∨
    ∃ header payload name other, element.event? = some (header, payload) ∧ payload.linkThrow? = some name ∧
      other ∈ program.siblings header ∧ other.event?.bind (·.2.linkCatch?) = some name ∧ flow ∈ other.outgoing

/-- An element a token leaving `element` goes on to. -/
def Continuing (program : Program) (element next : Element) : Prop :=
  ∃ flow, Onward program element flow ∧ Targets program flow next

/-- A child an occurrence of the Scope `scope` begins on entry: a start Event, or without one a child that begins
implicitly (BPMN 2.0.2 §13.3.4). -/
def EnteredChildren (program : Program) (scope : ElementId) (child : Element) : Prop :=
  child ∈ program.children (some scope) ∧
    (child.start?.isSome = true ∨
      ((program.children (some scope)).any (·.start?.isSome) = false ∧ child.beginsImplicitly = true))

/-- `call` is a Call Activity whose selector binds `process`. -/
def Calls (program : Program) (call : Element) (process : CalledProcess) : Prop :=
  ∃ header payload work, call.activity? = some (header, payload) ∧ payload.work.call? = some work ∧
    ∃ bound ∈ program.calledProcessFor program.options.calledElementResolution (program.callerDeployment call.header)
      work, bound.definition = process.definition

/-! ## What an element is, for the walk -/

/-- A Gateway kind that may leave on several flows at once: Parallel or Inclusive. -/
def Forking (kind : GatewayKind) : Prop :=
  kind = .parallel ∨ ∃ candidates default, kind = .inclusive candidates default

/-- An Event-Based Gateway, which waits for one of its arms. -/
def WaitsGateway (element : Element) : Prop :=
  ∃ header payload instantiation, element.gateway? = some (header, payload) ∧ payload.kind = .eventBased instantiation

/-- An element a token waits at for a stimulus: a User, Service or Receive Task, a catch Event, an Event-Based
Gateway. -/
def AwaitsStimulus (element : Element) : Prop :=
  (∃ header payload, element.activity? = some (header, payload) ∧
    (payload.work.isUser = true ∨ payload.work.isService = true ∨ payload.work.receive?.isSome = true)) ∨
  (∃ header payload subscription, element.event? = some (header, payload) ∧ payload.catch? = some subscription) ∨
  WaitsGateway element

/-- An element a branch stops at: one that awaits a stimulus, or a converging Parallel or Inclusive Gateway. -/
def BranchStop (element : Element) : Prop :=
  AwaitsStimulus element ∨
    ∃ header payload, element.gateway? = some (header, payload) ∧ Forking payload.kind ∧ payload.incoming.length ≥ 2

def Thrown (element : Element) (thrown : Throw) : Prop :=
  ∃ header payload, element.event? = some (header, payload) ∧ payload.throw? = some thrown

def WorkOf (element : Element) (work : Work) : Prop :=
  ∃ header payload, element.activity? = some (header, payload) ∧ payload.work = work

def Loop (element : Element) (loop : MultiInstance) : Prop :=
  (element.envelope?).bind (·.multiInstance) = some loop

def Signalled (subscription : Subscription) : Prop := (triggerView subscription.trigger).signal.isSome = true

def Conditional (subscription : Subscription) : Prop := subscription.trigger.condition?.isSome = true

/-- A raise the element's run may make in its closure: a Service, Send or Call work's, a thrown Error, Escalation or
Cancel, a bound Message throw's effect failure (`Admission.Work.traits`, `Admission.Propagation.throwReading`). -/
def Raises (element : Element) : Prop :=
  (∃ work, WorkOf element work ∧
    ((∃ task, work = .service task) ∨ (∃ task, work = .send task) ∨ ∃ call, work = .call call)) ∨
  ∃ thrown, Thrown element thrown ∧
    ((∃ record, thrown = .error record) ∨ (∃ record, thrown = .escalation record) ∨ thrown = .cancel ∨
      thrown.effect?.isSome = true)

/-- A subscription that catches a raise: an Error, Escalation or Cancel trigger (`Admission.Subscriptions.catchView`). -/
def CatchesRaise (subscription : Subscription) : Prop :=
  (∃ trigger, subscription.trigger = .error trigger) ∨ (∃ trigger, subscription.trigger = .escalation trigger) ∨
    subscription.trigger = .cancel

/-- A subscription that surely takes an Error of `code` (`none`: of any code, which only a catch-all takes). -/
def CatchesError (subscription : Subscription) (code : Option String) : Prop :=
  ∃ trigger, subscription.trigger = .error trigger ∧ (trigger.code = none ∨ code = trigger.code)

/-- An element that begins compensation handlers: a Compensation throw or a Cancel End. -/
def Compensates (element : Element) : Prop :=
  ∃ thrown, Thrown element thrown ∧ ((∃ record, thrown = .compensation record) ∨ thrown = .cancel)

def EventSubProcessStart (element : Element) (subscription : Subscription) : Prop :=
  ∃ header payload, element.scope? = some (header, payload) ∧ payload.kind.start? = some subscription

def EventSubProcess (element : Element) : Prop := ∃ subscription, EventSubProcessStart element subscription

/-- An interrupting Event Sub-Process, whose start removes everything else in its parent's interior. -/
def Interrupts (element : Element) : Prop :=
  ∃ header payload start, element.scope? = some (header, payload) ∧ payload.kind = .eventSubProcess start true

def Terminates (element : Element) : Prop := ∃ thrown, Thrown element thrown ∧ (throwView thrown).terminates = true

def SignalThrow (element : Element) : Prop := ∃ thrown, Thrown element thrown ∧ (throwView thrown).signal.isSome = true

def Escalates (element : Element) : Prop := ∃ record, Thrown element (.escalation record)

/-- A loop that may run no instance, which completes its element in the closure that begins it: anything but a literal
positive cardinality (`Admission.MultiInstance.mayRunNone`). -/
def MayRunNone (element : Element) : Prop :=
  ∃ loop, Loop element loop ∧ ∀ count, loop.count = .cardinality (.literal (.int count)) → count ≤ 0

/-- A loop whose instance's completion may begin the next in the same closure: a sequential one, or any under
`declarationDepthFirst` (`Admission.MultiInstance.beginsNext`). -/
def NextInstance (program : Program) (element : Element) : Prop :=
  ∃ loop, Loop element loop ∧ (loop.mode ≠ .parallel ∨ program.options.branchSchedule = .declarationDepthFirst)

/-- A stop the walk runs through anyway: a loop that may run no instance, or a Conditional catch. -/
def RunsThrough (element : Element) : Prop :=
  MayRunNone element ∨
    ∃ header payload subscription, element.event? = some (header, payload) ∧ payload.catch? = some subscription ∧
      Conditional subscription

/-- A compensation handler: a Compensation Activity or a Compensation Event Sub-Process. -/
def Handler (element : Element) : Prop :=
  element.isCompensationActivity = true ∨
    ∃ subscription, EventSubProcessStart element subscription ∧ subscription.trigger = .compensation

/-! ## Visits, catchers and regions -/

/-- One visit of a walk: an element a token begins, one that completes, a boundary that fires, a host a raise passes. -/
inductive Visit where
  | enters (element : Element)
  | completes (element : Element)
  | fires (boundary : Boundary)
  | passes (element : Element)

/-- The visits a subscription `picks` takes on `element` resume with: its catch completes, its boundary fires, an Event
Sub-Process it starts begins. -/
inductive Catching (picks : Subscription → Prop) (element : Element) : Visit → Prop where
  | caught {header : Header} {payload : EventPayload} {subscription : Subscription} :
      element.event? = some (header, payload) → payload.catch? = some subscription → picks subscription →
      Catching picks element (.completes element)
  | attached {envelope : Envelope} {boundary : Boundary} : element.envelope? = some envelope →
      boundary ∈ envelope.boundaries → picks boundary.subscription → Catching picks element (.fires boundary)
  | started {subscription : Subscription} : EventSubProcessStart element subscription → picks subscription →
      Catching picks element (.enters element)

def ProgramCatching (program : Program) (picks : Subscription → Prop) (visit : Visit) : Prop :=
  ∃ element ∈ program.elements, Catching picks element visit

/-- The subscription a visit resumes or catches with. -/
def visitSubscription : Visit → Option Subscription
  | .completes caught => caught.event?.bind (·.2.catch?)
  | .fires boundary => some boundary.subscription
  | .enters element => (element.scope?).bind (·.2.kind.start?)
  | .passes _ => none

/-- `host` is on the way a raise from `element` takes: `element` itself when it is an Activity or Scope, and every
element enclosing it. -/
def OnChain (program : Program) (element host : Element) : Prop :=
  (host = element ∧ element.envelope?.isSome = true) ∨ Ancestor program element host

/-- A catcher of `element`'s own process level: a boundary on its chain, which also passes its host, or an Event
Sub-Process of a Scope on its chain or of the process level, any raised kind and code counting. -/
inductive LocalCatcher (program : Program) (element : Element) : Visit → Prop where
  | boundary {host : Element} {envelope : Envelope} {boundary : Boundary} : OnChain program element host →
      host.envelope? = some envelope → boundary ∈ envelope.boundaries → CatchesRaise boundary.subscription →
      LocalCatcher program element (.fires boundary)
  | host {host : Element} {envelope : Envelope} {boundary : Boundary} : OnChain program element host →
      host.envelope? = some envelope → boundary ∈ envelope.boundaries → CatchesRaise boundary.subscription →
      LocalCatcher program element (.passes host)
  | inner {host start : Element} {header : Header} {payload : ScopePayload} {subscription : Subscription} :
      OnChain program element host → host.scope? = some (header, payload) → start ∈ program.children (some header.id) →
      EventSubProcessStart start subscription → CatchesRaise subscription → LocalCatcher program element (.enters start)
  | level {top start : Element} {subscription : Subscription} : Top program element top →
      start ∈ program.siblings top.header → EventSubProcessStart start subscription → CatchesRaise subscription →
      LocalCatcher program element (.enters start)

/-- Where a raise from `element` may be caught: its own level's catchers and, from a called process's level, every Call
of it, which the raise passes, and that Call's catchers (`Kernel.Admission.Flow.catchers`). -/
inductive Catcher (program : Program) : Element → Visit → Prop where
  | here {element : Element} {visit : Visit} : LocalCatcher program element visit → Catcher program element visit
  | caller {element call : Element} {process : CalledProcess} : program.processOf element.header = some process →
      call ∈ program.elements → Calls program call process → Catcher program element (.passes call)
  | outward {element call : Element} {process : CalledProcess} {visit : Visit} :
      program.processOf element.header = some process → call ∈ program.elements → Calls program call process →
      Catcher program call visit → Catcher program element visit

/-- A catcher of `element`'s own process level surely takes an Error of `code`; a caller's is not counted, since another
caller may lack it. -/
def CaughtWithin (program : Program) (element : Element) (code : Option String) : Prop :=
  ∃ visit subscription, LocalCatcher program element visit ∧ visitSubscription visit = some subscription ∧
    CatchesError subscription code

/-- `element` is declared in `level` or in a Scope declared there. -/
inductive DeclaredIn (program : Program) (level : List Element) : Element → Prop where
  | here {element : Element} : element ∈ level → DeclaredIn program level element
  | inside {scope element : Element} {header : Header} {payload : ScopePayload} : DeclaredIn program level scope →
      scope.scope? = some (header, payload) → element ∈ program.children (some header.id) →
      DeclaredIn program level element

/-- An Error `element`'s run may raise, `none` standing for any code: a thrown Error's, a Service or Send work's, and
for a Call one its called processes let escape (`Kernel.Admission.Flow.raisedCodes`). -/
inductive RaisesError (program : Program) : Element → Option String → Prop where
  | thrown {element : Element} {record : ErrorThrow} : Thrown element (.error record) →
      RaisesError program element (some record.code)
  | work {element : Element} {work : Work} : WorkOf element work →
      ((∃ task, work = .service task) ∨ ∃ task, work = .send task) → RaisesError program element none
  | call {element inner : Element} {work : Work} {call : CallWork} {process : CalledProcess} {code : Option String} :
      WorkOf element work → work.call? = some call →
      process ∈ program.calledProcessFor program.options.calledElementResolution
        (program.callerDeployment element.header) call →
      DeclaredIn program (program.processChildren process) inner → RaisesError program inner code →
      ¬ CaughtWithin program inner code → RaisesError program element code

/-- `element` may raise an Error no catcher of its own process level surely takes. -/
def Escapes (program : Program) (element : Element) : Prop :=
  ∃ code, RaisesError program element code ∧ ¬ CaughtWithin program element code

/-- A region one run may remove at once: the interior of `root`, its own occurrence too when `inclusive`; `root = none`
is the process level of `source`; `everything` the whole instance with its callers and called instances. -/
structure Region where
  source : ElementId
  root : Option ElementId
  inclusive : Bool
  everything : Bool := false

/-- `region` removes the element `id`: it lies in the region, or in a called process a Call in it calls. -/
inductive Removes (program : Program) (region : Region) : ElementId → Prop where
  | everything {id : ElementId} : region.everything = true → Removes program region id
  | host {id : ElementId} {element : Element} : region.root = some id → region.inclusive = true →
      program.element? id = some element → Removes program region id
  | inside {id root : ElementId} {element scope : Element} : region.root = some root →
      program.element? id = some element → program.element? root = some scope → Within program id root →
      Removes program region id
  | level {id : ElementId} {element source : Element} : region.root = none →
      program.element? region.source = some source → program.element? id = some element →
      (program.processOf source.header).map (·.definition) = (program.processOf element.header).map (·.definition) →
      Removes program region id
  | called {id : ElementId} {element call : Element} {process : CalledProcess} : program.element? id = some element →
      program.processOf element.header = some process → call ∈ program.elements → Calls program call process →
      Removes program region call.header.id → Removes program region id

/-- The whole instance, which an Error no catcher takes ends under `UnhandledError.failsInstance` (BPMN 2.0.2 Table
10.88, "termination of the Process instance"), removing every other unit's work. -/
def Unhandled (program : Program) (element : Element) (region : Region) : Prop :=
  program.options.unhandledError = .failsInstance ∧ Escapes program element ∧
    region = { source := element.header.id, root := none, inclusive := false, everything := true }

/-- What an interrupting boundary's firing removes: its host with everything in it. -/
def Interruption (program : Program) (boundary : Boundary) (region : Region) : Prop :=
  boundary.interrupting = true ∧ ∃ host record, program.boundary? boundary.id = some (host, record) ∧
    region = { source := host.header.id, root := some host.header.id, inclusive := true }

/-- What beginning an interrupting Event Sub-Process or a Terminate End removes: its parent's interior. -/
def Removal (element : Element) (region : Region) : Prop :=
  (Interrupts element ∨ Terminates element) ∧
    region = { source := element.header.id, root := element.header.parent, inclusive := false }

/-! ## Compensation handlers and Signal anchors -/

/-- The level whose handlers a Compensation throw or Cancel End may begin: the children of the nearest enclosing Scope
that is no Event Sub-Process, or its process level. -/
def HandlerLevel (program : Program) (thrower : Element) (level : List Element) : Prop :=
  (∃ scope, Ancestor program thrower scope ∧ ¬ EventSubProcess scope ∧
    (∀ inner, Ancestor program thrower inner → Within program inner.header.id scope.header.id → EventSubProcess inner) ∧
    level = program.children (some scope.header.id)) ∨
  ((∀ scope, Ancestor program thrower scope → EventSubProcess scope) ∧
    ∃ top, Top program thrower top ∧ level = program.siblings top.header)

/-- A handler `thrower` may begin: any handler declared under its level; which records the run finds is the run's. -/
def HandlersOf (program : Program) (thrower handler : Element) : Prop :=
  Handler handler ∧ ∃ level, HandlerLevel program thrower level ∧ DeclaredIn program level handler

/-- An Activity or Scope whose record `handler` compensates: one naming it, or a Compensation Event Sub-Process's
Scope. -/
def SubjectOf (program : Program) (handler : Element) (subject : ElementId) : Prop :=
  (∃ element ∈ program.elements,
    handler.header.id ∈ (element.envelope?.map (·.compensationHandlers)).getD [] ∧ subject = element.header.id) ∨
  (handler.isCompensationActivity = false ∧ handler.header.parent = some subject)

/-- An Activity or Scope whose record a run of `element` may compensate. -/
def Compensated (program : Program) (element : Element) (subject : ElementId) : Prop :=
  Compensates element ∧ ∃ handler, HandlersOf program element handler ∧ SubjectOf program handler subject

/-- An element a resumed subscription waits on: a catch and the Event-Based Gateway it is an arm of, a boundary's host,
an Event Sub-Process's Scope. -/
def Anchors (program : Program) : Visit → ElementId → Prop
  | .completes caught, id =>
    id = caught.header.id ∨ ∃ flow ∈ program.flows, flow.target = caught.header.id ∧ flow.source = id ∧
      ∃ gateway, program.element? id = some gateway ∧ WaitsGateway gateway
  | .fires boundary, id => ∃ host record, program.boundary? boundary.id = some (host, record) ∧ id = host.header.id
  | .enters started, id => started.header.parent = some id
  | .passes _, _ => False

/-- An element whose open Signal subscription a Signal throw of `element` resumes. -/
def Resumed (program : Program) (element : Element) (id : ElementId) : Prop :=
  SignalThrow element ∧ ∃ visit, ProgramCatching program Signalled visit ∧ Anchors program visit id

/-! ## The walk -/

/-- How a walk goes on: where it stops, and whether a token ending in a Scope completes it, a called process's end
its Calls, and a looping element's instance begins the next. -/
structure Walk where
  stop : Element → Prop
  ascends : Bool

def Stops (walk : Walk) (element : Element) : Prop := walk.stop element ∧ ¬ RunsThrough element

/-- The visits a token leaving `element` makes on its own way: its flows and Link, and when it goes on nowhere and
the walk ascends, its parent's completion or its called process's Calls'; a handler completes no parent. -/
inductive OnwardVisit (program : Program) (walk : Walk) (element : Element) : Visit → Prop where
  | next {target : Element} : Continuing program element target → OnwardVisit program walk element (.enters target)
  | parent {parent : ElementId} {scope : Element} : walk.ascends = true →
      (∀ target, ¬ Continuing program element target) → ¬ Handler element → element.header.parent = some parent →
      program.element? parent = some scope → OnwardVisit program walk element (.completes scope)
  | caller {process : CalledProcess} {call : Element} : walk.ascends = true →
      (∀ target, ¬ Continuing program element target) → ¬ Handler element → element.header.parent = none →
      program.processOf element.header = some process → call ∈ program.elements → Calls program call process →
      OnwardVisit program walk element (.completes call)

/-- The visits `element`'s completion makes beside its own way: the catchers of its raise, the handlers it begins, a
handler's fellow handlers and their trigger's resumption, and every Signal subscription its Signal throw resumes
(CIB-OP-0019). -/
inductive Beyond (program : Program) (element : Element) : Visit → Prop where
  | raised {visit : Visit} : Raises element → Catcher program element visit → Beyond program element visit
  | compensated {handler : Element} : Compensates element → HandlersOf program element handler →
      Beyond program element (.enters handler)
  | fellow {thrower own handler : Element} : Handler element → thrower ∈ program.elements → Compensates thrower →
      HandlersOf program thrower own → own.header.id = element.header.id → HandlersOf program thrower handler →
      Beyond program element (.enters handler)
  | trigger {thrower own : Element} : Handler element → thrower ∈ program.elements → Compensates thrower →
      HandlersOf program thrower own → own.header.id = element.header.id → Beyond program element (.completes thrower)
  | signalled {visit : Visit} : SignalThrow element → ProgramCatching program Signalled visit →
      Beyond program element visit

def After (program : Program) (walk : Walk) (element : Element) (visit : Visit) : Prop :=
  OnwardVisit program walk element visit ∨ Beyond program element visit

/-- The visits beginning `element` makes: a Conditional boundary, an Event-Based Gateway's Conditional arm and a
Conditional Event Sub-Process start may fire on entry, a Scope begins its entered children, and a loop that may run no
instance completes. -/
inductive Entering (program : Program) (element : Element) : Visit → Prop where
  | condition {envelope : Envelope} {boundary : Boundary} : element.envelope? = some envelope →
      boundary ∈ envelope.boundaries → Conditional boundary.subscription → Entering program element (.fires boundary)
  | arm {flow : FlowId} {arm : Element} {header : Header} {payload : EventPayload} {subscription : Subscription} :
      WaitsGateway element → flow ∈ element.outgoing → Targets program flow arm → arm.event? = some (header, payload) →
      payload.catch? = some subscription → Conditional subscription → Entering program element (.completes arm)
  | child {header : Header} {payload : ScopePayload} {child : Element} : element.scope? = some (header, payload) →
      EnteredChildren program header.id child → Entering program element (.enters child)
  | start {header : Header} {payload : ScopePayload} {start : Element} {subscription : Subscription} :
      element.scope? = some (header, payload) → start ∈ program.children (some header.id) →
      EventSubProcessStart start subscription → Conditional subscription → Entering program element (.enters start)
  | empty : MayRunNone element → Entering program element (.completes element)

/-- The resumptions of the Signal subscriptions beginning `element` opens and leaves waiting: its catch and boundaries
when it `stops` there, an Event-Based Gateway's Signal arms, a Scope's Signal Event Sub-Process starts. -/
inductive Opened (program : Program) (element : Element) (stops : Prop) : Visit → Prop where
  | caught {header : Header} {payload : EventPayload} {subscription : Subscription} : stops →
      element.event? = some (header, payload) → payload.catch? = some subscription → Signalled subscription →
      Opened program element stops (.completes element)
  | attached {envelope : Envelope} {boundary : Boundary} : stops → element.envelope? = some envelope →
      boundary ∈ envelope.boundaries → Signalled boundary.subscription → Opened program element stops (.fires boundary)
  | arm {flow : FlowId} {arm : Element} {header : Header} {payload : EventPayload} {subscription : Subscription} :
      WaitsGateway element → flow ∈ element.outgoing → Targets program flow arm → arm.event? = some (header, payload) →
      payload.catch? = some subscription → Signalled subscription → Opened program element stops (.completes arm)
  | start {header : Header} {payload : ScopePayload} {start : Element} {subscription : Subscription} :
      element.scope? = some (header, payload) → start ∈ program.children (some header.id) →
      EventSubProcessStart start subscription → Signalled subscription → Opened program element stops (.enters start)

/-- What `element` reads and writes when it runs: `Kernel.footprint`'s account and what `Kernel.writes` adds. -/
def runFootprint (program : Program) (element : Element) : Footprint :=
  { reads := (footprint program element).reads, writes := (footprint program element).writes.union (writes element) }

/-- What one visit reads and writes: a boundary its catch's writes, an element its run, an element the walk stops at
what it reads when it begins. -/
def VisitFootprint (program : Program) (walk : Walk) : Visit → Footprint → Prop
  | .fires boundary, found => found = { writes := { names := catchWrites boundary.subscription } }
  | .passes element, found => found = runFootprint program element
  | .completes element, found => found = runFootprint program element
  | .enters element, found => (Stops walk element ∧ found = { reads := beginReads element }) ∨
      (¬ Stops walk element ∧ found = runFootprint program element)

/-- A unit of work: a walk from its start visits. -/
structure WorkUnit where
  walk : Walk
  start : Visit → Prop

/-- The visits a unit reaches in one closure, the closure walk's rules stated declaratively: a completion goes on and
makes what it makes beside (`After`), and under `ascends` a looping element's instance begins the next; an entered
element makes its entry visits (`Entering`) and, unless it stops there, completes at once; a fired boundary enters its
targets; and once anything is written, every Conditional of the program may resume (CIB-EXT-0035). -/
inductive Reaches (program : Program) (unit : WorkUnit) : Visit → Prop where
  | start {visit : Visit} : unit.start visit → Reaches program unit visit
  | completes {element : Element} {visit : Visit} : Reaches program unit (.completes element) →
      (After program unit.walk element visit ∨
        (unit.walk.ascends = true ∧ NextInstance program element ∧ visit = .enters element)) →
      Reaches program unit visit
  | enters {element : Element} {visit : Visit} : Reaches program unit (.enters element) →
      (Entering program element visit ∨ (¬ Stops unit.walk element ∧ After program unit.walk element visit)) →
      Reaches program unit visit
  | fires {boundary : Boundary} {flow : FlowId} {target : Element} : Reaches program unit (.fires boundary) →
      flow ∈ boundary.outgoing → Targets program flow target → Reaches program unit (.enters target)
  | arms {written visit : Visit} {found : Footprint} : Reaches program unit written →
      VisitFootprint program unit.walk written found → (found.writes.names ≠ [] ∨ found.writes.all = true) →
      ProgramCatching program Conditional visit → Reaches program unit visit

/-- `element` runs in the unit: it completes, or begins and does not stop. -/
def Acts (program : Program) (unit : WorkUnit) (element : Element) : Prop :=
  Reaches program unit (.completes element) ∨ (Reaches program unit (.enters element) ∧ ¬ Stops unit.walk element)

/-- The regions one visit may remove: an interrupting boundary's host, an interrupting Event Sub-Process's or Terminate
End's parent, and the whole instance for a run whose Error no catcher takes. -/
def VisitWithdraws (program : Program) (walk : Walk) : Visit → Region → Prop
  | .fires boundary, region => Interruption program boundary region
  | .passes _, _ => False
  | .completes element, region => Unhandled program element region
  | .enters element, region => Removal element region ∨ (¬ Stops walk element ∧ Unhandled program element region)

/-- What `Apart` compares of a unit: its footprint, the work it begins and completes, the regions it may remove, the
elements whose Signal subscriptions it resumes and whose records it compensates, and `exposed`, the elements whose
removal reaches it from the other unit of its pair: those it begins, or for a second occurrence of the same work the
element holding both. -/
structure Account where
  footprint : Footprint → Prop
  begins : ElementId → Prop
  completes : ElementId → Prop
  withdraws : Region → Prop
  resumes : ElementId → Prop
  compensates : ElementId → Prop
  exposed : ElementId → Prop

def WorkUnit.account (program : Program) (unit : WorkUnit) : Account where
  footprint found := ∃ visit, Reaches program unit visit ∧ VisitFootprint program unit.walk visit found
  begins id := ∃ element, element.header.id = id ∧ Reaches program unit (.enters element)
  completes id := ∃ element, element.header.id = id ∧ Acts program unit element
  withdraws region := ∃ visit, Reaches program unit visit ∧ VisitWithdraws program unit.walk visit region
  resumes id := ∃ element, Acts program unit element ∧ Resumed program element id
  compensates id := ∃ element, Acts program unit element ∧ Compensated program element id
  exposed id := ∃ element, element.header.id = id ∧ Reaches program unit (.enters element)

/-- The resumptions of the Signal subscriptions a unit leaves open, which one later broadcast resumes together. -/
def Wakes (program : Program) (unit : WorkUnit) (visit : Visit) : Prop :=
  ∃ element, Reaches program unit (.enters element) ∧ Opened program element (Stops unit.walk element) visit

/-- A token of the unit may end: an element it runs through goes on nowhere. -/
def Ends (program : Program) (unit : WorkUnit) : Prop :=
  ∃ element, Reaches program unit (.enters element) ∧ ¬ Stops unit.walk element ∧
    (∀ next, ¬ Continuing program element next) ∧
    ∀ header payload child, element.scope? = some (header, payload) → ¬ EnteredChildren program header.id child

/-- A name one unit writes and the other reads or writes (`Footprint.races`), the conflict `flow.concurrentWrite`
refuses. -/
def Races (left right : Account) : Prop :=
  ∃ own other, left.footprint own ∧ right.footprint other ∧ own.races other = true

/-- `own` acts on `other`'s work: it may remove a region reaching it, resume a Signal subscription it opens or
compensate an Activity it completes, the conflict `flow.concurrentInterference` refuses. -/
def Interferes (program : Program) (own other : Account) : Prop :=
  (∃ region id, own.withdraws region ∧ other.exposed id ∧ Removes program region id) ∨
    (∃ id, own.resumes id ∧ other.begins id) ∨ ∃ id, own.compensates id ∧ other.completes id

end Kernel.Laws.Flow
