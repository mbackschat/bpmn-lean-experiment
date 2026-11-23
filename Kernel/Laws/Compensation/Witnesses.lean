module

public import Kernel.Laws.Compensation.Rules
public import Kernel.Laws.State.Key

/-! # Laws of compensation and Transaction cancellation: the witnesses

The non-vacuity witnesses of `Kernel.Laws.Compensation.Rules`: values that satisfy each law and, where the law could
otherwise hold of everything, values that violate it. They read the rules alone, so they stay outside
`Kernel.Feature.Compensation`'s rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Compensation

open Kernel

/-! ## Non-vacuity

Two records: `A` completed first and a Sequence Flow leads from `A` to `B`, so `B`'s handler runs first. -/

def subjectA : ElementId := ⟨"A"⟩
def subjectB : ElementId := ⟨"B"⟩
def outer : ScopeOccurrenceId := .ofSegments []
/-- The context entered in `outer` for `B`'s handler. -/
def inner : ScopeOccurrenceId := .ofSegments [{ element := ⟨"UndoB"⟩, ordinal := 0 }]

def recordA : Compensable := { subject := subjectA, handler := some ⟨"UndoA"⟩, scope := outer, completion := 1 }
def recordB : Compensable := { subject := subjectB, handler := some ⟨"UndoB"⟩, scope := outer, completion := 2 }
def innerRecord : Compensable := { recordB with scope := inner }

def flowAB (sources : List ElementId) (target : ElementId) : Bool := sources.contains subjectA && target == subjectB
def noBoundaries (_ : ElementId) : List ElementId := []
def nothing (_ : ElementId) : List String := []

def precedesAB : Compensable → Compensable → Prop :=
  Precedes flowAB noBoundaries (fun record other => record.completion < other.completion) nothing nothing

def trigger : OccurrenceRef := { processInstanceId := "p", element := ⟨"Throw"⟩, activation := 1 }
def both : CompensationRun := { trigger, scope := outer, pending := [recordA, recordB], leave := none, resume := none }
def afterFirst : CompensationRun := { both with pending := [recordA], running := [(inner, recordB)] }

theorem a_precedes_b : precedesAB recordA recordB :=
  .inr ⟨by simp [recordA, recordB], .inr (.inl (by simp [flowAB, recordA, recordB, subjectA, subjectB]))⟩

theorem b_not_precedes_a : ¬ precedesAB recordB recordA := by
  simp [precedesAB, Precedes, recordA, recordB, flowAB, noBoundaries, nothing, subjectA, subjectB]

theorem b_not_precedes_b : ¬ precedesAB recordB recordB := by
  simp [precedesAB, Precedes, recordB, noBoundaries, flowAB]

theorem a_ne_b : recordA ≠ recordB := by
  simp [recordA, recordB, subjectA, subjectB]

theorem b_ready : Ready precedesAB both recordB := by
  refine ⟨by simp [both], fun other mem => ?_⟩
  simp [both] at mem
  rcases mem with rfl | rfl
  · exact b_not_precedes_a
  · exact b_not_precedes_b

theorem a_not_ready : ¬ Ready precedesAB both recordA := fun ready =>
  ready.2 recordB (by simp [both]) a_precedes_b

/-- The run starts `B`'s handler alone and keeps `A`'s pending. -/
theorem starts_b_first : Advances precedesAB both afterFirst [recordB] := by
  refine ⟨fun record => ?_, fun record => ?_, by simp [afterFirst, both]⟩
  · constructor
    · intro mem
      simp at mem
      exact mem ▸ b_ready
    · intro ready
      have : record = recordA ∨ record = recordB := by simpa [both] using ready.1
      rcases this with rfl | rfl
      · exact absurd ready a_not_ready
      · simp
  · constructor
    · intro mem
      simp [afterFirst] at mem
      subst mem
      exact ⟨by simp [both], a_not_ready⟩
    · rintro ⟨mem, unready⟩
      have : record = recordA ∨ record = recordB := by simpa [both] using mem
      rcases this with rfl | rfl
      · simp [afterFirst]
      · exact absurd b_ready unready

/-- Starting both handlers at once, as CIB does (CIB-DEV-0011), is rejected. -/
theorem starts_both_rejected : ¬ Advances precedesAB both { afterFirst with pending := [] } [recordA, recordB] :=
  fun law => a_not_ready ((law.1 recordA).1 (by simp))

/-- A trigger in `outer` takes `A` and `B` and leaves the record of `inner`. -/
theorem takes_visible : TakesOut (· = outer) none { retained := [recordA, recordB, innerRecord] } { retained := [innerRecord] }
    both := by
  refine ⟨fun record => ?_, fun record => ?_⟩
  · simp only [both, List.mem_cons, List.not_mem_nil, or_false]
    constructor
    · rintro (rfl | rfl) <;> simp [recordA, recordB]
    · rintro ⟨mem, scope, _⟩
      rcases mem with rfl | rfl | rfl
      · exact .inl rfl
      · exact .inr rfl
      · simp [innerRecord, recordB, inner, outer] at scope
  · simp only [List.mem_cons, List.not_mem_nil, or_false]
    constructor
    · rintro rfl
      exact ⟨.inr (.inr rfl), by simp [innerRecord, recordB, inner, outer]⟩
    · rintro ⟨mem, unselected⟩
      rcases mem with rfl | rfl | rfl
      · exact absurd ⟨rfl, by simp⟩ unselected
      · exact absurd ⟨rfl, by simp⟩ unselected
      · rfl

/-- Keeping `A` retained after the run took it, so that a second trigger compensates it again, is rejected. -/
theorem keeps_taken_rejected :
    ¬ TakesOut (· = outer) none { retained := [recordA, recordB] } { retained := [recordA] } both := fun law =>
  law.once (record := recordA) (by simp [both]) (by simp)

def begun : State := { instanceId := "p", slots := { compensation := { runs := [both] } } }

/-! A second trigger in `outer` while the first run waits for `B`'s handler and keeps `A`'s pending: `C` completed
after the first trigger. -/

def subjectC : ElementId := ⟨"C"⟩
def recordC : Compensable := { subject := subjectC, handler := some ⟨"UndoC"⟩, scope := outer, completion := 3 }
def secondTrigger : OccurrenceRef := { trigger with activation := 2 }
def second : CompensationRun := { trigger := secondTrigger, scope := outer, pending := [recordC], leave := none, resume := none }
def secondBegun : CompensationRun :=
  { second with pending := [], running := [(.ofSegments [{ element := ⟨"UndoC"⟩, ordinal := 0 }], recordC)] }
def inProgress : Compensations := { retained := [recordC], runs := [afterFirst] }

theorem in_progress_apart : ClaimsApart inProgress := by
  intro run mem record held kept
  simp [inProgress] at mem kept
  subst mem kept
  simp [claimed, afterFirst, both, recordA, recordB, recordC, subjectA, subjectB, subjectC] at held

/-- The second run takes `C` alone, the record still retained. -/
theorem second_takes_remaining : TakesOut (· = outer) none inProgress { retained := [] } second := by
  refine ⟨fun record => ?_, fun record => ?_⟩
  · simp only [second, inProgress, List.mem_singleton]
    constructor
    · rintro rfl
      exact ⟨rfl, rfl, by simp⟩
    · rintro ⟨rfl, _⟩
      rfl
  · simp only [inProgress, List.mem_singleton, List.not_mem_nil]
    constructor
    · exact False.elim
    · rintro ⟨rfl, unselected⟩
      exact absurd ⟨rfl, by simp⟩ unselected

/-- Taking `A` again, which the first run claimed, is rejected. -/
theorem second_retakes_claimed_rejected :
    ¬ TakesOut (· = outer) none inProgress { retained := [] } { second with pending := [recordA, recordC] } := fun law => by
  have := ((law.1 recordA).1 (by simp)).1
  simp [inProgress, recordA, recordC, subjectA, subjectC] at this

/-- `B`'s handler completing in its context `inner` releases the first run alone. -/
theorem releases_first_only :
    ReleasesOwn inner [afterFirst, secondBegun] [{ afterFirst with running := [] }, secondBegun] := by
  simp [ReleasesOwn, afterFirst, secondBegun, inner]

/-- Releasing every run of the scope `outer`, which would end the second run's wait for `C`'s handler too, is rejected. -/
theorem releases_by_scope_rejected :
    ¬ ReleasesOwn inner [afterFirst, secondBegun] [{ afterFirst with running := [] }, { secondBegun with running := [] }] := by
  simp [ReleasesOwn, afterFirst, secondBegun, inner]

theorem completed_with_handler_retained : Retains true (some ⟨"UndoA"⟩) false (some recordA) :=
  ⟨rfl, .inl rfl, rfl⟩

/-- Retaining interrupted work is rejected. -/
theorem interrupted_retained_rejected : ¬ Retains false (some ⟨"UndoA"⟩) false (some recordA) := by
  simp [Retains]

/-- Retaining handler-free work outside an implicit group is rejected. -/
theorem handler_free_retained_rejected : ¬ Retains true none false (some { recordA with handler := none }) := by
  simp [Retains]

theorem leave_drops_inner : LeaveDrops inner false { retained := [recordA, innerRecord] } { retained := [recordA] } := by
  intro _ record
  simp only [List.mem_cons, List.not_mem_nil, or_false]
  constructor
  · rintro rfl
    exact ⟨.inl rfl, by simp [recordA, outer, inner]⟩
  · rintro ⟨rfl | rfl, scope⟩
    · rfl
    · exact absurd rfl scope

/-- Keeping the left scope occurrence's record is rejected. -/
theorem leave_keeps_rejected : ¬ LeaveDrops inner false { retained := [innerRecord] } { retained := [innerRecord] } := fun law =>
  law.noneLeft (record := innerRecord) (by simp) rfl

theorem ends_after_last : EndsOnce { both with pending := [] } ⟨"Cancel"⟩ [⟨"Cancel"⟩] :=
  ⟨fun _ => rfl, fun pending => by simp [both] at pending⟩

/-- Taking the Cancel boundary while a handler is still pending is rejected. -/
theorem ends_early_rejected : ¬ EndsOnce both ⟨"Cancel"⟩ [⟨"Cancel"⟩] := fun law => by
  have := law.2 (.inl (by simp [both]))
  simp at this

theorem drop_begins_nothing : DropBeginsNothing true (· = outer) begun { begun with slots := {} } := fun _ =>
  ⟨fun run => ⟨fun mem => by simp at mem, fun ⟨mem, notOuter⟩ => by
    simp [begun] at mem
    subst mem
    exact absurd rfl notOuter⟩, rfl, rfl⟩

/-- Beginning a handler's context while dropping the run is rejected. -/
theorem drop_begins_rejected :
    ¬ DropBeginsNothing true (· = outer) begun { begun with slots := {}, scopes := [{ id := inner, element := none, position := 0 }] } :=
  fun law => by
    have := (law rfl).2.1
    simp [begun] at this

def failedState : State :=
  { instanceId := "p", status := .failed, failure := some { code := "E", message := none, occurrence := trigger } }

theorem failure_fails : FailsInstance .failsInstance false none failedState := fun _ _ => ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- Under `failsInstance`, a handler failure that leaves the run's tokens is rejected. -/
theorem failure_continues_rejected :
    ¬ FailsInstance .failsInstance false none { failedState with batchTokens := [.flow ⟨"F"⟩ outer] } := fun law => by
  have := (law rfl rfl).2.2.2.1
  simp [Laws.State.allQueuedTokens, failedState] at this

/-- Under `failsInstance`, searching on from the trigger's scope occurrence is rejected. -/
theorem failure_searches_on_rejected : ¬ FailsInstance .failsInstance false (some outer) failedState := fun law => by
  have := (law rfl rfl).1
  simp at this

/-- A failure a catcher inside the handler took is no case of the law. -/
theorem caught_inside_unconstrained : FailsInstance .failsInstance true none begun := fun _ caught => by simp at caught

theorem propagates_from_record : PropagatesFromHandler .propagatesFromHandler false innerRecord (some inner) begun :=
  fun _ _ => ⟨rfl, by simp [begun]⟩

/-- Under `propagatesFromHandler`, failing the instance in the handler's context is rejected. -/
theorem propagates_fails_rejected :
    ¬ PropagatesFromHandler .propagatesFromHandler false innerRecord (some inner) failedState := fun law =>
  (law rfl rfl).2 rfl

/-- Under `propagatesFromHandler`, searching from the trigger's scope occurrence, the run's, instead of the one holding
the handler's record is rejected. -/
theorem propagates_from_trigger_rejected :
    ¬ PropagatesFromHandler .propagatesFromHandler false innerRecord (some both.scope) begun := fun law => by
  have := (law rfl rfl).1
  simp [both, innerRecord, recordB, inner, outer] at this

end Kernel.Laws.Compensation
