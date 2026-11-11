module

public import Kernel.IL.Types
public import Kernel.IL.Footprint

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
that begin implicitly (`Program.beginsImplicitly`), as `Kernel.Feature.Scopes.implicitStart` begins them. -/
def enteredChildren (program : Program) (id : ElementId) : List Element :=
  let children := program.children (some id)
  if children.any (·.start?.isSome) then children.filter (·.start?.isSome) else children.filter program.beginsImplicitly

/-- The elements a token reaches next from `element` in the same closure: its outgoing flows' targets, a throwing
Link's catch's, and a Scope's `enteredChildren`. -/
def onward (program : Program) (element : Element) : List Element :=
  let link := (element.event?.bind fun (header, payload) => payload.linkThrow?.map (header, ·)).map fun (header, name) =>
    (program.siblings header).flatMap fun other =>
      if (other.event?.bind (·.2.linkCatch?)) == some name then other.outgoing else []
  let entered := element.scope?.map fun (header, _) => enteredChildren program header.id
  flowTargets program (element.outgoing ++ link.getD []) ++ entered.getD []

/-- What the work beginning at `begun` reaches may read and write in one closure, where an element `stop` names only
begins, and whether a token may end there: reach an element that neither stops nor continues. -/
def closureWalk (program : Program) (stop : Element → Bool) (begun : List Element) : Footprint × Bool :=
  let rec go (fuel : Nat) (frontier : List Element) (seen : List ElementId) (found : Footprint) (ends : Bool) :
      Footprint × Bool :=
    match fuel, frontier with
    | _, [] => (found, ends)
    -- The fuel bounds every visit of every element, so it is never exhausted; running out answers what was found.
    | 0, _ :: _ => (found, ends)
    | fuel + 1, element :: rest =>
      let id := element.header.id
      if seen.contains id then go fuel rest seen found ends
      else if stop element then go fuel rest (id :: seen) (found.union { reads := beginReads element }) ends
      else
        let next := onward program element
        go fuel (rest ++ next) (id :: seen) (found.union (footprint program element)) (ends || next.isEmpty)
  let size := program.elements.length + program.flows.length + 1
  go (size * size) begun [] {} false

/-- What the work a token on `start` reaches may read and write in one closure; an element it stops at only begins. -/
def branchFootprint (program : Program) (start : FlowId) : Footprint :=
  (closureWalk program branchStop (flowTargets program [start])).1

/-- Under `BranchSchedule.orderInvariant`, no branch of a split may write a name another branch reads or writes in the
same closure: BPMN 2.0.2 lets concurrent branches interleave in any order (Table 13.1, §13.3.1), so the value left or
read would depend on the closure's order, which no input states. CIB runs the first-declared branch first
(CIB-OP-0016), the profile option `declarationDepthFirst` (PC-BASIC-03). A split is a Parallel or Inclusive Gateway,
or any element or Boundary Event with several outgoing flows. A forward-compatible restriction, and a conservative one:
a Call's output mappings count as written in the closure even when the called instance waits, and a JUEL text as
reading every name; a later profile may take the interleaving as a choice input instead. Not counted: what an element
it stops at evaluates besides its input mappings and Multi-Instance definition. -/
def concurrentWrite (program : Program) (flow : Flow) : Option String :=
  match program.options.branchSchedule with
  | .declarationDepthFirst => none
  | .orderInvariant =>
    let siblings := leaving program flow.source
    let concurrent := ((program.element? flow.source).bind (·.gateway?)).all fun (_, payload) =>
      (routing payload).concurrent
    let own := branchFootprint program flow.id
    if concurrent && siblings.any fun other => other != flow.id && own.races (branchFootprint program other) then
      some "flow.concurrentWrite"
    else none

/-- What the instances of a looping `element` do in the closure that begins them, which
`Kernel.Admission.MultiInstance.concurrentInstances` reads. -/
structure InstanceClosure where
  /-- One instance writes a name before it waits; every instance has the same footprint, so it meets its own. -/
  races : Bool
  /-- An instance may complete in that closure. -/
  completes : Bool

/-- A Sub-Process instance runs from its `enteredChildren` and continues past a join, which the instance's own branches
reach in that closure; a task instance is its work, which completes at once unless it awaits a stimulus. `completes`
over-approximates: a token reaching an element that neither waits nor continues, ignoring that a sibling branch of a
Parallel split may wait, which flows a condition selects and whether a nested Call waits. -/
def instanceClosure (program : Program) (element : Element) : InstanceClosure :=
  let (own, completes) := match element.scope? with
    | some (header, _) => closureWalk program awaitsStimulus (enteredChildren program header.id)
    | none => if awaitsStimulus element then ({}, false) else (footprint program element, true)
  { races := own.races own, completes }

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

/-- A throwing Link has exactly one catching Link of its name among its siblings, and one name has one target in the
whole definition (BPMN 2.0.2 §10.5.5, Table 10.89; CIB pairs names resource-wide, CIB-AGR-0018). A catching Link that a
flow also reaches passes that token on like any intermediate Event (PC-BASIC-02). -/
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
