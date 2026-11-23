module

public import Kernel.Proofs.Compensation.Lane

/-! # Proofs: the triggers a compensation hook holds

The triggers the states inside one compensation hook hold (`Kernel.Proofs.Compensation.Lane`): at a hook's end no
more than the before-state's, whose queued Cancel raises name the same triggers while their scope occurrences stand
(`queuedTriggers_sublist`), and those a trigger's new run adds (`triggers_opened`). It reads no feature, so it lies in
no feature's rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Counted Untriggered Within)
open Kernel.Laws.Compensation (ClaimsApart Advances Ready claimed)

/-! ## The triggers a hook holds -/

/-- A scope occurrence a later state holds that `base` had issued is one `base` holds. -/
theorem kept_entry {base t : State} (scopes : ∀ entry ∈ t.scopes, entry ∈ base.scopes ∨ ¬ Laws.State.ScopeIssued base entry.id)
    {entry : ScopeOccurrence} (member : entry ∈ t.scopes) (below : Laws.State.ScopeIssued base entry.id) : entry ∈ base.scopes :=
  (scopes entry member).resolve_right fun fresh => fresh below

/-- A scope occurrence that `base` had issued and a later well-formed state holds belongs to the same process instance
in both: its ancestors in `base` all stand in the later state, which holds no scope occurrence `base` issued but did not
hold. -/
theorem instanceOf_moved {program : Program} {base t : State} (before : WellFormed program base)
    (after : WellFormed program t)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ base.scopes ∨ ¬ Laws.State.ScopeIssued base entry.id)
    (named : t.instanceId = base.instanceId) {x : ScopeOccurrenceId} (present : x ∈ scopeIds t)
    (below : Laws.State.ScopeIssued base x) : t.instanceOf x = base.instanceOf x := by
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
  next : s.nextCompletion = base.nextCompletion
  ordinals : s.scopeOrdinals = base.scopeOrdinals
  occurrences : s.occurrences = base.occurrences
  table : s.issued = base.issued

theorem Twin.refl (s : State) : Twin s s := ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- Twins issued the same scope keys: issue reads only the scope occurrences, their counters and the issue table. -/
theorem Twin.issued {base s : State} (twin : Twin base s) {x : ScopeOccurrenceId} :
    Laws.State.ScopeIssued s x ↔ Laws.State.ScopeIssued base x := by
  show (∃ H, Laws.State.ScopeHistoryOn s.scopes s.scopeOrdinals s.issued H ∧ H x) ↔
    ∃ H, Laws.State.ScopeHistoryOn base.scopes base.scopeOrdinals base.issued H ∧ H x
  rw [twin.scopes, twin.ordinals, twin.table]

/-- What a hook's state moved to holds of a twin's base: each scope occurrence stood in it or was not issued there. -/
theorem Twin.scopes_moved {base s t : State} (twin : Twin base s) (moves : Moves s t) :
    ∀ entry ∈ t.scopes, entry ∈ base.scopes ∨ ¬ Laws.State.ScopeIssued base entry.id := fun entry member =>
  (moves.scopes entry member).imp (twin.scopes ▸ ·) fun fresh held => fresh (twin.issued.mpr held)

/-- A later state names no queued trigger a state twin to a well-formed `base` does not: each queued Cancel raise's
scope occurrence was issued (`TriggersApart.issued`), so while it stands it is the one the earlier state held, in the
same process instance. -/
theorem queuedTriggers_sublist {program : Program} {base s t : State} (before : WellFormed program base)
    (twin : Twin base s) (after : WellFormed program t) (moves : Moves s t) (apart : TriggersApart s) :
    (queuedTriggers t).Sublist (queuedTriggers s) := by
  obtain ⟨more, signals, quiet⟩ := moves.signals
  have scopes := twin.scopes_moved moves
  unfold queuedTriggers
  rw [signals, Laws.Step.triggersOf_append, Laws.Step.triggersOf_untriggered quiet, List.append_nil]
  refine filterMap_sublist_of fun x inside => ?_
  cases x with
  | inl trigger => exact .inl rfl
  | inr origin =>
    by_cases standing : origin.scope ∈ scopeIds t
    · have below : Laws.State.ScopeIssued base origin.scope := twin.issued.mp (apart.issued origin inside)
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
    fun trigger inside => ?_, fun origin inside => ?_, fun o inside unbegun trigger member => ?_⟩,
    fun scope activity trigger leave resume inside => ?_⟩
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
    exact moves.grows.issued (apart.issued origin inside)
  · have was := moves.occurrences o inside
    have scopes := twin.scopes_moved moves
    obtain ⟨entry, entered, named⟩ := List.mem_map.mp (before.owned.occurrenceScopes o (twin.occurrences ▸ was))
    have below : Laws.State.ScopeIssued base o.scope := by rw [← named]; exact before.issued.scopes entry entered
    have keyed : Laws.State.key t o = Laws.State.key s o := by
      simp [Laws.State.key, instanceOf_moved before after scopes (moves.named.trans twin.named)
        (after.owned.occurrenceScopes o inside) below, Laws.State.instanceOf_congr twin.scopes twin.named]
    rw [keyed]
    rcases List.mem_append.mp member with ran | queuedIn
    · obtain ⟨run, runMember, rfl⟩ := List.mem_map.mp ran
      obtain ⟨source, old, same⟩ := moves.sources run runMember
      rw [← same]
      exact apart.unreserved o was unbegun _ (List.mem_append_left _ (List.mem_map.mpr ⟨source, old, rfl⟩))
    · exact apart.unreserved o was unbegun _ (List.mem_append_right _ (queued.subset queuedIn))
  · rw [signals] at inside
    rcases List.mem_append.mp inside with old | new
    · exact ungrouped scope activity trigger leave resume old
    · exact absurd rfl ((quiet _ new).1 scope activity trigger leave resume)

/-- No completion number held more often than in a state whose numbers are apart and issued, but the one it issues
next, issuing once more. -/
theorem apart_of_fresh {s t : State}
    (counted : ∀ n, (completions t.slots.compensation).count n ≤
      (completions s.slots.compensation).count n + [s.nextCompletion].count n)
    (apart : CompletionsApart s.slots.compensation) (issued : CompletionsIssued s) (next : t.nextCompletion = s.nextCompletion + 1) :
    CompletionsApart t.slots.compensation ∧ CompletionsIssued t := by
  have none : (completions s.slots.compensation).count s.nextCompletion = 0 :=
    List.count_eq_zero.mpr fun inside => Nat.lt_irrefl _ (issued _ inside)
  refine ⟨List.nodup_iff_count.mpr fun n => ?_, fun n inside => ?_⟩
  · have bound := counted n
    have once := List.nodup_iff_count.mp apart n
    by_cases fresh : n = s.nextCompletion
    · subst fresh
      rw [none, List.count_singleton_self] at bound
      exact bound
    · have other : [s.nextCompletion].count n = 0 := List.count_eq_zero.mpr (by simpa using fresh)
      omega
  · rw [next]
    by_cases fresh : n = s.nextCompletion
    · rw [fresh]; exact Nat.lt_succ_self _
    · have other : [s.nextCompletion].count n = 0 := List.count_eq_zero.mpr (by simpa using fresh)
      have bound := counted n
      have positive := List.count_pos_iff.mpr inside
      exact Nat.lt_succ_of_lt (issued n (List.count_pos_iff.mp (by omega)))

/-! ## A trigger's new run -/

/-- The queued triggers of a queue holding a compensation under `unit`: its trigger, and those the rest names. -/
theorem queuedTriggers_pop {s : State} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {unit : UnitKey}
    (found : s.queuedSignals[unit]? = some (.compensate scope activity trigger leave resume)) :
    (queuedTriggers s).Perm (trigger :: (Laws.Step.triggersOf (Laws.State.allSignals { s with queuedSignals := s.queuedSignals.erase unit })).filterMap
      (queuedTrigger s)) := by
  unfold queuedTriggers
  have popped : (Laws.Step.triggersOf (Laws.State.allSignals s)).Perm (Laws.Step.triggersOf
      (Signal.compensate scope activity trigger leave resume :: Laws.State.allSignals { s with queuedSignals := s.queuedSignals.erase unit })) :=
    Laws.Step.triggersOf_perm (Laws.State.allSignals_pop found)
  refine (popped.filterMap _).trans ?_
  rw [show Signal.compensate scope activity trigger leave resume :: Laws.State.allSignals { s with queuedSignals := s.queuedSignals.erase unit } =
    [.compensate scope activity trigger leave resume] ++ Laws.State.allSignals { s with queuedSignals := s.queuedSignals.erase unit } from rfl,
    Laws.Step.triggersOf_append, Laws.Step.triggersOf_compensate]
  rfl

/-- `s` with `others` retained and `run` added after its runs: what a trigger's new run advances from. -/
def opened (s : State) (others : List Compensable) (run : CompensationRun) : State :=
  stored s { retained := others, runs := s.slots.compensation.runs ++ [run] }

/-- A new run that is no group's, in an issued scope occurrence, with no handler running and keyed apart from every run,
keeps a tame state tame. -/
theorem tame_opened {s : State} (tame : Tame s) {others : List Compensable} {run : CompensationRun}
    (kept : ∀ record ∈ others, record ∈ s.slots.compensation.retained)
    (fresh : ∀ other ∈ s.slots.compensation.runs, other.scope = run.scope → other.trigger ≠ run.trigger)
    (issued : Laws.State.ScopeIssued s run.scope) (idle : run.running = []) (free : resumesGroup run.resume = false) :
    Tame (opened s others run) := by
  refine ⟨fun record inside => tame.retained record (kept record inside), ?_, fun other inside => ?_,
    fun other inside context running => ?_, tame.scopes, fun other inside context resumed => ?_, tame.parents,
    fun other inside context running => ?_, tame.issuer.same rfl rfl rfl rfl, fun other inside grouped => ?_⟩
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
    · exact tame.grouped other old context resumed
    · rw [resumed] at free; cases free
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact tame.runningIn other old context running
    · rw [idle] at running; cases running
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact tame.groupsStanding other old grouped
    · rw [free] at grouped; cases grouped

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
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {others : List Compensable}
    {run : CompensationRun} (apart : TriggersApart queue) (ungrouped : QueuedUngrouped queue)
    {unit : UnitKey} (found : queue.queuedSignals[unit]? = some (.compensate scope activity trigger leave resume))
    (shape : s = { queue with queuedSignals := queue.queuedSignals.erase unit }) (named : run.trigger = trigger)
    (free : resumesGroup run.resume = false) :
    TriggersApart (opened s others run) ∧ QueuedUngrouped (opened s others run) := by
  have slots : s.slots = queue.slots := by rw [shape]
  have scopes : s.scopes = queue.scopes := by rw [shape]
  have instance_ : s.instanceId = queue.instanceId := by rw [shape]
  have next : s.nextCompletion = queue.nextCompletion := by rw [shape]
  have activations : s.activations = queue.activations := by rw [shape]
  have queuedEq : (queuedTriggers queue).Perm (trigger :: queuedTriggers (opened s others run)) := by
    refine (queuedTriggers_pop found).trans ?_
    rw [queuedTriggers, queuedTrigger_congr (t := opened s others run) (s := queue) scopes instance_, shape]
    rfl
  have ungroupedEq : ungroupedTriggers (opened s others run) = ungroupedTriggers queue ++ [trigger] := by
    simp only [ungroupedTriggers, opened, stored, List.filter_append, List.map_append, slots]
    simp [free, named]
  have later : ∀ signal ∈ Laws.State.allSignals s, signal ∈ Laws.State.allSignals queue := fun signal inside => by
    rw [shape] at inside; exact Laws.State.allSignals_unqueue _ inside
  have counted : ∀ key, Counted queue key → Counted (opened s others run) key := fun key old => by
    unfold Counted at old ⊢
    simp only [opened, stored, activations]
    exact old
  have runs : ∀ other ∈ s.slots.compensation.runs, other ∈ queue.slots.compensation.runs := fun other inside => by
    rw [← slots]; exact inside
  refine ⟨⟨?_, fun other inside grouped queuedIn => ?_, fun key inside => ?_, fun origin inside => ?_,
    fun o inside unbegun held member => ?_⟩,
    fun scope activity trigger leave resume inside => ungrouped scope activity trigger leave resume (later _ inside)⟩
  · have held : (heldTriggers (opened s others run)).Perm (heldTriggers queue) := by
      rw [heldTriggers_eq, heldTriggers_eq, ungroupedEq, List.append_assoc, List.singleton_append]
      exact (queuedEq.append_left _).symm
    exact held.nodup_iff.mpr apart.apart
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at inside
    rcases inside with old | rfl
    · exact apart.grouped other (runs other old) grouped (queuedEq.mem_iff.mpr (List.mem_cons_of_mem _ queuedIn))
    · rw [free] at grouped; cases grouped
  · simp only [opened, stored, List.map_append, List.map_cons, List.map_nil, List.mem_append, List.mem_singleton]
      at inside
    rcases inside with (old | rfl) | queuedIn
    · obtain ⟨other, member, rfl⟩ := List.mem_map.mp old
      exact counted _ (apart.counted _ (List.mem_append_left _ (List.mem_map.mpr ⟨other, runs other member, rfl⟩)))
    · rw [named]
      exact counted _ (apart.counted _ (List.mem_append_right _ (queuedEq.mem_iff.mpr (List.mem_cons_self ..))))
    · exact counted _ (apart.counted _ (List.mem_append_right _ (queuedEq.mem_iff.mpr (List.mem_cons_of_mem _ queuedIn))))
  · have old : .inr origin ∈ Laws.Step.triggersOf (Laws.State.allSignals queue) :=
      Laws.Step.triggersOf_subset later _ inside
    have ordinals : s.scopeOrdinals = queue.scopeOrdinals := by rw [shape]
    exact (Laws.State.ScopeGrows.of_same (congrArg (List.map (·.id)) scopes) ordinals (.of_eq (by rw [shape]))).issued
      (apart.issued origin old)
  · have occurrences : s.occurrences = queue.occurrences := by rw [shape]
    have was : o ∈ queue.occurrences := by rw [← occurrences]; exact inside
    have keyed : Laws.State.key (opened s others run) o = Laws.State.key queue o := by
      simp [Laws.State.key, Laws.State.instanceOf_congr (s := queue) (t := opened s others run) scopes instance_]
    rw [keyed]
    refine apart.unreserved o was unbegun held ?_
    simp only [opened, stored, List.map_append, List.map_cons, List.map_nil, List.mem_append, List.mem_singleton]
      at member
    rcases member with (old | rfl) | queuedIn
    · obtain ⟨other, member, rfl⟩ := List.mem_map.mp old
      exact List.mem_append_left _ (List.mem_map.mpr ⟨other, runs other member, rfl⟩)
    · rw [named]
      exact List.mem_append_right _ (queuedEq.mem_iff.mpr (List.mem_cons_self ..))
    · exact List.mem_append_right _ (queuedEq.mem_iff.mpr (List.mem_cons_of_mem _ queuedIn))

end Kernel.Proofs.Compensation
