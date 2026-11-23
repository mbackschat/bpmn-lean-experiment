module

public import Kernel.Laws.State.Keeps

/-! # Laws of the kernel state: what the variable writes keep

That `State.setVariable` and `State.removeVariable` keep `WellFormed`: a write rebinds a name its set holds or appends
it, a removal drops it, and nothing else `WellFormed` reads changes (`SameButVariables`). It reads no body;
`Kernel.Proofs.State` assembles them into `Laws.Step.Operations`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-! ## Variables -/

/-- Rebinding or appending a name keeps a set's names distinct. -/
theorem names_after_set (entries : List (String × Value)) (name : String) (value : Value)
    (nodup : (entries.map (·.1)).Nodup) :
    ((if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
      else entries ++ [(name, value)]).map (·.1)).Nodup := by
  split
  · rename_i present
    have same : ((entries.map fun entry => if entry.1 == name then (name, value) else entry).map (·.1)) =
        entries.map (·.1) := by
      simp only [List.map_map]
      apply List.map_congr_left
      intro entry _
      by_cases targeted : entry.1 = name <;> simp [targeted]
    rw [same]; exact nodup
  · rename_i absent
    simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
    rw [List.map_append, List.nodup_append]
    refine ⟨nodup, by simp, ?_⟩
    intro first member second other
    simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    subst other; subst named
    exact fun targeted => absent entry inside targeted

/-- `setVariable` keeps the variable sets keyed, whichever scope occurrence it writes to. -/
theorem setVariable_variablesKeyed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (keyed : VariablesKeyed state) : VariablesKeyed (state.setVariable target name value) := by
  refine ⟨fun x entries held => ?_⟩
  rw [setVariable_variables, Std.ExtTreeMap.getElem?_insert] at held
  split at held
  · rename_i same
    obtain rfl := Std.LawfulEqCmp.compare_eq_iff_eq.mp same
    obtain rfl := Option.some.inj held
    refine names_after_set _ name value ?_
    cases found : state.variables[target]? with
    | none => simp [Std.ExtTreeMap.getD_eq_getD_getElem?, found]
    | some old => simpa [Std.ExtTreeMap.getD_eq_getD_getElem?, found] using keyed.names target old found
  · exact keyed.names x entries held

/-- `setVariable` keeps a state well-formed when the scope occurrence it writes to is present. -/
theorem setVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (formed : WellFormed program state) (present : target ∈ scopeIds state) :
    WellFormed program (state.setVariable target name value) := by
  have same := setVariable_same state target name value
  refine formed.ofVariables same ?_ (setVariable_variablesKeyed formed.variables)
  intro x member
  rw [scopeIds, same.scopes]
  rw [setVariable_variables, Std.ExtTreeMap.mem_insert, Std.LawfulEqCmp.compare_eq_iff_eq] at member
  rcases member with rfl | old
  · exact present
  · exact formed.owned.variableScopes x old

/-- `removeVariable` keeps a state well-formed. -/
theorem removeVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String}
    (formed : WellFormed program state) : WellFormed program (state.removeVariable target name) := by
  refine formed.ofVariables (removeVariable_same state target name) ?_ ⟨?_⟩
  · intro x member
    rw [removeVariable_variables, Std.ExtTreeMap.mem_modify] at member
    rw [scopeIds, (removeVariable_same state target name).scopes]
    exact formed.owned.variableScopes x member
  · intro x entries held
    rw [removeVariable_variables, Std.ExtTreeMap.getElem?_modify] at held
    split at held
    · rename_i same
      obtain rfl := Std.LawfulEqCmp.compare_eq_iff_eq.mp same
      obtain ⟨old, found, rfl⟩ := Option.map_eq_some_iff.mp held
      exact (formed.variables.names target old found).sublist ((List.filter_sublist).map _)
    · exact formed.variables.names x entries held

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
