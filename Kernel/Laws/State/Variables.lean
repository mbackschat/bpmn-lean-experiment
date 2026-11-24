module

public import Kernel.Laws.State.Keeps

/-! # Laws of the kernel state: what the variable writes keep

That `State.setVariable` and `State.removeVariable` keep `WellFormed`: a write binds a name in its set, a removal
erases it, and nothing else `WellFormed` reads changes (`SameButVariables`); a set binds a name at most once by its
type (`Variables`). It reads no body;
`Kernel.Proofs.State` assembles them into `Laws.Step.Operations`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-! ## Variables -/

/-- `setVariable` keeps a state well-formed when the scope occurrence it writes to is present. -/
theorem setVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (formed : WellFormed program state) (present : target ∈ scopeIds state) :
    WellFormed program (state.setVariable target name value) := by
  have same := setVariable_same state target name value
  refine formed.ofVariables same ?_
  intro x member
  rw [scopeIds, same.scopes]
  rw [setVariable_variables, Std.ExtTreeMap.mem_insert, Std.LawfulEqCmp.compare_eq_iff_eq] at member
  rcases member with rfl | old
  · exact present
  · exact formed.owned.variableScopes x old

/-- `removeVariable` keeps a state well-formed. -/
theorem removeVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String}
    (formed : WellFormed program state) : WellFormed program (state.removeVariable target name) := by
  refine formed.ofVariables (removeVariable_same state target name) ?_
  intro x member
  rw [removeVariable_variables, Std.ExtTreeMap.mem_modify] at member
  rw [scopeIds, (removeVariable_same state target name).scopes]
  exact formed.owned.variableScopes x member

/-- `setVariable` changes no scope occurrence, occurrence or open item. -/
theorem setVariable_frame (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    (state.setVariable target name value).scopes = state.scopes ∧
      (state.setVariable target name value).occurrences = state.occurrences ∧
      (state.setVariable target name value).openItems = state.openItems :=
  let same := setVariable_same state target name value
  ⟨same.scopes, same.occurrences, same.items⟩

theorem removeVariable_frame (state : State) (target : ScopeOccurrenceId) (name : String) :
    (state.removeVariable target name).scopes = state.scopes ∧
      (state.removeVariable target name).occurrences = state.occurrences ∧
      (state.removeVariable target name).openItems = state.openItems :=
  let same := removeVariable_same state target name
  ⟨same.scopes, same.occurrences, same.items⟩

end Kernel.Laws.State
