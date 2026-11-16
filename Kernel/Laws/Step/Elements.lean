module

public import Kernel.Laws.IL

/-! # Laws of the step function: what an element's typed views carry

`Element` is guarded, so splitting one on its constructors belongs to `Kernel.Step`'s laws: a typed view an element
gives (`Element.start?`, `Element.scope?`) carries the element's own header. The feature laws that read a start Event
or a Scope found among an occurrence's children read its identifier through these. The module reads no body. Nothing
executable imports it.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel

/-- A start Event's header is its element's. -/
theorem start?_header {element : Element} {header : Header} {payload : StartPayload}
    (typed : element.start? = some (header, payload)) : element.header = header := by
  cases element <;> simp_all [Laws.IL.start?_start, Laws.IL.header_start, Laws.IL.start?_activity,
    Laws.IL.start?_event, Laws.IL.start?_scope, Laws.IL.start?_gateway]

/-- A Scope's header is its element's. -/
theorem scope?_header {element : Element} {header : Header} {payload : ScopePayload}
    (typed : element.scope? = some (header, payload)) : element.header = header := by
  cases element <;> simp_all [Laws.IL.scope?_scope, Laws.IL.header_scope, Laws.IL.scope?_activity,
    Laws.IL.scope?_event, Laws.IL.scope?_gateway, Laws.IL.scope?_start]

end Kernel.Laws.Step
