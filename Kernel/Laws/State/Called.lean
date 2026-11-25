module

public import Kernel.Laws.State
import all Kernel.State.Called

/-! # Laws of the kernel state: entering a called process instance

What `Kernel.State.Called` computes: a Call's called root is the running unit's next scope occurrence, recording the
instance it names and the definition it bound (`enterCalled_eq`, `enterCalled_root`); the name's laws are
`Kernel.Laws.State.Key`'s. The one module that sees `Kernel.State.Called`'s bodies; it re-exports
`Kernel.Laws.State`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- A Call enters its called root as the running unit's next issue, below its own scope occurrence, with the following
issue as its order position, recording the instance it names and the definition it bound; the other scope occurrences,
issued before, stay as they were. -/
theorem enterCalled_eq (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) :
    state.enterCalled program call variables definition =
      ({ state with
          issueNext := state.issueNext + 1 + 1
          issued := (state.issued.insert (.fresh state.issuing state.issueNext)
            (.scope { parent := call.scope, element := call.element })).insert (.fresh state.issuing (state.issueNext + 1)) .position
          scopeMap := state.scopeMap.insert (call.scope.child call.element (.fresh state.issuing state.issueNext))
                                     { id := call.scope.child call.element (.fresh state.issuing state.issueNext)
                                       element := some call.element, position := .fresh state.issuing (state.issueNext + 1)
                                       occurrence := some call.id
                                       calledInstance := some ((state.instanceOf call.scope).calledBy
                                         (program.publicId call.element) (.committed call.activation)) }
          variables := state.variables.insert (call.scope.child call.element (.fresh state.issuing state.issueNext))
            (Variables.ofBindings variables)
          slots := { state.slots with
            instances := state.slots.instances ++
              [{ root := call.scope.child call.element (.fresh state.issuing state.issueNext), definition := some definition }] } },
        call.scope.child call.element (.fresh state.issuing state.issueNext)) := by
  simp only [State.enterCalled, enterScope_eq, Keyed.modify_insert_self]

/-- A Call's called root calls an instance and has the instance entry recording the definition the Call bound, whatever
identifiers stood before. -/
theorem enterCalled_root (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) :
    (∃ root ∈ (state.enterCalled program call variables definition).1.scopes,
      root.id = (state.enterCalled program call variables definition).2 ∧ root.calledInstance.isSome) ∧
    { root := (state.enterCalled program call variables definition).2, definition := some definition } ∈
      (state.enterCalled program call variables definition).1.slots.instances := by
  simp only [State.enterCalled, enterScope_eq, Keyed.modify_insert_self, scopes_eq]
  refine ⟨⟨_, mem_scopeList.mpr ⟨_, Std.ExtTreeMap.getElem?_insert_self⟩, ?_, ?_⟩, by simp⟩ <;>
    simp

end Kernel.Laws.State
