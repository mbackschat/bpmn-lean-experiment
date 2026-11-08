module

public import Kernel.IL.Types

/-! # Admission of Scopes. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Scopes

def scope (_ : ScopePayload) : Option String := some "scope"

end Kernel.Admission.Scopes
