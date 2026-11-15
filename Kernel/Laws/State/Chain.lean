module

public import Kernel.Laws.State

/-! # Laws of the kernel state: the scope chain's searches

What `State.visible`, `State.owner?`, `State.declaring?` and `State.instanceRoot` find, derived from their step
equations in `Kernel.Laws.State` (`visible_go`, `owner?_go`, `declaring?_go`, `instanceRoot_go`) without opening
`Kernel.State`'s bodies. Each search runs from a scope occurrence outward and stops at a called instance's root, the
root of the scope occurrence's process instance (`InstanceRoot`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The process instance of a scope occurrence -/

/-- `root` is the root of a called process instance in `s`. -/
def CalledRoot (s : State) (root : ScopeOccurrenceId) : Prop :=
  ∃ occurrence ∈ s.scopes, occurrence.id = root ∧ occurrence.calledInstance.isSome

/-- `root` is the root of the process instance `scope` belongs to: the nearest called root from `scope` outward, `scope`
itself included, or the process root when none lies on the way. -/
def InstanceRoot (s : State) (scope root : ScopeOccurrenceId) : Prop :=
  Within s scope root ∧ (CalledRoot s root ∨ root = State.root) ∧
    ∀ nearer, Within s scope nearer → Within s nearer root → CalledRoot s nearer → nearer = root

/-! ## Congruence -/

/-- What a scope occurrence sees reads only the scope occurrences and the variable sets. -/
theorem visible_congr {s t : State} (scopes : t.scopes = s.scopes) (variables : t.variables = s.variables)
    (program : Program) (scope : ScopeOccurrenceId) : t.visible program scope = s.visible program scope := by
  have shows : t.shows program = s.shows program := by
    funext id name; simp only [shows_eq, scopes]
  have called : t.calledRoot = s.calledRoot := by
    funext id; simp only [calledRoot_eq, scopes]
  obtain ⟨later, laterStart, laterSteps⟩ := visible_go t program
  obtain ⟨laterZero, laterNone, laterStep⟩ := laterSteps
  obtain ⟨earlier, earlierStart, earlierSteps⟩ := visible_go s program
  obtain ⟨earlierZero, earlierNone, earlierStep⟩ := earlierSteps
  have go : ∀ fuel current, later fuel current = earlier fuel current := by
    intro fuel
    induction fuel with
    | zero => intro current; rw [laterZero, earlierZero]
    | succ fuel ih =>
      intro current
      cases current with
      | none => rw [laterNone, earlierNone]
      | some id => rw [laterStep, earlierStep, shows, called, scopes, variables, ih]
  rw [laterStart, earlierStart, go, scopes]

/-! ## What a search finds stands -/

private theorem find?_stands {state : State} {current : ScopeOccurrenceId} {entry : ScopeOccurrence}
    (found : state.scopes.find? (·.id == current) = some entry) : ∃ scope ∈ state.scopes, scope.id = current :=
  ⟨entry, List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

/-- The declaring occurrence `State.declaring?` finds stands. -/
theorem declaring?_stands {state : State} {scope found : ScopeOccurrenceId} {element : ElementId}
    (ran : state.declaring? scope element = some found) : ∃ entry ∈ state.scopes, entry.id = found := by
  obtain ⟨go, start, zero, step⟩ := declaring?_go state element
  rw [start] at ran
  generalize state.scopes.length = fuel at ran
  induction fuel generalizing scope with
  | zero => simp [zero] at ran
  | succ fuel ih =>
    rw [step] at ran
    cases search : state.scopes.find? (·.id == scope) with
    | none => simp [search] at ran
    | some entry =>
      simp only [search, Option.bind_some] at ran
      split at ran
      · cases ran; exact find?_stands search
      · split at ran
        · simp at ran
        · obtain ⟨parent, _, recursed⟩ := Option.bind_eq_some_iff.mp ran
          exact ih recursed

/-- The owner `State.owner?` finds holds a variable set. -/
theorem owner?_holds {state : State} {scope found : ScopeOccurrenceId} {name : String}
    (ran : state.owner? scope name = some found) : ∃ variables ∈ state.variables, variables.scope = found := by
  obtain ⟨go, start, zero, step⟩ := owner?_go state name
  rw [start] at ran
  generalize state.scopes.length = fuel at ran
  induction fuel generalizing scope with
  | zero => simp [zero] at ran
  | succ fuel ih =>
    rw [step] at ran
    split at ran
    · rename_i declares
      cases search : state.variables.find? (·.scope == scope) with
      | none => simp [search] at declares
      | some variables =>
        cases ran
        exact ⟨variables, List.mem_of_find?_eq_some search, by simpa using List.find?_some search⟩
    · split at ran
      · simp at ran
      · obtain ⟨parent, _, recursed⟩ := Option.bind_eq_some_iff.mp ran
        exact ih recursed

/-- An instance root is the process root or a scope occurrence that stands. -/
theorem instanceRoot_stands (state : State) (scope : ScopeOccurrenceId) :
    state.instanceRoot scope = State.root ∨ ∃ entry ∈ state.scopes, entry.id = state.instanceRoot scope := by
  obtain ⟨go, start, zero, step⟩ := instanceRoot_go state
  rw [start]
  generalize state.scopes.length = fuel
  induction fuel generalizing scope with
  | zero => exact .inl (zero scope)
  | succ fuel ih =>
    rw [step]
    split
    · rename_i called
      right
      rw [calledRoot_eq] at called
      cases search : state.scopes.find? (·.id == scope) with
      | none => simp [search] at called
      | some entry => exact find?_stands search
    · cases (state.scopes.find? (·.id == scope)).bind (·.parent) with
      | none => exact .inl rfl
      | some parent => exact ih parent

end Kernel.Laws.State
