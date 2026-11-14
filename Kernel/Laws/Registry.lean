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

/-- Flow queues every outgoing token. -/
theorem hooks_outflow : Registry.hooks.outflow = Feature.Flow.outflow := by
  simp only [Registry.hooks]

/-- Flow arrives at every Link. -/
theorem hooks_arriveLink : Registry.hooks.arriveLink = Feature.Flow.arriveLink := by
  simp only [Registry.hooks]

/-- Starts arrives at every start Event, with the registry's hooks for firing and payloads. -/
theorem hooks_arriveStart : Registry.hooks.arriveStart = Feature.Starts.arriveStart Registry.startsHooks := by
  simp only [Registry.hooks]

/-- Scopes completes every idle Scope. -/
theorem hooks_completeScope : Registry.hooks.completeScope = Feature.Scopes.completeScope := by
  simp only [Registry.hooks]

/-- Data applies every write. -/
theorem hooks_writeOutputs : Registry.hooks.writeOutputs = Feature.Data.writeOutputs := by
  simp only [Registry.hooks]

/-- Data removes every variable. -/
theorem hooks_removeVariables : Registry.hooks.removeVariables = Feature.Data.removeVariables := by
  simp only [Registry.hooks]

end Kernel.Laws.Registry
