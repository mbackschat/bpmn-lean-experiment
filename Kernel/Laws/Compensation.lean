module

public import Kernel.Hooks
public import Kernel.Feature.Compensation
public import Kernel.Laws.Compensation.Runs
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

/-! ## Preservation

What the compensation hooks keep of an invariant: a completion retains its record, issuing a completion number, and a
handler's uncaught failure ends the instance failed. -/

/-- What the compensation hooks need of the state operations they apply, for an invariant `inv`. -/
structure CompensationOps (inv : State → Prop) : Prop where
  /-- The retained records replaced, and the runs by some of them. -/
  store : ∀ state compensation, inv state → (∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs) →
    inv { state with slots := { state.slots with compensation } }
  issue : ∀ state, inv state → inv state.issue.1
  /-- Issuing keeps the scope occurrences, the occurrences, the open items and the slots. -/
  issued : ∀ state : State, state.issue.1.scopes = state.scopes ∧ state.issue.1.occurrences = state.occurrences ∧
    state.issue.1.openItems = state.openItems ∧ state.issue.1.slots = state.slots
  fail : ∀ state failure, inv state → inv (state.signal (.endInstance .failed (some failure)))

/-- `Hooks.completed` keeps `inv`, the scope occurrences, the occurrences and the open items. -/
theorem completed_keeps {inv : State → Prop} (ops : CompensationOps inv) {ctx : Ctx} {occurrence : Occurrence}
    {state after : State} (holds : inv state) (ran : Feature.Compensation.completed ctx occurrence state = .ok after) :
    inv after ∧ after.scopes = state.scopes ∧ after.occurrences = state.occurrences ∧ after.openItems = state.openItems := by
  unfold Feature.Compensation.completed at ran
  split at ran
  · cases ran
    exact ⟨holds, rfl, rfl, rfl⟩
  · have issued := ops.issued state
    have kept := ops.issue state holds
    dsimp only at ran
    split at ran
    · cases ran
      exact ⟨ops.store _ _ holds fun _ member => member, rfl, rfl, rfl⟩
    · cases ran
      obtain ⟨scopes, occurrences, items, slots⟩ := issued
      exact ⟨ops.store _ _ kept fun _ member => slots ▸ member, scopes, occurrences, items⟩

/-- `Hooks.failCompensation` keeps `inv`. -/
theorem failCompensation_keeps {inv : State → Prop} (ops : CompensationOps inv) {ctx : Ctx} {handler : ScopeOccurrenceId}
    {code : String} {message : Option String} {origin : Origin} {state after : State} (holds : inv state)
    (ran : Feature.Compensation.failCompensation ctx handler code message origin state = .ok after) : inv after := by
  unfold Feature.Compensation.failCompensation at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals exact ops.fail _ _ holds

/-! ## Runs

The fuel induction over `Compensation.beginHandler`, `advance` and `release`, from the statements and the operations
record of `Kernel.Laws.Compensation.Runs`. -/

/-- What `Compensation.advance` keeps at `fuel`: `inv`, what follows, and, while no run holds the run's scope
occurrence as a handler's context, every scope occurrence. -/
def AdvanceKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ scope trigger state after, inv state → scope ∈ state.scopes.map (·.id) →
    Feature.Compensation.advance ctx scope trigger state fuel = .ok after → inv after ∧ Follows settled state after ∧
      (Unheld state scope → ∀ entry ∈ state.scopes, entry ∈ after.scopes)

/-- What `Compensation.release` keeps at `fuel` of a context that stands. -/
def ReleaseKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ context state after, inv state → context ∈ state.scopes.map (·.id) →
    Feature.Compensation.release ctx context state fuel = .ok after → inv after ∧ Follows settled state after

/-- What `Compensation.beginHandler` keeps at `fuel` in a scope occurrence that stands: `inv`, what follows and every
scope occurrence, and the context it began in is issued and lies directly in that scope occurrence. -/
def BeginKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ trigger scope state record after context, inv state → scope ∈ state.scopes.map (·.id) →
    Feature.Compensation.beginHandler ctx trigger scope state record fuel = .ok (after, context) →
      inv after ∧ Follows settled state after ∧ (∀ entry ∈ state.scopes, entry ∈ after.scopes) ∧
      context.value < after.nextIssue ∧ ∀ entry ∈ after.scopes, entry.id = context → entry.parent = some scope

theorem ended_store {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs) :
    Ended inv settled state (Feature.Compensation.store state compensation) :=
  have stored := ops.store state compensation holds fun run member => .inl (held run member)
  ⟨stored.1, .same stored.2 rfl rfl, rfl, held⟩

theorem ended_cancel {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs) (occurrence : Nat) :
    Ended inv settled state ((Feature.Compensation.store state compensation).signal (.cancel occurrence)) :=
  have stored := ended_store ops holds compensation held
  have cancelled := ops.cancel _ occurrence stored.1
  have shape := ops.signalled (Feature.Compensation.store state compensation) (.cancel occurrence)
  ⟨cancelled.1, stored.2.1.trans (.same cancelled.2 shape.1 shape.2.1), shape.1.trans stored.2.2.1,
    fun run member => by
      rw [shape.2.2] at member
      exact held run member⟩

/-- A run that ends by queuing a completion or an occurrence keeps what `Compensation.advance` keeps. -/
theorem Ended.queue {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {state ended : State} (done : Ended inv settled state ended) {signal : Signal} {scope : ScopeOccurrenceId}
    (queued : inv (ended.signal signal) ∧ ∀ id, settled ended id → settled (ended.signal signal) id) :
    inv (ended.signal signal) ∧ Follows settled state (ended.signal signal) ∧
      (Unheld state scope → ∀ entry ∈ state.scopes, entry ∈ (ended.signal signal).scopes) :=
  have shape := ops.signalled ended signal
  ⟨queued.1, done.2.1.trans (.same queued.2 shape.1 shape.2.1), fun _ entry member => by
    rw [shape.1, done.2.2.1]
    exact member⟩

/-- A run that ends without resuming anything keeps what `Compensation.advance` keeps. -/
theorem Ended.done {inv : State → Prop} {settled : State → Nat → Prop} {state ended : State}
    (done : Ended inv settled state ended) {scope : ScopeOccurrenceId} :
    inv ended ∧ Follows settled state ended ∧ (Unheld state scope → ∀ entry ∈ state.scopes, entry ∈ ended.scopes) :=
  ⟨done.1, done.2.1, fun _ entry member => done.2.2.1 ▸ member⟩

theorem Ended.complete {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {state ended : State} (done : Ended inv settled state ended) {scope : ScopeOccurrenceId} {id : Nat}
    (completes : settled state id) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    inv (ended.signal (.complete id leave writes rule)) ∧ Follows settled state (ended.signal (.complete id leave writes rule)) ∧
      (Unheld state scope → ∀ entry ∈ state.scopes, entry ∈ (ended.signal (.complete id leave writes rule)).scopes) :=
  done.queue ops (ops.complete _ _ _ _ _ done.1 (done.2.1.2.2 _ completes))

/-- A group's nested run that ends releases its own context, which no run holds while the outer run's handlers begin. -/
theorem Ended.group {inv : State → Prop} {settled : State → Nat → Prop} {ctx : Ctx} {fuel : Nat}
    (releases : ReleaseKeeps inv settled ctx fuel) {state ended after : State} (done : Ended inv settled state ended)
    {scope : ScopeOccurrenceId} (stands : scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.release ctx scope ended fuel = .ok after) :
    inv after ∧ Follows settled state after ∧ (Unheld state scope → ∀ entry ∈ state.scopes, entry ∈ after.scopes) := by
  have released := releases scope ended after done.1 (done.2.2.1 ▸ stands) ran
  refine ⟨released.1, done.2.1.trans released.2, fun unheld => ?_⟩
  cases fuel with
  | zero => simp [Feature.Compensation.release] at ran
  | succ fuel =>
    simp only [Feature.Compensation.release] at ran
    split at ran
    · cases ran
    · rename_i owner found
      have holding := List.find?_some found
      obtain ⟨pair, running, named⟩ := List.any_eq_true.mp holding
      exact absurd (List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩)
        (unheld owner (done.2.2.2 owner (List.mem_of_find?_eq_some found)))

/-- A handler begun in a context entered below a scope occurrence that stands keeps what `Compensation.beginHandler`
keeps. -/
theorem handler_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) {scope : ScopeOccurrenceId} (stands : scope ∈ state.scopes.map (·.id)) (handler : ElementId)
    {locals : List (String × Value)} (compensation : Compensations)
    (runs : compensation.runs = (state.enterScope handler scope locals none).1.slots.compensation.runs) :
    let entered := state.enterScope handler scope locals none
    let after := (Feature.Compensation.store entered.1 compensation).signal
      (.begin { element := handler, scope := entered.2, continuation := .compensation scope })
    inv after ∧ Follows settled state after ∧ (∀ entry ∈ state.scopes, entry ∈ after.scopes) ∧
      entered.2.value < after.nextIssue ∧ ∀ entry ∈ after.scopes, entry.id = entered.2 → entry.parent = some scope := by
  obtain ⟨named, issuedNext, scopesEq, _⟩ := ops.entered state handler scope locals
  have enter := ops.enter state handler scope locals holds stands
  intro entered after
  have fresh : ∀ entry ∈ state.scopes, entry.id ≠ ⟨state.nextIssue⟩ := fun entry member same => by
    have below := ops.issued state holds entry member
    rw [same] at below
    exact Nat.lt_irrefl _ below
  have stored := ops.store entered.1 compensation enter.1 fun run member => .inl (runs ▸ member)
  have standsEntered : entered.2 ∈ (Feature.Compensation.store entered.1 compensation).scopes.map (·.id) := by
    change _ ∈ (state.enterScope handler scope locals none).1.scopes.map _
    rw [scopesEq, named]
    simp
  have begun := ops.begin _ handler _ scope stored.1 standsEntered
  have shape := ops.signalled (Feature.Compensation.store entered.1 compensation)
    (.begin { element := handler, scope := entered.2, continuation := .compensation scope })
  have scopesAfter : after.scopes = state.scopes ++
      [{ id := ⟨state.nextIssue⟩, element := some handler, parent := some scope, occurrence := none }] :=
    shape.1.trans scopesEq
  refine ⟨begun.1, ⟨?_, fun entry member => ?_, fun id settled => begun.2 id (stored.2 id (enter.2 id settled))⟩,
    fun entry member => by rw [scopesAfter]; exact List.mem_append_left _ member, ?_, fun entry member same => ?_⟩
  · change state.nextIssue ≤ ((Feature.Compensation.store entered.1 compensation).signal _).nextIssue
    rw [shape.2.1]
    change state.nextIssue ≤ (state.enterScope handler scope locals none).1.nextIssue
    omega
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr (Nat.le_refl _)
  · change entered.2.value < ((Feature.Compensation.store entered.1 compensation).signal _).nextIssue
    rw [shape.2.1]
    change (state.enterScope handler scope locals none).2.value < (state.enterScope handler scope locals none).1.nextIssue
    rw [named, issuedNext]
    exact Nat.lt_succ_self _
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact absurd (same.trans named) (fresh entry old)
    · rw [List.mem_singleton.mp new]

theorem runs_keep {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) (ctx : Ctx) :
    ∀ fuel, AdvanceKeeps inv settled ctx fuel ∧ ReleaseKeeps inv settled ctx fuel ∧ BeginKeeps inv settled ctx fuel
  | 0 => ⟨fun _ _ _ _ _ _ ran => by simp [Feature.Compensation.advance] at ran,
    fun _ _ _ _ _ ran => by simp [Feature.Compensation.release] at ran,
    fun _ _ _ _ _ _ _ _ ran => by simp [Feature.Compensation.beginHandler] at ran⟩
  | fuel + 1 => by
    obtain ⟨advances, releases, begins⟩ := runs_keep ops ctx fuel
    refine ⟨?_, ?_, ?_⟩
    · intro scope trigger state after holds stands ran
      simp only [Feature.Compensation.advance, bind, Except.bind] at ran
      split at ran
      · rename_i run found
        have member := List.mem_of_find?_eq_some found
        have own : run.scope = scope := by
          have := List.find?_some found
          simp only [Feature.Compensation.isRun, Bool.and_eq_true, beq_iff_eq] at this
          exact this.1
        have fits := ops.fits state run holds member
        have held : ∀ other ∈ state.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·),
            other ∈ state.slots.compensation.runs := fun _ kept => (List.mem_filter.mp kept).1
        split at ran
        · rcases resumed : run.resume with _ | (⟨occurrence, leave⟩ | ⟨element, at_, leave⟩ | ⟨outer, context⟩) <;>
            simp only [resumed] at ran <;> rcases left : run.leave with _ | cancelled <;> simp only [left] at ran
          · cases ran
            exact (ended_store ops holds _ held).done
          · cases ran
            exact (ended_cancel ops holds _ held _).done
          · cases ran
            exact (ended_store ops holds _ held).complete ops (fits.1 _ _ resumed) _ _ _
          · cases ran
            exact (ended_cancel ops holds _ held _).complete ops (fits.1 _ _ resumed) _ _ _
          · cases ran
            exact (ended_store ops holds _ held).queue ops (ops.occur _ _ _ _ _ _ (ended_store ops holds _ held).1)
          · cases ran
            exact (ended_cancel ops holds _ held _).queue ops (ops.occur _ _ _ _ _ _ (ended_cancel ops holds _ held _).1)
          · obtain rfl := (fits.2.1 _ _ resumed).trans own
            exact (ended_store ops holds _ held).group releases stands ran
          · obtain rfl := (fits.2.1 _ _ resumed).trans own
            exact (ended_cancel ops holds _ held _).group releases stands ran
        · split at ran
          · cases ran
          · split at ran
            · cases ran
            · rename_i started folded
              cases ran
              have kept := foldlM_keeps (fun (now : State × List (ScopeOccurrenceId × Compensable)) =>
                  inv now.1 ∧ Follows settled state now.1 ∧ (∀ entry ∈ state.scopes, entry ∈ now.1.scopes) ∧
                    ∀ context ∈ now.2.map (·.1), context.value < now.1.nextIssue ∧
                      ∀ entry ∈ now.1.scopes, entry.id = context → entry.parent = some scope) _ _ _ _
                (fun now record next _ holdsNow began => by
                  split at began
                  · cases began
                  · rename_i begun beganNow
                    cases began
                    obtain ⟨nowHolds, nowFollows, nowKept, nowPlaced⟩ := holdsNow
                    obtain ⟨keptBegun, followsBegun, rest⟩ := begins _ _ _ _ begun.1 begun.2 nowHolds
                      (List.mem_map.mpr ((List.mem_map.mp (stands)).imp fun _ found =>
                        ⟨nowKept _ found.1, found.2⟩)) beganNow
                    obtain ⟨keptAll, below, placed⟩ := rest
                    refine ⟨keptBegun, nowFollows.trans followsBegun, fun entry member => keptAll entry (nowKept entry member),
                      fun context running => ?_⟩
                    simp only [List.map_append, List.mem_append, List.map_cons, List.map_nil, List.mem_singleton] at running
                    rcases running with old | rfl
                    · obtain ⟨oldBelow, oldPlaced⟩ := nowPlaced context old
                      refine ⟨Nat.lt_of_lt_of_le oldBelow followsBegun.1, fun entry member named => ?_⟩
                      rcases followsBegun.2.1 entry member with inside | fresh
                      · exact oldPlaced entry inside named
                      · rw [named] at fresh
                        omega
                    · exact ⟨below, placed⟩)
                ⟨holds, .refl _, fun _ member => member, fun _ running => by simp at running⟩ folded
              obtain ⟨keptHolds, keptFollows, rest⟩ := kept
              obtain ⟨keptScopes, keptPlaced⟩ := rest
              refine ⟨(ops.store started.1 _ keptHolds ?fit).1,
                keptFollows.trans (.same (ops.store started.1 _ keptHolds ?fit).2 rfl rfl),
                fun _ entry member => keptScopes entry member⟩
              case fit =>
                intro other member
                rcases List.mem_append.mp member with old | new
                · exact .inl (List.mem_filter.mp old).1
                · rw [List.mem_singleton.mp new]
                  refine .inr ⟨fun occurrence leave resumes => keptFollows.2.2 _ (fits.1 occurrence leave resumes),
                    fits.2.1, fun context running => ?_⟩
                  simp only [List.map_append, List.mem_append] at running
                  rcases running with old | started
                  · obtain ⟨oldBelow, oldPlaced⟩ := fits.2.2 context old
                    refine ⟨Nat.lt_of_lt_of_le oldBelow keptFollows.1, fun entry member named => ?_⟩
                    rcases keptFollows.2.1 entry member with inside | fresh
                    · exact oldPlaced entry inside named
                    · rw [named] at fresh
                      omega
                  · exact own ▸ keptPlaced context started
      · cases ran
    · intro context state after holds stands ran
      simp only [Feature.Compensation.release] at ran
      split at ran
      · cases ran
      · rename_i owner found
        have member := List.mem_of_find?_eq_some found
        have holding := List.find?_some found
        obtain ⟨pair, running, named⟩ := List.any_eq_true.mp holding
        obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp stands
        have link := ((ops.fits state owner holds member).2.2 entry.id
          (List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩)).2 entry inside rfl
        obtain ⟨left, parentStands, rest⟩ := ops.leave state entry owner.scope holds inside link
        obtain ⟨issued, kept, leftSettled⟩ := rest
        have stored := ops.store (state.leaveScope entry.id) { (state.leaveScope entry.id).slots.compensation with
            runs := (state.leaveScope entry.id).slots.compensation.runs.map fun candidate =>
              if Feature.Compensation.isRun owner.scope owner.trigger candidate then
                { candidate with running := candidate.running.filter (·.1 != entry.id) }
              else candidate } left fun run held => by
          obtain ⟨candidate, inLeft, rfl⟩ := List.mem_map.mp held
          split
          · have fits := ops.fits _ candidate left inLeft
            exact .inr ⟨fits.1, fits.2.1, fun context running =>
              fits.2.2 context ((List.filter_sublist.map _).subset running)⟩
          · exact .inl inLeft
        obtain ⟨kept', follows, -⟩ := advances owner.scope owner.trigger _ after stored.1 parentStands ran
        refine ⟨kept', Follows.trans ?_ follows⟩
        exact ⟨Nat.le_of_eq issued.symm, fun entry member => .inl (kept entry member),
          fun id settled => stored.2 id (leftSettled id settled)⟩
    · intro trigger scope state record after context holds stands ran
      simp only [Feature.Compensation.beginHandler] at ran
      have fresh : ∀ entry ∈ state.scopes, entry.id ≠ ⟨state.nextIssue⟩ := fun entry member same => by
        have below := ops.issued state holds entry member
        rw [same] at below
        exact Nat.lt_irrefl _ below
      have follows : ∀ element, Follows settled state (state.enterScope element scope record.snapshot none).1 :=
        fun element => by
          obtain ⟨_, issuedNext, scopesEq, _⟩ := ops.entered state element scope record.snapshot
          refine ⟨by omega, fun entry member => ?_, (ops.enter state element scope record.snapshot holds stands).2⟩
          rw [scopesEq] at member
          rcases List.mem_append.mp member with old | new
          · exact .inl old
          · rw [List.mem_singleton.mp new]
            exact .inr (Nat.le_refl _)
      rcases handlerOf : record.handler with _ | handler <;> simp only [handlerOf] at ran
      · simp only [bind, Except.bind] at ran
        split at ran
        · cases ran
        · rename_i nestedAfter nested
          cases ran
          obtain ⟨named, issuedNext, scopesEq, slotsEq⟩ := ops.entered state record.subject scope record.snapshot
          have entering := follows record.subject
          have enter := ops.enter state record.subject scope record.snapshot holds stands
          rw [named] at nested ⊢
          generalize (state.enterScope record.subject scope record.snapshot none).1 = entered
            at nested issuedNext scopesEq slotsEq enter entering
          have stored : ∀ pending, inv (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runs ++
                [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))]))) ∧
              ∀ id, settled entered id → settled (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
                (entered.slots.compensation.runs ++
                  [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))]))) id :=
            fun pending => by
              refine ops.store entered _ enter.1 fun run member => ?_
              rcases List.mem_append.mp member with old | new
              · exact .inl old
              · rw [List.mem_singleton.mp new]
                refine .inr ⟨fun _ _ same => ?_, fun _ _ same => ?_, fun _ running => ?_⟩
                · cases same
                · cases same
                  rfl
                · simp at running
          have standsNested : ⟨state.nextIssue⟩ ∈ entered.scopes.map (·.id) := by
            rw [scopesEq]
            simp
          obtain ⟨nestedHolds, nestedFollows, keeps⟩ := advances _ _ _ _ (stored _).1 standsNested nested
          have unheld : ∀ pending, Unheld (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runs ++
                [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))])))
              ⟨state.nextIssue⟩ := fun _ run member running => by
            rcases List.mem_append.mp member with old | new
            · have below := ((ops.fits state run holds (slotsEq ▸ old)).2.2 _ running).1
              exact Nat.lt_irrefl _ below
            · rw [List.mem_singleton.mp new] at running
              simp at running
          refine ⟨nestedHolds, entering.trans ((Follows.same (stored _).2 rfl rfl).trans nestedFollows), fun entry member =>
            keeps (unheld _) entry (by rw [Feature.Compensation.store, scopesEq]; exact List.mem_append_left _ member),
            Nat.lt_of_lt_of_le (by change state.nextIssue < entered.nextIssue; omega) nestedFollows.1,
            fun entry member named => ?_⟩
          rcases nestedFollows.2.1 entry member with inside | later
          · change entry ∈ entered.scopes at inside
            rw [scopesEq] at inside
            rcases List.mem_append.mp inside with old | new
            · exact absurd named (fresh entry old)
            · rw [List.mem_singleton.mp new]
          · change entered.nextIssue ≤ entry.id.value at later
            rw [named] at later
            simp at later
            omega
      · split at ran
        · cases ran
        · split at ran
          · cases ran
          · cases ran
            exact handler_keeps ops holds stands handler _ rfl

/-- `Hooks.compensate` keeps `inv` in a scope occurrence that stands, for a run that may end as it asks. -/
theorem compensate_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {ctx : Ctx}
    {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef} {leave : Option Nat}
    {resume : Option Resume} {state after : State} (holds : inv state) (stands : scope ∈ state.scopes.map (·.id))
    (resumable : ∀ next, resume = some next → (∀ occurrence leave, next = .complete occurrence leave →
      settled state occurrence) ∧ ∀ outer context, next = .group outer context → context = scope)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) : inv after := by
  unfold Feature.Compensation.compensate at ran
  simp only at ran
  refine ((runs_keep ops ctx _).1 _ _ _ _ ?_ ?_ ran).1
  rotate_left
  · exact stands
  refine (ops.store state _ holds fun run member => ?_).1
  rcases List.mem_append.mp member with old | new
  · exact .inl old
  · rw [List.mem_singleton.mp new]
    refine .inr ⟨fun occurrence leave same => (resumable _ same).1 occurrence leave rfl,
      fun outer context same => (resumable _ same).2 outer context rfl, fun _ running => ?_⟩
    simp at running

/-- `Hooks.handlerCompleted` keeps `inv` for a handler whose context stands. -/
theorem handlerCompleted_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerCompleted ctx run occurrence state = .ok after) : inv after :=
  ((runs_keep ops ctx _).2.1 _ _ _ holds stands ran).1

/-- `Hooks.handlerEnded` keeps `inv` for a handler whose context stands. -/
theorem handlerEnded_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerEnded ctx run occurrence state = .ok after) : inv after := by
  unfold Feature.Compensation.handlerEnded at ran
  split at ran
  · split at ran
    · exact handlerCompleted_keeps ops holds stands ran
    · cases ran
      exact holds
  all_goals cases ran
  all_goals exact holds

end Kernel.Laws.Compensation
