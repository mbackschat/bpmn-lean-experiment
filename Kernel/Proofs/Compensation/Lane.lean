module

public import Kernel.Proofs.Compensation.Formed

/-! # Proofs: what the states inside a compensation hook keep

The bookkeeping the compensation hook proofs (`Kernel.Proofs.Compensation.Hooks`) carry across the states inside one
hook, which keep neither `Laws.State.WellFormed` nor the lane relation `Formed`: completion numbers and triggers
counted, what such a state keeps (`Tame`) and moves (`Moves`) of an earlier one, the states a handler's begin and a
release pass through, and how the relation is assembled at a hook's end; the triggers a hook holds are
`Kernel.Proofs.Compensation.Triggers`'. It reads no feature, so it lies in no feature's rebuild cone (guard 15). Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Counted Untriggered Within)
open Kernel.Laws.Compensation (ClaimsApart Advances Ready claimed)

/-! ## Counting what a hook holds

Completion numbers and triggers are counted, so that a state inside a hook that holds a number twice, a run advanced
while the handlers it begins already hold their children, still bounds what the hook's result holds. -/

theorem completionsOf_eq (record : Compensable) :
    completionsOf record = record.completion :: record.children.map (·.completion) := rfl

theorem completionsIn_append (left right : List Compensable) :
    completionsIn (left ++ right) = completionsIn left ++ completionsIn right := by
  simp [completionsIn]

/-- A record moved into another scope occurrence keeps its completion numbers. -/
theorem completionsIn_rescope (records : List Compensable) (scope : ScopeOccurrenceId) :
    completionsIn (records.map fun record => { record with scope }) = completionsIn records := by
  simp only [completionsIn, List.flatMap_map]
  rfl

/-- The completion numbers of the records `records` keep. -/
def childrenCompletions (records : List Compensable) : List Nat :=
  records.flatMap fun record => record.children.map (·.completion)

theorem count_completionsIn (n : Nat) (records : List Compensable) :
    (completionsIn records).count n =
      (records.map (·.completion)).count n + (childrenCompletions records).count n := by
  induction records with
  | nil => simp [completionsIn, childrenCompletions]
  | cons record rest ih =>
    simp only [completionsIn, completionsOf_eq, childrenCompletions, List.map_cons, List.flatMap_cons,
      List.count_append, List.count_cons] at ih ⊢
    omega

theorem count_completionsIn_perm (n : Nat) {left right : List Compensable} (perm : left.Perm right) :
    (completionsIn left).count n = (completionsIn right).count n := by
  rw [count_completionsIn, count_completionsIn, (perm.map _).count_eq, childrenCompletions, childrenCompletions,
    (perm.flatMap_right _).count_eq]

/-- What a run holds of the completion numbers: its pending records with their children, its running ones alone. -/
def runCompletions (run : CompensationRun) : List Nat :=
  completionsIn run.pending ++ run.running.map (·.2.completion)

theorem count_completions (n : Nat) (compensation : Compensations) :
    (completions compensation).count n =
      (completionsIn compensation.retained).count n + (compensation.runs.flatMap runCompletions).count n := by
  simp only [completions, List.count_append]
  rfl

/-! ## What the states inside a hook keep -/

/-- A run in progress that the lane relation accepts: it holds a handler pending or running and none of its pending
handlers may start. -/
def Good (precedes : Compensable → Compensable → Prop) (run : CompensationRun) : Prop :=
  (run.pending ≠ [] ∨ run.running ≠ []) ∧ ∀ record, ¬ Ready precedes run record

/-- Every standing scope occurrence's parent stands: what `WellFormed` roots, read off the keys. -/
def ParentsStand (s : State) : Prop :=
  ∀ entry ∈ s.scopes, ∀ segment rest, entry.id.segments = segment :: rest → (.ofSegments rest : ScopeOccurrenceId) ∈ scopeIds s

/-- What every state inside a compensation hook keeps of the lane relation and of `WellFormed`: retained records in
present scope occurrences, runs keyed apart in issued scope occurrences, running contexts and scope occurrences issued,
a group's nested run resuming from its own context, standing parents, and each running context, while it stands, lying
directly in its run's scope occurrence. The last two keep a context entered below a run's scope occurrence fresh: it
stands whenever a handler begins there (`entered_fresh`). -/
structure Tame (s : State) : Prop where
  retained : RetainedPresent s
  keyed : RunsKeyed s
  runsIssued : RunsIssued s
  running : ∀ run ∈ s.slots.compensation.runs, ∀ context ∈ run.running.map (·.1), Laws.State.ScopeIssued s context
  scopes : ∀ entry ∈ s.scopes, Laws.State.ScopeIssued s entry.id
  grouped : ∀ run ∈ s.slots.compensation.runs, ∀ context, run.resume = some (.group context) →
    context = run.scope
  parents : ParentsStand s
  runningIn : ∀ run ∈ s.slots.compensation.runs, ∀ context ∈ run.running.map (·.1), ∀ entry ∈ s.scopes,
    entry.id = context → entry.parent = some run.scope

/-- The triggers of the runs that are no group's nested run. -/
def ungroupedTriggers (s : State) : List OccurrenceRef :=
  (s.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger)

theorem heldTriggers_eq (s : State) : heldTriggers s = ungroupedTriggers s ++ queuedTriggers s := rfl

/-- What a compensation hook's state `t` keeps of an earlier one `s`: it issues on, its scope occurrences stood or were
issued since, its counters, instance and queued signals but untriggered ones are `s`'s, it holds no trigger of a run
that is no group's more often, every run's trigger is one of a run of `s`, and every occurrence is one of `s`'s. -/
structure Moves (s t : State) : Prop where
  issued : s.nextPosition ≤ t.nextPosition
  grows : Laws.State.ScopeGrows s t
  scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ ¬ Laws.State.ScopeIssued s entry.id
  activations : t.activations = s.activations
  named : t.instanceId = s.instanceId
  signals : ∃ more, t.signals = s.signals ++ more ∧ ∀ signal ∈ more, Untriggered signal
  ungrouped : ∀ trigger, (ungroupedTriggers t).count trigger ≤ (ungroupedTriggers s).count trigger
  sources : ∀ run ∈ t.slots.compensation.runs, ∃ source ∈ s.slots.compensation.runs, source.trigger = run.trigger
  occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences

theorem Moves.refl (s : State) : Moves s s :=
  ⟨Nat.le_refl _, .refl _, fun _ member => .inl member, rfl, rfl, ⟨[], by simp, by simp⟩, fun _ => Nat.le_refl _,
    fun run member => ⟨run, member, rfl⟩, fun _ inside => inside⟩

theorem Moves.trans {s t u : State} (first : Moves s t) (second : Moves t u) : Moves s u := by
  obtain ⟨more, signals, quiet⟩ := first.signals
  obtain ⟨further, signals', quiet'⟩ := second.signals
  refine ⟨Nat.le_trans first.issued second.issued, first.grows.trans second.grows, fun entry member => ?_,
    second.activations.trans first.activations,
    second.named.trans first.named, ⟨more ++ further, by rw [signals', signals, List.append_assoc], fun signal inside => ?_⟩,
    fun trigger => Nat.le_trans (second.ungrouped trigger) (first.ungrouped trigger), fun run member => ?_,
    fun o inside => first.occurrences o (second.occurrences o inside)⟩
  · rcases second.scopes entry member with old | fresh
    · rcases first.scopes entry old with older | later
      · exact .inl older
      · exact .inr later
    · exact .inr fun held => fresh (first.grows.issued held)
  · rcases List.mem_append.mp inside with early | late
    · exact quiet signal early
    · exact quiet' signal late
  · obtain ⟨middle, inside, same⟩ := second.sources run member
    obtain ⟨source, origin, named⟩ := first.sources middle inside
    exact ⟨source, origin, named.trans same⟩

/-- Queuing an untriggered signal moves nothing else. -/
theorem moves_signal (s : State) {signal : Signal} (quiet : Untriggered signal) : Moves s (s.signal signal) := by
  rw [Laws.State.signal_eq]
  exact ⟨Nat.le_refl _, .of_same rfl rfl, fun _ member => .inl member, rfl, rfl, ⟨[signal], rfl, by simpa using quiet⟩,
    fun _ => Nat.le_refl _, fun run member => ⟨run, member, rfl⟩, fun _ inside => inside⟩

theorem tame_signal {s : State} (tame : Tame s) (signal : Signal) : Tame (s.signal signal) := by
  rw [Laws.State.signal_eq]
  exact ⟨tame.1, tame.2, tame.3, tame.4, tame.5, tame.6, tame.7, tame.8⟩

theorem flatMap_sublist_of {α β : Type} {f g : α → List β} {l : List α} (each : ∀ x ∈ l, (f x).Sublist (g x)) :
    (l.flatMap f).Sublist (l.flatMap g) := by
  induction l with
  | nil => exact .slnil
  | cons a rest ih =>
    simpa using (each a (List.mem_cons_self ..)).append (ih fun x inside => each x (List.mem_cons_of_mem _ inside))

/-- Fewer runs hold no trigger of a run that is no group's more often. -/
theorem ungrouped_sublist {s t : State} (sub : t.slots.compensation.runs.Sublist s.slots.compensation.runs)
    (trigger : OccurrenceRef) : (ungroupedTriggers t).count trigger ≤ (ungroupedTriggers s).count trigger :=
  ((sub.filter _).map _).count_le _

/-- Fewer retained records and runs hold no completion number more often. -/
theorem count_completions_le {before after : Compensations} (retained : after.retained.Sublist before.retained)
    (runs : after.runs.Sublist before.runs) (n : Nat) :
    (completions after).count n ≤ (completions before).count n :=
  (completions_sublist retained runs).count_le n

theorem childrenCompletions_one (record : Compensable) :
    childrenCompletions [record] = record.children.map (·.completion) := by
  simp [childrenCompletions]

/-- `s` holding `compensation`: `Compensation.store`, read without its body (`Laws.Compensation.store_eq`). -/
def stored (s : State) (compensation : Compensations) : State :=
  { s with slots := { s.slots with compensation } }

/-- What entering a context changes: a scope occurrence at its parent's counter, that counter stepped, nothing else a
hook reads. -/
theorem entered_eq (s : State) (element : ElementId) (parent : ScopeOccurrenceId) (locals : List (String × Value)) :
    (s.enterScope element parent locals none).2 = parent.child element (Laws.State.slotCount s parent element) ∧
      (s.enterScope element parent locals none).1.slots = s.slots ∧
      (s.enterScope element parent locals none).1.nextPosition = s.nextPosition ∧
      (s.enterScope element parent locals none).1.scopes =
        s.scopes ++ [{ id := parent.child element (Laws.State.slotCount s parent element), element := some element
                       occurrence := none }] ∧
      (s.enterScope element parent locals none).1.activations = s.activations ∧
      (s.enterScope element parent locals none).1.instanceId = s.instanceId ∧
      (s.enterScope element parent locals none).1.signals = s.signals := by
  rw [Laws.State.enterScope_eq]
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- A context entered below a scope occurrence that stands in a tame state takes a key the state never issued, and
every history grows into one that holds it. -/
theorem entered_fresh {s : State} (tame : Tame s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) :
    Laws.State.ScopeFresh s (s.enterScope element parent locals none).1 (s.enterScope element parent locals none).2 := by
  obtain ⟨entry, member, _⟩ := List.mem_map.mp stands
  exact Laws.State.enterScope_fresh (tame.scopes entry member).historic element stands locals none

/-- Appending a scope occurrence below a standing parent keeps the parents standing. -/
theorem parents_append {s : State} (parents : ParentsStand s) {scopes : List ScopeOccurrence} {added : ScopeOccurrence}
    (shape : scopes = s.scopes ++ [added]) (parent : ScopeOccurrenceId) (stands : parent ∈ scopeIds s)
    (link : added.id.parent? = some parent) :
    ∀ entry ∈ scopes, ∀ segment rest, entry.id.segments = segment :: rest →
      (.ofSegments rest : ScopeOccurrenceId) ∈ scopes.map (·.id) := by
  intro entry inside segment rest keyed
  rw [shape, List.map_append, List.mem_append]
  rcases List.mem_append.mp (shape ▸ inside) with old | new
  · exact .inl (parents entry old segment rest keyed)
  · rw [List.mem_singleton.mp new] at keyed
    have : (.ofSegments rest : ScopeOccurrenceId) = parent := by
      rw [Laws.State.ScopeOccurrenceId.parent?_cons_eq keyed] at link
      exact Option.some.inj link
    exact .inl (this ▸ stands)

/-- A scope occurrence stays when a scope occurrence is left exactly when it is neither that one nor below it. -/
theorem left_mem {s : State} {context : ScopeOccurrenceId} {entry : ScopeOccurrence} (member : entry ∈ s.scopes) :
    entry ∈ (s.leaveScope context).scopes ↔ entry.id ≠ context ∧ State.below context.segments entry.id.segments = false := by
  have contains : ((s.subtree context).filter (· != context)).contains entry.id = true ↔
      entry.id ≠ context ∧ State.below context.segments entry.id.segments = true := by
    rw [List.contains_iff_mem, List.mem_filter, Laws.State.mem_subtree, bne_iff_ne]
    constructor
    · rintro ⟨same | ⟨_, _, _, below⟩, other⟩
      · exact absurd same other
      · exact ⟨other, below⟩
    · rintro ⟨other, below⟩
      exact ⟨.inr ⟨entry, member, rfl, below⟩, other⟩
  rw [(Laws.State.leaveScope_compensation s context).2.2.1, List.mem_filter, List.mem_filter]
  constructor
  · rintro ⟨⟨-, outside⟩, other⟩
    have other' : entry.id ≠ context := by simpa using other
    refine ⟨other', ?_⟩
    cases below : State.below context.segments entry.id.segments
    · rfl
    · simp at outside
      rcases outside with out | same
      · exact absurd ((Laws.State.mem_subtree s context entry.id).mpr (.inr ⟨entry, member, rfl, below⟩)) out
      · exact absurd same other'
  · rintro ⟨other, below⟩
    refine ⟨⟨member, ?_⟩, by simpa using other⟩
    cases held : ((s.subtree context).filter (· != context)).contains entry.id
    · rfl
    · have := (contains.mp held).2
      rw [below] at this; cases this

/-- Leaving a scope occurrence keeps the parents standing: a scope occurrence below a removed one is removed. -/
theorem parents_left {s : State} (parents : ParentsStand s) (context : ScopeOccurrenceId) :
    ParentsStand (s.leaveScope context) := by
  intro entry inside segment rest keyed
  have old : entry ∈ s.scopes := by
    rw [(Laws.State.leaveScope_compensation s context).2.2.1] at inside; exact (List.mem_filter.mp (List.mem_filter.mp inside).1).1
  obtain ⟨other, member, named⟩ := List.mem_map.mp (parents entry old segment rest keyed)
  have kept := (left_mem old).mp inside
  refine List.mem_map.mpr ⟨other, (left_mem member).mpr ⟨fun same => ?_, ?_⟩, named⟩
  · rw [named] at same
    have : State.below context.segments entry.id.segments = true := by
      rw [keyed, Laws.State.below_cons, ← same]; simp
    rw [kept.2] at this; cases this
  · cases deeper : State.below context.segments other.id.segments
    · rfl
    · have deep : State.below context.segments rest = true := by
        rw [named, Laws.State.ScopeOccurrenceId.ofSegments_segments] at deeper; exact deeper
      have : State.below context.segments entry.id.segments = true := by
        rw [keyed, Laws.State.below_cons, deep]; simp
      rw [kept.2] at this; cases this

/-- Leaving a standing scope occurrence keeps its parent standing. -/
theorem left_parent {s : State} (parents : ParentsStand s) {context : ScopeOccurrenceId}
    {entry : ScopeOccurrence} (member : entry ∈ s.scopes) (named : entry.id = context) {outer : ScopeOccurrenceId}
    (link : entry.parent = some outer) : outer ∈ scopeIds (s.leaveScope context) := by
  obtain ⟨segment, rest, keyed, rfl⟩ : ∃ segment rest, entry.id.segments = segment :: rest ∧ outer = .ofSegments rest := by
    change entry.id.parent? = some outer at link
    obtain ⟨segment, keyed⟩ := Laws.State.ScopeOccurrenceId.parent?_eq_some.mp link
    exact ⟨segment, outer.segments, keyed, (Laws.State.ScopeOccurrenceId.ofSegments_eta outer).symm⟩
  obtain ⟨other, inside, same⟩ := List.mem_map.mp (parents entry member segment rest keyed)
  refine List.mem_map.mpr ⟨other, (left_mem inside).mpr ⟨fun equal => ?_, ?_⟩, same⟩
  · have := congrArg (fun x : ScopeOccurrenceId => x.segments.length) (same.symm.trans (equal.trans named.symm))
    simp [keyed] at this
  · cases deeper : State.below context.segments other.id.segments
    · rfl
    · have longer := Laws.State.below_length deeper
      have outerKey : context.segments = segment :: rest := named ▸ keyed
      rw [same, outerKey] at longer
      simp at longer
      omega

/-- `s` with `run` added to its runs, as a group's handler begins its nested run. -/
def withRun (s : State) (run : CompensationRun) : State :=
  stored s { s.slots.compensation with runs := s.slots.compensation.runs ++ [run] }

/-- `s` with `records` added to its retained records, as a handler begins in a context holding its record's children. -/
def withRetained (s : State) (records : List Compensable) : State :=
  stored s { s.slots.compensation with retained := s.slots.compensation.retained ++ records }

/-- A group's nested run in a context entered afresh keeps a tame state tame. -/
theorem tame_withRun {s : State} (tame : Tame s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) {run : CompensationRun}
    (placed : run.scope = (s.enterScope element parent locals none).2) (idle : run.running = [])
    (grouped : ∀ context, run.resume = some (.group context) → context = run.scope) :
    Tame (withRun (s.enterScope element parent locals none).1 run) := by
  obtain ⟨contextEq, slots, -, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, _⟩ := rest
  obtain ⟨unissued, issuedNew, grows⟩ := entered_fresh tame element stands locals
  rw [contextEq] at unissued
  have below : ∀ other ∈ s.slots.compensation.runs, Laws.State.ScopeIssued s other.scope := tame.runsIssued
  refine ⟨fun record inside => ?_, ?_, fun other inside => ?_, fun other inside context running => ?_,
    fun entry inside => ?_, fun other inside context resumed => ?_, ?_, ?_⟩
  · simp only [withRun, stored, slots] at inside
    simp only [withRun, stored, scopeIds, scopes, List.map_append, List.mem_append]
    exact .inl (tame.retained record inside)
  · simp only [RunsKeyed, withRun, stored, slots, List.map_append, List.map_cons, List.map_nil]
    refine List.nodup_append.mpr ⟨tame.keyed, by simp, fun key old key' new same => ?_⟩
    obtain ⟨other, member, rfl⟩ := List.mem_map.mp old
    rw [List.mem_singleton.mp new] at same
    have := below other member
    rw [show other.scope = run.scope from congrArg Prod.fst same, placed, contextEq] at this
    exact unissued this
  · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact grows.issued (below other old)
    · rw [placed]; exact issuedNew
  · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact grows.issued (tame.running other old context running)
    · rw [idle] at running; cases running
  · simp only [withRun, stored, scopes, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact grows.issued (tame.scopes entry old)
    · exact contextEq ▸ issuedNew
  · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact tame.grouped other old context resumed
    · exact grouped context resumed
  · exact parents_append tame.parents scopes parent stands (by simp [Laws.State.child_eq])
  · intro other inside context running entry member named
    simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · simp only [withRun, stored, scopes, List.mem_append, List.mem_singleton] at member
      rcases member with older | rfl
      · exact tame.runningIn other old context running entry older named
      · exact absurd (tame.running other old context running) (by rw [← named]; exact unissued)
    · rw [idle] at running; cases running

/-- A group's nested run, of a trigger a run of `s` holds, moves nothing a hook reads but its run. -/
theorem moves_withRun {s : State} (tame : Tame s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value))
    {run : CompensationRun} (grouped : resumesGroup run.resume = true)
    (source : ∃ other ∈ s.slots.compensation.runs, other.trigger = run.trigger) :
    Moves s (withRun (s.enterScope element parent locals none).1 run) := by
  obtain ⟨contextEq, slots, next, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, activations, named, signals⟩ := rest
  obtain ⟨unissued, -, grows⟩ := entered_fresh tame element stands locals
  refine ⟨by simp only [withRun, stored, next]; exact Nat.le_refl _, grows, fun entry inside => ?_, activations, named,
    ⟨[], by simp [withRun, stored, signals], by simp⟩, fun trigger => ?_, fun other inside => ?_,
    fun _ inside => by simpa [withRun, stored, Laws.State.enterScope_eq] using inside⟩
  · simp only [withRun, stored, scopes, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact .inl old
    · exact .inr (contextEq ▸ unissued)
  · simp [withRun, stored, slots, ungroupedTriggers, List.filter_append, grouped]
  · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact ⟨other, old, rfl⟩
    · exact source

/-- A handler's context entered afresh, holding records in it, keeps a tame state tame. -/
theorem tame_withRetained {s : State} (tame : Tame s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) {records : List Compensable}
    (placed : ∀ record ∈ records, record.scope = (s.enterScope element parent locals none).2) :
    Tame (withRetained (s.enterScope element parent locals none).1 records) := by
  obtain ⟨contextEq, slots, -, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, _⟩ := rest
  obtain ⟨unissued, issuedNew, grows⟩ := entered_fresh tame element stands locals
  rw [contextEq] at unissued
  refine ⟨fun record inside => ?_, ?_, fun other inside => ?_, fun other inside context running => ?_,
    fun entry inside => ?_, fun other inside context resumed => ?_,
    parents_append tame.parents scopes parent stands (by simp [Laws.State.child_eq]),
    fun other inside context running entry member named => ?_⟩
  · simp only [withRetained, stored, slots, List.mem_append] at inside
    simp only [withRetained, stored, scopeIds, scopes, List.map_append, List.mem_append, List.map_cons, List.map_nil,
      List.mem_singleton]
    rcases inside with old | new
    · exact .inl (tame.retained record old)
    · exact .inr ((placed record new).trans contextEq)
  · simp only [RunsKeyed, withRetained, stored, slots]
    exact tame.keyed
  · simp only [withRetained, stored, slots] at inside
    exact grows.issued (tame.runsIssued other inside)
  · simp only [withRetained, stored, slots] at inside
    exact grows.issued (tame.running other inside context running)
  · simp only [withRetained, stored, scopes, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact grows.issued (tame.scopes entry old)
    · exact contextEq ▸ issuedNew
  · simp only [withRetained, stored, slots] at inside
    exact tame.grouped other inside context resumed
  · simp only [withRetained, stored, slots] at inside
    simp only [withRetained, stored, scopes, List.mem_append, List.mem_singleton] at member
    rcases member with older | rfl
    · exact tame.runningIn other inside context running entry older named
    · exact absurd (tame.running other inside context running) (by rw [← named]; exact unissued)

theorem moves_withRetained {s : State} (tame : Tame s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) (records : List Compensable) :
    Moves s (withRetained (s.enterScope element parent locals none).1 records) := by
  obtain ⟨contextEq, slots, next, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, activations, named, signals⟩ := rest
  obtain ⟨unissued, -, grows⟩ := entered_fresh tame element stands locals
  refine ⟨by simp only [withRetained, stored, next]; exact Nat.le_refl _, grows, fun entry inside => ?_, activations, named,
    ⟨[], by simp [withRetained, stored, signals], by simp⟩, fun trigger => ?_, fun other inside => ?_,
    fun _ inside => by simpa [withRetained, stored, Laws.State.enterScope_eq] using inside⟩
  · simp only [withRetained, stored, scopes, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact .inl old
    · exact .inr (contextEq ▸ unissued)
  · simp [withRetained, stored, slots, ungroupedTriggers]
  · simp only [withRetained, stored, slots] at inside
    exact ⟨other, inside, rfl⟩

/-- Fewer runs, the retained records kept: what a tame state keeps. -/
theorem tame_fewer {s : State} (tame : Tame s) {runs : List CompensationRun}
    (fewer : runs.Sublist s.slots.compensation.runs) :
    Tame (stored s { s.slots.compensation with runs }) :=
  ⟨tame.retained, (fewer.map _).nodup tame.keyed, fun run inside => tame.runsIssued run (fewer.subset inside),
    fun run inside => tame.running run (fewer.subset inside), tame.scopes,
    fun run inside => tame.grouped run (fewer.subset inside), tame.parents,
    fun run inside => tame.runningIn run (fewer.subset inside)⟩

theorem moves_fewer (s : State) {runs : List CompensationRun} (fewer : runs.Sublist s.slots.compensation.runs) :
    Moves s (stored s { s.slots.compensation with runs }) :=
  ⟨Nat.le_refl _, .of_same rfl rfl, fun _ inside => .inl inside, rfl, rfl, ⟨[], by simp [stored], by simp⟩,
    ungrouped_sublist (t := stored s { s.slots.compensation with runs }) fewer,
    fun run inside => ⟨run, fewer.subset inside, rfl⟩, fun _ inside => inside⟩

theorem counted_fewer (s : State) {runs : List CompensationRun} (fewer : runs.Sublist s.slots.compensation.runs)
    (n : Nat) : (completions (stored s { s.slots.compensation with runs }).slots.compensation).count n ≤
      (completions s.slots.compensation).count n :=
  count_completions_le (before := s.slots.compensation) (after := { s.slots.compensation with runs })
    (List.Sublist.refl _) fewer n

/-- A state `t` is `s` or `s` with one untriggered signal queued. -/
def Quieted (s t : State) : Prop := t = s ∨ ∃ signal, Untriggered signal ∧ t = s.signal signal

theorem Quieted.tame {s t : State} (quieted : Quieted s t) (tame : Tame s) : Tame t := by
  rcases quieted with rfl | ⟨signal, _, rfl⟩
  · exact tame
  · exact tame_signal tame signal

theorem Quieted.moves {s t : State} (quieted : Quieted s t) : Moves s t := by
  rcases quieted with rfl | ⟨signal, quiet, rfl⟩
  · exact .refl _
  · exact moves_signal s quiet

theorem Quieted.slots {s t : State} (quieted : Quieted s t) : t.slots = s.slots := by
  rcases quieted with rfl | ⟨signal, _, rfl⟩
  · rfl
  · rw [Laws.State.signal_eq]

/-! ## Releases -/

/-- A map over runs keeping each run's keys, resume and pending records and shrinking what it runs: a release's. -/
structure Trims (f : CompensationRun → CompensationRun) : Prop where
  sameScope : ∀ run, (f run).scope = run.scope
  sameTrigger : ∀ run, (f run).trigger = run.trigger
  sameResume : ∀ run, (f run).resume = run.resume
  samePending : ∀ run, (f run).pending = run.pending
  shrinks : ∀ run, (f run).running.Sublist run.running

/-- `s` with `context` left and its runs mapped by `f`: what a release advances from. -/
def trimmed (s : State) (context : ScopeOccurrenceId) (f : CompensationRun → CompensationRun) : State :=
  stored (s.leaveScope context)
    { (s.leaveScope context).slots.compensation with runs := (s.leaveScope context).slots.compensation.runs.map f }

theorem left_runs (s : State) (context : ScopeOccurrenceId) :
    (s.leaveScope context).slots.compensation.runs.Sublist s.slots.compensation.runs := by
  rw [(Laws.State.leaveScope_compensation s context).2.1]; exact List.filter_sublist

theorem left_scopes (s : State) (context : ScopeOccurrenceId) : (s.leaveScope context).scopes.Sublist s.scopes := by
  rw [(Laws.State.leaveScope_compensation s context).2.2.1]; exact List.filter_sublist.trans List.filter_sublist

theorem left_retained (s : State) (context : ScopeOccurrenceId) :
    (s.leaveScope context).slots.compensation.retained.Sublist s.slots.compensation.retained := by
  rw [(Laws.State.leaveScope_compensation s context).1]; exact List.filter_sublist.trans List.filter_sublist

theorem trims_keys {f : CompensationRun → CompensationRun} (trims : Trims f) (runs : List CompensationRun) :
    (runs.map f).map (fun run => (run.scope, run.trigger)) = runs.map fun run => (run.scope, run.trigger) := by
  rw [List.map_map]
  exact List.map_congr_left fun run _ => by simp [trims.sameScope, trims.sameTrigger]

theorem trims_ungrouped {f : CompensationRun → CompensationRun} (trims : Trims f) (runs : List CompensationRun) :
    ((runs.map f).filter (!resumesGroup ·.resume)).map (·.trigger) =
      (runs.filter (!resumesGroup ·.resume)).map (·.trigger) := by
  rw [List.filter_map, List.map_map]
  have same : ((!resumesGroup ·.resume) ∘ f) = (!resumesGroup ·.resume) := funext fun run => by simp [trims.sameResume]
  rw [same]
  exact List.map_congr_left fun run _ => by simp [trims.sameTrigger]

theorem tame_trimmed {s : State} (tame : Tame s) (context : ScopeOccurrenceId) {f : CompensationRun → CompensationRun}
    (trims : Trims f) : Tame (trimmed s context f) := by
  have retainedEq := (Laws.State.leaveScope_compensation s context).1
  have scopesEq := (Laws.State.leaveScope_compensation s context).2.2.1
  have grows := Laws.State.leaveScope_grows s context
  have runsSub := left_runs s context
  refine ⟨fun record inside => ?_, ?_, fun run inside => ?_, fun run inside held running => ?_,
    fun entry inside => ?_, fun run inside held resumed => ?_, parents_left tame.parents context,
    fun run inside held running entry member named => ?_⟩
  · simp only [trimmed, stored] at inside
    rw [retainedEq, List.mem_filter, List.mem_filter] at inside
    obtain ⟨⟨kept, outside⟩, other⟩ := inside
    obtain ⟨entry, present, named⟩ := List.mem_map.mp (tame.retained record kept)
    simp only [trimmed, stored, scopeIds, scopesEq]
    refine List.mem_map.mpr ⟨entry, List.mem_filter.mpr ⟨List.mem_filter.mpr ⟨present, ?_⟩, ?_⟩, named⟩
    · simpa only [named] using outside
    · simpa only [named] using other
  · simp only [RunsKeyed, trimmed, stored]
    rw [trims_keys trims]
    exact (runsSub.map _).nodup tame.keyed
  · simp only [trimmed, stored, List.mem_map] at inside ⊢
    obtain ⟨source, member, rfl⟩ := inside
    rw [trims.sameScope]
    exact grows.issued (tame.runsIssued source (runsSub.subset member))
  · simp only [trimmed, stored, List.mem_map] at inside ⊢
    obtain ⟨source, member, rfl⟩ := inside
    exact grows.issued (tame.running source (runsSub.subset member) held (((trims.shrinks source).map _).subset running))
  · simp only [trimmed, stored] at inside
    exact grows.issued (tame.scopes entry ((left_scopes s context).subset inside))
  · simp only [trimmed, stored, List.mem_map] at inside
    obtain ⟨source, member, rfl⟩ := inside
    rw [trims.sameResume] at resumed
    rw [trims.sameScope]
    exact tame.grouped source (runsSub.subset member) held resumed
  · simp only [trimmed, stored, List.mem_map] at inside
    obtain ⟨source, sourceIn, rfl⟩ := inside
    rw [trims.sameScope]
    exact tame.runningIn source (runsSub.subset sourceIn) held (((trims.shrinks source).map _).subset running) entry
      ((left_scopes s context).subset member) named

theorem moves_trimmed (s : State) (context : ScopeOccurrenceId) {f : CompensationRun → CompensationRun}
    (trims : Trims f) : Moves s (trimmed s context f) := by
  have runsSub := left_runs s context
  refine ⟨Nat.le_of_eq (Laws.State.leaveScope_compensation s context).2.2.2.2.symm, Laws.State.leaveScope_grows s context,
    fun entry inside => .inl ((left_scopes s context).subset inside), (Laws.State.leaveScope_compensation s context).2.2.2.1,
    (Laws.State.leaveScope_eq s context).2, ⟨[], ?_, by simp⟩, fun trigger => ?_, fun run inside => ?_,
    fun _ inside => (Laws.State.leaveScope_occurrences s context).subset inside⟩
  · simp only [trimmed, stored, Laws.State.leaveScope_signals, List.append_nil]
  · simp only [ungroupedTriggers, trimmed, stored]
    rw [trims_ungrouped trims]
    exact ((runsSub.filter _).map _).count_le _
  · simp only [trimmed, stored, List.mem_map] at inside
    obtain ⟨source, member, rfl⟩ := inside
    exact ⟨source, runsSub.subset member, (trims.sameTrigger source).symm⟩

theorem counted_trimmed (s : State) (context : ScopeOccurrenceId) {f : CompensationRun → CompensationRun}
    (trims : Trims f) (n : Nat) :
    (completions (trimmed s context f).slots.compensation).count n ≤ (completions s.slots.compensation).count n := by
  have each : ∀ run ∈ (s.leaveScope context).slots.compensation.runs,
      (runCompletions (f run)).Sublist (runCompletions run) := fun run _ => by
    simp only [runCompletions, trims.samePending]
    exact ((trims.shrinks run).map _).append_left _
  have shrunk := (flatMap_sublist_of each).count_le n
  have below := count_completions_le (before := s.slots.compensation)
    (after := { (s.leaveScope context).slots.compensation with runs := (s.leaveScope context).slots.compensation.runs })
    (left_retained s context) (left_runs s context) n
  rw [count_completions] at below ⊢
  simp only [trimmed, stored, List.flatMap_map] at shrunk below ⊢
  omega

/-- A run a hook's state holds, read against the state `s` the hook began from: one in a scope occurrence issued since,
or one of the key of a run of `s`, that run itself or one advance of it released, its pending records and trigger
kept. -/
def Steps (precedes : Compensable → Compensable → Prop) (s : State) (next : CompensationRun) : Prop :=
  ¬ Laws.State.ScopeIssued s next.scope ∨ ∃ run ∈ s.slots.compensation.runs, run.scope = next.scope ∧
    run.trigger = next.trigger ∧ (next = run ∨ ∃ released started, Advances precedes released next started ∧
      released.pending = run.pending ∧ released.trigger = run.trigger)

theorem Steps.mono {precedes : Compensable → Compensable → Prop} {s u : State}
    (runs : ∀ run ∈ u.slots.compensation.runs, run ∈ s.slots.compensation.runs) (grows : Laws.State.ScopeGrows s u)
    {next : CompensationRun} (steps : Steps precedes u next) : Steps precedes s next := by
  rcases steps with fresh | ⟨run, member, rest⟩
  · exact .inl fun held => fresh (grows.issued held)
  · exact .inr ⟨run, runs run member, rest⟩

/-! ## Assembling the relation -/

/-- A well-formed state whose retained records stand and whose runs are keyed apart in issued scope occurrences is
tame: `WellFormed` places every run's handler contexts and group (`Laws.State.RunPlaced`). -/
theorem tame_of {program : Program} {s : State} (wf : WellFormed program s) (retained : RetainedPresent s)
    (keyed : RunsKeyed s) (issued : RunsIssued s) : Tame s :=
  ⟨retained, keyed, issued, fun run inside context running => ((wf.settled.runsPlaced run inside).2 context running).1,
    wf.issued.scopes, fun run inside => (wf.settled.runsPlaced run inside).1,
    fun _ inside _ _ keyed => Laws.State.parent_stands wf inside keyed,
    fun run inside context running => ((wf.settled.runsPlaced run inside).2 context running).2⟩

theorem completion_mem {record : Compensable} {records : List Compensable} (member : record ∈ records) :
    record.completion ∈ completionsIn records :=
  List.mem_flatMap.mpr ⟨record, member, by rw [completionsOf_eq]; exact List.mem_cons_self ..⟩

/-- Completion numbers held apart keep every claimed record out of retention. -/
theorem claims_of_apart {compensation : Compensations} (apart : CompletionsApart compensation) :
    ClaimsApart compensation := by
  intro run inside record claimedBy retainedAs
  have held : record.completion ∈ compensation.runs.flatMap runCompletions := by
    refine List.mem_flatMap.mpr ⟨run, inside, ?_⟩
    rcases List.mem_append.mp claimedBy with pending | running
    · exact List.mem_append_left _ (completion_mem pending)
    · obtain ⟨entry, entered, rfl⟩ := List.mem_map.mp running
      exact List.mem_append_right _ (List.mem_map.mpr ⟨entry, entered, rfl⟩)
  have split : (completionsIn compensation.retained ++ compensation.runs.flatMap runCompletions).Nodup := apart
  exact (List.nodup_append.mp split).2.2 _ (completion_mem retainedAs) _ held rfl

/-- No completion number held more often than in a state whose numbers are apart and issued, and issuing on. -/
theorem apart_of_counts {s t : State}
    (counted : ∀ n, (completions t.slots.compensation).count n ≤ (completions s.slots.compensation).count n)
    (apart : CompletionsApart s.slots.compensation) (issued : CompletionsIssued s) (later : s.nextPosition ≤ t.nextPosition) :
    CompletionsApart t.slots.compensation ∧ CompletionsIssued t :=
  ⟨List.nodup_iff_count.mpr fun n => Nat.le_trans (counted n) (List.nodup_iff_count.mp apart n),
    fun n inside => Nat.lt_of_lt_of_le (issued n (List.count_pos_iff.mp
      (Nat.lt_of_lt_of_le (List.count_pos_iff.mpr inside) (counted n)))) later⟩

/-- The lane relation of a state whose parts were each shown: its runs the earlier state's, which kept the relation,
or in good standing. -/
theorem formed_of {precedes : Compensable → Compensable → Prop} {s t : State} (formed : Formed precedes s)
    (retained : RetainedPresent t) (keyed : RunsKeyed t) (issued : RunsIssued t)
    (numbers : CompletionsApart t.slots.compensation ∧ CompletionsIssued t)
    (runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ Good precedes run)
    (triggers : TriggersApart t ∧ QueuedUngrouped t) : Formed precedes t := by
  refine ⟨claims_of_apart numbers.1, retained, fun run inside => ?_, numbers.1, numbers.2, fun run inside => ?_, keyed,
    issued, triggers.1, triggers.2⟩
  · rcases runs run inside with old | good
    · exact formed.unfinished run old
    · exact good.1
  · rcases runs run inside with old | good
    · exact formed.settled run old
    · exact good.2

end Kernel.Proofs.Compensation
