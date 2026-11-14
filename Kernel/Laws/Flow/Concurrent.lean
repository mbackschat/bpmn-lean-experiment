module

public import Kernel.IL.Footprint

/-! # Laws of flow: the units one closure holds together, and when their order is immaterial

P6's order-invariance premise ([PLAN, P6](../../../docs/PLAN.md#proof-wave)) as a declarative IL condition: `Apart`.
`Concurrent` relates the accounts of two units of work one closure may hold together, one constructor per mechanism
that queues more than one work item; `Reaches` restates the visit rules of the closure walk
(`Kernel.Admission.Flow.closureWalk`) as an inductive relation over the IL, and a unit's `Account` reads its footprint
(`Kernel.IL.Footprint`'s reads and writes) and the work it begins, completes, removes, resumes and compensates from it.
`Apart` holds of a program when no two such units race on a name or act on each other's work. Under
`BranchSchedule.orderInvariant` admission enforces it with `flow.concurrentWrite`, `flow.concurrentInterference` and
`multiInstance.concurrentInstances` (`Kernel.Admission.Flow.Concurrency`); that it does stays scenario evidence, since a
law may not name the admission evaluator.

The restatement keeps the walk's over-approximations, so it is no stronger than what admission enforces: any work
raise meets any catcher around it, a Signal throw resumes every Signal subscription, a write arms every Conditional,
a Compensation throw may begin every handler of its level. Where admission excludes a pair (`ClosedAt`, `Preempts`,
`Contested`, `Ordered`), so does `Concurrent`. The readings other owners' guarded types give the walk
(`Kernel.AdmissionRegistry.reading`) appear as constructor hypotheses on `Work`, `Throw`, `Trigger`, `ScopeKind` and
`MultiInstanceMode`, never as a match. The relations assume admission's well-formed IL: identifiers unique
(`il.reference`) and parents that resolve to enclosing Scopes (`Admission.Scopes.membership`), so the parent chain is
finite. Nothing executable imports this module.
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

/-! ## Exclusions -/

/-- A level that may hold two tokens at once: two starts or implicitly begun children, a split, a boundary that does
not interrupt or leaves on several flows, an Event Sub-Process that does not interrupt, a compensation handler. With
`alongFlows` only tokens moving along the level's Sequence Flows count, so a handler and a boundary without an outgoing
flow, such as a Compensation boundary, add none. -/
def ConcurrentLevel (alongFlows : Bool) (level : List Element) : Prop :=
  (level.filter (·.start?.isSome)).length ≥ 2 ∨
    (level.any (·.start?.isSome) = false ∧ (level.filter (·.beginsImplicitly)).length ≥ 2) ∨
    ∃ element ∈ level, (alongFlows = false ∧ element.isCompensationActivity = true) ∨
      (∃ header payload, element.gateway? = some (header, payload) ∧ Forking payload.kind ∧
        payload.outgoing.length ≥ 2) ∨
      (element.gateway? = none ∧ element.outgoing.length ≥ 2) ∨
      (∃ envelope boundary, element.envelope? = some envelope ∧ boundary ∈ envelope.boundaries ∧
        ((boundary.interrupting = false ∧ ¬ (alongFlows = true ∧ boundary.outgoing = [])) ∨
          boundary.outgoing.length ≥ 2)) ∨
      (EventSubProcess element ∧ ¬ Interrupts element ∧ ¬ (alongFlows = true ∧ Handler element))

/-- At most one token moves through `element`'s level at a time and the level is entered at most once at a time: no
level from it outwards is concurrent, no Scope around it loops, and its process is the root process. -/
def Solitary (program : Program) (element : Element) : Prop :=
  ∃ top, Top program element top ∧ program.inCalledProcess top.header.id = false ∧
    ¬ ConcurrentLevel false (program.siblings top.header) ∧
    ∀ scope, Ancestor program element scope → (scope.envelope?).bind (·.multiInstance) = none ∧
      ¬ ConcurrentLevel false (program.children (some scope.header.id))

/-- The element a resumption's subscription hangs on: a catch, a boundary's host, an Event Sub-Process. -/
def AnchorOf (program : Program) (visit : Visit) (anchor : Element) : Prop :=
  match visit with
  | .completes caught => anchor = caught
  | .fires boundary => ∃ record, program.boundary? boundary.id = some (anchor, record)
  | .enters started => anchor = started
  | .passes _ => False

/-- An element telling apart two open occurrences of the subscription `visit` resumes: the Scope its anchor lies in,
or at a called process's level a Call of it; none for a solitary anchor. -/
def Holder (program : Program) (visit : Visit) (holder : ElementId) : Prop :=
  ∃ anchor, AnchorOf program visit anchor ∧ ¬ Solitary program anchor ∧
    (anchor.header.parent = some holder ∨
      (anchor.header.parent = none ∧ ∃ process call, program.processOf anchor.header = some process ∧
        call ∈ program.elements ∧ Calls program call process ∧ holder = call.header.id))

/-- The subscription `visit` resumes cannot be open while `thrower` runs: its anchor lies in a solitary level whose one
token is at the thrower or at an element holding it. An Event Sub-Process start is never closed. -/
def ClosedAt (program : Program) (thrower : Element) (visit : Visit) : Prop :=
  (∀ element, visit ≠ .enters element) ∧ ∃ held, AnchorOf program visit held ∧ Solitary program held ∧
    ∃ holder, (holder = thrower ∨ Ancestor program thrower holder) ∧ holder.header.parent = held.header.parent ∧
      (program.processOf holder.header).map (·.definition) = (program.processOf held.header).map (·.definition) ∧
      holder.header.id ≠ held.header.id

/-- What a resumption's first visit removes, as a queued signal that runs before any token moves. -/
def FirstWithdrawal (program : Program) : Visit → Region → Prop
  | .fires boundary, region => Interruption program boundary region
  | .enters element, region => Removal element region
  | .completes _, _ => False
  | .passes _, _ => False

/-- A resumption's first visit removes `element` with the level its token goes on in: the removal reaches `element`
and is no interruption of `element` itself, whose outflow lies outside it. -/
def Preempts (program : Program) (visit : Visit) (element : Element) : Prop :=
  ∃ region, FirstWithdrawal program visit region ∧ region.root ≠ some element.header.id ∧
    Removes program region element.header.id

/-- A write of `written` may make true the Conditional subscription `visit` resumes: under `ConditionalRetrigger.edge`
only a write of a name its condition reads (BPMN 2.0.2 Tables 10.89, 10.90), under `eachWrite` any its filters pass
(CIB-EXT-0035). -/
def MayMakeTrue (program : Program) (written : NameSet) (visit : Visit) : Prop :=
  ∃ subscription trigger, visitSubscription visit = some subscription ∧
    subscription.trigger.condition? = some trigger ∧
    (∀ name, trigger.variableName = some name → written.all = true ∨ name ∈ written.names) ∧
    (program.options.conditionalRetrigger = .eachWrite ∨ (expressionReads trigger.condition).meets written = true)

def conditionReads (visit : Visit) : NameSet :=
  ((visitSubscription visit).bind fun subscription =>
    subscription.trigger.condition?.map (expressionReads ·.condition)).getD {}

/-- Two Conditional resumptions are one contest, whose order the input's ranking states (CIB-LIM-0053): one's first
visit removes the other's anchor, or both are arms of one Event-Based Gateway. -/
def Contested (program : Program) (left right : Visit) : Prop :=
  (∃ region anchor, FirstWithdrawal program left region ∧ AnchorOf program right anchor ∧
    Removes program region anchor.header.id) ∨
  (∃ region anchor, FirstWithdrawal program right region ∧ AnchorOf program left anchor ∧
    Removes program region anchor.header.id) ∨
  ∃ id gateway, Anchors program left id ∧ Anchors program right id ∧ program.element? id = some gateway ∧
    WaitsGateway gateway

/-- Two Conditional resumptions one write may make true together, in distinct contests. -/
def Together (program : Program) (left right : Visit) : Prop :=
  left ≠ right ∧ ¬ Contested program left right ∧
    (program.options.conditionalRetrigger = .eachWrite ∨ (conditionReads left).meets (conditionReads right) = true)

/-- One step of a Sequence Flow path from an element, by its onward flows, or from a boundary Event. -/
def StepsOn (program : Program) (source : ElementId) (flow : FlowId) : Prop :=
  (∃ element, program.element? source = some element ∧ Onward program element flow) ∨
    (program.element? source = none ∧
      ∃ host boundary, program.boundary? source = some (host, boundary) ∧ flow ∈ boundary.outgoing)

/-- A path element that leaves no record: a Gateway or an intermediate Event. -/
def Transits (program : Program) (id : ElementId) : Prop :=
  ∃ element, program.element? id = some element ∧
    (element.gateway?.isSome = true ∨
      ∃ header payload, element.event? = some (header, payload) ∧ payload.placement = .intermediate)

/-- A Sequence Flow path from `source` to `target` through elements that transit only (`Kernel.flowReaches`). -/
inductive TransitPath (program : Program) : ElementId → ElementId → Prop where
  | direct {source target : ElementId} {flow : FlowId} : StepsOn program source flow →
      program.target? flow = some target → TransitPath program source target
  | through {source middle target : ElementId} {flow : FlowId} : StepsOn program source flow →
      program.target? flow = some middle → Transits program middle → TransitPath program middle target →
      TransitPath program source target

/-- One step a token takes onward from an element it reached: its own onward flows, or a flow of a boundary Event on
it. -/
def StepsAround (program : Program) (id : ElementId) (flow : FlowId) : Prop :=
  StepsOn program id flow ∨ ∃ element envelope boundary, program.element? id = some element ∧
    element.envelope? = some envelope ∧ boundary ∈ envelope.boundaries ∧ flow ∈ boundary.outgoing

/-- A token leaving `source`, an element or a boundary Event, may reach `target`: along Sequence Flows and Link pairs
through any element, Activities included, and the flows of the boundary Events of every element it reaches, though not
of `source`'s own, which it has left (`Kernel.Admission.Flow.reaches`). -/
inductive Goes (program : Program) (source : ElementId) : ElementId → Prop where
  | first {flow : FlowId} {target : ElementId} : StepsOn program source flow → program.target? flow = some target →
      Goes program source target
  | next {middle target : ElementId} {flow : FlowId} : Goes program source middle → StepsAround program middle flow →
      program.target? flow = some target → Goes program source target

/-- `element`'s level is entered once per process instance and moves one token at a time along its flows, so its
occurrences complete one after another along that token's path: no level from it outwards moves two tokens at once
along its flows, no Scope around it loops, is a compensation handler or may be entered again, and its process is the
root process (`Kernel.Admission.Flow.Concurrency.runsOnce`). -/
def RunsOnce (program : Program) (element : Element) : Prop :=
  ∃ top, Top program element top ∧ program.inCalledProcess top.header.id = false ∧
    ¬ ConcurrentLevel true (program.siblings top.header) ∧
    ∀ scope, Ancestor program element scope → (scope.envelope?).bind (·.multiInstance) = none ∧ ¬ Handler scope ∧
      ¬ Goes program scope.header.id scope.header.id ∧
      (∀ envelope boundary, scope.envelope? = some envelope → boundary ∈ envelope.boundaries →
        ¬ Goes program boundary.id scope.header.id) ∧
      ¬ ConcurrentLevel true (program.children (some scope.header.id))

/-- A path through Gateways and intermediate Events leads from a boundary Event of `first` to `second`. -/
def BoundaryLeads (program : Program) (first second : ElementId) : Prop :=
  ∃ host envelope boundary, program.element? first = some host ∧ host.envelope? = some envelope ∧
    boundary ∈ envelope.boundaries ∧ TransitPath program boundary.id second

/-- Every record of `first` precedes a later one of `second` and a record of `first` after one of `second` is ordered
too or cannot exist: a path leads from `first` to `second`, and either one leads back, so completion orders the pair
the same way, or `first` runs once along one token's path and no way out of `second` returns to it. -/
def Follows (program : Program) (first second : ElementId) : Prop :=
  TransitPath program first second ∧
    (TransitPath program second first ∨
      (¬ Goes program second first ∧ ∃ element, program.element? first = some element ∧ RunsOnce program element))

/-- Two subjects whose records `Kernel.Feature.Compensation.precedes` orders in every run (BPMN 2.0.2 §13.5.5): one
subject, ordered by completion; a path from one's boundary Events to the other, ordered whatever the completion; or
one follows the other. -/
def OrderedSubjects (program : Program) (first second : ElementId) : Prop :=
  first = second ∨ BoundaryLeads program first second ∨ BoundaryLeads program second first ∨
    Follows program first second ∨ Follows program second first

/-- Every pair of the two handlers' subjects is ordered. -/
def Ordered (program : Program) (left right : Element) : Prop :=
  ∀ first second, SubjectOf program left first → SubjectOf program right second → OrderedSubjects program first second

/-! ## Units -/

def branchWalk : Walk := { stop := BranchStop, ascends := false }
def instanceWalk : Walk := { stop := AwaitsStimulus, ascends := false }
def continuationWalk : Walk := { stop := BranchStop, ascends := true }

/-- A branch's path from `begun`, stopping where it waits or joins. -/
def pathFrom (begun : Visit → Prop) : WorkUnit := { walk := branchWalk, start := begun }

/-- The branch a token on `flow` runs. -/
def branch (program : Program) (flow : FlowId) : WorkUnit :=
  pathFrom fun visit => ∃ target, Targets program flow target ∧ visit = .enters target

/-- The resumptions of the subscriptions `unit` leaves open, which one broadcast starts together. -/
def wake (program : Program) (unit : WorkUnit) : WorkUnit := { walk := unit.walk, start := Wakes program unit }

/-- What a token leaving `element` runs next, ascending: a token that ends its Scope goes on with the Scope's
completion, since `Step.settle` completes an idle scope only after every signal and token. -/
def continuationOf (program : Program) (element : Element) : WorkUnit :=
  { walk := continuationWalk, start := OnwardVisit program continuationWalk element }

/-- What an occurrence of the Scope `scope` begins on entry. -/
def enteredFrom (program : Program) (scope : ElementId) (walk : Walk) : WorkUnit :=
  { walk, start := fun visit => ∃ child, EnteredChildren program scope child ∧ visit = .enters child }

/-- A resumption against a second open occurrence of its own subscription: a removal reaches it only through a
holder, and only names and removals are compared. -/
def itselfAt (program : Program) (visit : Visit) : Account :=
  { (pathFrom (· = visit)).account program with
    exposed := Holder program visit, resumes := fun _ => False, compensates := fun _ => False }

/-- The body with every instance in it, which an instance's completion removes once the completion condition holds
(BPMN 2.0.2 §13.3.7). -/
def bodyRegion (body : Element) : Region :=
  { source := body.header.id, root := some body.header.id, inclusive := true }

/-- A parallel Sub-Process body's instance against another: what it runs from its entered children, or from what one
broadcast resumes, a removal reaching the other only through the body, its completion under a completion condition
removing the body. -/
def instances (program : Program) (body : Element) (loop : MultiInstance) (unit : WorkUnit) : Account :=
  { unit.account program with
    withdraws := fun region => (unit.account program).withdraws region ∨
      (loop.completionCondition.isSome = true ∧ Ends program unit ∧ region = bodyRegion body)
    exposed := (· = body.header.id) }

/-- A parallel task body's instance against another: its run's footprint, and what its completion makes beside. -/
def taskInstances (program : Program) (body : Element) (loop : MultiInstance) : Account :=
  let beside := ({ walk := instanceWalk, start := Beyond program body } : WorkUnit).account program
  { beside with
    footprint := (· = runFootprint program body)
    withdraws := fun region => Unhandled program body region ∨ beside.withdraws region ∨
      (loop.completionCondition.isSome = true ∧ region = bodyRegion body)
    exposed := (· = body.header.id) }

/-- A compensation handler's own run, without its trigger's resumption, which comes after every handler it races. -/
def handlerAccount (program : Program) (handler : Element) : Account :=
  let begun := ({ walk := { stop := fun other => other.header.id = handler.header.id ∨ BranchStop other,
                            ascends := false },
                  start := (· = .enters handler) } : WorkUnit).account program
  { begun with
    footprint := fun found => begun.footprint found ∨ (¬ BranchStop handler ∧ found = runFootprint program handler)
    completes := fun id => begun.completes id ∨ (¬ BranchStop handler ∧ id = handler.header.id)
    withdraws := fun region => begun.withdraws region ∨ (¬ BranchStop handler ∧ Unhandled program handler region) }

/-! ## The mechanisms -/

/-- A source whose activation may leave on several flows: a Parallel or Inclusive Gateway, any other element, a
boundary Event. -/
def Forks (program : Program) (source : ElementId) : Prop :=
  program.element? source = none ∨ ∃ element, program.element? source = some element ∧
    (element.gateway? = none ∨ ∃ header payload, element.gateway? = some (header, payload) ∧ Forking payload.kind)

def Leaving (program : Program) (source : ElementId) (flow : FlowId) : Prop :=
  (∃ element, program.element? source = some element ∧ flow ∈ element.outgoing) ∨
    (program.element? source = none ∧
      ∃ host boundary, program.boundary? source = some (host, boundary) ∧ flow ∈ boundary.outgoing)

/-- A split's two branches, and the resumptions each leaves open, which a later broadcast starts together in the order
this closure opened them. -/
inductive BranchPair (program : Program) (own other : FlowId) : Account → Account → Prop where
  | branches : BranchPair program own other ((branch program own).account program) ((branch program other).account program)
  | wakes : BranchPair program own other ((wake program (branch program own)).account program)
      ((wake program (branch program other)).account program)

/-- A parallel body's instance against another, in the closure that begins them and in the one where a broadcast
resumes them. -/
inductive InstancePair (program : Program) (body : Element) (loop : MultiInstance) : Account → Account → Prop where
  | entered {header : Header} {payload : ScopePayload} : body.scope? = some (header, payload) →
      InstancePair program body loop (instances program body loop (enteredFrom program header.id instanceWalk))
        (instances program body loop (enteredFrom program header.id instanceWalk))
  | woken {header : Header} {payload : ScopePayload} : body.scope? = some (header, payload) →
      InstancePair program body loop
        (instances program body loop (wake program (enteredFrom program header.id instanceWalk)))
        (instances program body loop (wake program (enteredFrom program header.id instanceWalk)))
  | task : body.scope? = none → ¬ AwaitsStimulus body →
      InstancePair program body loop (taskInstances program body loop) (taskInstances program body loop)

/-- A Signal subscription a throw of `thrower` may resume: any of the program's, unless closed while it runs. -/
def SignalWake (program : Program) (thrower : Element) (visit : Visit) : Prop :=
  ProgramCatching program Signalled visit ∧ ¬ ClosedAt program thrower visit

/-- The units a Signal throw starts together: its continuation and each resumption whose first visit does not remove
it, two resumptions, and a resumption against a second open occurrence of its own subscription. -/
inductive SignalPair (program : Program) (thrower : Element) : Account → Account → Prop where
  | continuation {visit : Visit} : SignalWake program thrower visit → ¬ Preempts program visit thrower →
      SignalPair program thrower ((continuationOf program thrower).account program)
        ((pathFrom (· = visit)).account program)
  | resumptions {visit other : Visit} : SignalWake program thrower visit → SignalWake program thrower other →
      visit ≠ other →
      SignalPair program thrower ((pathFrom (· = visit)).account program) ((pathFrom (· = other)).account program)
  | itself {visit : Visit} {holder : ElementId} : SignalWake program thrower visit → Holder program visit holder →
      SignalPair program thrower (itselfAt program visit) (itselfAt program visit)

/-- A catcher of a raise that does not interrupt the thrower: a non-interrupting boundary or Event Sub-Process. -/
def NonInterrupting : Visit → Prop
  | .fires boundary => boundary.interrupting = false
  | .enters element => ¬ Interrupts element
  | .completes _ => False
  | .passes _ => False

/-- What a writer's run writes. -/
def Written (program : Program) (writer : Element) : NameSet := (runFootprint program writer).writes

/-- The path a writing boundary's firing starts, ascending like a continuation. -/
def boundaryPath (program : Program) (boundary : Boundary) : WorkUnit :=
  { walk := continuationWalk,
    start := fun visit => ∃ flow target, flow ∈ boundary.outgoing ∧ Targets program flow target ∧ visit = .enters target }

/-- The units a write's Conditional firings start together (`Kernel.Feature.Subscriptions.offerWrites`): the writer's
continuation against each resumption its write may make true and whose first visit does not remove it, an Event
Sub-Process's entered children against the same, a writing boundary's path against the resumptions its write may make
true, and the Conditional resumptions the writer holds against every other one a write may make true with them in
another contest and against a second open occurrence of themselves. -/
inductive WritePair (program : Program) (writer : Element) : Account → Account → Prop where
  | continuation {visit : Visit} :
      ((Written program writer).names ≠ [] ∨ (Written program writer).all = true) →
      ProgramCatching program Conditional visit → MayMakeTrue program (Written program writer) visit →
      ¬ Preempts program visit writer →
      WritePair program writer ((continuationOf program writer).account program) ((pathFrom (· = visit)).account program)
  | inside {visit : Visit} {header : Header} {payload : ScopePayload} {subscription : Subscription} :
      ((Written program writer).names ≠ [] ∨ (Written program writer).all = true) →
      ProgramCatching program Conditional visit → MayMakeTrue program (Written program writer) visit →
      ¬ Preempts program visit writer → writer.scope? = some (header, payload) →
      payload.kind.start? = some subscription →
      WritePair program writer ((enteredFrom program header.id branchWalk).account program)
        ((pathFrom (· = visit)).account program)
  | fired {envelope : Envelope} {boundary : Boundary} {visit : Visit} : writer.envelope? = some envelope →
      boundary ∈ envelope.boundaries → catchWrites boundary.subscription ≠ [] →
      ProgramCatching program Conditional visit →
      MayMakeTrue program { names := catchWrites boundary.subscription } visit →
      WritePair program writer ((boundaryPath program boundary).account program) ((pathFrom (· = visit)).account program)
  | itself {visit : Visit} {holder : ElementId} : Catching Conditional writer visit → Holder program visit holder →
      WritePair program writer (itselfAt program visit) (itselfAt program visit)
  | rivals {visit other : Visit} : Catching Conditional writer visit → ProgramCatching program Conditional other →
      Together program visit other →
      WritePair program writer ((pathFrom (· = visit)).account program) ((pathFrom (· = other)).account program)

/-- Two units of work one closure may hold together, in an order no input states, one constructor per mechanism that
queues more than one work item. P6's provenance lemma, that two items queued together at a reachable closure state lie
in distinct units of one case, has exactly these cases; the mechanisms that make a level hold two tokens at once
(`ConcurrentLevel`, `Kernel.Admission.Flow.Concurrency.concurrentLevel`) must agree with them. -/
inductive Concurrent (program : Program) : Account → Account → Prop where
  /-- A split's branches: BPMN 2.0.2 §13.3.1 and Table 13.1 let them interleave in any order; `flow.concurrentWrite`
  and `flow.concurrentInterference` (`Kernel.Admission.Flow.Concurrency.concurrentBranches`). -/
  | split {flow : Flow} {other : FlowId} {left right : Account} : flow ∈ program.flows → Forks program flow.source →
      Leaving program flow.source other → other ≠ flow.id → BranchPair program flow.id other left right →
      Concurrent program left right
  /-- A parallel Multi-Instance body's instances: §13.3.7 orders them not at all, completion included;
  `multiInstance.concurrentInstances` (`Kernel.Admission.MultiInstance.concurrentInstances`). -/
  | instances {body : Element} {loop : MultiInstance} {left right : Account} : body ∈ program.elements →
      Loop body loop → loop.mode = .parallel → InstancePair program body loop left right → Concurrent program left right
  /-- A Signal throw's firings beside its continuation: §10.5.1, a Signal reaches every catcher;
  `flow.concurrentWrite` and `flow.concurrentInterference` (`Kernel.Admission.Flow.Concurrency.signalFanOut`). -/
  | signalled {thrower : Element} {left right : Account} : thrower ∈ program.elements → SignalThrow thrower →
      SignalPair program thrower left right → Concurrent program left right
  /-- An Escalation throw's continuation beside its non-interrupting catchers: §10.5.1, the thrower goes on;
  `flow.concurrentWrite` and `flow.concurrentInterference` (`Kernel.Admission.Flow.Concurrency.escalationFanOut`). -/
  | escalated {thrower : Element} : thrower ∈ program.elements → Escalates thrower →
      Concurrent program ((continuationOf program thrower).account program)
        ((pathFrom fun visit => Catcher program thrower visit ∧ NonInterrupting visit).account program)
  /-- The Conditional firings one write offers, in evaluation order (Tables 10.89, 10.90; CIB-EXT-0035), a contest's
  members ranked by the input (CIB-LIM-0053); `flow.concurrentWrite` and `flow.concurrentInterference`
  (`Kernel.Admission.Flow.Concurrency.writeFanOut`). -/
  | writes {writer : Element} {left right : Account} : writer ∈ program.elements → WritePair program writer left right →
      Concurrent program left right
  /-- The compensation handlers one Compensation throw or Cancel End begins together, in declaration order, unless
  their subjects are ordered in every run: §13.5.5; `flow.concurrentWrite` and `flow.concurrentInterference`
  (`Kernel.Admission.Flow.Concurrency.compensationFanOut`). -/
  | compensating {thrower first second : Element} : thrower ∈ program.elements → Compensates thrower →
      HandlersOf program thrower first → HandlersOf program thrower second → first.header.id ≠ second.header.id →
      ¬ Ordered program first second → Concurrent program (handlerAccount program first) (handlerAccount program second)

/-- P6's order-invariance premise: no two units one closure may hold together race on a name or act on each other's
work, so the order `Step.settle` runs them in is immaterial. An Error no catcher takes ends every unit (Table 10.88),
which `Unhandled` counts as removing the whole instance. -/
def Apart (program : Program) : Prop :=
  ∀ left right, Concurrent program left right →
    ¬ Races left right ∧ ¬ Interferes program left right ∧ ¬ Interferes program right left

/-! ## Non-vacuity

A program holding nothing is `Apart`, so the premise is no `False`. A split whose two branches each begin an element
they run through, the two runs racing on a name, is not `Apart`: two plain Tasks behind a Parallel fork, both with an
output to `x`, are an instance once `Laws.IL` states the values of the IL queries the hypotheses name. -/

def quiet : Program :=
  { identity := { processId := "quiet", sourceSha256 := "", profile := "" }, elements := [], flows := [] }

theorem quiet_apart : Apart quiet := by
  intro left right concurrent
  exfalso
  cases concurrent with
  | split member => simp [quiet] at member
  | instances member => simp [quiet] at member
  | signalled member => simp [quiet] at member
  | escalated member => simp [quiet] at member
  | writes member => simp [quiet] at member
  | compensating member => simp [quiet] at member

theorem split_race_not_apart {program : Program} {flow : Flow} {other : FlowId} {left right : Element}
    (member : flow ∈ program.flows) (forks : Forks program flow.source) (leaving : Leaving program flow.source other)
    (distinct : other ≠ flow.id) (toLeft : Targets program flow.id left) (toRight : Targets program other right)
    (runsLeft : ¬ Stops branchWalk left) (runsRight : ¬ Stops branchWalk right)
    (race : (runFootprint program left).races (runFootprint program right) = true) : ¬ Apart program := fun apart =>
  (apart _ _ (.split member forks leaving distinct .branches)).1
    ⟨_, _, ⟨.enters left, .start ⟨left, toLeft, rfl⟩, .inr ⟨runsLeft, rfl⟩⟩,
      ⟨.enters right, .start ⟨right, toRight, rfl⟩, .inr ⟨runsRight, rfl⟩⟩, race⟩

end Kernel.Laws.Flow
