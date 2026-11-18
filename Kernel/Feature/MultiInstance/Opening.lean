module

public import Kernel.State

/-! # Multi-Instance Activities: the instances to begin

Which slots of a Multi-Instance body begin now, under the loop's mode: every waiting one of a parallel body, the first
waiting one of a sequential body once none runs. `Kernel.Feature.MultiInstance` enters and begins the slots this
module names.
-/

public section

namespace Kernel.Feature.MultiInstance

/-- The instances to begin now: every waiting one in parallel, else the first waiting one once none runs. -/
def opening (mode : MultiInstanceMode) (instances : List Iteration) : List Nat :=
  let waiting := (instances.zipIdx.filterMap fun (slot, index) =>
    match slot with
    | .waiting => some index
    | .active _ => none
    | .completed _ => none)
  let running := instances.any fun
    | .active _ => true
    | .waiting => false
    | .completed _ => false
  match mode with
  | .parallel => waiting
  | .sequential => if running then [] else waiting.take 1

end Kernel.Feature.MultiInstance
