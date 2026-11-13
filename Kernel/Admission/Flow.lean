module

public import Kernel.IL.Types
public import Kernel.IL.Footprint
public import Kernel.IL.Paths

/-! # Admission of starts, gateways, Links and flow references. A refusal carries a stable code. A start's trigger is
admitted by `Kernel.Admission.Subscriptions.start`. -/

public section

namespace Kernel.Admission.Flow

/-- Every entry of `list` is distinct. -/
def distinct {α : Type} [DecidableEq α] (list : List α) : Bool :=
  list.eraseDups.length == list.length

/-! ## References -/

/-- Where an element or boundary sits: its parent Scope, and for a process-level element the called process holding
it by its position among the carried processes (`none` for the root process), since one key names every carried version
of a process (PC-SCOPE-03). A boundary sits where its host does. -/
def place (program : Program) (id : ElementId) : Option (Option ElementId × Option Nat) :=
  let located (element : Element) : Option ElementId × Option Nat :=
    (element.header.parent,
      if element.header.parent.isNone then program.processes.findIdx? (·.children.contains element.header.id) else none)
  match program.element? id with
  | some element => some (located element)
  | none => (program.boundary? id).map fun (host, _) => located host

/-- The flows that leave an element or boundary by its own lists. -/
def leaving (program : Program) (id : ElementId) : List FlowId :=
  match program.element? id with
  | some element => element.outgoing
  | none => ((program.boundary? id).map (·.2.outgoing)).getD []

/-- A flow joins two endpoints of one place, enters no start, and is listed by both. -/
def flowReference (program : Program) (flow : Flow) : Bool :=
  match place program flow.source, program.element? flow.target with
  | some source, some target =>
    some source == place program flow.target && target.start?.isNone &&
      (leaving program flow.source).contains flow.id && target.incoming.contains flow.id
  | _, _ => false

/-- An element's own flow lists name flows that end at, or leave, that element; a boundary's flows leave it. -/
def listReference (program : Program) (element : Element) : Bool :=
  let id := element.header.id
  let ends (flow : FlowId) : Bool := ((program.flow? flow).map (·.target)) == some id
  let leaves (source : ElementId) (flow : FlowId) : Bool := ((program.flow? flow).map (·.source)) == some source
  distinct element.incoming && distinct element.outgoing && element.incoming.all ends &&
    element.outgoing.all (leaves id) &&
    (element.envelope?.all fun envelope =>
      envelope.defaultFlow.all element.outgoing.contains &&
      envelope.boundaries.all fun boundary => distinct boundary.outgoing && boundary.outgoing.all (leaves boundary.id))

/-- What the admissions read of a Gateway's kind: the candidates and default of a conditional Gateway, whether one
activation may leave on several flows at once, and whether it waits for an event. -/
structure Routing where
  conditional : Option (List FlowId × Option FlowId)
  concurrent : Bool
  waits : Bool

def routing (payload : GatewayPayload) : Routing :=
  match payload.kind with
  | .exclusive candidates default => { conditional := some (candidates, default), concurrent := false, waits := false }
  | .inclusive candidates default => { conditional := some (candidates, default), concurrent := true, waits := false }
  | .parallel => { conditional := none, concurrent := true, waits := false }
  | .eventBased _ => { conditional := none, concurrent := false, waits := true }

/-- A gateway's candidates and default are its own outgoing flows, the default not a candidate. -/
def gatewayReference (payload : GatewayPayload) : Bool :=
  (routing payload).conditional.all fun (candidates, default) =>
    candidates.all payload.outgoing.contains && distinct candidates &&
      default.all fun flow => payload.outgoing.contains flow && !candidates.contains flow

/-- Every identifier names exactly one element, boundary or flow, and every flow reference resolves where it is used:
a dangling or misplaced reference would be read as no reference at all. Scope membership is
`Kernel.Admission.Scopes.membership`. -/
def references (program : Program) : Option String :=
  let elements := program.elements.map (·.header.id)
  let boundaries := program.elements.flatMap fun element => (element.envelope?.map (·.boundaries.map (·.id))).getD []
  if distinct (elements ++ boundaries) && distinct (program.flows.map (·.id)) &&
      program.flows.all (flowReference program) && program.elements.all (listReference program) &&
      program.elements.all fun element => element.gateway?.all fun (_, payload) => gatewayReference payload then none
  else some "il.reference"

/-! ## Gateways -/

def conditioned (program : Program) (flow : FlowId) : Bool :=
  ((program.flow? flow).bind (·.condition)).isSome

/-- An Event-Based Gateway's arms are catch Events. BPMN 2.0.2 §10.6.6 also admits a Receive Task, which pinned CIB
refuses at parse like every target that is not an intermediate catch (`BpmnParse#parseEventBasedGateway`, :2139), so any
other arm is `receiveArm` (PC-CF-05). §10.6.6 lists Link among the invalid triggers and CIB refuses a catching Link
after the gateway (`BpmnParse:1546`), so a Link arm is `linkArm` (PC-CF-05, PC-BASIC-02). -/
def eventBasedArms (program : Program) (payload : GatewayPayload) : Option String :=
  let arm (flow : FlowId) : Option EventPayload :=
    ((program.target? flow).bind program.element?).bind fun target => target.event?.map (·.2)
  if payload.outgoing.any fun flow => ((arm flow).bind (·.linkCatch?)).isSome then some "gateway.eventBased.linkArm"
  else if payload.outgoing.all fun flow => ((arm flow).bind (·.catch?)).isSome then none
  else some "gateway.eventBased.receiveArm"

/-- A diverging Exclusive Gateway routes by its conditions and its default (BPMN 2.0.2 §10.6.2, Table 13.2). A sole
unconditioned non-default flow is a candidate whose condition always holds, tried in declaration order like the others
(the reading CIB-INT-0005 gives an Inclusive output, which CIB's `ExclusiveGatewayActivityBehavior#doLeave` applies);
CIB refuses to parse a second unconditioned flow, an unconditioned flow beside a default, and a sole conditioned flow
without a default (`BpmnParse#validateExclusiveGateway`), and so one without an outgoing flow. A converging gateway's
one unconditioned flow is its merge (PC-CF-02). -/
def exclusive (program : Program) (payload : GatewayPayload) (candidates : List FlowId) (default : Option FlowId) :
    Option String :=
  let unconditioned := (candidates.filter (!conditioned program ·)).length
  if payload.outgoing.isEmpty then some "gateway.exclusive.noOutgoingFlow"
  else if payload.outgoing.length ≥ 2 && (unconditioned ≥ 2 || (default.isSome && unconditioned ≥ 1)) then
    some "gateway.exclusive.unconditionedFlow"
  else if default.isNone && payload.outgoing.length == 1 && candidates.all (conditioned program) &&
      !candidates.isEmpty then
    some "gateway.exclusive.singleConditionWithoutDefault"
  else none

/-- An Inclusive Gateway joins by `Kernel.Feature.Flow`'s reachability rule wherever it converges, and a split that
selects nothing rolls back (CIB-INT-0012). One without an outgoing flow would consume every token it takes, where CIB
deploys it and rolls back each activation (`InclusiveGatewayActivityBehavior#execute`, `stuckExecutionException`), so it
is refused (PC-CF-04). An instantiating Event-Based Gateway starts its Process (BPMN 2.0.2 §10.6.6), which pinned CIB
never reads (CIB-LIM-0008) (PC-BASIC-04). -/
def gateway (program : Program) (payload : GatewayPayload) : Option String :=
  match payload.kind with
  | .exclusive candidates default => exclusive program payload candidates default
  | .parallel => none
  | .inclusive _ _ => if payload.outgoing.isEmpty then some "gateway.inclusive.noOutgoingFlow" else none
  | .eventBased .none => eventBasedArms program payload
  | .eventBased .exclusive => some "gateway.eventBased.instantiate"
  | .eventBased .parallel => some "gateway.eventBased.instantiate"

/-- A condition is read on a conditional Gateway's candidates and on an Activity's or Scope's flows other than its
default (BPMN 2.0.2 §13.3.1). Elsewhere it is refused: BPMN gives it no meaning on a default (§10.3.1 "SHALL be
ignored"), a Parallel Gateway's flows (§13.4.1 "without checking any conditions"), an Event-Based Gateway's (§10.6.6
"MUST NOT") or a Start Event's (§10.5.2 "MUST be set to None"), and pinned CIB evaluates it on a Start, intermediate or
Boundary Event's flows (`BpmnActivityBehavior#performOutgoingBehavior`), outside the admitted surface: a
restriction, not a reading (PC-CF-07, PC-BASIC-01). -/
def conditionalOutflow (program : Program) (flow : Flow) : Option String :=
  let refused : Option String := some "flow.conditionalOutflow"
  match flow.condition, program.element? flow.source with
  | none, _ => none
  | some _, none => refused
  | some _, some source =>
    match source.gateway?, source.envelope? with
    | some (_, payload), _ => if (routing payload).conditional.any (·.1.contains flow.id) then none else refused
    | none, some envelope => if envelope.defaultFlow == some flow.id then refused else none
    | none, none => refused

/-! ## Concurrent footprints -/

/-- An element a token waits at for a stimulus: a User, Service or Receive Task, a catch Event or an Event-Based
Gateway. -/
def awaitsStimulus (element : Element) : Bool :=
  (element.activity?.any fun (_, payload) =>
    payload.work.isUser || payload.work.isService || payload.work.receive?.isSome) ||
  (element.event?.any fun (_, payload) => payload.catch?.isSome) ||
  element.gateway?.any fun (_, payload) => (routing payload).waits

/-- An element a branch stops at within its closure: one that awaits a stimulus, or a converging Parallel or Inclusive
Gateway, which joins the branches (CIB parks its execution there too). -/
def branchStop (element : Element) : Bool :=
  awaitsStimulus element ||
    element.gateway?.any fun (_, payload) => (routing payload).concurrent && payload.incoming.length ≥ 2

/-- The elements `flows` lead to. -/
def flowTargets (program : Program) (flows : List FlowId) : List Element :=
  flows.filterMap fun flow => (program.target? flow).bind program.element?

/-- The children an occurrence of the Scope `id` begins on entry: its start Events, or, without one, the children
that begin implicitly (`Element.beginsImplicitly`), as `Kernel.Feature.Scopes.implicitStart` begins them. -/
def enteredChildren (program : Program) (id : ElementId) : List Element :=
  let children := program.children (some id)
  if children.any (·.start?.isSome) then children.filter (·.start?.isSome) else children.filter (·.beginsImplicitly)

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
  /-- Whether beginning an element removes everything else in its parent's interior: an interrupting Event
  Sub-Process. -/
  interrupts : Element → Bool := fun _ => false

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
complete it, a called process's end its Calls, and a looping element's instance begin the next. A branch walk does not
ascend: completing the Scope that holds the split waits for every branch. -/
structure Walk where
  stop : Element → Bool
  ascends : Bool

/-- The visits after `element` completes: its flows and Link, and under `ascends` its parent's completion or, at a
called process's level, its Calls'; a handler completes no parent. -/
def after (reading : Reading) (program : Program) (walk : Walk) (element : Element) : List Visit :=
  let next := (continuing program element).map Visit.enters
  let ascent := if walk.ascends && next.isEmpty && !handler reading element then
      match element.header.parent with
      | some parent => ((program.element? parent).map Visit.completes).toList
      | none => ((program.processOf element.header).map fun process => (callers program process).map Visit.completes).getD []
    else []
  next ++ ascent ++ beyond reading program element true

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

/-- What `element` contributes when it runs: its reads, and its shared and own writes. -/
def runs (reading : Reading) (program : Program) (element : Element) : Footprint × List String :=
  ({ reads := (footprint program element).reads, writes := (footprint program element).writes.union (reading.writes element) },
   reading.locals element)

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

/-- The Activities and Scopes whose records a Compensation throw or Cancel End of `element` may compensate: a handler's
subject is the Activity naming it, a Compensation Event Sub-Process's its Scope. A record exists only once its subject
completed. -/
def compensated (reading : Reading) (program : Program) (element : Element) : List ElementId :=
  if reading.compensates element then
    (handlersOf reading program element).flatMap fun handler =>
      (program.elements.filter fun subject =>
          ((subject.envelope?.map (·.compensationHandlers)).getD []).contains handler.header.id).map (·.header.id) ++
        if handler.isCompensationActivity then [] else handler.header.parent.toList
  else []

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

/-- Walk one closure from `begun`. Every element, boundary and passed host is taken at most once per kind of visit; a
write arms every Conditional of the program once, since it may resume one in the same closure (CIB-EXT-0035). -/
def closureWalk (reading : Reading) (program : Program) (walk : Walk) (begun : List Visit) : Closure :=
  let key : Visit → Nat × ElementId
    | .enters element => (0, element.header.id)
    | .completes element => (1, element.header.id)
    | .fires boundary => (2, boundary.id)
    | .passes element => (3, element.header.id)
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
        let add (part : Footprint × List String) (found : Closure) : Closure :=
          { found with footprint := found.footprint.union part.1, locals := part.2 ++ found.locals }
        let acts (element : Element) (found : Closure) : Closure :=
          { found with completed := element.header.id :: found.completed,
                       resumes := resumed program element ++ found.resumes,
                       compensates := compensated reading program element ++ found.compensates }
        let (found, next) : Closure × List Visit := match visit with
          | .fires boundary =>
            ({ add ({ writes := { names := reading.fires boundary } }, []) (reach boundary.id found) with
                withdraws := interruption program boundary ++ found.withdraws },
              (flowTargets program boundary.outgoing).map Visit.enters)
          | .passes element =>
            (add ({ reads := (footprint program element).reads,
                    writes := (footprint program element).writes.union (reading.writes element) }, [])
              (reach element.header.id found), [])
          | .completes element => (acts element (add (runs reading program element) (reach element.header.id found)),
              after reading program walk element ++
                if walk.ascends && (element.envelope?.bind (·.multiInstance)).isSome then [Visit.enters element] else [])
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

/-- Pinned CIB parses one initial start per process, a None or Timer Start (`BpmnParse#selectInitial`), and one start
per Sub-Process (`BpmnParse#parseScopeStartEvent`); BPMN 2.0.2 §10.5.2 admits several, which lie outside the target
(PC-BASIC-01). -/
def startCombination (program : Program) (header : Header) : Option String :=
  let here := place program header.id
  let siblings := program.elements.filterMap fun element =>
    element.start?.bind fun (other, payload) => if place program other.id == here then some payload else none
  let initial (payload : StartPayload) : Bool := payload.subscription.all (·.trigger.timer?.isSome)
  if header.parent.isSome then (if siblings.length ≥ 2 then some "start.subProcessCombination" else none)
  else if (siblings.filter initial).length ≥ 2 then some "start.rootCombination"
  else none

/-! ## Links -/

/-- A throwing Link has exactly one catching Link of its name among its siblings: BPMN 2.0.2 §10.5.4 (Table 10.89) and
§10.5.5 keep a Link within one Process level and give a name one target there. A second catching Link of one name
anywhere in the definition is refused as a restriction CIB shares, refusing a second catch resource-wide (CIB-AGR-0018);
the standard scopes the name to one Process level, so two levels may each hold one. A catching Link that a flow also
reaches passes that token on like any intermediate Event (PC-BASIC-02). -/
def link (program : Program) (header : Header) (payload : EventPayload) : Option String :=
  let catches (name : String) (element : Element) : Bool := (element.event?.bind (·.2.linkCatch?)) == some name
  match payload.linkThrow?, payload.linkCatch? with
  | some name, _ =>
    match (program.siblings header).filter (catches name) with
    | [_] => none
    | [] => some "link.catch"
    | _ :: _ :: _ => some "link.catch"
  | none, some name => if (program.elements.filter (catches name)).length ≥ 2 then some "link.duplicateCatch" else none
  | none, none => none

end Kernel.Admission.Flow
