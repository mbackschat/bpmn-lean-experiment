module

public import Kernel.State

/-! # Entering a called process instance

The scope occurrence a Call Activity's called process instance roots in, and the name it takes (`InstanceName.calledBy`).
Part of the State layer, above `Kernel.State`; its one caller, `Kernel.Feature.Work.Call`, imports it directly.
-/

public section

namespace Kernel

namespace State

/-- Enter the called process instance of the Call occurrence `call`, with the given variables: a scope occurrence
that is the called instance's root, recording the definition the Call bound for this instance. The instance is named by
the Call's authored identifier (`Program.publicId`), so a Call in another deployment's process that a program carries
as a renamed copy names its instance as that process's own deployment does (PC-SCOPE-03). -/
def enterCalled (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) : State × ScopeOccurrenceId :=
  let caller := state.instanceOf call.scope
  let (state, id) := state.enterScope call.element call.scope variables (some call.id)
  ({ state with
      scopeMap := state.scopeMap.modify id fun occurrence =>
        { occurrence with calledInstance := some (caller.calledBy (program.publicId call.element) call.activation) }
      slots := { state.slots with instances := state.slots.instances ++ [{ root := id, definition := some definition }] } }, id)

end State

end Kernel
