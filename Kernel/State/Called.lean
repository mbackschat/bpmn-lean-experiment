module

public import Kernel.State

/-! # Entering a called process instance

The scope occurrence a Call Activity's called process instance roots in, and the identifier that names the instance.
Part of the State layer, above `Kernel.State`; its one caller, `Kernel.Feature.Work.Call`, imports it directly.
-/

public section

namespace Kernel

namespace State

/-- The identifier of the process instance a Call Activity's `activation` calls from the instance `caller`: each
part prefixed by its UTF-8 byte length, so that nested identifiers never collide. -/
def calledInstanceId (caller : String) (call : ElementId) (activation : Nat) : String :=
  s!"call:{caller.utf8ByteSize}:{caller}:{call.value.utf8ByteSize}:{call.value}:{activation}"

/-- Enter the called process instance of the Call occurrence `call`, with the given variables: a scope occurrence
that is the called instance's root, recording the definition the Call bound for this instance. The instance is named by
the Call's authored identifier (`Program.publicId`), so a Call in another deployment's process that a program carries
as a renamed copy names its instance as that process's own deployment does (PC-SCOPE-03). -/
def enterCalled (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) : State × ScopeOccurrenceId :=
  let caller := state.instanceOf call.scope
  let (state, id) := state.enterScope call.element call.scope variables (some call.id)
  ({ state with
      scopes := state.scopes.map fun occurrence =>
        if occurrence.id == id then
          { occurrence with calledInstance := some (calledInstanceId caller (program.publicId call.element) call.activation) }
        else occurrence
      slots := { state.slots with instances := state.slots.instances ++ [{ root := id, definition := some definition }] } }, id)

end State

end Kernel
