module

public import Kernel.Laws.Flow.Walk

/-! # Laws of flow: the units one closure holds together, and when their order is immaterial

P6's order-invariance premise ([PLAN, P6](../../../docs/PLAN.md#proof-wave)) as a declarative IL condition: `Apart`.
`Concurrent` relates the accounts (`Kernel.Laws.Flow.Walk`) of two units of work one closure may hold together, one
constructor per mechanism that queues more than one work item, and `Apart` holds of a program when no two such units
race on a name or act on each other's work. Under `BranchSchedule.orderInvariant` admission enforces it with
`flow.concurrentWrite`, `flow.concurrentInterference` and `multiInstance.concurrentInstances`
(`Kernel.Admission.Flow.Concurrency`); that it does stays scenario evidence, since a law may not name the admission
evaluator. Where admission excludes a pair (`ClosedAt`, `Preempts`, `Contested`, `Ordered`), so does `Concurrent`.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Flow

open Kernel

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
