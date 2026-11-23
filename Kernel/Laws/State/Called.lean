module

public import Kernel.Laws.State
import all Kernel.State.Called

/-! # Laws of the kernel state: entering a called process instance

What `Kernel.State.Called` computes: a Call's called root is the running unit's next scope occurrence, recording the
instance it names and the definition it bound (`enterCalled_eq`, `enterCalled_root`), and the instance identifier's
spelling (`calledInstanceId_eq`). The one module that sees `Kernel.State.Called`'s bodies; it re-exports
`Kernel.Laws.State`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- A Call enters its called root as the running unit's next issue, below its own scope occurrence, with the following
issue as its order position, recording the instance it names and the definition it bound; the other scope occurrences,
issued before, stay as they were. -/
theorem enterCalled_eq (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef)
    (fresh : ∀ entry ∈ state.scopes, entry.id ≠ call.scope.child call.element (.fresh state.issuing state.issueNext)) :
    state.enterCalled program call variables definition =
      ({ state with
          issueNext := state.issueNext + 1 + 1
          issued := (state.issued.insert (.fresh state.issuing state.issueNext)
            (.scope { parent := call.scope, element := call.element })).insert (.fresh state.issuing (state.issueNext + 1)) .position
          scopes := state.scopes ++ [{ id := call.scope.child call.element (.fresh state.issuing state.issueNext)
                                       element := some call.element, position := .fresh state.issuing (state.issueNext + 1)
                                       occurrence := some call.id
                                       calledInstance := some (State.calledInstanceId (state.instanceOf call.scope)
                                         (program.publicId call.element) call.activation) }]
          variables := state.variables.insert (call.scope.child call.element (.fresh state.issuing state.issueNext))
            (keyed variables)
          slots := { state.slots with
            instances := state.slots.instances ++
              [{ root := call.scope.child call.element (.fresh state.issuing state.issueNext), definition := some definition }] } },
        call.scope.child call.element (.fresh state.issuing state.issueNext)) := by
  simp only [State.enterCalled, enterScope_eq, List.map_append, List.map_cons, List.map_nil,
    beq_self_eq_true, ite_true]
  have same : ∀ named : ScopeOccurrence → ScopeOccurrence, (∀ entry ∈ state.scopes, named entry = entry) →
      state.scopes.map named = state.scopes := fun _ kept => (List.map_congr_left kept).trans (List.map_id _)
  rw [same]
  intro entry member
  simp [fresh entry member]

/-- A Call's called root calls an instance and has the instance entry recording the definition the Call bound, whatever
identifiers stood before. -/
theorem enterCalled_root (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) :
    (∃ root ∈ (state.enterCalled program call variables definition).1.scopes,
      root.id = (state.enterCalled program call variables definition).2 ∧ root.calledInstance.isSome) ∧
    { root := (state.enterCalled program call variables definition).2, definition := some definition } ∈
      (state.enterCalled program call variables definition).1.slots.instances := by
  simp only [State.enterCalled, enterScope_eq]
  refine ⟨⟨_, List.mem_map.mpr ⟨_, List.mem_append_right _ (List.mem_singleton_self _), rfl⟩, ?_, ?_⟩, by simp⟩ <;>
    simp

/-- A called instance's identifier spells its caller's instance, then the Call's authored identifier, each after its
UTF-8 byte length, then the activation. -/
theorem calledInstanceId_eq (caller : String) (call : ElementId) (activation : Nat) :
    State.calledInstanceId caller call activation =
      s!"call:{caller.utf8ByteSize}:{caller}:{call.value.utf8ByteSize}:{call.value}:{activation}" := by
  simp only [State.calledInstanceId]

end Kernel.Laws.State
