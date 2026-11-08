module

public import Kernel.IL.Types

/-! # Admission of throw Events. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Propagation

def throwRecord : Throw → Option String
  | .none => none
  | .error _ => none
  | .escalation _ => none
  | .terminate => none
  | .message _ => some "throw.message"
  | .signal _ => some "throw.signal"
  | .compensation record =>
    if record.activity.isSome then some "throw.compensation.activity"
    else if !record.waitForCompletion then some "throw.compensation.asynchronous"
    else none
  | .cancel => none

end Kernel.Admission.Propagation
