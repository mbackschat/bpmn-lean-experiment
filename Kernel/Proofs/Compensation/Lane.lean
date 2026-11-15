module

public import Kernel.Proofs.Compensation.Formed

/-! # Proofs: what the states inside a compensation hook keep

The bookkeeping the compensation hook proofs (`Kernel.Proofs.Compensation.Hooks`) carry across the states inside one
hook, which keep neither `Laws.State.WellFormed` nor the lane relation `Formed`: completion numbers and triggers
counted, what such a state keeps (`Tame`) and moves (`Moves`) of an earlier one, the states a handler's begin and a
release pass through, and how the relation is assembled at a hook's end, its held triggers no more than the
before-state's, whose queued Cancel raises name the same triggers while their scope occurrences stand
(`queuedTriggers_sublist`). It reads no feature, so it lies in no feature's rebuild cone (guard 15). Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Counted Untriggered Within)
open Kernel.Laws.Compensation (ClaimsApart Ready claimed)

/-! ## Counting what a hook holds

Completion numbers and triggers are counted, so that a state inside a hook that holds a number twice, a run advanced
while the handlers it begins already hold their children, still bounds what the hook's result holds. -/

theorem completionsOf_eq (record : Compensable) :
    completionsOf record = record.completion :: completionsIn record.children := by
  cases record; simp [completionsOf]

theorem completionsIn_append (left right : List Compensable) :
    completionsIn (left ++ right) = completionsIn left ++ completionsIn right := by
  induction left with
  | nil => simp [completionsIn]
  | cons record rest ih => simp [completionsIn, ih]

/-- A record moved into another scope occurrence keeps its completion numbers. -/
theorem completionsIn_rescope (records : List Compensable) (scope : ScopeOccurrenceId) :
    completionsIn (records.map fun record => { record with scope }) = completionsIn records := by
  induction records with
  | nil => rfl
  | cons record rest ih => simp only [List.map_cons, completionsIn, ih, completionsOf_eq]

/-- The completion numbers of the children the records keep. -/
def childrenCompletions (records : List Compensable) : List Nat :=
  records.flatMap fun record => completionsIn record.children

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

/-- What every state inside a compensation hook keeps of the lane relation and of `WellFormed`: retained records in
present scope occurrences, runs keyed apart in issued scope occurrences, running contexts and scope occurrences issued,
and a group's nested run resuming from its own context. -/
structure Tame (s : State) : Prop where
  retained : RetainedPresent s
  keyed : RunsKeyed s
  runsIssued : RunsIssued s
  running : ∀ run ∈ s.slots.compensation.runs, ∀ context ∈ run.running.map (·.1), context.value < s.nextIssue
  scopes : ∀ entry ∈ s.scopes, entry.id.value < s.nextIssue
  grouped : ∀ run ∈ s.slots.compensation.runs, ∀ outer context, run.resume = some (.group outer context) →
    context = run.scope

/-- The triggers of the runs that are no group's nested run. -/
def ungroupedTriggers (s : State) : List OccurrenceRef :=
  (s.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger)

theorem heldTriggers_eq (s : State) : heldTriggers s = ungroupedTriggers s ++ queuedTriggers s := rfl

/-- What a compensation hook's state `t` keeps of an earlier one `s`: it issues on, its scope occurrences stood or were
issued since, its counters, instance and queued signals but untriggered ones are `s`'s, it holds no trigger of a run
that is no group's more often, and every run's trigger is one of a run of `s`. -/
structure Moves (s t : State) : Prop where
  issued : s.nextIssue ≤ t.nextIssue
  scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ s.nextIssue ≤ entry.id.value
  activations : t.activations = s.activations
  named : t.instanceId = s.instanceId
  signals : ∃ more, t.signals = s.signals ++ more ∧ ∀ signal ∈ more, Untriggered signal
  ungrouped : ∀ trigger, (ungroupedTriggers t).count trigger ≤ (ungroupedTriggers s).count trigger
  sources : ∀ run ∈ t.slots.compensation.runs, ∃ source ∈ s.slots.compensation.runs, source.trigger = run.trigger

theorem Moves.refl (s : State) : Moves s s :=
  ⟨Nat.le_refl _, fun _ member => .inl member, rfl, rfl, ⟨[], by simp, by simp⟩, fun _ => Nat.le_refl _,
    fun run member => ⟨run, member, rfl⟩⟩

theorem Moves.trans {s t u : State} (first : Moves s t) (second : Moves t u) : Moves s u := by
  obtain ⟨more, signals, quiet⟩ := first.signals
  obtain ⟨further, signals', quiet'⟩ := second.signals
  refine ⟨Nat.le_trans first.issued second.issued, fun entry member => ?_, second.activations.trans first.activations,
    second.named.trans first.named, ⟨more ++ further, by rw [signals', signals, List.append_assoc], fun signal inside => ?_⟩,
    fun trigger => Nat.le_trans (second.ungrouped trigger) (first.ungrouped trigger), fun run member => ?_⟩
  · rcases second.scopes entry member with old | fresh
    · rcases first.scopes entry old with older | later
      · exact .inl older
      · exact .inr later
    · exact .inr (Nat.le_trans first.issued fresh)
  · rcases List.mem_append.mp inside with early | late
    · exact quiet signal early
    · exact quiet' signal late
  · obtain ⟨middle, inside, same⟩ := second.sources run member
    obtain ⟨source, origin, named⟩ := first.sources middle inside
    exact ⟨source, origin, named.trans same⟩

/-- Queuing an untriggered signal moves nothing else. -/
theorem moves_signal (s : State) {signal : Signal} (quiet : Untriggered signal) : Moves s (s.signal signal) := by
  rw [Laws.State.signal_eq]
  exact ⟨Nat.le_refl _, fun _ member => .inl member, rfl, rfl, ⟨[signal], rfl, by simpa using quiet⟩,
    fun _ => Nat.le_refl _, fun run member => ⟨run, member, rfl⟩⟩

theorem tame_signal {s : State} (tame : Tame s) (signal : Signal) : Tame (s.signal signal) := by
  rw [Laws.State.signal_eq]
  exact ⟨tame.1, tame.2, tame.3, tame.4, tame.5, tame.6⟩

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
    childrenCompletions [record] = completionsIn record.children := by
  simp [childrenCompletions]

/-- `s` holding `compensation`: `Compensation.store`, read without its body (`Laws.Compensation.store_eq`). -/
def stored (s : State) (compensation : Compensations) : State :=
  { s with slots := { s.slots with compensation } }

/-- What entering a context changes: a scope occurrence at the counter, the counter stepped, nothing else a hook
reads. -/
theorem entered_eq (s : State) (element : ElementId) (parent : ScopeOccurrenceId) (locals : List (String × Value)) :
    (s.enterScope element parent locals none).2 = ⟨s.nextIssue⟩ ∧
      (s.enterScope element parent locals none).1.slots = s.slots ∧
      (s.enterScope element parent locals none).1.nextIssue = s.nextIssue + 1 ∧
      (s.enterScope element parent locals none).1.scopes =
        s.scopes ++ [{ id := ⟨s.nextIssue⟩, element := some element, parent := some parent, occurrence := none }] ∧
      (s.enterScope element parent locals none).1.activations = s.activations ∧
      (s.enterScope element parent locals none).1.instanceId = s.instanceId ∧
      (s.enterScope element parent locals none).1.signals = s.signals := by
  rw [Laws.State.enterScope_eq]
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- `s` with `run` added to its runs, as a group's handler begins its nested run. -/
def withRun (s : State) (run : CompensationRun) : State :=
  stored s { s.slots.compensation with runs := s.slots.compensation.runs ++ [run] }

/-- `s` with `records` added to its retained records, as a handler begins in a context holding its record's children. -/
def withRetained (s : State) (records : List Compensable) : State :=
  stored s { s.slots.compensation with retained := s.slots.compensation.retained ++ records }

/-- A group's nested run in a context entered afresh keeps a tame state tame. -/
theorem tame_withRun {s : State} (tame : Tame s) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) {run : CompensationRun}
    (placed : run.scope = (s.enterScope element parent locals none).2) (idle : run.running = [])
    (grouped : ∀ outer context, run.resume = some (.group outer context) → context = run.scope) :
    Tame (withRun (s.enterScope element parent locals none).1 run) := by
  obtain ⟨contextEq, slots, next, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, _⟩ := rest
  rw [contextEq] at placed
  have below : ∀ other ∈ s.slots.compensation.runs, other.scope.value < s.nextIssue := tame.runsIssued
  refine ⟨fun record inside => ?_, ?_, fun other inside => ?_, fun other inside context running => ?_,
    fun entry inside => ?_, fun other inside outer context resumed => ?_⟩
  · simp only [withRun, stored, slots] at inside
    simp only [withRun, stored, scopeIds, scopes, List.map_append, List.mem_append]
    exact .inl (tame.retained record inside)
  · simp only [RunsKeyed, withRun, stored, slots, List.map_append, List.map_cons, List.map_nil]
    refine List.nodup_append.mpr ⟨tame.keyed, by simp, fun key old key' new same => ?_⟩
    obtain ⟨other, member, rfl⟩ := List.mem_map.mp old
    rw [List.mem_singleton.mp new] at same
    have := below other member
    rw [show other.scope = run.scope from congrArg Prod.fst same, placed] at this
    exact Nat.lt_irrefl _ this
  · simp only [withRun, stored, slots, next, List.mem_append, List.mem_singleton] at inside ⊢
    rcases inside with old | rfl
    · exact Nat.lt_succ_of_lt (below other old)
    · rw [placed]; exact Nat.lt_succ_self _
  · simp only [withRun, stored, slots, next, List.mem_append, List.mem_singleton] at inside ⊢
    rcases inside with old | rfl
    · exact Nat.lt_succ_of_lt (tame.running other old context running)
    · rw [idle] at running; cases running
  · simp only [withRun, stored, scopes, next, List.mem_append, List.mem_singleton] at inside ⊢
    rcases inside with old | rfl
    · exact Nat.lt_succ_of_lt (tame.scopes entry old)
    · exact Nat.lt_succ_self _
  · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact tame.grouped other old outer context resumed
    · exact grouped outer context resumed

/-- A group's nested run, of a trigger a run of `s` holds, moves nothing a hook reads but its run. -/
theorem moves_withRun (s : State) (element : ElementId) (parent : ScopeOccurrenceId) (locals : List (String × Value))
    {run : CompensationRun} (grouped : resumesGroup run.resume = true)
    (source : ∃ other ∈ s.slots.compensation.runs, other.trigger = run.trigger) :
    Moves s (withRun (s.enterScope element parent locals none).1 run) := by
  obtain ⟨_, slots, next, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, activations, named, signals⟩ := rest
  refine ⟨by simp only [withRun, stored, next]; exact Nat.le_succ _, fun entry inside => ?_, activations, named,
    ⟨[], by simp [withRun, stored, signals], by simp⟩, fun trigger => ?_, fun other inside => ?_⟩
  · simp only [withRun, stored, scopes, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact .inl old
    · exact .inr (Nat.le_refl _)
  · simp [withRun, stored, slots, ungroupedTriggers, List.filter_append, grouped]
  · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact ⟨other, old, rfl⟩
    · exact source

/-- A handler's context entered afresh, holding records in it, keeps a tame state tame. -/
theorem tame_withRetained {s : State} (tame : Tame s) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) {records : List Compensable}
    (placed : ∀ record ∈ records, record.scope = (s.enterScope element parent locals none).2) :
    Tame (withRetained (s.enterScope element parent locals none).1 records) := by
  obtain ⟨contextEq, slots, next, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, _⟩ := rest
  refine ⟨fun record inside => ?_, ?_, fun other inside => ?_, fun other inside context running => ?_,
    fun entry inside => ?_, fun other inside outer context resumed => ?_⟩
  · simp only [withRetained, stored, slots, List.mem_append] at inside
    simp only [withRetained, stored, scopeIds, scopes, List.map_append, List.mem_append, List.map_cons, List.map_nil,
      List.mem_singleton]
    rcases inside with old | new
    · exact .inl (tame.retained record old)
    · exact .inr ((placed record new).trans contextEq)
  · simp only [RunsKeyed, withRetained, stored, slots]
    exact tame.keyed
  · simp only [withRetained, stored, slots, next] at inside ⊢
    exact Nat.lt_succ_of_lt (tame.runsIssued other inside)
  · simp only [withRetained, stored, slots, next] at inside ⊢
    exact Nat.lt_succ_of_lt (tame.running other inside context running)
  · simp only [withRetained, stored, scopes, next, List.mem_append, List.mem_singleton] at inside ⊢
    rcases inside with old | rfl
    · exact Nat.lt_succ_of_lt (tame.scopes entry old)
    · exact Nat.lt_succ_self _
  · simp only [withRetained, stored, slots] at inside
    exact tame.grouped other inside outer context resumed

theorem moves_withRetained (s : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (records : List Compensable) :
    Moves s (withRetained (s.enterScope element parent locals none).1 records) := by
  obtain ⟨_, slots, next, rest⟩ := entered_eq s element parent locals
  obtain ⟨scopes, activations, named, signals⟩ := rest
  refine ⟨by simp only [withRetained, stored, next]; exact Nat.le_succ _, fun entry inside => ?_, activations, named,
    ⟨[], by simp [withRetained, stored, signals], by simp⟩, fun trigger => ?_, fun other inside => ?_⟩
  · simp only [withRetained, stored, scopes, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact .inl old
    · exact .inr (Nat.le_refl _)
  · simp [withRetained, stored, slots, ungroupedTriggers]
  · simp only [withRetained, stored, slots] at inside
    exact ⟨other, inside, rfl⟩

/-- Fewer runs, the retained records kept: what a tame state keeps. -/
theorem tame_fewer {s : State} (tame : Tame s) {runs : List CompensationRun}
    (fewer : runs.Sublist s.slots.compensation.runs) :
    Tame (stored s { s.slots.compensation with runs }) :=
  ⟨tame.retained, (fewer.map _).nodup tame.keyed, fun run inside => tame.runsIssued run (fewer.subset inside),
    fun run inside => tame.running run (fewer.subset inside), tame.scopes,
    fun run inside => tame.grouped run (fewer.subset inside)⟩

theorem moves_fewer (s : State) {runs : List CompensationRun} (fewer : runs.Sublist s.slots.compensation.runs) :
    Moves s (stored s { s.slots.compensation with runs }) :=
  ⟨Nat.le_refl _, fun _ inside => .inl inside, rfl, rfl, ⟨[], by simp [stored], by simp⟩,
    ungrouped_sublist (t := stored s { s.slots.compensation with runs }) fewer,
    fun run inside => ⟨run, fewer.subset inside, rfl⟩⟩

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
  have nextEq : (s.leaveScope context).nextIssue = s.nextIssue := (Laws.State.leaveScope_compensation s context).2.2.2.2
  have runsSub := left_runs s context
  refine ⟨fun record inside => ?_, ?_, fun run inside => ?_, fun run inside held running => ?_,
    fun entry inside => ?_, fun run inside outer held resumed => ?_⟩
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
    rw [trims.sameScope, nextEq]
    exact tame.runsIssued source (runsSub.subset member)
  · simp only [trimmed, stored, List.mem_map] at inside ⊢
    obtain ⟨source, member, rfl⟩ := inside
    rw [nextEq]
    exact tame.running source (runsSub.subset member) held (((trims.shrinks source).map _).subset running)
  · simp only [trimmed, stored] at inside ⊢
    rw [nextEq]
    exact tame.scopes entry ((left_scopes s context).subset inside)
  · simp only [trimmed, stored, List.mem_map] at inside
    obtain ⟨source, member, rfl⟩ := inside
    rw [trims.sameResume] at resumed
    rw [trims.sameScope]
    exact tame.grouped source (runsSub.subset member) outer held resumed

theorem moves_trimmed (s : State) (context : ScopeOccurrenceId) {f : CompensationRun → CompensationRun}
    (trims : Trims f) : Moves s (trimmed s context f) := by
  have runsSub := left_runs s context
  refine ⟨Nat.le_of_eq (Laws.State.leaveScope_compensation s context).2.2.2.2.symm,
    fun entry inside => .inl ((left_scopes s context).subset inside), (Laws.State.leaveScope_compensation s context).2.2.2.1,
    (Laws.State.leaveScope_eq s context).2, ⟨[], ?_, by simp⟩, fun trigger => ?_, fun run inside => ?_⟩
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

/-! ## Assembling the relation -/

/-- A well-formed state whose retained records stand and whose runs are keyed apart in issued scope occurrences is
tame: `WellFormed` places every run's handler contexts and group (`Laws.State.RunPlaced`). -/
theorem tame_of {program : Program} {s : State} (wf : WellFormed program s) (retained : RetainedPresent s)
    (keyed : RunsKeyed s) (issued : RunsIssued s) : Tame s :=
  ⟨retained, keyed, issued, fun run inside context running => ((wf.settled.runsPlaced run inside).2 context running).1,
    wf.issued.scopes, fun run inside => (wf.settled.runsPlaced run inside).1⟩

theorem completion_mem {record : Compensable} {records : List Compensable} (member : record ∈ records) :
    record.completion ∈ completionsIn records := by
  induction records with
  | nil => cases member
  | cons head rest ih =>
    simp only [completionsIn, List.mem_append]
    rcases List.mem_cons.mp member with rfl | later
    · exact .inl (by rw [completionsOf_eq]; exact List.mem_cons_self ..)
    · exact .inr (ih later)

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
    (apart : CompletionsApart s.slots.compensation) (issued : CompletionsIssued s) (later : s.nextIssue ≤ t.nextIssue) :
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

/-! ## The triggers a hook holds -/

/-- A scope occurrence a later state holds that `base` had issued is one `base` holds. -/
theorem kept_entry {base t : State} (scopes : ∀ entry ∈ t.scopes, entry ∈ base.scopes ∨ base.nextIssue ≤ entry.id.value)
    {entry : ScopeOccurrence} (member : entry ∈ t.scopes) (below : entry.id.value < base.nextIssue) : entry ∈ base.scopes :=
  (scopes entry member).resolve_right (Nat.not_le.mpr below)

/-- A scope occurrence that `base` had issued and a later well-formed state holds belongs to the same process instance
in both: its ancestors in `base` all stand in the later state, which holds no scope occurrence `base` issued but did not
hold. -/
theorem instanceOf_moved {program : Program} {base t : State} (before : WellFormed program base)
    (after : WellFormed program t)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ base.scopes ∨ base.nextIssue ≤ entry.id.value)
    (named : t.instanceId = base.instanceId) {x : ScopeOccurrenceId} (present : x ∈ scopeIds t)
    (below : x.value < base.nextIssue) : t.instanceOf x = base.instanceOf x := by
  obtain ⟨entry, member, same⟩ := List.mem_map.mp present
  have old := kept_entry scopes member (same ▸ below)
  refine Laws.State.instanceOf_kept before after.distinct.scopes
    (fun entry inside orphan => (after.rooted.2.1 entry inside).mp orphan) named (List.mem_map.mpr ⟨entry, old, same⟩) ?_
  suffices up : ∀ inner outer, Within base inner outer → inner ∈ scopeIds t →
      ∀ above ∈ base.scopes, above.id = outer → above ∈ t.scopes from
    fun above inside within => up _ _ within present above inside rfl
  intro inner outer within
  induction within with
  | refl scope =>
    intro standing above inside named'
    obtain ⟨found, foundIn, foundNamed⟩ := List.mem_map.mp standing
    have foundOld := kept_entry scopes foundIn (by rw [foundNamed, ← named']; exact before.issued.scopes above inside)
    rw [Laws.State.scope_unique before.distinct inside foundOld (named'.trans foundNamed.symm)]
    exact foundIn
  | parent child parent outer member link _ ih =>
    intro standing above inside named'
    obtain ⟨found, foundIn, foundNamed⟩ := List.mem_map.mp standing
    have foundOld := kept_entry scopes foundIn (by rw [foundNamed]; exact before.issued.scopes child member)
    obtain rfl := Laws.State.scope_unique before.distinct member foundOld foundNamed.symm
    obtain ⟨_, depth⟩ := (after.rooted.2.2 child foundIn).depth
    obtain ⟨_, _, up⟩ := depth.parent after foundIn link
    exact ih (up.present after) above inside named'

/-- What a hook's state `s` holds of a well-formed `base`'s scope occurrences, instance and issues. -/
structure Twin (base s : State) : Prop where
  scopes : s.scopes = base.scopes
  named : s.instanceId = base.instanceId
  next : s.nextIssue = base.nextIssue

theorem Twin.refl (s : State) : Twin s s := ⟨rfl, rfl, rfl⟩

/-- A later state names no queued trigger a state twin to a well-formed `base` does not: each queued Cancel raise's
scope occurrence was issued (`TriggersApart.issued`), so while it stands it is the one the earlier state held, in the
same process instance. -/
theorem queuedTriggers_sublist {program : Program} {base s t : State} (before : WellFormed program base)
    (twin : Twin base s) (after : WellFormed program t) (moves : Moves s t) (apart : TriggersApart s) :
    (queuedTriggers t).Sublist (queuedTriggers s) := by
  obtain ⟨more, signals, quiet⟩ := moves.signals
  have scopes : ∀ entry ∈ t.scopes, entry ∈ base.scopes ∨ base.nextIssue ≤ entry.id.value := by
    rw [← twin.scopes, ← twin.next]; exact moves.scopes
  unfold queuedTriggers
  rw [signals, Laws.Step.triggersOf_append, Laws.Step.triggersOf_untriggered quiet, List.append_nil]
  refine filterMap_sublist_of fun x inside => ?_
  cases x with
  | inl trigger => exact .inl rfl
  | inr origin =>
    by_cases standing : origin.scope ∈ scopeIds t
    · have below : origin.scope.value < base.nextIssue := twin.next ▸ apart.issued origin inside
      have old : origin.scope ∈ scopeIds s := by
        obtain ⟨entry, member, same⟩ := List.mem_map.mp standing
        rw [scopeIds, twin.scopes]
        exact List.mem_map.mpr ⟨entry, kept_entry scopes member (same ▸ below), same⟩
      have instances : s.instanceOf origin.scope = base.instanceOf origin.scope :=
        Laws.State.instanceOf_congr twin.scopes twin.named _
      refine .inl ?_
      simp [queuedTrigger, standing, old, instanceOf_moved before after scopes (moves.named.trans twin.named) standing
        below, instances]
    · exact .inr (by simp [queuedTrigger, standing])

theorem counted_moved {s t : State} (moves : Moves s t) {key : OccurrenceKey} (counted : Counted s key) :
    Counted t key := by
  unfold Counted; rw [moves.activations]; exact counted

/-- A later state that moved from one keeping its triggers apart keeps them apart. -/
theorem triggers_moved {program : Program} {base s t : State} (before : WellFormed program base) (twin : Twin base s)
    (after : WellFormed program t) (moves : Moves s t) (apart : TriggersApart s) (ungrouped : QueuedUngrouped s) :
    TriggersApart t ∧ QueuedUngrouped t := by
  have queued := queuedTriggers_sublist before twin after moves apart
  obtain ⟨more, signals, quiet⟩ := moves.signals
  have split : (ungroupedTriggers s ++ queuedTriggers s).Nodup := apart.apart
  have held : ∀ trigger, (heldTriggers t).count trigger ≤ (heldTriggers s).count trigger := fun trigger => by
    rw [heldTriggers_eq, heldTriggers_eq, List.count_append, List.count_append]
    have fewer := moves.ungrouped trigger
    have queuedFewer := queued.count_le trigger
    omega
  refine ⟨⟨List.nodup_iff_count.mpr fun trigger => Nat.le_trans (held trigger)
      (List.nodup_iff_count.mp apart.apart trigger), fun run inside grouped queuedIn => ?_,
    fun trigger inside => ?_, fun origin inside => ?_⟩, fun scope activity trigger leave resume inside => ?_⟩
  · obtain ⟨source, member, same⟩ := moves.sources run inside
    have old : source.trigger ∈ queuedTriggers s := by rw [same]; exact queued.subset queuedIn
    cases sourced : resumesGroup source.resume
    · have free : source.trigger ∈ ungroupedTriggers s :=
        List.mem_map.mpr ⟨source, List.mem_filter.mpr ⟨member, by simp [sourced]⟩, rfl⟩
      exact (List.nodup_append.mp split).2.2 _ free _ old rfl
    · exact apart.grouped source member sourced old
  · rcases List.mem_append.mp inside with ran | queuedIn
    · obtain ⟨run, member, rfl⟩ := List.mem_map.mp ran
      obtain ⟨source, old, same⟩ := moves.sources run member
      rw [← same]
      exact counted_moved moves (apart.counted _ (List.mem_append_left _ (List.mem_map.mpr ⟨source, old, rfl⟩)))
    · exact counted_moved moves (apart.counted _ (List.mem_append_right _ (queued.subset queuedIn)))
  · rw [signals, Laws.Step.triggersOf_append, Laws.Step.triggersOf_untriggered quiet, List.append_nil] at inside
    exact Nat.lt_of_lt_of_le (apart.issued origin inside) moves.issued
  · rw [signals] at inside
    rcases List.mem_append.mp inside with old | new
    · exact ungrouped scope activity trigger leave resume old
    · exact absurd rfl ((quiet _ new).1 scope activity trigger leave resume)

/-- No completion number held more often than in a state whose numbers are apart and issued, but the one it issues
next, issuing once more. -/
theorem apart_of_fresh {s t : State}
    (counted : ∀ n, (completions t.slots.compensation).count n ≤
      (completions s.slots.compensation).count n + [s.nextIssue].count n)
    (apart : CompletionsApart s.slots.compensation) (issued : CompletionsIssued s) (next : t.nextIssue = s.nextIssue + 1) :
    CompletionsApart t.slots.compensation ∧ CompletionsIssued t := by
  have none : (completions s.slots.compensation).count s.nextIssue = 0 :=
    List.count_eq_zero.mpr fun inside => Nat.lt_irrefl _ (issued _ inside)
  refine ⟨List.nodup_iff_count.mpr fun n => ?_, fun n inside => ?_⟩
  · have bound := counted n
    have once := List.nodup_iff_count.mp apart n
    by_cases fresh : n = s.nextIssue
    · subst fresh
      rw [none, List.count_singleton_self] at bound
      exact bound
    · have other : [s.nextIssue].count n = 0 := List.count_eq_zero.mpr (by simpa using fresh)
      omega
  · rw [next]
    by_cases fresh : n = s.nextIssue
    · rw [fresh]; exact Nat.lt_succ_self _
    · have other : [s.nextIssue].count n = 0 := List.count_eq_zero.mpr (by simpa using fresh)
      have bound := counted n
      have positive := List.count_pos_iff.mpr inside
      exact Nat.lt_succ_of_lt (issued n (List.count_pos_iff.mp (by omega)))

/-- The trigger a queued compensation or Cancel raise names reads only the scope occurrences and the instance. -/
theorem queuedTrigger_congr {s t : State} (scopes : t.scopes = s.scopes) (named : t.instanceId = s.instanceId) :
    queuedTrigger t = queuedTrigger s := by
  funext x
  cases x <;> simp [queuedTrigger, scopeIds, scopes, Laws.State.instanceOf_congr scopes named]

/-! ## A trigger's new run -/

/-- The queued triggers of a queue whose head is a compensation: its trigger, then those the rest names. -/
theorem queuedTriggers_cons {s : State} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option Nat} {resume : Option Resume} {rest : List Signal}
    (queued : s.signals = .compensate scope activity trigger leave resume :: rest) :
    queuedTriggers s = trigger :: (Laws.Step.triggersOf rest).filterMap (queuedTrigger s) := by
  unfold queuedTriggers
  rw [queued, show Signal.compensate scope activity trigger leave resume :: rest =
    [.compensate scope activity trigger leave resume] ++ rest from rfl, Laws.Step.triggersOf_append,
    Laws.Step.triggersOf_compensate]
  rfl

/-- `s` with `others` retained and `run` added after its runs: what a trigger's new run advances from. -/
def opened (s : State) (others : List Compensable) (run : CompensationRun) : State :=
  stored s { retained := others, runs := s.slots.compensation.runs ++ [run] }

/-- A new run that is no group's, in an issued scope occurrence, with no handler running and keyed apart from every run,
keeps a tame state tame. -/
theorem tame_opened {s : State} (tame : Tame s) {others : List Compensable} {run : CompensationRun}
    (kept : ∀ record ∈ others, record ∈ s.slots.compensation.retained)
    (fresh : ∀ other ∈ s.slots.compensation.runs, other.scope = run.scope → other.trigger ≠ run.trigger)
    (issued : run.scope.value < s.nextIssue) (idle : run.running = []) (free : resumesGroup run.resume = false) :
    Tame (opened s others run) := by
  refine ⟨fun record inside => tame.retained record (kept record inside), ?_, fun other inside => ?_,
    fun other inside context running => ?_, tame.scopes, fun other inside outer context resumed => ?_⟩
  · simp only [RunsKeyed, opened, stored, List.map_append, List.map_cons, List.map_nil]
    refine List.nodup_append.mpr ⟨tame.keyed, by simp, fun key old key' new same => ?_⟩
    obtain ⟨other, member, rfl⟩ := List.mem_map.mp old
    rw [List.mem_singleton.mp new] at same
    exact fresh other member (congrArg Prod.fst same) (congrArg Prod.snd same)
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at inside ⊢
    rcases inside with old | rfl
    · exact tame.runsIssued other old
    · exact issued
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at inside ⊢
    rcases inside with old | rfl
    · exact tame.running other old context running
    · rw [idle] at running; cases running
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact tame.grouped other old outer context resumed
    · rw [resumed] at free; cases free

/-- Taking `taken` out of retention into a new run holding them pending and nothing running holds the same completion
numbers. -/
theorem count_opened {s : State} {taken others : List Compensable} (perm : (taken ++ others).Perm s.slots.compensation.retained)
    {run : CompensationRun} (pending : run.pending = taken) (idle : run.running = []) (n : Nat) :
    (completions (opened s others run).slots.compensation).count n = (completions s.slots.compensation).count n := by
  have same := count_completionsIn_perm n perm
  simp only [opened, stored, count_completions, List.flatMap_append, List.flatMap_cons, List.flatMap_nil,
    List.append_nil, List.count_append, runCompletions, completionsIn_append, pending, idle, List.map_nil] at same ⊢
  omega

/-- A new run of the trigger of the compensation taken off a queue's head, no group's, keeps the queue's held triggers
apart: the trigger moves from the queued ones to the runs'. -/
theorem triggers_opened {queue s : State} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option Nat} {resume : Option Resume} {others : List Compensable}
    {run : CompensationRun} (apart : TriggersApart queue) (ungrouped : QueuedUngrouped queue)
    (queued : queue.signals = .compensate scope activity trigger leave resume :: s.signals)
    (shape : s = { queue with signals := s.signals }) (named : run.trigger = trigger) (free : resumesGroup run.resume = false) :
    TriggersApart (opened s others run) ∧ QueuedUngrouped (opened s others run) := by
  have slots : s.slots = queue.slots := by rw [shape]
  have scopes : s.scopes = queue.scopes := by rw [shape]
  have instance_ : s.instanceId = queue.instanceId := by rw [shape]
  have next : s.nextIssue = queue.nextIssue := by rw [shape]
  have activations : s.activations = queue.activations := by rw [shape]
  have queuedEq : queuedTriggers queue = trigger :: queuedTriggers (opened s others run) := by
    rw [queuedTriggers_cons queued, queuedTriggers, queuedTrigger_congr (t := opened s others run) (s := queue) scopes
      instance_]
    rfl
  have ungroupedEq : ungroupedTriggers (opened s others run) = ungroupedTriggers queue ++ [trigger] := by
    simp only [ungroupedTriggers, opened, stored, List.filter_append, List.map_append, slots]
    simp [free, named]
  have later : ∀ signal ∈ s.signals, signal ∈ queue.signals := fun signal inside => by
    rw [queued]; exact List.mem_cons_of_mem _ inside
  have counted : ∀ key, Counted queue key → Counted (opened s others run) key := fun key old => by
    unfold Counted at old ⊢
    simp only [opened, stored, activations]
    exact old
  have runs : ∀ other ∈ s.slots.compensation.runs, other ∈ queue.slots.compensation.runs := fun other inside => by
    rw [← slots]; exact inside
  refine ⟨⟨?_, fun other inside grouped queuedIn => ?_, fun key inside => ?_, fun origin inside => ?_⟩,
    fun scope activity trigger leave resume inside => ungrouped scope activity trigger leave resume (later _ inside)⟩
  · have held : heldTriggers (opened s others run) = heldTriggers queue := by
      rw [heldTriggers_eq, heldTriggers_eq, ungroupedEq, queuedEq, List.append_assoc, List.singleton_append]
    rw [held]; exact apart.apart
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact apart.grouped other (runs other old) grouped (by rw [queuedEq]; exact List.mem_cons_of_mem _ queuedIn)
    · rw [free] at grouped; cases grouped
  · simp only [opened, stored, List.map_append, List.map_cons, List.map_nil, List.mem_append, List.mem_singleton]
      at inside
    rcases inside with (old | rfl) | queuedIn
    · obtain ⟨other, member, rfl⟩ := List.mem_map.mp old
      exact counted _ (apart.counted _ (List.mem_append_left _ (List.mem_map.mpr ⟨other, runs other member, rfl⟩)))
    · rw [named]
      exact counted _ (apart.counted _ (List.mem_append_right _ (by rw [queuedEq]; exact List.mem_cons_self ..)))
    · exact counted _ (apart.counted _ (List.mem_append_right _ (by rw [queuedEq]; exact List.mem_cons_of_mem _ queuedIn)))
  · have old : .inr origin ∈ Laws.Step.triggersOf queue.signals := by
      rw [queued, show Signal.compensate scope activity trigger leave resume :: s.signals =
        [.compensate scope activity trigger leave resume] ++ s.signals from rfl, Laws.Step.triggersOf_append]
      exact List.mem_append_right _ inside
    have bound := apart.issued origin old
    rw [← next] at bound
    exact bound

end Kernel.Proofs.Compensation
