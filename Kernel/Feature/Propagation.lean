module

public import Kernel.Hooks

/-! # Propagation: throw Events

Owns matching on `Throw`. A none End Event consumes its token; a none intermediate throw passes it on.
-/

public section

namespace Kernel.Feature.Propagation

def arriveThrow (_ : Ctx) (_ : Header) (payload : EventPayload) (thrown : Throw) (arrival : Arrival)
    (state : State) : Outcome :=
  match thrown with
  | .none =>
    match payload.placement with
    | .finish => .ok state
    | .intermediate => .ok (state.emit payload.outgoing arrival.scope)
  | .message _ => .error (.unsupported "message-throw")
  | .signal _ => .error (.unsupported "signal-throw")
  | .error _ => .error (.unsupported "error-throw")
  | .escalation _ => .error (.unsupported "escalation-throw")
  | .compensation _ => .error (.unsupported "compensation-throw")
  | .cancel => .error (.unsupported "cancel-throw")
  | .terminate => .error (.unsupported "terminate-end")

end Kernel.Feature.Propagation
