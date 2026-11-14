module

public import Kernel.Admission.Flow
public import Kernel.IL.Footprint
public import Kernel.IL.Paths

/-! # The closure walk: the work a token, a firing or a raise reaches before it waits, joins or ends, read by the
order checks of `Kernel.Admission.Flow.Concurrency` and the registry's `closureReach`. It shares the namespace of
`Kernel.Admission.Flow`, whose structural reading of flows and Scopes it builds on. -/

public section

namespace Kernel.Admission.Flow

/-- What a closure walk reads of an element beyond the IL, filled by `Kernel.AdmissionRegistry.reading` from the
admissions that own each part, since this module matches none of `Trigger`, `Throw` or `Work`. -/
structure Reading where
  /-- What an element writes when it runs through its closure, beyond its envelope's outputs and a Call's: its work's
  result, its catch's outputs and variables, what its Signal's receivers install and a loop's output collection. -/
  writes : Element → NameSet := fun _ => {}
  /-- The names a looping element writes into scope occurrences of its own, which no sibling branch can read: its
  counters and each instance's items. -/
  locals : Element → List String := fun _ => []
  /-- What a boundary writes when it fires: its outputs and catch variables. -/
  fires : Boundary → List String := fun _ => []
  /-- Whether an element's run may raise an Error, Escalation or Cancel in its closure. -/
  raises : Element → Bool := fun _ => false
  /-- Whether a subscription catches a raised Error, Escalation or Cancel. -/
  catchesRaise : Subscription → Bool := fun _ => false
  /-- Whether an element begins compensation handlers: a Compensation throw or a Cancel End. -/
  compensates : Element → Bool := fun _ => false
  /-- Whether a subscription starts a Compensation Event Sub-Process. -/
  compensationStart : Subscription → Bool := fun _ => false
  /-- Whether a looping element may run no instance, which completes it in the closure that begins it. -/
  mayRunNone : Element → Bool := fun _ => false
  /-- Whether completing an instance of a looping element may begin another in the same closure. -/
  nextInstance : Element → Bool := fun _ => false
  /-- Whether beginning an element removes everything else in its parent's interior: an interrupting Event
  Sub-Process. -/
  interrupts : Element → Bool := fun _ => false
  /-- The code of an Error an element's run may raise in its closure: `some (some code)` for a thrown Error, `some none`
  for an Error of any code a work may raise, `none` for none. A Call's codes are what its called processes let escape
  (`raisedCodes`), so this reading is not consulted for one. -/
  errorCode : Element → Option (Option String) := fun _ => none
  /-- Whether a catcher's subscription takes every Error of a code (`none`: of any code). -/
  catchesError : Subscription → Option String → Bool := fun _ _ => false
  /-- Whether an element's run raises an Escalation, after which its thrower goes on unless the catcher interrupts it. -/
  escalates : Element → Bool := fun _ => false

/-- One step of a closure walk: an element a token begins, one that completes, a boundary that fires, or an element a
raise passes, which writes its outputs (`interruptedOutputs`, a Call's raised outputs) and goes no further. -/
inductive Visit where
  | enters (element : Element)
  | completes (element : Element)
  | fires (boundary : Boundary)
  | passes (element : Element)

/-- A region a closure may remove at once with all the work in it: the interior of `root`, its own occurrence included
when `inclusive` (an interrupting boundary's host), else only what it holds (an interrupting Event Sub-Process's or a
Terminate End's Scope); `root = none` is the process level of `source`, the element whose run removes it. -/
structure Withdrawal where
  source : ElementId
  root : Option ElementId
  inclusive : Bool
  /-- The whole process instance, its callers and called instances included: an Error no catcher takes ends it under
  `UnhandledError.failsInstance`. -/
  everything : Bool := false

/-- What a walk found: the footprint of the shared names, whether a token may end, every element and boundary it
reached (walked through, stopped at or fired), and the names written into scope occurrences of their own; and what it
may do to other work in the instance (`interferes`): the elements it begins and completes, the regions it may remove,
the elements whose open Signal subscriptions (`resumes`) or compensation records (`compensates`) it may act on, and
the resumptions of the Signal subscriptions it leaves open (`wakes`). -/
structure Closure where
  footprint : Footprint := {}
  ends : Bool := false
  reached : List ElementId := []
  locals : List String := []
  begun : List ElementId := []
  completed : List ElementId := []
  withdraws : List Withdrawal := []
  resumes : List ElementId := []
  compensates : List ElementId := []
  wakes : List Visit := []

/-- The elements enclosing `element`, innermost first. -/
def ancestors (program : Program) : Nat → Option ElementId → List Element
  | 0, _ => []
  | _, none => []
  | fuel + 1, some id =>
    match program.element? id with
    | some element => element :: ancestors program fuel element.header.parent
    | none => []

/-- The Event Sub-Processes among `level` whose start `starts` takes. -/
def startingSubProcesses (level : List Element) (starts : Subscription → Bool) : List Element :=
  level.filter fun element => ((element.scope?).bind fun (_, payload) => payload.kind.start?).any starts

/-- The Call Activities whose called process is `process`. -/
def callers (program : Program) (process : CalledProcess) : List Element :=
  program.elements.filter fun element =>
    (element.activity?.bind fun (_, payload) => payload.work.call?).any fun work =>
      (program.calledProcessFor program.options.calledElementResolution (program.callerDeployment element.header) work).any
        (·.definition == process.definition)

/-- Where a raise from `element` may be caught: a boundary of the element itself, if it is an Activity or Scope, or of
an enclosing one, whose host it interrupts and passes, an Event Sub-Process of an enclosing Scope or of the process
level, and from a called process's level a Call's catchers in its caller. Any raised kind and code counts. -/
def catchers (reading : Reading) (program : Program) (element : Element) : Nat → List Visit
  | 0 => []
  | fuel + 1 =>
    let chain := (if element.envelope?.isSome then [element] else []) ++
      ancestors program program.elements.length element.header.parent
    let atHost (host : Element) : List Visit :=
      (((host.envelope?.map (·.boundaries)).getD []).filter (reading.catchesRaise ·.subscription)).flatMap
          (fun boundary => [Visit.fires boundary, Visit.passes host]) ++
        ((host.scope?).map fun (header, _) =>
          (startingSubProcesses (program.children (some header.id)) reading.catchesRaise).map Visit.enters).getD []
    let top := (chain.getLast?).getD element
    let level := (startingSubProcesses (program.siblings top.header) reading.catchesRaise).map Visit.enters
    let caller := ((program.processOf top.header).map fun process =>
      (callers program process).flatMap fun call => Visit.passes call :: catchers reading program call fuel).getD []
    chain.flatMap atHost ++ level ++ caller

/-- Whether an element is a compensation handler: a Compensation Activity (`Element.isCompensationActivity`) or a
Compensation Event Sub-Process. -/
def handler (reading : Reading) (element : Element) : Bool :=
  element.isCompensationActivity ||
    ((element.scope?).bind fun (_, payload) => payload.kind.start?).any reading.compensationStart

/-- Every element declared in `level` and the Scopes it holds. -/
def declaredIn (program : Program) : Nat → List Element → List Element
  | 0, _ => []
  | fuel + 1, level => level.flatMap fun element =>
    element :: ((element.scope?).map fun (header, _) => declaredIn program fuel (program.children (some header.id))).getD []

/-- The handlers a Compensation throw or Cancel End may begin: every handler declared under the nearest Scope enclosing
it that is no Event Sub-Process, or under its process level. Which records it finds is the run's; any may be there. -/
def handlersOf (reading : Reading) (program : Program) (thrower : Element) : List Element :=
  let enclosing := (ancestors program program.elements.length thrower.header.parent).find? fun scope =>
    !((scope.scope?).bind fun (_, payload) => payload.kind.start?).isSome
  let level := match enclosing with
    | some scope => program.children (some scope.header.id)
    | none => program.siblings ((ancestors program program.elements.length thrower.header.parent).getLast?.getD thrower).header
  (declaredIn program program.elements.length level).filter (handler reading)

/-- The subscriptions a Signal or Conditional catch, boundary or Event Sub-Process start of `element` holds, as visits:
a catch completes, a boundary fires, an Event Sub-Process begins. -/
def catching (picks : Subscription → Bool) (element : Element) : List Visit :=
  let caught := ((element.event?.bind (·.2.catch?)).filter picks).map fun _ => Visit.completes element
  let attached := ((element.envelope?.map (·.boundaries)).getD []).filter (picks ·.subscription) |>.map Visit.fires
  let started := (((element.scope?).bind fun (_, payload) => payload.kind.start?).filter picks).map fun _ =>
    Visit.enters element
  caught.toList ++ attached ++ started.toList

def signalled (subscription : Subscription) : Bool := (triggerView subscription.trigger).signal.isSome
def conditional (subscription : Subscription) : Bool := subscription.trigger.condition?.isSome

/-- Every Conditional catch, boundary and Event Sub-Process start of the program, which a write may resume. -/
def conditionalCatches (program : Program) : List Visit := program.elements.flatMap (catching conditional)

/-- The visits a token's leaving `element` makes in the same closure beside its flows: the catchers of its raise, the
handlers its Compensation throw or Cancel End begins and, when it is a handler that completes, the other handlers of
every trigger that may begin it and that trigger's continuation; and every Signal catch a Signal throw resumes in the
instance (CIB-OP-0019). -/
def beyond (reading : Reading) (program : Program) (element : Element) (completes : Bool) : List Visit :=
  let raised := if reading.raises element then catchers reading program element (program.elements.length + 1) else []
  let compensated := if reading.compensates element then (handlersOf reading program element).map Visit.enters else []
  let continued := if completes && handler reading element then
      (program.elements.filter fun thrower => reading.compensates thrower &&
        (handlersOf reading program thrower).any (·.header.id == element.header.id)).flatMap fun thrower =>
        (handlersOf reading program thrower).map Visit.enters ++ [Visit.completes thrower]
    else []
  let signals := if ((element.event?.bind (·.2.throw?)).any fun thrown => (throwView thrown).signal.isSome) then
      program.elements.flatMap (catching signalled)
    else []
  raised ++ compensated ++ continued ++ signals

/-- The elements `element`'s outgoing flows and throwing Link lead to. -/
def continuing (program : Program) (element : Element) : List Element :=
  flowTargets program (onward program element)

/-- How a walk proceeds: `stop` names the elements that only begin, and `ascends` whether a token ending in a Scope may
complete it, a called process's end its Calls, and a looping element's instance begin the next (`Reading.nextInstance`). A branch walk does not
ascend: completing the Scope that holds the split waits for every branch. -/
structure Walk where
  stop : Element → Bool
  ascends : Bool

/-- The visits a token leaving `element` makes on its own way: its flows and Link, and under `ascends` its parent's
completion or, at a called process's level, its Calls'; a handler completes no parent. -/
def onwardVisits (reading : Reading) (program : Program) (walk : Walk) (element : Element) : List Visit :=
  let next := (continuing program element).map Visit.enters
  let ascent := if walk.ascends && next.isEmpty && !handler reading element then
      match element.header.parent with
      | some parent => ((program.element? parent).map Visit.completes).toList
      | none => ((program.processOf element.header).map fun process => (callers program process).map Visit.completes).getD []
    else []
  next ++ ascent

/-- The visits after `element` completes: its own way on (`onwardVisits`) and what it makes beside it (`beyond`). -/
def after (reading : Reading) (program : Program) (walk : Walk) (element : Element) : List Visit :=
  onwardVisits reading program walk element ++ beyond reading program element true

/-- The visits beginning `element` makes: a Scope's entered children and, as before it completes, its flows; a loop
that may run no instance completes at once; a Conditional boundary, an Event Sub-Process Conditional start and an
Event-Based Gateway's Conditional arm may fire on entry. -/
def entering (reading : Reading) (program : Program) (element : Element) : List Visit :=
  let conditions := ((element.envelope?.map (·.boundaries)).getD []).filter (conditional ·.subscription) |>.map Visit.fires
  let arms := if (element.gateway?.any fun (_, payload) => (routing payload).waits) then
      (flowTargets program element.outgoing).flatMap fun arm =>
        if (arm.event?.bind (·.2.catch?)).any conditional then [Visit.completes arm] else []
    else []
  let nested := ((element.scope?).map fun (header, _) =>
    (enteredChildren program header.id).map Visit.enters ++
      (startingSubProcesses (program.children (some header.id)) conditional).map Visit.enters).getD []
  conditions ++ arms ++ nested ++ (if reading.mayRunNone element then [Visit.completes element] else [])

/-- Whether a stop runs through anyway: a loop that may run no instance, or a Conditional catch whose condition may hold
on arrival. -/
def runsThrough (reading : Reading) (element : Element) : Bool :=
  reading.mayRunNone element || (element.event?.bind (·.2.catch?)).any conditional

/-- The subscription a visit resumes or catches with: a catch's, a boundary's, an Event Sub-Process's start. -/
def visitSubscription : Visit → Option Subscription
  | .completes caught => caught.event?.bind (·.2.catch?)
  | .fires boundary => some boundary.subscription
  | .enters element => (element.scope?).bind fun (_, payload) => payload.kind.start?
  | .passes _ => none

/-- Whether a catcher of `element`'s own process level surely takes an Error of `code` (`none`: any code): a boundary
of it or of an enclosing Activity, or an Event Sub-Process of an enclosing Scope or of the process level, whose trigger
takes the code (`Reading.catchesError`). A catcher in a caller is not counted, since another caller may lack it. -/
def caughtWithin (reading : Reading) (program : Program) (element : Element) (code : Option String) : Bool :=
  (catchers reading program element 1).any fun visit => (visitSubscription visit).any (reading.catchesError · code)

/-- The codes of the Errors `element`'s run may raise, `none` standing for any code: a thrown Error's and a raising
work's (`Reading.errorCode`), and for a Call what its called processes let escape, an Error raised at any depth there
that no catcher of that process's level surely takes (`caughtWithin`). A called process already on the path (`seen`)
adds nothing a first visit does not, since its codes are only filtered further on the way back. -/
def raisedCodes (reading : Reading) (program : Program) (fuel : Nat) (seen : List DefinitionRef) (element : Element) :
    List (Option String) :=
  match fuel with
  | 0 => [none]
  | fuel + 1 =>
    match element.activity?.bind fun (_, payload) => payload.work.call? with
    | some work =>
      let called := program.calledProcessFor program.options.calledElementResolution
        (program.callerDeployment element.header) work
      (called.filter fun process => !seen.contains process.definition).flatMap fun process =>
        (declaredIn program program.elements.length (program.processChildren process)).flatMap fun inner =>
          (raisedCodes reading program fuel (process.definition :: seen) inner).filter (!caughtWithin reading program inner ·)
    | none => (reading.errorCode element).toList

/-- Whether an Error `element`'s run may raise is one no catcher of its own process level surely takes. -/
def escapes (reading : Reading) (program : Program) (element : Element) : Bool :=
  (raisedCodes reading program (program.processes.length + 1) [] element).any (!caughtWithin reading program element ·)

/-- The whole instance an Error that no catcher takes ends under `UnhandledError.failsInstance` (BPMN 2.0.2 Table 10.88,
"termination of the Process instance"; `Kernel.Feature.Propagation.unhandledError`), which removes every sibling
branch's and instance's work as an interruption does (issue #81). -/
def unhandled (reading : Reading) (program : Program) (element : Element) : List Withdrawal :=
  if program.options.unhandledError == .failsInstance && escapes reading program element then
    [{ source := element.header.id, root := none, inclusive := false, everything := true }]
  else []

/-- What `element` contributes when it runs: its reads, its shared and own writes, and the regions its run may remove
beyond its flows, the whole instance when it may raise an Error no catcher takes (`unhandled`). Every path that counts a
run counts all three. -/
structure Contribution where
  footprint : Footprint
  locals : List String
  withdraws : List Withdrawal

def runs (reading : Reading) (program : Program) (element : Element) : Contribution :=
  { footprint := { reads := (footprint program element).reads
                   writes := (footprint program element).writes.union (reading.writes element) }
    locals := reading.locals element
    withdraws := unhandled reading program element }

/-- Whether `element` is a Terminate End, which ends everything in the Scope or process level it sits in. -/
def terminates (element : Element) : Bool :=
  (element.event?.bind (·.2.throw?)).any fun thrown => (throwView thrown).terminates

/-- The region beginning `element` removes: an interrupting Event Sub-Process's and a Terminate End's parent. -/
def removal (reading : Reading) (element : Element) : List Withdrawal :=
  if reading.interrupts element || terminates element then
    [{ source := element.header.id, root := element.header.parent, inclusive := false }]
  else []

/-- The region an interrupting boundary's firing removes: its host with everything in it. -/
def interruption (program : Program) (boundary : Boundary) : List Withdrawal :=
  if boundary.interrupting then
    ((program.boundary? boundary.id).map fun (host, _) =>
      { source := host.header.id, root := some host.header.id, inclusive := true }).toList
  else []

/-- The element a resumed Signal subscription waits on: a catch and the Event-Based Gateway it is an arm of, a
boundary's host, an Event Sub-Process's Scope. -/
def anchors (program : Program) : Visit → List ElementId
  | .completes caught =>
    caught.header.id :: (program.flows.filter (·.target == caught.header.id)).filterMap fun flow =>
      if (program.element? flow.source).any (·.gateway?.any fun (_, payload) => (routing payload).waits) then
        some flow.source
      else none
  | .fires boundary => ((program.boundary? boundary.id).map (·.1.header.id)).toList
  | .enters started => started.header.parent.toList
  | .passes _ => []

/-- The elements whose open Signal subscriptions a Signal throw of `element` resumes: they are open only once the work
that opens them began. -/
def resumed (program : Program) (element : Element) : List ElementId :=
  if ((element.event?.bind (·.2.throw?)).any fun thrown => (throwView thrown).signal.isSome) then
    (program.elements.flatMap (catching signalled)).flatMap (anchors program)
  else []

/-- The Activities and Scopes whose records a handler compensates: the Activities naming it, and a Compensation Event
Sub-Process's Scope. -/
def subjectsOf (program : Program) (handler : Element) : List ElementId :=
  (program.elements.filter fun subject =>
      ((subject.envelope?.map (·.compensationHandlers)).getD []).contains handler.header.id).map (·.header.id) ++
    if handler.isCompensationActivity then [] else handler.header.parent.toList

/-- The Activities and Scopes whose records a Compensation throw or Cancel End of `element` may compensate: a handler's
subject is the Activity naming it, a Compensation Event Sub-Process's its Scope. A record exists only once its subject
completed. -/
def compensated (reading : Reading) (program : Program) (element : Element) : List ElementId :=
  if reading.compensates element then (handlersOf reading program element).flatMap (subjectsOf program) else []

/-- The resumptions of the Signal subscriptions beginning `element` opens and leaves waiting: its catch and its
boundaries when it `stops` there, an Event-Based Gateway's Signal arms, and a Scope's Signal Event Sub-Process starts. -/
def opened (program : Program) (element : Element) (stops : Bool) : List Visit :=
  let caught := if stops && (element.event?.bind (·.2.catch?)).any signalled then [Visit.completes element] else []
  let attached := if stops then
      ((element.envelope?.map (·.boundaries)).getD []).filter (signalled ·.subscription) |>.map Visit.fires
    else []
  let arms := if (element.gateway?.any fun (_, payload) => (routing payload).waits) then
      (flowTargets program element.outgoing).filter (fun arm => (arm.event?.bind (·.2.catch?)).any signalled) |>.map
        Visit.completes
    else []
  let started := ((element.scope?).map fun (header, _) =>
    (startingSubProcesses (program.children (some header.id)) signalled).map Visit.enters).getD []
  caught ++ attached ++ arms ++ started

/-- A visit's identity: its kind and the element or boundary it visits. -/
def visitKey : Visit → Nat × ElementId
  | .enters element => (0, element.header.id)
  | .completes element => (1, element.header.id)
  | .fires boundary => (2, boundary.id)
  | .passes element => (3, element.header.id)

/-- Walk one closure from `begun`. Every element, boundary and passed host is taken at most once per kind of visit; a
write arms every Conditional of the program once, since it may resume one in the same closure (CIB-EXT-0035). -/
def closureWalk (reading : Reading) (program : Program) (walk : Walk) (begun : List Visit) : Closure :=
  let key := visitKey
  let rec go (fuel : Nat) (frontier : List Visit) (seen : List (Nat × ElementId)) (found : Closure) (armed : Bool) :
      Closure :=
    match fuel, frontier with
    | _, [] => found
    -- The fuel bounds every visit and every visit's successors, so it is never exhausted; running out answers what was
    -- found.
    | 0, _ :: _ => found
    | fuel + 1, visit :: rest =>
      if seen.contains (key visit) then go fuel rest seen found armed
      else
        let seen := key visit :: seen
        let reach (id : ElementId) (found : Closure) : Closure := { found with reached := id :: found.reached }
        let add (part : Contribution) (found : Closure) : Closure :=
          { found with footprint := found.footprint.union part.footprint, locals := part.locals ++ found.locals
                       withdraws := part.withdraws ++ found.withdraws }
        let acts (element : Element) (found : Closure) : Closure :=
          { found with completed := element.header.id :: found.completed,
                       resumes := resumed program element ++ found.resumes,
                       compensates := compensated reading program element ++ found.compensates }
        let (found, next) : Closure × List Visit := match visit with
          | .fires boundary =>
            ({ add { footprint := { writes := { names := reading.fires boundary } }, locals := [], withdraws := [] }
                (reach boundary.id found) with
                withdraws := interruption program boundary ++ found.withdraws },
              (flowTargets program boundary.outgoing).map Visit.enters)
          | .passes element =>
            (add { footprint := { reads := (footprint program element).reads
                                  writes := (footprint program element).writes.union (reading.writes element) }
                   locals := [], withdraws := [] } (reach element.header.id found), [])
          | .completes element => (acts element (add (runs reading program element) (reach element.header.id found)),
              after reading program walk element ++
                if walk.ascends && reading.nextInstance element then [Visit.enters element] else [])
          | .enters element =>
            let stops := walk.stop element && !runsThrough reading element
            let found := { reach element.header.id found with
              begun := element.header.id :: found.begun, withdraws := removal reading element ++ found.withdraws
              wakes := found.wakes ++ opened program element stops }
            if stops then
              ({ found with footprint := found.footprint.union { reads := beginReads element } },
                entering reading program element)
            else
              let onward := continuing program element ++
                ((element.scope?).map fun (header, _) => enteredChildren program header.id).getD []
              ({ acts element (add (runs reading program element) found) with ends := found.ends || onward.isEmpty },
                entering reading program element ++ after reading program walk element)
        let arms := !armed && (!found.footprint.writes.names.isEmpty || found.footprint.writes.all)
        let next := if arms then next ++ conditionalCatches program else next
        go fuel (rest ++ next) seen found (armed || arms)
  let boundaries := program.elements.foldl (fun count element => count + ((element.envelope?.map (·.boundaries.length)).getD 0)) 0
  let size := program.elements.length + program.flows.length + boundaries + 1
  go (4 * size * size) begun [] {} false

end Kernel.Admission.Flow
