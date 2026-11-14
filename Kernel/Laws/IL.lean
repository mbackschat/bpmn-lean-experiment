module

public import Kernel.IL.Types
import all Kernel.IL.Types

/-! # Laws of the IL

What the IL's queries return, for the proofs that need a query's value rather than its name. This is the one module
that sees the bodies of `Kernel.IL`'s modules ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
a query enters here when a proof first needs it, so an IL body edit rebuilds only this module and the proofs above it.
Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.IL

open Kernel

/-- A Gateway carries no envelope, so no loop or Multi-Instance characteristic wraps its occurrence. -/
theorem envelope?_gateway (header : Header) (payload : GatewayPayload) :
    (Element.gateway header payload).envelope? = none := by
  simp only [Element.envelope?]

end Kernel.Laws.IL
