module

public import Kernel.IL.Types

/-! # Admission of starts, gateways, Links and flow references. A refusal carries a stable code. A start's trigger is
admitted by `Kernel.Admission.Subscriptions.start`. -/

public section

namespace Kernel.Admission.Flow

/-- The one entry of a list, `none` for any other length. -/
def single? {α : Type} : List α → Option α
  | [entry] => some entry
  | [] => none
  | _ :: _ :: _ => none

/-- Every entry of `list` is distinct. -/
def distinct {α : Type} [DecidableEq α] (list : List α) : Bool :=
  list.eraseDups.length == list.length

/-! ## References -/

/-- Where an element or boundary sits: its parent Scope, and for a process-level element the called process holding
it (`none` for the root process). A boundary sits where its host does. -/
def place (program : Program) (id : ElementId) : Option (Option ElementId × Option String) :=
  let located (element : Element) : Option ElementId × Option String :=
    (element.header.parent,
      if element.header.parent.isNone then
        (program.processes.find? (·.children.contains element.header.id)).map (·.definition.key)
      else none)
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

/-- What the admissions read of a Gateway's kind: the candidates and default of a conditional Gateway, and whether it
is Inclusive or Parallel. -/
structure Routing where
  conditional : Option (List FlowId × Option FlowId) := none
  inclusive : Bool := false
  parallel : Bool := false

def routing (payload : GatewayPayload) : Routing :=
  match payload.kind with
  | .exclusive candidates default => { conditional := some (candidates, default) }
  | .inclusive candidates default => { conditional := some (candidates, default), inclusive := true }
  | .parallel => { parallel := true }
  | .eventBased => {}

/-- A gateway's candidates and default are its own outgoing flows, the default not a candidate. -/
def gatewayReference (payload : GatewayPayload) : Bool :=
  (routing payload).conditional.all fun (candidates, default) =>
    candidates.all payload.outgoing.contains && distinct candidates &&
      default.all fun flow => payload.outgoing.contains flow && !candidates.contains flow

/-- Every identifier names exactly one element, boundary or flow, and every flow reference resolves where it is used:
a dangling or misplaced reference would be read as no reference at all. Scope membership is
`Kernel.Admission.Scopes.references`. -/
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

def parallel (payload : GatewayPayload) : Bool := (routing payload).parallel

def inclusive (payload : GatewayPayload) : Bool := (routing payload).inclusive

/-- An Event-Based Gateway's arms are catch Events: a Receive Task arm opens through the work feature's wait, which
`Hooks.armGateway` cannot name, and a catching Link has no incoming flow (BPMN 2.0.2 §10.5.5) (PC-CF-05, PC-BASIC-02). -/
def eventBasedArms (program : Program) (payload : GatewayPayload) : Option String :=
  let arm (flow : FlowId) : Option EventPayload :=
    ((program.target? flow).bind program.element?).bind fun target => target.event?.map (·.2)
  if payload.outgoing.any fun flow => ((arm flow).bind (·.linkCatch?)).isSome then some "gateway.eventBased.linkArm"
  else if payload.outgoing.all fun flow => ((arm flow).bind (·.catch?)).isSome then none
  else some "gateway.eventBased.receiveArm"

/-- A diverging Exclusive Gateway routes by its conditions and its default only (BPMN 2.0.2 §10.6.2, Table 13.2): an
unconditioned non-default flow has no reading there, which CIB takes unconditionally
(`BpmnParse#validateExclusiveGateway`). A sole conditioned flow without a default CIB refuses to parse. A converging
gateway's one unconditioned flow is its merge (PC-CF-02). -/
def exclusive (program : Program) (payload : GatewayPayload) (candidates : List FlowId) (default : Option FlowId) :
    Option String :=
  if payload.outgoing.length ≥ 2 && candidates.any (!conditioned program ·) then
    some "gateway.exclusive.unconditionedFlow"
  else if default.isNone && payload.outgoing.length == 1 && candidates.all (conditioned program) &&
      !candidates.isEmpty then
    some "gateway.exclusive.singleConditionWithoutDefault"
  else none

/-- What a branch of a structured Inclusive region may hold, as the work feature's admission classifies an Activity:
`some arms` when it may stand on a branch, `arms` when it waits for work before the join, `none` otherwise. -/
abbrev BranchWork := Work → Option Bool

/-- The first converging element a branch reaches from `flow`, with the flow it arrives on. Every element before it is
an Activity the branch admits, a Scope or an intermediate Event, each without boundaries and with one outgoing flow, or
a Parallel block closed by its own Parallel join; and an Activity or Scope arms every path before it converges. -/
def reach (program : Program) (work : BranchWork) : Nat → Bool → FlowId → Option (ElementId × FlowId)
  | 0, _, _ => none
  | fuel + 1, armed, flow => do
    let id ← program.target? flow
    let element ← program.element? id
    let onward (arms : Bool) : Option (ElementId × FlowId) :=
      (single? element.outgoing).bind (reach program work fuel (armed || arms))
    let unbounded : Bool := element.envelope?.all (·.boundaries.isEmpty)
    if element.incoming.length ≥ 2 then (if armed then some (id, flow) else none)
    else if !unbounded then none
    else if let some (_, payload) := element.activity? then (work payload.work).bind onward
    else if element.scope?.isSome then onward true
    else if let some (_, payload) := element.event? then
      if payload.placement == .intermediate then onward false else none
    else if let some (_, payload) := element.gateway? then
      if !parallel payload || payload.outgoing.length < 2 then none
      else do
        let ends ← payload.outgoing.mapM (reach program work fuel armed)
        let (join, _) ← ends.head?
        let (_, closing) ← (program.element? join).bind (·.gateway?)
        let arrivals := ends.map (·.2)
        if parallel closing && ends.all (·.1 == join) && arrivals.length == closing.incoming.length &&
            closing.incoming.all arrivals.contains then
          (single? closing.outgoing).bind (reach program work fuel true)
        else none
    else none

/-- BPMN 2.0.2 §13.4.3's join rule is reviewed only for the Structured Synchronizing Merge (Table 13.3) while
BPMN21-450 is open: a converging Inclusive Gateway is admitted only as the one-output join of a region whose Inclusive
split, under the same parent, reaches it on one distinct incoming flow per split output through `reach` (PC-CF-04). -/
def inclusiveJoin (program : Program) (work : BranchWork) (header : Header) (payload : GatewayPayload)
    (candidates : List FlowId) (default : Option FlowId) : Option String :=
  let fuel := program.elements.length + 1
  let closes (split : Element) : Bool :=
    split.gateway?.any fun (splitHeader, splitPayload) =>
      inclusive splitPayload && splitHeader.parent == header.parent && splitPayload.incoming.length == 1 &&
        splitPayload.outgoing.length ≥ 2 &&
        (splitPayload.outgoing.mapM (reach program work fuel false)).any fun ends =>
          let arrivals := ends.map (·.2)
          ends.all (·.1 == header.id) && arrivals.length == payload.incoming.length &&
            payload.incoming.all arrivals.contains
  if payload.incoming.length < 2 then none
  else if payload.outgoing.length == 1 && candidates.isEmpty && default.isNone && program.elements.any closes then none
  else some "gateway.inclusive.join"

/-- A diverging Inclusive Gateway whose every candidate is conditioned and which has no default may select nothing, an
exception BPMN 2.0.2 §10.6.3 names without a selected reading (PC-CF-04); an unconditioned candidate always holds
(CIB-INT-0005). -/
def inclusiveSplit (program : Program) (candidates : List FlowId) (default : Option FlowId) : Option String :=
  if default.isNone && !candidates.isEmpty && candidates.all (conditioned program) then
    some "gateway.inclusive.conditionalWithoutDefault"
  else none

def gateway (program : Program) (work : BranchWork) (header : Header) (payload : GatewayPayload) : Option String :=
  match payload.kind with
  | .exclusive candidates default => exclusive program payload candidates default
  | .parallel => none
  | .inclusive candidates default =>
    inclusiveSplit program candidates default <|> inclusiveJoin program work header payload candidates default
  | .eventBased => eventBasedArms program payload

/-- A condition is read only by the exclusive and inclusive gateways, on the flows they list as candidates; on any other
flow it would be silently ignored. -/
def conditionalOutflow (program : Program) (flow : Flow) : Option String :=
  let refused : Option String := some "flow.conditionalOutflow"
  match flow.condition, (program.element? flow.source).bind (·.gateway?) with
  | none, _ => none
  | some _, none => refused
  | some _, some (_, payload) =>
    if (routing payload).conditional.any (·.1.contains flow.id) then none else refused

def start (_ : StartPayload) : Option String := none

/-! ## Links -/

/-- A throwing Link has exactly one catching Link of its name among its siblings. A catching Link has no incoming flow,
and one name has one target in the whole definition (BPMN 2.0.2 §10.5.5, Table 10.89; CIB pairs names resource-wide,
CIB-AGR-0018) (PC-BASIC-02). -/
def link (program : Program) (header : Header) (payload : EventPayload) : Option String :=
  let catches (name : String) (element : Element) : Bool := (element.event?.bind (·.2.linkCatch?)) == some name
  match payload.linkThrow?, payload.linkCatch? with
  | some name, _ =>
    match (program.children header.parent).filter (catches name) with
    | [_] => none
    | [] => some "link.catch"
    | _ :: _ :: _ => some "link.catch"
  | none, some name =>
    if !payload.incoming.isEmpty then some "link.catch.incoming"
    else if (program.elements.filter (catches name)).length ≥ 2 then some "link.duplicateCatch"
    else none
  | none, none => none

end Kernel.Admission.Flow
