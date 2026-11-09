module

public import Kernel.IL.Types

/-! # Admission of starts, gateways and Links. A refusal carries a stable code. A start's trigger is admitted by
`Kernel.Admission.Subscriptions.start`. -/

public section

namespace Kernel.Admission.Flow

/-- An Event-Based Gateway's arms are catch Events: a Receive Task arm opens through the work feature's wait, which
`Hooks.armGateway` cannot name. -/
def eventBasedArms (program : Program) (payload : GatewayPayload) : Option String :=
  let catchEvent (flow : FlowId) : Bool :=
    ((program.target? flow).bind program.element?).any fun target =>
      (target.event?.bind fun (_, event) => event.catch?).isSome
  if payload.outgoing.all catchEvent then none else some "gateway.eventBased.receiveArm"

def gateway (program : Program) (payload : GatewayPayload) : Option String :=
  match payload.kind with
  | .exclusive _ _ => none
  | .parallel => none
  | .inclusive _ _ => none
  | .eventBased => eventBasedArms program payload

/-- A condition is read only by the exclusive and inclusive gateways, on the flows they list as candidates; on any other
flow it would be silently ignored. -/
def conditionalOutflow (program : Program) (flow : Flow) : Option String :=
  let refused : Option String := some "flow.conditionalOutflow"
  match flow.condition, (program.element? flow.source).bind (·.gateway?) with
  | none, _ => none
  | some _, none => refused
  | some _, some (_, payload) =>
    match payload.kind with
    | .exclusive candidates _ => if candidates.contains flow.id then none else refused
    | .inclusive candidates _ => if candidates.contains flow.id then none else refused
    | .parallel => refused
    | .eventBased => refused

def start (_ : StartPayload) : Option String := none

/-- A throwing Link has exactly one catching Link of its name among its siblings (BPMN 2.0.2 §10.5.6). -/
def link (program : Program) (header : Header) (payload : EventPayload) : Option String :=
  match payload.linkThrow? with
  | none => none
  | some name =>
    match (program.children header.parent).filter (fun element =>
        (element.event?.bind (·.2.linkCatch?)) == some name) with
    | [_] => none
    | [] => some "link.catch"
    | _ :: _ :: _ => some "link.catch"

end Kernel.Admission.Flow
