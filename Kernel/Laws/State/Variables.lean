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
  constructor
  · rw [setVariable_variables]
    split
    · rw [List.map_map]
      have same : ((·.scope) ∘ fun (vars : ScopeVariables) => if vars.scope == target then
          { vars with entries := if vars.entries.any (·.1 == name) then
              vars.entries.map fun entry => if entry.1 == name then (name, value) else entry
            else vars.entries ++ [(name, value)] } else vars) = (·.scope) := by
        funext vars
        by_cases targeted : vars.scope = target <;> simp [targeted]
      rw [same]; exact keyed.scopes
    · rename_i absent
      simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
      rw [List.map_append, List.nodup_append]
      refine ⟨keyed.scopes, by simp, ?_⟩
      intro first member second other
      simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
      obtain ⟨vars, inside, located⟩ := List.mem_map.mp member
      subst other; subst located
      exact fun targeted => absent vars inside targeted
  · intro vars member
    rw [setVariable_variables] at member
    split at member
    · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
      subst made
      by_cases targeted : old.scope = target
      · simp only [targeted, beq_self_eq_true, ite_true]
        exact names_after_set old.entries name value (keyed.names old inside)
      · simp only [beq_iff_eq, targeted, ite_false]
        exact keyed.names old inside
    · rcases List.mem_append.mp member with old | fresh
      · exact keyed.names vars old
      · simp only [List.mem_singleton] at fresh
        subst fresh
        simp

/-- `setVariable` keeps a state well-formed when the scope occurrence it writes to is present. -/
theorem setVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (formed : WellFormed program state) (present : target ∈ scopeIds state) :
    WellFormed program (state.setVariable target name value) := by
  have same := setVariable_same state target name value
  refine formed.ofVariables same ?_ (setVariable_variablesKeyed formed.variables)
  intro vars member
  rw [scopeIds, same.scopes]
  rw [setVariable_variables] at member
  split at member
  · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    by_cases targeted : old.scope = target <;> simpa [targeted, scopeIds] using this
  · rcases List.mem_append.mp member with old | fresh
    · exact formed.owned.variableScopes vars old
    · simp only [List.mem_singleton] at fresh
      subst fresh
      exact present

/-- `removeVariable` keeps a state well-formed. -/
theorem removeVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String}
    (formed : WellFormed program state) : WellFormed program (state.removeVariable target name) := by
  refine formed.ofVariables (removeVariable_same state target name) ?_ ⟨?_, ?_⟩
  · intro vars member
    rw [removeVariable_variables] at member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    rw [scopeIds, (removeVariable_same state target name).scopes]
    by_cases targeted : old.scope = target <;> simpa [targeted, scopeIds] using this
  · have same : ((state.removeVariable target name).variables.map (·.scope)) = state.variables.map (·.scope) := by
      simp only [removeVariable_variables, List.map_map]
      apply List.map_congr_left
      intro vars _
      by_cases targeted : vars.scope = target <;> simp [targeted]
    rw [same]; exact formed.variables.scopes
  · intro vars member
    rw [removeVariable_variables] at member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have nodup := formed.variables.names old inside
    by_cases targeted : old.scope = target
    · simp only [targeted, beq_self_eq_true, ite_true]
      exact nodup.sublist ((List.filter_sublist).map _)
    · simp only [beq_iff_eq, targeted, ite_false]
      exact nodup

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
