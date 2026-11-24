module

public import Kernel.Laws.Step
public import Kernel.Laws.State

/-! # Laws of the step function: scope entries commute

T66's exact-content diamond on the scope map (DC21): two units each entering a scope occurrence, through the real
`Step.microStep`, reach exactly equal states in either order. Every identity a micro-step issues is its own unit's
(`Issue.fresh unit n`, DC12), its position included (DC25), so the two scope keys differ because the units do: no
premise separates the elements or parents, orders the units, or counts busy work.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step Kernel.Laws.State

attribute [local ext] Kernel.State

/-- The micro-step of `unit` that enters a scope occurrence of `element` in `parent`, holding no variables. -/
def enterStep (hooks : Hooks) (ctx : Ctx) (unit : UnitKey) (cause : Cause) (element : ElementId)
    (parent : ScopeOccurrenceId) (state : State) : Outcome :=
  microStep hooks ctx unit cause none parent (fun t => .ok (t.enterScope element parent [] none).1) state

/-- The state `enterStep` leaves: the scope occurrence, its variable set and its two issues under `unit`, the
transition journalled, the issuer reset. -/
def entered (unit : UnitKey) (cause : Cause) (element : ElementId) (parent : ScopeOccurrenceId) (s : State) : State :=
  { s with
    issued := (s.issued.insert (.fresh unit 0) (.scope { parent, element })).insert (.fresh unit 1) .position
    scopeMap := s.scopeMap.insert (parent.child element (.fresh unit 0))
      { id := parent.child element (.fresh unit 0), element := some element, position := .fresh unit 1, occurrence := none }
    variables := s.variables.insert (parent.child element (.fresh unit 0)) (Variables.ofBindings [])
    transitions := s.transitions.insert unit
      { cause, element := none, owner := parent, started := s.draft.started, ended := s.draft.ended,
        ready := s.draft.ready }
    draft := {}, writes := [], issuing := .ofRoot .seed, issueNext := 0 }

/-- An entering micro-step of a unit that has not run, from a state with no running batch and nothing cancelled,
under hooks whose write notification changes nothing, commits `entered`. -/
theorem enterStep_ok {hooks : Hooks} {ctx : Ctx} (quiet : ∀ writes t, hooks.written ctx writes t = .ok t)
    {unit : UnitKey} (cause : Cause) (element : ElementId) (parent : ScopeOccurrenceId) {s : State}
    (unbatched : Unbatched s) (clean : s.draft.cancelled = []) (fresh : s.transitions.contains unit = false)
    (unseeded : unit ≠ .ofRoot .seed) :
    enterStep hooks ctx unit cause element parent s = .ok (entered unit cause element parent s) := by
  obtain ⟨signals, tokens, intents⟩ := unbatched
  refine microStep_of fresh unseeded rfl (absorb_quiet (by rw [enterScope_eq]; simp [signals]))
    ((conclude_quiet quiet (by rw [enterScope_eq]; exact clean) (by rw [enterScope_eq]; simp [signals])).trans ?_)
  rw [enterScope_eq, queueBatch_eq]
  simp [entered, signals, tokens, intents]

theorem entered_unbatched (unit : UnitKey) (cause : Cause) (element : ElementId) (parent : ScopeOccurrenceId) {s : State}
    (unbatched : Unbatched s) : Unbatched (entered unit cause element parent s) :=
  unbatched

theorem entered_contains {unit other : UnitKey} (cause : Cause) (element : ElementId) (parent : ScopeOccurrenceId)
    {s : State} (apart : unit ≠ other) :
    (entered unit cause element parent s).transitions.contains other = s.transitions.contains other := by
  simp only [entered]
  rw [Std.ExtTreeMap.contains_insert]
  cases same : compare unit other
  · simp
  · exact absurd (Std.LawfulEqCmp.eq_of_compare same) apart
  · simp

/-- **Scope entries commute.** Two units, each entering a scope occurrence, run in either order through the real
micro-step to exactly equal states, their elements, parents and causes arbitrary. -/
theorem scope_entries_commute {hooks : Hooks} {ctx : Ctx} (quiet : ∀ writes t, hooks.written ctx writes t = .ok t)
    {u v : UnitKey} (distinct : u ≠ v) (seedU : u ≠ .ofRoot .seed) (seedV : v ≠ .ofRoot .seed)
    (cause cause' : Cause) (element element' : ElementId) (parent parent' : ScopeOccurrenceId) {s : State}
    (unbatched : Unbatched s) (clean : s.draft = {}) (newU : s.transitions.contains u = false)
    (newV : s.transitions.contains v = false) :
    (enterStep hooks ctx u cause element parent s).bind (enterStep hooks ctx v cause' element' parent') =
      (enterStep hooks ctx v cause' element' parent' s).bind (enterStep hooks ctx u cause element parent) := by
  have cancelled : s.draft.cancelled = [] := by simp [clean]
  rw [enterStep_ok quiet cause element parent unbatched cancelled newU seedU,
    enterStep_ok quiet cause' element' parent' unbatched cancelled newV seedV]
  simp only [Except.bind]
  rw [enterStep_ok quiet cause' element' parent' (entered_unbatched u cause element parent unbatched) rfl
      ((entered_contains cause element parent distinct).trans newV) seedV,
    enterStep_ok quiet cause element parent (entered_unbatched v cause' element' parent' unbatched) rfl
      ((entered_contains cause' element' parent' (Ne.symm distinct)).trans newU) seedU]
  have issues : ∀ i j, Issue.fresh u i ≠ Issue.fresh v j := fun _ _ same => distinct (Issue.fresh.inj same).1
  have keys : parent.child element (.fresh u 0) ≠ parent'.child element' (.fresh v 0) := fun same => by
    have segments := ScopeOccurrenceId.child_eq_iff.mp same
    rw [← ScopeOccurrenceId.child_eq_iff.mp (rfl : parent'.child element' (.fresh v 0) = _)] at segments
    exact issues 0 0 (ScopeSegment.mk.inj (List.cons.inj segments).1).2
  congr 1
  apply State.ext <;> simp only [entered, clean]
  all_goals first
    | exact Keyed.insert_pairs_comm _ _ _ _ _ (issues 0 0) (issues 0 1) (issues 1 0) (issues 1 1)
    | exact Keyed.insert_comm_ne _ _ _ keys
    | exact Keyed.insert_comm_ne _ _ _ distinct
    | skip

end Kernel.Laws.Step
