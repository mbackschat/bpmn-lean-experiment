module

public import Kernel.IL.Types

/-! # Admission of starts, gateways, Links and flow references. A refusal carries a stable code. A start's trigger is
admitted by `Kernel.Admission.Subscriptions.start`. -/

public section

namespace Kernel.Admission.Flow

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

/-- The candidates and default of a conditional Gateway: what the admissions read of a Gateway's kind. -/
def routing (payload : GatewayPayload) : Option (List FlowId × Option FlowId) :=
  match payload.kind with
  | .exclusive candidates default => some (candidates, default)
  | .inclusive candidates default => some (candidates, default)
  | .parallel => none
  | .eventBased => none

/-- A gateway's candidates and default are its own outgoing flows, the default not a candidate. -/
def gatewayReference (payload : GatewayPayload) : Bool :=
  (routing payload).all fun (candidates, default) =>
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

/-- An Event-Based Gateway's arms are catch Events: a Receive Task arm opens through the work feature's wait, which
`Hooks.armGateway` cannot name, and a catching Link has no incoming flow (BPMN 2.0.2 §10.5.5) (PC-CF-05, PC-BASIC-02). -/
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
without a default (`BpmnParse#validateExclusiveGateway`). A converging gateway's one unconditioned flow is its merge
(PC-CF-02). -/
def exclusive (program : Program) (payload : GatewayPayload) (candidates : List FlowId) (default : Option FlowId) :
    Option String :=
  let unconditioned := (candidates.filter (!conditioned program ·)).length
  if payload.outgoing.length ≥ 2 && (unconditioned ≥ 2 || (default.isSome && unconditioned ≥ 1)) then
    some "gateway.exclusive.unconditionedFlow"
  else if default.isNone && payload.outgoing.length == 1 && candidates.all (conditioned program) &&
      !candidates.isEmpty then
    some "gateway.exclusive.singleConditionWithoutDefault"
  else none

/-- An Inclusive Gateway joins by `Kernel.Feature.Flow`'s reachability rule wherever it converges, and a split that
selects nothing rolls back (CIB-INT-0012), so only the Event-Based arms and the Exclusive shapes are refused here
(PC-CF-04). -/
def gateway (program : Program) (payload : GatewayPayload) : Option String :=
  match payload.kind with
  | .exclusive candidates default => exclusive program payload candidates default
  | .parallel => none
  | .inclusive _ _ => none
  | .eventBased => eventBasedArms program payload

/-- A condition is read on a conditional Gateway's candidates and on an Activity's or Scope's flows other than its
default (BPMN 2.0.2 §13.3.1; §10.3.1: a condition on the default "SHALL be ignored"); on any other flow it would be
silently ignored (PC-CF-07). -/
def conditionalOutflow (program : Program) (flow : Flow) : Option String :=
  let refused : Option String := some "flow.conditionalOutflow"
  match flow.condition, program.element? flow.source with
  | none, _ => none
  | some _, none => refused
  | some _, some source =>
    match source.gateway?, source.envelope? with
    | some (_, payload), _ => if (routing payload).any (·.1.contains flow.id) then none else refused
    | none, some envelope => if envelope.defaultFlow == some flow.id then refused else none
    | none, none => refused

/-- Pinned CIB parses one initial start per process, a None or Timer Start (`BpmnParse#selectInitial`), and one start
per Sub-Process (`BpmnParse#parseScopeStartEvent`); BPMN 2.0.2 §10.5.2 admits several, which lie outside the target
(PC-BASIC-01). -/
def start (program : Program) (header : Header) : Option String :=
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
    match (program.children header.parent).filter (catches name) with
    | [_] => none
    | [] => some "link.catch"
    | _ :: _ :: _ => some "link.catch"
  | none, some name => if (program.elements.filter (catches name)).length ≥ 2 then some "link.duplicateCatch" else none
  | none, none => none

end Kernel.Admission.Flow
