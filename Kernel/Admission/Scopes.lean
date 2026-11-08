module

public import Kernel.IL.Types

/-! # Admission of Scopes. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Scopes

/-- A local variable is declared by an input mapping; a declared local without one has no initial value the
kernel could choose. -/
def scope (payload : ScopePayload) : Option String :=
  let declared := payload.envelope.inputs.map (·.target)
  if payload.envelope.multiInstance.isSome then some "scope.multiInstance"
  else if payload.localVariables.any (!declared.contains ·) then some "scope.localVariableWithoutInput"
  else none

end Kernel.Admission.Scopes
