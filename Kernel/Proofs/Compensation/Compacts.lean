module

public import Kernel.Proofs.Compensation.Relation
public import Kernel.Laws.Step.CompactedKeys

/-! # Compensation's relation across compaction at commit (DC12)

Compensation's `Formed` across `Step.orderJournal`'s compaction (`Proofs.Frame.StepAlongside.runOrder`).

A commit renames the scope occurrence of every retained, pending and running record, every run's scope occurrence and
its running handlers' contexts, and keeps every completion number, trigger and record kind; it leaves nothing queued, so
every clause over queued compensations and raises holds of nothing. Two premises are the lane's, not the commit's:
`precedes` reads no record's scope occurrence (`blind`), and a group's nested run stands in its context
(`groupsStanding`), since two runs of one trigger are an outer run and a group's nested run, and the renaming is
injective only against a standing key (`Laws.Step.renameScope_apart`).
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel Kernel.Step Kernel.Laws.State Kernel.Laws.Step
open Kernel.Laws.Compensation (ClaimsApart Ready claimed)

section Compacts

variable {schedule : BranchSchedule} {start : State} {log : RunLog} {s t : State}

/-- A commit keeps the next position. -/
theorem compact_nextCompletion (ran : compact schedule start log s = .ok t) : t.nextCompletion = s.nextCompletion := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · rfl
  have same := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2
    (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [same, renameState_eq]

end Compacts

theorem completionsOf_rename (r : Issue → Issue) (record : Compensable) :
    completionsOf (renameCompensable r record) = completionsOf record := by
  simp [completionsOf, Laws.Compensation.heldCompletions, renameCompensable_eq]

theorem completion_rename (r : Issue → Issue) (record : Compensable) :
    (renameCompensable r record).completion = record.completion := by
  simp [renameCompensable_eq]

theorem resumesGroup_rename (r : Issue → Issue) (resume : Option Resume) :
    resumesGroup (resume.map (renameResume r)) = resumesGroup resume := by
  rcases resume with _ | (_ | _ | _) <;> simp [resumesGroup]

/-- A commit keeps every completion number a compensation slot holds, up to order. -/
theorem completions_rename (r : Issue → Issue) {compensation renamed : Compensations}
    (retained : renamed.retained = compensation.retained.map (renameCompensable r))
    (runs : renamed.runs.Perm (compensation.runs.map (renamedRun r))) :
    (completions renamed).Perm (completions compensation) := by
  unfold completions
  rw [retained]
  refine List.Perm.append (.of_eq (by simp [completionsIn, completionsOf_rename, List.flatMap_map]))
    ((runs.flatMap_right _).trans (.of_eq ?_))
  simp [completionsIn, completionsOf_rename, completion_rename, List.flatMap_map, Function.comp_def]

/-- Two members of a list whose images are distinct are one when their images are. -/
theorem eq_of_nodup_map {α β : Type} {f : α → β} {l : List α} (nodup : (l.map f).Nodup) {a b : α} (aIn : a ∈ l)
    (bIn : b ∈ l) (same : f a = f b) : a = b := by
  induction l with
  | nil => cases aIn
  | cons x rest ih =>
    rw [List.map_cons, List.nodup_cons] at nodup
    rcases List.mem_cons.mp aIn with rfl | aRest <;> rcases List.mem_cons.mp bIn with rfl | bRest
    · rfl
    · exact absurd (same ▸ List.mem_map_of_mem bRest) nodup.1
    · exact absurd (same.symm ▸ List.mem_map_of_mem aRest) nodup.1
    · exact ih nodup.2 aRest bRest

/-- A record's completion number is among those its slot holds: a retained record's in the retained part, a claimed
one's in its run's. -/
theorem completion_retained {compensation : Compensations} {record : Compensable}
    (member : record ∈ compensation.retained) : record.completion ∈ completionsIn compensation.retained :=
  List.mem_flatMap.mpr ⟨record, member, by simp [completionsOf, Laws.Compensation.heldCompletions]⟩

theorem completion_claimed {compensation : Compensations} {run : CompensationRun} (runIn : run ∈ compensation.runs)
    {record : Compensable} (member : record ∈ claimed run) :
    record.completion ∈ compensation.runs.flatMap fun run =>
      completionsIn run.pending ++ run.running.map (·.2.completion) := by
  refine List.mem_flatMap.mpr ⟨run, runIn, ?_⟩
  rcases List.mem_append.mp member with pending | running
  · exact List.mem_append_left _ (List.mem_flatMap.mpr ⟨record, pending, by simp [completionsOf, Laws.Compensation.heldCompletions]⟩)
  · obtain ⟨pair, inside, rfl⟩ := List.mem_map.mp running
    exact List.mem_append_right _ (List.mem_map_of_mem inside)

section Formed

variable {schedule : BranchSchedule} {program : Program} {start state : State} {log : RunLog} {after : State}

/-- **`GroupsStanding` across the commit**: a group's nested run keeps its kind and stands, renamed, in its context,
renamed. -/
theorem orderJournal_groupsStanding (standing : GroupsStanding state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) : GroupsStanding after := by
  have ran := orderJournal_of made
  intro run' member grouped
  obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
  rw [resumesGroup_rename] at grouped
  have stands := standing run runIn grouped
  rw [scopeIds, ← standingKeys, compact_scopes ran]
  exact List.mem_map_of_mem stands

/-- **`Formed` across the commit** (`formed_stepAlongside`'s `runOrder`, all ten fields). `blind` says `precedes` reads
no record's scope occurrence or occurrence key, which `Laws.Compensation.Precedes` meets, reading only subjects and completion numbers;
`Formed.groupsStanding` keeps two runs of one trigger apart across the renaming. -/
theorem orderJournal_formed {precedes : Compensable → Compensable → Prop} (formed : WellFormed program state)
    (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (blind : ∀ record other (x y : ScopeOccurrenceId) (rekey : OccurrenceKey → OccurrenceKey), precedes record other →
      precedes
        { record with scope := x, occurrence := rekey record.occurrence
                      children := record.children.map fun child => { child with occurrence := rekey child.occurrence } }
        { other with scope := y, occurrence := rekey other.occurrence
                     children := other.children.map fun child => { child with occurrence := rekey child.occurrence } })
    (held : Formed precedes state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) : Formed precedes after := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  have quietSignals := facts.quietSignals
  have quietTokens := facts.quietTokens
  have quiet := (compact_quiet ran ⟨quietSignals, quietTokens⟩).1
  have ungrouped := held.triggers.apart.sublist (List.sublist_append_left _ _)
  -- The renaming keeps the runs' keys apart: their triggers are counted keys, which it keeps apart
  -- (`Laws.Step.renameKey_apart`), a group's nested run stands, and no two other runs share a trigger.
  have triggersApart : ∀ a ∈ state.slots.compensation.runs, ∀ b ∈ state.slots.compensation.runs,
      renameName (commitRenaming schedule start log (ordered log state)) a.trigger =
        renameName (commitRenaming schedule start log (ordered log state)) b.trigger → a.trigger = b.trigger := by
    intro a aIn b bIn same
    have triggerCounted := fun x (xIn : x ∈ state.slots.compensation.runs) =>
      held.triggers.counted x.trigger (List.mem_append_left _ (List.mem_map_of_mem xIn))
    have keys : renameKey (commitRenaming schedule start log (ordered log state)) (triggerKey a.trigger) =
        renameKey (commitRenaming schedule start log (ordered log state)) (triggerKey b.trigger) := by
      have := congrArg triggerKey same
      simpa [renameKey_eq, renameName_eq, triggerKey] using this
    have kept := renameKey_apart (schedule := schedule) (log := log) (u := state) (s := ordered log state) counted
      formed.activations rfl
      (fun issue slot inside => NameTabled.grow (s := state) (t := ordered log state) (fun _ _ found => found)
        (formed.issued.slots issue slot inside)) (triggerCounted a aIn) (triggerCounted b bIn) keys
    have keyed : ∀ one two : OccurrenceName, triggerKey one = triggerKey two → one = two := by
      rintro ⟨_, _, _⟩ ⟨_, _, _⟩ same
      simp only [triggerKey, OccurrenceKey.mk.injEq] at same
      simp only [OccurrenceName.mk.injEq]
      exact ⟨same.1, same.2.1, same.2.2.1⟩
    exact keyed _ _ kept
  have apart : ∀ a ∈ state.slots.compensation.runs, ∀ b ∈ state.slots.compensation.runs,
      renameScope (commitRenaming schedule start log (ordered log state)) a.scope =
        renameScope (commitRenaming schedule start log (ordered log state)) b.scope →
      renameName (commitRenaming schedule start log (ordered log state)) a.trigger =
        renameName (commitRenaming schedule start log (ordered log state)) b.trigger →
      a.scope = b.scope ∧ a.trigger = b.trigger := by
    intro a aIn b bIn scopes triggers
    have trigger := triggersApart a aIn b bIn triggers
    refine ⟨?_, trigger⟩
    by_cases aGroup : resumesGroup a.resume = true
    · exact (renameScope_apart counted' rooted (held.runsIssued b bIn) (held.groupsStanding a aIn aGroup) scopes.symm).symm
    · by_cases bGroup : resumesGroup b.resume = true
      · exact renameScope_apart counted' rooted (held.runsIssued a aIn) (held.groupsStanding b bIn bGroup) scopes
      · rw [eq_of_nodup_map ungrouped (List.mem_filter.mpr ⟨aIn, by simpa using aGroup⟩)
          (List.mem_filter.mpr ⟨bIn, by simpa using bGroup⟩) trigger]
  have runsPerm := compact_runs_perm ran apart
  have same : (completions after.slots.compensation).Perm (completions state.slots.compensation) :=
    completions_rename (commitRenaming schedule start log (ordered log state)) (compact_retained ran) runsPerm
  have queued : queuedTriggers after = [] := by simp [queuedTriggers, quiet, Laws.Step.triggersOf_nil]
  have runTriggers : (after.slots.compensation.runs.map (·.trigger)).Perm
      (state.slots.compensation.runs.map fun run => renameName (commitRenaming schedule start log (ordered log state)) run.trigger) :=
    (runsPerm.map _).trans (.of_eq (by simp [List.map_map, Function.comp_def]))
  -- A trigger's key renames as the trigger does.
  have triggerRenamed : ∀ trigger : OccurrenceName,
      triggerKey (renameName (commitRenaming schedule start log (ordered log state)) trigger) =
        renameKey (commitRenaming schedule start log (ordered log state)) (triggerKey trigger) := fun trigger => by
    simp [renameKey_eq, renameName_eq, triggerKey]
  have slotsNamed : ∀ (issue : Issue) (slot : ActivationSlot), (ordered log state).issued[issue]? = some (.activation slot) →
      NameTabled (ordered log state) slot.processInstance := fun issue slot inside =>
    NameTabled.grow (s := state) (t := ordered log state) (fun _ _ found => found) (formed.issued.slots issue slot inside)
  refine ⟨?claims, ?retained, ?unfinished, ?completions, ?issued, ?settled, ?keyed, ?runsIssued, ?triggers, ?ungrouped,
    orderJournal_groupsStanding held.groupsStanding made⟩
  case claims =>
    intro run' member record' inside retained
    rw [compact_retained ran] at retained
    obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
    obtain ⟨y, yIn, rfl⟩ := List.mem_map.mp retained
    obtain ⟨x, xIn, renamed⟩ : ∃ x ∈ claimed run, renameCompensable (commitRenaming schedule start log (ordered log state)) x =
        renameCompensable (commitRenaming schedule start log (ordered log state)) y := by
      rcases List.mem_append.mp inside with pending | running
      · obtain ⟨x, xIn, renamed⟩ := List.mem_map.mp pending
        exact ⟨x, List.mem_append_left _ xIn, renamed⟩
      · obtain ⟨pair, pairIn, renamed⟩ := List.mem_map.mp running
        obtain ⟨pair', pairIn', rfl⟩ := List.mem_map.mp pairIn
        exact ⟨pair'.2, List.mem_append_right _ (List.mem_map_of_mem pairIn'), renamed⟩
    have completion : x.completion = y.completion := by
      simpa [renameCompensable_eq] using congrArg (·.completion) renamed
    exact (List.nodup_append.mp held.completions).2.2 _ (completion_retained yIn) _ (completion_claimed runIn xIn)
      completion.symm
  case retained =>
    intro record' member
    rw [compact_retained ran] at member
    obtain ⟨y, yIn, rfl⟩ := List.mem_map.mp member
    rw [renameCompensable_eq, scopeIds, ← standingKeys, compact_scopes ran]
    exact List.mem_map_of_mem (held.retained y yIn)
  case unfinished =>
    intro run' member
    obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
    simpa using held.unfinished run runIn
  case completions => exact same.nodup_iff.mpr held.completions
  case issued =>
    intro completion member
    rw [compact_nextCompletion ran]
    exact held.issued completion (same.mem_iff.mp member)
  case settled =>
    rintro run' member record' ⟨pending, ready⟩
    obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
    obtain ⟨x, xIn, rfl⟩ := List.mem_map.mp pending
    refine held.settled run runIn x ⟨xIn, fun other otherIn precede =>
      ready (renameCompensable (commitRenaming schedule start log (ordered log state)) other) ?_ ?_⟩
    · rcases List.mem_append.mp otherIn with inPending | inRunning
      · exact List.mem_append_left _ (List.mem_map_of_mem inPending)
      · obtain ⟨pair, pairIn, rfl⟩ := List.mem_map.mp inRunning
        exact List.mem_append_right _ (List.mem_map.mpr ⟨_, List.mem_map_of_mem pairIn, rfl⟩)
    · rw [renameCompensable_eq, renameCompensable_eq]
      exact blind _ _ _ _ _ precede
  case keyed => exact runsKeyed _
  case runsIssued =>
    intro run' member
    obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
    exact compact_scopeIssued ran counted' rooted (held.runsIssued run runIn)
  case triggers =>
    refine ⟨?apart, ?grouped, ?counted, ?raised, ?unreserved⟩
    case apart =>
      unfold heldTriggers
      rw [queued, List.append_nil]
      have kept : ((after.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger)).Perm
          ((state.slots.compensation.runs.filter (!resumesGroup ·.resume)).map
            fun run => renameName (commitRenaming schedule start log (ordered log state)) run.trigger) :=
        ((runsPerm.filter _).map _).trans (.of_eq (by
          simp [List.filter_map, Function.comp_def, resumesGroup_rename, List.map_map]))
      refine kept.nodup_iff.mpr ?_
      have renamed : (((state.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger)).map
          (renameName (commitRenaming schedule start log (ordered log state)))).Nodup :=
        List.pairwise_map.mpr (ungrouped.imp_of_mem fun {x y} xIn yIn differ same => differ (by
          obtain ⟨a, aIn, rfl⟩ := List.mem_map.mp xIn
          obtain ⟨b, bIn, rfl⟩ := List.mem_map.mp yIn
          exact triggersApart a (List.mem_filter.mp aIn).1 b (List.mem_filter.mp bIn).1 same))
      simpa [List.map_map, Function.comp_def] using renamed
    case grouped => intro _ _ _; rw [queued]; exact List.not_mem_nil
    case counted =>
      intro trigger member
      rw [queued, List.append_nil] at member
      have live : instanceLive after (triggerKey trigger).processInstanceId = true := by
        obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
        simp only [instanceLive, Bool.or_eq_true, List.any_eq_true, beq_iff_eq]
        exact .inr ⟨run, runIn, rfl⟩
      replace member := runTriggers.mem_iff.mp member
      obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
      rw [triggerRenamed] at live ⊢
      -- The commit keeps the counters a run's trigger names (`Step.countLive`), so its key stays counted.
      have before := held.triggers.counted _ (List.mem_append_left _ (List.mem_map_of_mem runIn))
      refine compact_counted ran (ordered_activations formed.activations) slotsNamed live ?_
      cases activation : (triggerKey run.trigger).activation with
      | committed n =>
        simp only [Counted, activation] at before ⊢
        obtain ⟨count, kept, rest⟩ := before
        refine ⟨count, List.mem_filter.mpr ⟨kept, ?_⟩, rest⟩
        simp only [countLive, instanceLive, Bool.or_eq_true, List.any_eq_true, beq_iff_eq]
        exact .inr ⟨run, runIn, rest.1.symm⟩
      | fresh unit index => simp only [Counted, activation] at before ⊢; exact before
    case raised => intro origin member; rw [quiet, Laws.Step.triggersOf_nil] at member; cases member
    case unreserved =>
      intro occurrence member unbegun trigger inside
      rw [queued, List.append_nil] at inside
      replace inside := runTriggers.mem_iff.mp inside
      obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp inside
      obtain ⟨old, oldIn, keyed, begun⟩ :=
        compact_key ran counted' formed rfl rfl issued owned rooted formed.distinct.scopes member
      rw [keyed, key_congr (instanceOf_congr (s := state) (t := ordered log state) rfl rfl _), triggerRenamed]
      -- The commit keeps counted keys apart, so a trigger apart from a key stays apart from it.
      intro same
      exact held.triggers.unreserved old oldIn (begun ▸ unbegun) run.trigger
        (List.mem_append_left _ (List.mem_map_of_mem runIn))
        (renameKey_apart (schedule := schedule) (log := log) (u := state) (s := ordered log state) counted
          formed.activations rfl slotsNamed
          (held.triggers.counted _ (List.mem_append_left _ (List.mem_map_of_mem runIn)))
          (formed.occurrencesCounted old oldIn) same)
  case ungrouped => intro _ _ _ _ _ member; rw [quiet] at member; cases member

end Formed

end Kernel.Proofs.Compensation
