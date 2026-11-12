module

public import Kernel.Hooks
import all Kernel.Feature.Compensation

/-! # Laws of compensation and Transaction cancellation

The rules of the [compensation semantics](../../docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#interpretation),
independent of `Kernel.Feature.Compensation`'s and `Kernel.Step`'s code: only completed work with a handler is
retained; a trigger takes the records it sees out of retention atomically, so none is compensated twice, and a second
trigger over a run in progress takes only what is still retained, so two runs never share a record and a handler's
completion advances only the run holding its context; a handler starts only once every handler that must complete before it has
(§13.5.5's dependency order: a Sequence Flow from its subject, or from a boundary Event of it, to the other subject, a
data dependency, or a later record of the same subject); a run that an interruption drops begins nothing; leaving a
scope occurrence drops its records ("presumed abort"); the thrower, and a Transaction's one Cancel boundary
continuation, go on only once the last handler has completed; and a handler failure fails the instance.

The laws take the program's relations as parameters, `flowFrom` for "a Sequence Flow path leads from one of these
elements to that one" (`flowReaches` in `Kernel.IL.Paths`), `boundaries` for a subject's boundary Events and `reads` and
`writes` for the names an element reads and can write, since reading them is the IL's; the proof wave relates them to
the program. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Compensation

open Kernel

/-! ## Retention -/

/-- What a completion retains (§13.5.5, Tables 10.88 and 10.89): a record exactly when the work completed and either has
a handler or, under `ImplicitCompensation.everySubProcess` (I5), is a Sub-Process holding records (`implicitGroup`); the
record carries the subject's handler. Interrupted or failed work retains nothing. -/
def Retains (completed : Bool) (handler : Option ElementId) (implicitGroup : Bool) (record : Option Compensable) : Prop :=
  match record with
  | some kept => completed = true ∧ (handler.isSome = true ∨ implicitGroup = true) ∧ kept.handler = handler
  | none => completed = false ∨ (handler = none ∧ implicitGroup = false)

/-- A scope occurrence left without completing (`completed = false`) drops every record retained in it and keeps every
other one. -/
def LeaveDrops (scope : ScopeOccurrenceId) (completed : Bool) (before after : Compensations) : Prop :=
  completed = false → ∀ record, record ∈ after.retained ↔ record ∈ before.retained ∧ record.scope ≠ scope

theorem LeaveDrops.noneLeft {scope : ScopeOccurrenceId} {before after : Compensations}
    (law : LeaveDrops scope false before after) {record : Compensable} (kept : record ∈ after.retained) :
    record.scope ≠ scope :=
  ((law rfl record).1 kept).2

/-! ## The trigger -/

/-- A trigger takes into its run exactly the retained records in the scope occurrences it sees (`covered`), only the
named Activity's when it names one, and leaves every other record retained, whether or not a run is in progress there:
the records a run claimed, pending ones included, are Compensating from its trigger (§13.5.5, Figure 13.2) and so no
longer retained (#103). -/
def TakesOut (covered : ScopeOccurrenceId → Prop) (activity : Option ElementId) (before after : Compensations)
    (run : CompensationRun) : Prop :=
  let selected (record : Compensable) : Prop := covered record.scope ∧ ∀ named, activity = some named → record.subject = named
  (∀ record, record ∈ run.pending ↔ record ∈ before.retained ∧ selected record) ∧
    ∀ record, record ∈ after.retained ↔ record ∈ before.retained ∧ ¬ selected record

/-- So no record is both taken by the run and still retained: no later trigger compensates it again. -/
theorem TakesOut.once {covered : ScopeOccurrenceId → Prop} {activity : Option ElementId} {before after : Compensations}
    {run : CompensationRun} (law : TakesOut covered activity before after run) {record : Compensable}
    (taken : record ∈ run.pending) : record ∉ after.retained := fun kept =>
  ((law.2 record).1 kept).2 ((law.1 record).1 taken).2

/-- The records a run has claimed: those still pending and those whose handler runs. -/
def claimed (run : CompensationRun) : List Compensable := run.pending ++ run.running.map (·.2)

/-- No record a run in progress claimed is still retained. -/
def ClaimsApart (compensations : Compensations) : Prop :=
  ∀ run ∈ compensations.runs, ∀ record ∈ claimed run, record ∉ compensations.retained

/-- So a second trigger over a run in progress claims none of that run's records: the two runs partition what they
claimed (#103). -/
theorem TakesOut.apart {covered : ScopeOccurrenceId → Prop} {activity : Option ElementId} {before after : Compensations}
    {run : CompensationRun} (law : TakesOut covered activity before after run) (apart : ClaimsApart before)
    {other : CompensationRun} (progress : other ∈ before.runs) {record : Compensable} (taken : record ∈ run.pending) :
    record ∉ claimed other := fun held =>
  apart other progress record held ((law.1 record).1 taken).1

/-- A handler's completion in its context scope occurrence `context` releases it from the run whose `running` holds that
context, found by the context and never by the run's scope, which a second run may share (#103); every other run, one
in the same scope included, is unchanged, so each thrower waits for its own run's handlers only. -/
def ReleasesOwn (context : ScopeOccurrenceId) (before after : List CompensationRun) : Prop :=
  after = before.map fun run => { run with running := run.running.filter (·.1 ≠ context) }

/-- So a run that does not hold the context is kept as it was. -/
theorem ReleasesOwn.othersKept {context : ScopeOccurrenceId} {before after : List CompensationRun}
    (law : ReleasesOwn context before after) {run : CompensationRun} (kept : run ∈ before)
    (foreign : ∀ entry ∈ run.running, entry.1 ≠ context) : run ∈ after := by
  subst law
  refine List.mem_map.2 ⟨run, kept, ?_⟩
  have same : run.running.filter (fun entry => decide (entry.1 ≠ context)) = run.running :=
    List.filter_eq_self.2 fun entry mem => by simpa using foreign entry mem
  rw [same]

/-! ## Order -/

/-- §13.5.5's dependency between two records of one trigger (I1): `record`'s handler waits until `other`'s completed when
a Sequence Flow path leads from a boundary Event of `record`'s subject to `other`'s, a different one, or `record`
completed first and a Sequence Flow path leads from its subject to `other`'s, `other`'s subject reads a name
`record`'s can write, or both are records of one subject. -/
def Precedes (flowFrom : List ElementId → ElementId → Bool) (boundaries : ElementId → List ElementId)
    (reads writes : ElementId → List String) (record other : Compensable) : Prop :=
  (record.subject ≠ other.subject ∧ flowFrom (boundaries record.subject) other.subject = true) ∨
    (record.completion < other.completion ∧
      (record.subject = other.subject ∨ flowFrom [record.subject] other.subject = true ∨
        ∃ name ∈ reads other.subject, name ∈ writes record.subject))

/-- A pending handler may start when no pending or running handler must complete before it. -/
def Ready (precedes : Compensable → Compensable → Prop) (run : CompensationRun) (record : Compensable) : Prop :=
  record ∈ run.pending ∧ ∀ other ∈ run.pending ++ run.running.map (·.2), ¬ precedes record other

/-- One advance of a run: it starts exactly its ready handlers, at once, and keeps the others pending. -/
def Advances (precedes : Compensable → Compensable → Prop) (run after : CompensationRun) (started : List Compensable) :
    Prop :=
  (∀ record, record ∈ started ↔ Ready precedes run record) ∧
    (∀ record, record ∈ after.pending ↔ record ∈ run.pending ∧ ¬ Ready precedes run record) ∧
    after.running.map (·.2) = run.running.map (·.2) ++ started

/-- So a handler never starts while one that must complete before it is pending or running. -/
theorem Advances.respectsOrder {precedes : Compensable → Compensable → Prop} {run after : CompensationRun}
    {started : List Compensable} (law : Advances precedes run after started) {record other : Compensable}
    (begun : record ∈ started) (waiting : other ∈ run.pending ++ run.running.map (·.2)) : ¬ precedes record other :=
  ((law.1 record).1 begun).2 other waiting

/-- In particular a Sequence Flow from an earlier record's subject keeps its handler waiting for the later one's. -/
theorem Advances.flowOrder {flowFrom : List ElementId → ElementId → Bool} {boundaries : ElementId → List ElementId}
    {reads writes : ElementId → List String} {run after : CompensationRun} {started : List Compensable}
    (law : Advances (Precedes flowFrom boundaries reads writes) run after started) {record other : Compensable}
    (earlier : record.completion < other.completion) (flow : flowFrom [record.subject] other.subject = true)
    (waiting : other ∈ run.pending ++ run.running.map (·.2)) : record ∉ started := fun begun =>
  law.respectsOrder begun waiting (.inr ⟨earlier, .inr (.inl flow)⟩)

/-- The thrower continues, and a Transaction's Cancel boundary is taken, exactly once the run has no pending and no
running handler: `continued` lists the continuations the run's end gives, at most the one it was asked for. -/
def EndsOnce (run : CompensationRun) (continuation : ElementId) (continued : List ElementId) : Prop :=
  (run.pending = [] ∧ run.running = [] → continued = [continuation]) ∧
    (run.pending ≠ [] ∨ run.running ≠ [] → continued = [])

/-! ## Interruption and failure -/

/-- When a catch that interrupts a scope occurrence has decided (`interrupts`), the runs in it and inside it
(`inside`) go at once and begin nothing: every other run is kept, and no scope occurrence or token is added. -/
def DropBeginsNothing (interrupts : Bool) (inside : ScopeOccurrenceId → Prop) (before after : State) : Prop :=
  interrupts = true →
    (∀ run, run ∈ after.slots.compensation.runs ↔ run ∈ before.slots.compensation.runs ∧ ¬ inside run.scope) ∧
      after.scopes = before.scopes ∧ after.tokens = before.tokens

/-- The instance has failed with a published failure, and nothing is left to continue: no token, open item or
occurrence. -/
def Failed (state : State) : Prop :=
  state.status = .failed ∧ state.failure.isSome = true ∧ state.tokens = [] ∧ state.openItems = [] ∧ state.occurrences = []

/-- Under `compensationHandlerFailure = failsInstance` (COMPH-FAIL-01), an Error that no catcher inside the handler's
context takes (`caughtInside = false`) is searched no further (`searchedFrom = none`) and fails the instance. -/
def FailsInstance (policy : CompensationHandlerFailure) (caughtInside : Bool) (searchedFrom : Option ScopeOccurrenceId)
    (after : State) : Prop :=
  policy = .failsInstance → caughtInside = false → searchedFrom = none ∧ Failed after

/-- Under `compensationHandlerFailure = propagatesFromTrigger` (I11, CIB-INT-0038), an Error that no catcher inside the
handler's context takes is searched for further from the scope occurrence the trigger ran in, the run's, as CIB's
compensating execution is a child of the throwing one; the instance does not fail for it there. -/
def PropagatesFromTrigger (policy : CompensationHandlerFailure) (caughtInside : Bool) (run : CompensationRun)
    (searchedFrom : Option ScopeOccurrenceId) (after : State) : Prop :=
  policy = .propagatesFromTrigger → caughtInside = false → searchedFrom = some run.scope ∧ after.status ≠ .failed

/-! ## Non-vacuity

Two records: `A` completed first and a Sequence Flow leads from `A` to `B`, so `B`'s handler runs first. -/

def subjectA : ElementId := ⟨"A"⟩
def subjectB : ElementId := ⟨"B"⟩
def outer : ScopeOccurrenceId := ⟨0⟩
def inner : ScopeOccurrenceId := ⟨1⟩

def recordA : Compensable := { subject := subjectA, handler := some ⟨"UndoA"⟩, scope := outer, completion := 1 }
def recordB : Compensable := { subject := subjectB, handler := some ⟨"UndoB"⟩, scope := outer, completion := 2 }
def innerRecord : Compensable := { recordB with scope := inner }

def flowAB (sources : List ElementId) (target : ElementId) : Bool := sources.contains subjectA && target == subjectB
def noBoundaries (_ : ElementId) : List ElementId := []
def nothing (_ : ElementId) : List String := []

def precedesAB : Compensable → Compensable → Prop := Precedes flowAB noBoundaries nothing nothing

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
def secondBegun : CompensationRun := { second with pending := [], running := [(⟨2⟩, recordC)] }
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
    ¬ DropBeginsNothing true (· = outer) begun { begun with slots := {}, scopes := [{ id := inner, element := none, parent := some outer }] } :=
  fun law => by
    have := (law rfl).2.1
    simp [begun] at this

def failedState : State :=
  { instanceId := "p", status := .failed, failure := some { code := "E", message := none, occurrence := trigger } }

theorem failure_fails : FailsInstance .failsInstance false none failedState := fun _ _ => ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- Under `failsInstance`, a handler failure that leaves the run's tokens is rejected. -/
theorem failure_continues_rejected :
    ¬ FailsInstance .failsInstance false none { failedState with tokens := [.flow ⟨"F"⟩ outer] } := fun law => by
  have := (law rfl rfl).2.2.2.1
  simp at this

/-- Under `failsInstance`, searching on from the trigger's scope occurrence is rejected. -/
theorem failure_searches_on_rejected : ¬ FailsInstance .failsInstance false (some outer) failedState := fun law => by
  have := (law rfl rfl).1
  simp at this

/-- A failure a catcher inside the handler took is no case of the law. -/
theorem caught_inside_unconstrained : FailsInstance .failsInstance true none begun := fun _ caught => by simp at caught

theorem propagates_from_trigger : PropagatesFromTrigger .propagatesFromTrigger false both (some outer) begun :=
  fun _ _ => ⟨rfl, by simp [begun]⟩

/-- Under `propagatesFromTrigger`, failing the instance in the handler's context is rejected. -/
theorem propagates_fails_rejected :
    ¬ PropagatesFromTrigger .propagatesFromTrigger false both (some outer) failedState := fun law =>
  (law rfl rfl).2 rfl

/-- Under `propagatesFromTrigger`, searching from the handler's context instead of the trigger's is rejected. -/
theorem propagates_from_context_rejected :
    ¬ PropagatesFromTrigger .propagatesFromTrigger false both (some inner) begun := fun law => by
  have := (law rfl rfl).1
  simp [both, inner, outer] at this

end Kernel.Laws.Compensation
