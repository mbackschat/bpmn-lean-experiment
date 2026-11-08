module

public import Kernel.IL.Types

/-! # Admission of Events. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Propagation

def throwRecord : Throw → Option String
  | .none => none
  | .message _ => some "throw.message"
  | .signal _ => some "throw.signal"
  | .error _ => some "throw.error"
  | .escalation _ => some "throw.escalation"
  | .compensation _ => some "throw.compensation"
  | .cancel => some "throw.cancel"
  | .terminate => some "throw.terminate"


end Kernel.Admission.Propagation
