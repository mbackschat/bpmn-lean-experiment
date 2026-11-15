module

public import Kernel.Hooks

/-! # Laws of compensation and Transaction cancellation: the rules

The rules of the [compensation semantics](../../../docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#interpretation),
stated without reading `Kernel.Feature.Compensation` or `Kernel.Step`, so that what reads them alone, the witnesses
(`Kernel.Laws.Compensation.Witnesses`), stays outside the feature's rebuild cone (guard 15): only completed work with a
handler is retained; a trigger takes the records it sees out of retention atomically, so none is compensated twice, and
a second trigger over a run in progress takes only what is still retained, so two runs never share a record and a
handler's completion advances only the run holding its context; a handler starts only once every handler that must
complete before it has (§13.5.5's dependency order: a Sequence Flow from its subject, or from a boundary Event of it, to
the other subject, a data dependency, or a later record of the same subject); a run that an interruption drops begins
nothing; leaving a scope occurrence drops its records ("presumed abort"); the thrower, and a Transaction's one Cancel
boundary continuation, go on only once the last handler has completed; and a handler failure fails the instance.
`Kernel.Laws.Compensation` proves what the feature's hooks keep and do.

The laws take the program's relations as parameters, `flowFrom` for "a Sequence Flow path leads from one of these
elements to that one" (`flowReaches` in `Kernel.IL.Paths`), `boundaries` for a subject's boundary Events and `reads` and
`writes` for the names an element reads and can write, since reading them is the IL's; the proof wave relates them to
the program. Each law has its non-vacuity witness in `Kernel.Laws.Compensation.Witnesses`: values that satisfy it and,
where the law could otherwise hold of everything, values that violate it. Nothing executable imports this module.
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

/-- So an advanced run is settled: none of its pending handlers is ready, since each one an advance kept waiting still
waits for a handler that is pending or, having started, running. -/
theorem Advances.settles {precedes : Compensable → Compensable → Prop} {run after : CompensationRun}
    {started : List Compensable} (law : Advances precedes run after started) (record : Compensable) :
    ¬ Ready precedes after record := fun ready => by
  obtain ⟨pending, unready⟩ := (law.2.1 record).1 ready.1
  refine unready ⟨pending, fun other waiting first => ?_⟩
  refine ready.2 other ?_ first
  rw [List.mem_append, law.2.2, List.mem_append]
  rcases List.mem_append.mp waiting with waits | runs
  · by_cases now : Ready precedes run other
    · exact .inr (.inr ((law.1 other).2 now))
    · exact .inl ((law.2.1 other).2 ⟨waits, now⟩)
  · exact .inr (.inl runs)

/-- An advance moves records between pending and running only: the run claims the same records after it. -/
theorem Advances.claims {precedes : Compensable → Compensable → Prop} {run after : CompensationRun}
    {started : List Compensable} (law : Advances precedes run after started) (record : Compensable) :
    record ∈ claimed after ↔ record ∈ claimed run := by
  simp only [claimed, List.mem_append, law.2.2, law.2.1 record, law.1 record]
  by_cases now : Ready precedes run record
  · exact ⟨fun _ => .inl now.1, fun _ => .inr (.inr now)⟩
  · constructor
    · rintro (⟨pending, -⟩ | runs | ready)
      · exact .inl pending
      · exact .inr runs
      · exact absurd ready now
    · rintro (pending | runs)
      · exact .inl ⟨pending, now⟩
      · exact .inr (.inl runs)

/-- So a run a trigger took, with no handler running yet, claims after its first advance exactly the records the trigger
selected: the retained ones in the scope occurrences it sees, the named Activity's only when it names one. -/
theorem TakesOut.claimsSelected {covered : ScopeOccurrenceId → Prop} {activity : Option ElementId}
    {before after : Compensations} {taken next : CompensationRun} {precedes : Compensable → Compensable → Prop}
    {started : List Compensable} (law : TakesOut covered activity before after taken) (idle : taken.running = [])
    (advanced : Advances precedes taken next started) (record : Compensable) :
    record ∈ claimed next ↔
      record ∈ before.retained ∧ covered record.scope ∧ ∀ named, activity = some named → record.subject = named := by
  rw [advanced.claims, ← law.1 record]
  simp [claimed, idle]

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

end Kernel.Laws.Compensation
