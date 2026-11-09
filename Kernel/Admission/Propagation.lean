module

public import Kernel.IL.Types

/-! # Admission of throw Events. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Propagation

def throwRecord : Throw → Option String
  | .none => none
  | .error record =>
    match record.message with
    | some (.expression _) => some "throw.error.message"
    | some (.literal _) => none
    | none => none
  | .escalation _ => none
  | .terminate => none
  | .message _ => some "throw.message"
  | .signal _ => some "throw.signal"
  | .compensation record =>
    if record.activity.isSome then some "throw.compensation.activity"
    else if !record.waitForCompletion then some "throw.compensation.asynchronous"
    else none
  | .cancel => none

def terminates : Throw → Bool
  | .terminate => true
  | .none => false
  | .message _ => false
  | .signal _ => false
  | .error _ => false
  | .escalation _ => false
  | .compensation _ => false
  | .cancel => false

end Kernel.Admission.Propagation
