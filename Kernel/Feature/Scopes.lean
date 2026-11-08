module

public import Kernel.Hooks

/-! # Scopes: Sub-Processes, Transactions and Event Sub-Processes

Owns matching on `ScopeKind`.
-/

public section

namespace Kernel.Feature.Scopes

def arriveScope (_ : Ctx) (_ : Header) (_ : ScopePayload) (_ : Arrival) (_ : State) : Outcome :=
  .error (.unsupported "scope")

end Kernel.Feature.Scopes
