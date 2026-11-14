module

public import Kernel.Hooks
import all Kernel.Hooks

/-! # Laws of the hooks module

What `Kernel.Hooks`' shared helpers compute, for the proofs that need a helper's value rather than its name. This is the
one module that sees `Kernel.Hooks`' bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
a helper enters here when a proof first needs it. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Hooks

open Kernel

/-- An expression evaluated from `scope` reads the variables visible from it and the logical time. -/
theorem evalContext_eq (state : State) (program : Program) (scope : ScopeOccurrenceId) :
    state.evalContext program scope = { variables := state.visible program scope, nowMs := state.logicalTimeMs } := by
  simp only [State.evalContext]

end Kernel.Laws.Hooks
