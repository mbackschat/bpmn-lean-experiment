module

public import Kernel.Registry
import all Kernel.Registry

/-! # Laws of the registry

Which feature fills each field of the hooks record `Kernel.Registry` registers, so that a proof about `Step.step`,
which takes the hooks as a parameter, reaches the feature that runs. This is the one module that sees the registry's
body ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)); a field enters here when a proof
first needs it, one statement per field, never a copy of the record. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Registry

open Kernel

/-- Flow arrives at every Gateway. -/
theorem hooks_arriveGateway : Registry.hooks.arriveGateway = Feature.Flow.arriveGateway := by
  simp only [Registry.hooks]

/-- Data applies every write. -/
theorem hooks_writeOutputs : Registry.hooks.writeOutputs = Feature.Data.writeOutputs := by
  simp only [Registry.hooks]

/-- Data removes every variable. -/
theorem hooks_removeVariables : Registry.hooks.removeVariables = Feature.Data.removeVariables := by
  simp only [Registry.hooks]

end Kernel.Laws.Registry
