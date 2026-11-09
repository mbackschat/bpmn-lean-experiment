module

public import Kernel.IL.Types

/-! # Admission of throw Events. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Propagation

/-- `inTransaction` says whether the throw's parent is a Transaction: a Cancel End is used only within a Transaction
Sub-Process (BPMN 2.0.2 §10.3.5, §10.5.5 Cancel Event; `BpmnParse#parseEndEvents` refuses it elsewhere) (PC-TX-02). -/
def throwRecord (inTransaction : Bool) : Throw → Option String
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
  | .cancel => if inTransaction then none else some "throw.cancel.outsideTransaction"

/-- What other admissions read of a throw: whether it terminates its scope or throws Compensation. -/
structure Reading where
  terminates : Bool := false
  compensates : Bool := false

def reading : Throw → Reading
  | .terminate => { terminates := true }
  | .compensation _ => { compensates := true }
  | .none => {}
  | .message _ => {}
  | .signal _ => {}
  | .error _ => {}
  | .escalation _ => {}
  | .cancel => {}

end Kernel.Admission.Propagation
