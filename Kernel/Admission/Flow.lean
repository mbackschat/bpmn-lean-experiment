module

public import Kernel.IL.Types

/-! # Admission of starts, gateways and Links. A refusal carries a stable code. A start's trigger is admitted by
`Kernel.Admission.Subscriptions.start`. -/

public section

namespace Kernel.Admission.Flow

def gateway (payload : GatewayPayload) : Option String :=
  match payload.kind with
  | .exclusive _ _ => none
  | .parallel => none
  | .inclusive _ _ => none
  | .eventBased _ => none

def start (_ : StartPayload) : Option String := none

def link (_ : EventPayload) : Option String := none

end Kernel.Admission.Flow
