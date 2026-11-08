module

public import Kernel.IL.Types

/-! # Admission of starts and gateways. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Flow

def gateway (payload : GatewayPayload) : Option String :=
  match payload.kind with
  | .exclusive _ _ => none
  | .parallel => some "gateway.parallel"
  | .inclusive _ _ => some "gateway.inclusive"
  | .eventBased _ => some "gateway.eventBased"

def start (payload : StartPayload) : Option String :=
  match payload.subscription with
  | none => none
  | some _ => some "start.triggered"

end Kernel.Admission.Flow
