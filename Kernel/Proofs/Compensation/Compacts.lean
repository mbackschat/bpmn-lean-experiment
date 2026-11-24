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

/-- A compensation run renamed by a commit. -/
abbrev renamedRun (r : Issue → Issue) (run : CompensationRun) : CompensationRun :=
  { run with scope := renameScope r run.scope, pending := run.pending.map (renameCompensable r)
             running := run.running.map fun (context, record) => (renameScope r context, renameCompensable r record)
             leave := run.leave.map (renameId r), resume := run.resume.map (renameResume r) }

section Compacts

variable {schedule : BranchSchedule} {start : State} {log : RunLog} {s t : State}

/-- A commit keeps the next position. -/
theorem compact_nextCompletion (ran : compact schedule start log s = .ok t) : t.nextCompletion = s.nextCompletion := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · rfl
  have same := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2
    (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s)
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

/-- A commit keeps every completion number a compensation slot holds. -/
theorem completions_rename (r : Issue → Issue) (compensation : Compensations) :
    completions { retained := compensation.retained.map (renameCompensable r)
                  runs := compensation.runs.map (renamedRun r) } = completions compensation := by
  simp [completions, completionsIn, completionsOf_rename, completion_rename, List.flatMap_map, Function.comp_def]

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
  rw [compact_compensation ran] at member
  obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
  rw [resumesGroup_rename] at grouped
  have stands := standing run runIn grouped
  rw [scopeIds, ← standingKeys, compact_scopes ran]
  exact List.mem_map_of_mem stands

/-- **`Formed` across the commit** (`formed_stepAlongside`'s `runOrder`, all ten fields). `blind` says `precedes` reads
no record's scope occurrence, which `Laws.Compensation.Precedes` meets, reading only subjects and completion numbers;
`Formed.groupsStanding` keeps two runs of one trigger apart across the renaming. -/
theorem orderJournal_formed {precedes : Compensable → Compensable → Prop} (formed : WellFormed program state)
    (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (blind : ∀ record other (x y : ScopeOccurrenceId), precedes record other →
      precedes { record with scope := x } { other with scope := y })
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
  have slot := compact_compensation ran
  have same : completions after.slots.compensation = completions state.slots.compensation := by
    rw [slot]; exact completions_rename _ _
  have queued : queuedTriggers after = [] := by simp [queuedTriggers, quiet, Laws.Step.triggersOf_nil]
  have runTriggers : after.slots.compensation.runs.map (·.trigger) = state.slots.compensation.runs.map (·.trigger) := by
    rw [slot]; simp [List.map_map, Function.comp_def]
  refine ⟨?claims, ?retained, ?unfinished, ?completions, ?issued, ?settled, ?keyed, ?runsIssued, ?triggers, ?ungrouped,
    orderJournal_groupsStanding held.groupsStanding made⟩
  case claims =>
    intro run' member record' inside retained
    rw [slot] at member retained
    obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
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
    rw [slot] at member
    obtain ⟨y, yIn, rfl⟩ := List.mem_map.mp member
    rw [renameCompensable_eq, scopeIds, ← standingKeys, compact_scopes ran]
    exact List.mem_map_of_mem (held.retained y yIn)
  case unfinished =>
    intro run' member
    rw [slot] at member
    obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
    simpa using held.unfinished run runIn
  case completions => unfold CompletionsApart; rw [same]; exact held.completions
  case issued =>
    intro completion member
    rw [same] at member
    rw [compact_nextCompletion ran]
    exact held.issued completion member
  case settled =>
    rintro run' member record' ⟨pending, ready⟩
    rw [slot] at member
    obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
    obtain ⟨x, xIn, rfl⟩ := List.mem_map.mp pending
    refine held.settled run runIn x ⟨xIn, fun other otherIn precede =>
      ready (renameCompensable (commitRenaming schedule start log (ordered log state)) other) ?_ ?_⟩
    · rcases List.mem_append.mp otherIn with inPending | inRunning
      · exact List.mem_append_left _ (List.mem_map_of_mem inPending)
      · obtain ⟨pair, pairIn, rfl⟩ := List.mem_map.mp inRunning
        exact List.mem_append_right _ (List.mem_map.mpr ⟨_, List.mem_map_of_mem pairIn, rfl⟩)
    · rw [renameCompensable_eq, renameCompensable_eq]
      exact blind _ _ _ _ precede
  case keyed =>
    unfold RunsKeyed
    rw [slot]
    simp only [List.map_map]
    have ungrouped := List.pairwise_filter.mp (List.pairwise_map.mp (held.triggers.apart.sublist
      (List.sublist_append_left _ _)))
    refine List.pairwise_map.mpr ((List.pairwise_map.mp held.keyed).and ungrouped |>.imp_of_mem ?_)
    rintro a b aIn bIn ⟨apart, triggers⟩ renamed
    simp only [Function.comp_apply, Prod.mk.injEq] at renamed
    obtain ⟨scopes, trigger⟩ := renamed
    by_cases aGroup : resumesGroup a.resume = true
    · have := renameScope_apart counted' rooted (held.runsIssued b bIn) (held.groupsStanding a aIn aGroup) scopes.symm
      exact apart (by rw [this, trigger])
    · by_cases bGroup : resumesGroup b.resume = true
      · have := renameScope_apart counted' rooted (held.runsIssued a aIn) (held.groupsStanding b bIn bGroup) scopes
        exact apart (by rw [this, trigger])
      · exact triggers (by simpa using aGroup) (by simpa using bGroup) trigger
  case runsIssued =>
    intro run' member
    rw [slot] at member
    obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
    exact compact_scopeIssued ran counted' rooted (held.runsIssued run runIn)
  case triggers =>
    refine ⟨?apart, ?grouped, ?counted, ?raised, ?unreserved⟩
    case apart =>
      unfold heldTriggers
      rw [queued, List.append_nil]
      have kept : (after.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger) =
          (state.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger) := by
        rw [slot]
        simp [List.filter_map, Function.comp_def, resumesGroup_rename, List.map_map]
      rw [kept]
      exact held.triggers.apart.sublist (List.sublist_append_left _ _)
    case grouped => intro _ _ _; rw [queued]; exact List.not_mem_nil
    case counted =>
      intro trigger member
      rw [queued, List.append_nil, runTriggers] at member
      obtain ⟨count, kept, rest⟩ := held.triggers.counted trigger (List.mem_append_left _ member)
      refine Counted.congr (compact_kept ran).activations ⟨count, List.mem_filter.mpr ⟨kept, ?_⟩, rest⟩
      -- The commit keeps the counters a run's trigger names (`Step.countLive`).
      obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
      simp only [countLive, Bool.or_eq_true, List.any_eq_true, beq_iff_eq]
      exact .inr ⟨run, runIn, rest.1.symm⟩
    case raised => intro origin member; rw [quiet, Laws.Step.triggersOf_nil] at member; cases member
    case unreserved =>
      intro occurrence member unbegun trigger inside
      rw [queued, List.append_nil, runTriggers] at inside
      obtain ⟨old, oldIn, keyed, begun⟩ :=
        compact_key ran counted' formed rfl rfl issued owned rooted formed.distinct.scopes member
      rw [keyed, key_congr (instanceOf_congr (s := state) (t := ordered log state) rfl rfl _)]
      exact held.triggers.unreserved old oldIn (begun ▸ unbegun) trigger (List.mem_append_left _ inside)
  case ungrouped => intro _ _ _ _ _ member; rw [quiet] at member; cases member

end Formed

end Kernel.Proofs.Compensation
