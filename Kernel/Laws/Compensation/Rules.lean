module

public import Kernel.Hooks
public import Kernel.Laws.State.Map

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
`Kernel.Laws.Compensation` proves what the feature's hooks keep and do, in this module's vocabulary of the run a search
finds (`Keyed`, `Holds`, `FirstOf`) and of the handlers an advance begins (`BeginsEach`).

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

/-- `Ready` read as the search the kernel runs over a Boolean dependency `test`: a pending record that `test` orders
after none of its run's pending or running records. -/
theorem Ready.any_iff {test : Compensable → Compensable → Bool} {run : CompensationRun} {record : Compensable} :
    Ready (test · · = true) run record ↔
      record ∈ run.pending ∧ (!(run.pending ++ run.running.map (·.2)).any (test record ·)) = true := by
  rw [Bool.not_eq_true', List.any_eq_false]
  rfl

/-- The run that `trigger` started in `scope`: two runs never share both. -/
def Keyed (scope : ScopeOccurrenceId) (trigger : OccurrenceRef) (run : CompensationRun) : Prop :=
  run.scope = scope ∧ run.trigger = trigger

/-- The run holds a handler running in the context scope occurrence `context`. -/
def Holds (context : ScopeOccurrenceId) (run : CompensationRun) : Prop :=
  context ∈ run.running.map (·.1)

/-- `run` is the first of `runs` that `holds`: the one a search of the runs in order finds. -/
def FirstOf (holds : CompensationRun → Prop) (runs : List CompensationRun) (run : CompensationRun) : Prop :=
  holds run ∧ ∃ front back, runs = front ++ run :: back ∧ ∀ other ∈ front, ¬ holds other

theorem FirstOf.mem {holds : CompensationRun → Prop} {runs : List CompensationRun} {run : CompensationRun}
    (first : FirstOf holds runs run) : run ∈ runs := by
  obtain ⟨-, front, back, split⟩ := first
  simp [split.1]

/-- A search of the runs in order for one satisfying `test` finds the first one that `holds`. -/
theorem FirstOf.of_find {test : CompensationRun → Bool} {holds : CompensationRun → Prop}
    (tests : ∀ run, test run = true ↔ holds run) {runs : List CompensationRun} {run : CompensationRun}
    (found : runs.find? test = some run) : FirstOf holds runs run := by
  obtain ⟨tested, front, back, split⟩ := List.find?_eq_some_iff_append.mp found
  refine ⟨(tests run).1 tested, front, back, split.1, fun other member held => ?_⟩
  have := split.2 other member
  simp [(tests other).2 held] at this

/-- The search for a run holding `context` by its running handlers finds one that `Holds` it. -/
theorem Holds.any_iff (context : ScopeOccurrenceId) (run : CompensationRun) :
    run.running.any (·.1 == context) = true ↔ Holds context run := by
  simp [Holds]

/-- The handlers of the records in `started` begun one after another by `begin`, from `state` to `final`: each in the
state the one before left, in the context scope occurrence paired with it. -/
inductive BeginsEach (begin : State → Compensable → Except Failure (State × ScopeOccurrenceId)) :
    State → List (ScopeOccurrenceId × Compensable) → State → Prop
  | nil (state : State) : BeginsEach begin state [] state
  | cons {state next final : State} {context : ScopeOccurrenceId} {record : Compensable}
      {later : List (ScopeOccurrenceId × Compensable)} :
      begin state record = .ok (next, context) → BeginsEach begin next later final →
      BeginsEach begin state ((context, record) :: later) final

/-- A fold over records whose every `step` begins one by `begin` and appends it with its context begins them as
`BeginsEach` says. -/
theorem BeginsEach.of_fold {begin : State → Compensable → Except Failure (State × ScopeOccurrenceId)}
    {step : State × List (ScopeOccurrenceId × Compensable) → Compensable →
      Except Failure (State × List (ScopeOccurrenceId × Compensable))}
    (stepped : ∀ now record result, step now record = .ok result →
      ∃ entered, begin now.1 record = .ok entered ∧ result = (entered.1, now.2 ++ [(entered.2, record)])) :
    ∀ (records : List Compensable) (state : State) (begun : List (ScopeOccurrenceId × Compensable))
      (result : State × List (ScopeOccurrenceId × Compensable)), records.foldlM step (state, begun) = .ok result →
      ∃ started, result.2 = begun ++ started ∧ started.map (·.2) = records ∧ BeginsEach begin state started result.1
  | [], state, begun, result, folded => by
    cases folded
    exact ⟨[], by simp, rfl, .nil _⟩
  | record :: records, state, begun, result, folded => by
    simp only [List.foldlM_cons, bind, Except.bind] at folded
    split at folded
    · cases folded
    · rename_i next began
      obtain ⟨entered, begins, rfl⟩ := stepped _ _ _ began
      obtain ⟨started, appended, mapped, rest⟩ := BeginsEach.of_fold stepped records _ _ _ folded
      exact ⟨(entered.2, record) :: started, by simp [appended], by simp [mapped], .cons begins rest⟩

/-- A completion that moves its inner records, having no handler and no implicit group, retains no record of its own. -/
theorem Retains.moved {handler : Option ElementId} {grouped : Bool} (plain : (handler.isNone && !grouped) = true) :
    Retains true handler grouped none := by
  cases handler <;> cases grouped <;> simp_all [Retains]

/-- A completion with a handler or an implicit group retains a record of its own carrying the handler. -/
theorem Retains.record {handler : Option ElementId} {grouped : Bool} {record : Compensable}
    (kept : ¬ (handler.isNone && !grouped) = true) (carried : record.handler = handler) :
    Retains true handler grouped (some record) := by
  cases handler <;> cases grouped <;> simp_all [Retains]

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
      after.scopes = before.scopes ∧ Laws.State.allQueuedTokens after = Laws.State.allQueuedTokens before

/-- The instance has failed with a published failure, and nothing is left to continue: no token, open item or
occurrence. -/
def Failed (state : State) : Prop :=
  state.status = .failed ∧ state.failure.isSome = true ∧ Laws.State.allQueuedTokens state = [] ∧ state.openItems = ∅ ∧ state.occurrences = []

/-- Under `compensationHandlerFailure = failsInstance` (COMPH-FAIL-01), an Error that no catcher inside the handler's
context takes (`caughtInside = false`) is searched no further (`searchedFrom = none`) and fails the instance. -/
def FailsInstance (policy : CompensationHandlerFailure) (caughtInside : Bool) (searchedFrom : Option ScopeOccurrenceId)
    (after : State) : Prop :=
  policy = .failsInstance → caughtInside = false → searchedFrom = none ∧ Failed after

/-- Under `compensationHandlerFailure = propagatesFromHandler` (I11, CIB-INT-0038), an Error that no catcher inside the
handler's context takes is searched for further from the scope occurrence holding the handler's `record`, through the
handler's model scopes, as CIB walks the handler's model flow scopes, not the scope occurrence the trigger ran in (#159);
the instance does not fail for it there. -/
def PropagatesFromHandler (policy : CompensationHandlerFailure) (caughtInside : Bool) (record : Compensable)
    (searchedFrom : Option ScopeOccurrenceId) (after : State) : Prop :=
  policy = .propagatesFromHandler → caughtInside = false → searchedFrom = some record.scope ∧ after.status ≠ .failed

/-! ## Where stored records come from -/

/-- The completion numbers a record holds: its own and those of the records it keeps. -/
def heldCompletions (record : Compensable) : List Nat :=
  record.completion :: record.children.map (·.completion)

/-- The elements a kept record names: its subject and its handler. -/
def childElements (child : CompensableChild) : List ElementId :=
  child.subject :: child.handler.toList

/-- The elements a compensation record names at every depth: its subject, its handler and those of every record it
keeps. -/
def recordElements (record : Compensable) : List ElementId :=
  record.subject :: record.handler.toList ++ record.children.flatMap childElements

/-- A record names its subject, its handler and the elements of the records it keeps. -/
theorem recordElements_eq (record : Compensable) :
    recordElements record = record.subject :: record.handler.toList ++ record.children.flatMap childElements := rfl

/-- A kept record's elements are its holder's. -/
theorem recordElements_child {record : Compensable} {child : CompensableChild} {element : ElementId}
    (member : child ∈ record.children) (named : element ∈ childElements child) : element ∈ recordElements record :=
  List.mem_cons_of_mem _ (List.mem_append_right _ (List.mem_flatMap.mpr ⟨child, member, named⟩))

/-- A record moved to another scope occurrence names the elements it named. -/
theorem recordElements_scope (record : Compensable) (scope : ScopeOccurrenceId) :
    recordElements { record with scope } = recordElements record := rfl

/-- A scope occurrence an `InstanceLinked` edge may leave: one that calls no instance, or one of a Scope element or
owned by an occurrence of one, which the placement lane shows never calls one. -/
def Uncalled (program : Program) (state : State) (entry : ScopeOccurrence) : Prop :=
  entry.calledInstance = none ∨ (∃ element, entry.element = some element ∧
    ((program.element? element).bind (·.scope?)).isSome) ∨
    ∃ owner ∈ state.occurrences, entry.occurrence = some owner.id ∧ ((program.element? owner.element).bind (·.scope?)).isSome

/-- Two scope occurrences of one process instance, by a path of parent links and owner links (from a scope occurrence
an occurrence owns to the occurrence's own) each of which leaves an `Uncalled` scope occurrence: where a stored record
may come from. -/
inductive InstanceLinked (program : Program) (state : State) : ScopeOccurrenceId → ScopeOccurrenceId → Prop where
  | refl (scope : ScopeOccurrenceId) : InstanceLinked program state scope scope
  | parent (entry : ScopeOccurrence) (parent : ScopeOccurrenceId) : entry ∈ state.scopes → entry.parent = some parent →
      Uncalled program state entry → InstanceLinked program state entry.id parent
  | owner (entry : ScopeOccurrence) (owner : Occurrence) : entry ∈ state.scopes → owner ∈ state.occurrences →
      entry.occurrence = some owner.id → Uncalled program state entry → InstanceLinked program state entry.id owner.scope
  | symm {first second : ScopeOccurrenceId} : InstanceLinked program state first second →
      InstanceLinked program state second first
  | trans {first second third : ScopeOccurrenceId} : InstanceLinked program state first second →
      InstanceLinked program state second third → InstanceLinked program state first third

/-- Paths that read only scope occurrences and occurrences agree on states that agree on those. -/
theorem InstanceLinked.congr {program : Program} {s t : State} (scopes : t.scopes = s.scopes)
    (occurrences : t.occurrences = s.occurrences) {first second : ScopeOccurrenceId}
    (linked : InstanceLinked program s first second) : InstanceLinked program t first second := by
  have uncalled : ∀ entry, Uncalled program s entry → Uncalled program t entry := fun _ => by
    unfold Uncalled; rw [occurrences]; exact id
  induction linked with
  | refl => exact .refl _
  | parent entry parent member link free => exact .parent entry parent (scopes ▸ member) link (uncalled _ free)
  | owner entry owner member owns link free =>
    exact .owner entry owner (scopes ▸ member) (occurrences ▸ owns) link (uncalled _ free)
  | symm _ back => exact back.symm
  | trans _ _ left right => exact left.trans right

/-- A record held in `state`, retained or pending in a run, at a scope occurrence linked to `scope`, naming every one
of `elements`. -/
def RecordHeld (program : Program) (state : State) (elements : List ElementId) (scope : ScopeOccurrenceId) : Prop :=
  ∃ held at_, ((held ∈ state.slots.compensation.retained ∧ held.scope = at_) ∨
    ∃ run ∈ state.slots.compensation.runs, held ∈ run.pending ∧ run.scope = at_) ∧
    InstanceLinked program state at_ scope ∧ ∀ element ∈ elements, element ∈ recordElements held

/-- Where a record stored at `scope` comes from: one `state` holds (`RecordHeld`), or the record of a completed
occurrence of `state` whose scope occurrence is linked to `scope`, naming one of its element's compensation handlers and
holding records `state` holds. -/
def RecordFrom (program : Program) (state : State) (record : Compensable) (scope : ScopeOccurrenceId) : Prop :=
  RecordHeld program state (recordElements record) scope ∨
    ∃ occurrence ∈ state.occurrences, record.subject = occurrence.element ∧
    InstanceLinked program state occurrence.scope scope ∧
    (∀ handler, record.handler = some handler → ∃ element ∈ program.elements, element.header.id = record.subject ∧
      ∃ envelope, element.envelope? = some envelope ∧ handler ∈ envelope.compensationHandlers) ∧
    ∀ child ∈ record.children, RecordHeld program state (childElements child) scope

/-- Where a compensation stored in place of `state`'s comes from (the storage provenance): every record it retains and
every record a run of it holds pending, at the scope occurrence holding it (`RecordFrom`), and every run's resume: a
resume of a run of `state`, a group's, or one `resumed` admits. -/
def StoredFrom (program : Program) (state : State) (resumed : Resume → Prop) (compensation : Compensations) : Prop :=
  (∀ record ∈ compensation.retained, RecordFrom program state record record.scope) ∧
    ∀ run ∈ compensation.runs, (∀ record ∈ run.pending, RecordFrom program state record run.scope) ∧
      ∀ resume, run.resume = some resume → (∃ held ∈ state.slots.compensation.runs, held.resume = some resume) ∨
        (∃ context, resume = .group context) ∨ resumed resume

/-! ## What the hooks need -/

/-- What the compensation hooks need of the state operations they apply, for an invariant `inv`. -/
structure CompensationOps (program : Program) (inv : State → Prop) : Prop where
  /-- The retained records replaced, from where `StoredFrom` says, and the runs by some of them. -/
  store : ∀ state compensation, inv state → (∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs) →
    StoredFrom program state (fun _ => False) compensation → inv { state with slots := { state.slots with compensation } }
  takePosition : ∀ state, inv state → inv state.takePosition.1
  /-- Taking a position keeps the scope occurrences, the occurrences, the open items and the slots. -/
  issued : ∀ state : State, state.takePosition.1.scopes = state.scopes ∧ state.takePosition.1.occurrences = state.occurrences ∧
    state.takePosition.1.openItems = state.openItems ∧ state.takePosition.1.slots = state.slots
  fail : ∀ state failure, inv state → inv (state.signal (.endInstance .failed (some failure)))

end Kernel.Laws.Compensation
