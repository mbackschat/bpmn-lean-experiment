module

public import Kernel.Hooks

/-! # Flow: starts and gateways

Owns matching on `GatewayKind`. An Exclusive Gateway evaluates its candidates in document order and takes the first
true one, else its default ([BPMN 2.0.2 §13.4.2](../../docs/reference/bpmn-2.0.2/README.md)).
-/

public section

namespace Kernel.Feature.Flow

def startProcess (_ : Ctx) (_ : Header) (payload : StartPayload) (state : State) : Outcome :=
  match payload.subscription with
  | none => .ok (state.emit payload.outgoing State.root)
  | some _ => .error (.unsupported "triggered-start")

/-- The first candidate whose condition holds; an unconditioned candidate holds. -/
def firstTrue (ctx : Ctx) (variables : List (String × Value)) :
    List ConditionalFlow → Except Failure (Option FlowId)
  | [] => .ok none
  | candidate :: rest =>
    match candidate.condition with
    | none => .ok (some candidate.flow)
    | some condition =>
      match ctx.evaluate variables condition with
      | .value (.bool true) => .ok (some candidate.flow)
      | .value (.bool false) => firstTrue ctx variables rest
      | .value _ => .error (.semanticFailure "condition-not-boolean")
      | .needsHost => .error (.unsupported "host-evaluation")
      | .failure code => .error (.semanticFailure code)

def exclusive (ctx : Ctx) (candidates : List ConditionalFlow) (default : Option FlowId) (arrival : Arrival)
    (state : State) : Outcome := do
  let chosen ← firstTrue ctx (state.visible arrival.scope) candidates
  match chosen <|> default with
  | some flow => .ok (state.emit [flow] arrival.scope)
  | none => .error (.semanticFailure "exclusive-gateway-no-outgoing-flow")

def arriveGateway (ctx : Ctx) (_ : Header) (payload : GatewayPayload) (arrival : Arrival) (state : State) :
    Outcome :=
  match payload.kind with
  | .exclusive candidates default => exclusive ctx candidates default arrival state
  | .parallel => .error (.unsupported "parallel-gateway")
  | .inclusive _ _ => .error (.unsupported "inclusive-gateway")
  | .eventBased _ => .error (.unsupported "event-based-gateway")

end Kernel.Feature.Flow
