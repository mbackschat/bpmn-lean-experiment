module

public import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
public import BpmnSemantics.SemanticProcess.ParallelScopeLocalFrameProofs

/-! # Activity-local frame absence along actual parallel histories

PMIS-SELECT-01 needs absence of Activity-owned local frames before Human
reservation. Start establishes it; actual operations preserve or remove frames.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem activity_frame_absent_of_sublist (query : ActivityOccurrenceId → Bool)
    (before after : RuntimeState)
    (frames : after.variables.activities.Sublist before.variables.activities)
    (absent : (before.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false) :
    (after.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false :=
  List.any_eq_false.mpr fun frame member => List.any_eq_false.mp absent frame (frames.subset member)

/-- Actual pre-entry execution retains the empty Activity-frame query established at Start. -/
theorem ParallelScopeParentHistory.activity_frame_absent (program : Program)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (query : ActivityOccurrenceId → Bool)
    (history : ParallelScopeParentHistory program entry parent state) :
    (state.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
  induction history with
  | start instanceId root values state selected started owner distinct =>
      subst parent
      exact runningProgramStartState_activity_frame_absent program instanceId values state query started
  | @initiate before after history output declared applied ih =>
      unfold initiateState? at applied
      obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      split at applied <;> try contradiction
      cases Option.some.inj applied
      exact ih
  | @body before after history candidate operation resolved kind applied ih =>
      exact (applyInternalOperationOccurrence_body_activity_frame program before after candidate operation
        query resolved kind applied).trans ih
  | @human before after history id values wait selected ordinary applied ih =>
      rw [ParallelScopeCommand.completeTask_activity_frames program before after id values applied]
      exact ih
  | @service before after history id values wait selected ordinary applied ih =>
      exact activity_frame_absent_of_sublist query before after
        (ParallelScopeCommand.completeEffect_success_activity_frames program before after id values applied) ih

namespace ParallelScopeReplay

private theorem replayed_activity_frame_absent (program : Program) (query : ActivityOccurrenceId → Bool)
    (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (valid : (before.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false)
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    (after.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    replayInternalOperationOccurrence_sound program before after record replayed
  rcases kind with body | retirement
  · exact (applyInternalOperationOccurrence_body_activity_frame program before after
      ⟨record.operationId, record.owner⟩ operation query resolved (by rw [metadata]; exact body) applied).trans valid
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact activity_frame_absent_of_sublist query before after
      (completeParallelScope_activity_frames entry record.owner before after completed) valid

private theorem ordered_activity_frame_absent (program : Program) (query : ActivityOccurrenceId → Bool)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (valid : (initial.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false) :
    (final.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
  induction records generalizing initial successors with
  | nil =>
      have empty : successors = [] := by simpa using length
      subst successors
      have same : initial = final := by simpa using last
      exact same ▸ valid
  | cons head rest ih =>
      cases successors with
      | nil => simp at length
      | cons next tail =>
          obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
          change head = .internalOperation record at same
          have first := replayed_activity_frame_absent program query initial next record
            (same ▸ kinds head (by simp)) valid actual
          exact ih next tail (by simpa using length) (by simpa using last)
            (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
            (fun record member => kinds record (by simp [member])) first

/-- Actual completion ingress preserves Activity-frame absence even when it refuses unchanged. -/
theorem admitStimulus_activity_frame_absent (program : Program) (query : ActivityOccurrenceId → Bool)
    (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus)
    (valid : (before.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false) :
    ((admitStimulus program before stimulus).state.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
  apply admitStimulus_wait_preserves program before stimulus selected completion
    (fun state => (state.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false) valid
  · intro id values after completed
    rw [ParallelScopeCommand.completeTask_activity_frames program before after id values completed]
    exact valid
  · intro id values after completed
    exact activity_frame_absent_of_sublist query before after
      (ParallelScopeCommand.completeEffect_success_activity_frames program before after id values completed) valid

/-- Every actual continuation command and internal prefix preserves Activity-frame absence. -/
theorem ContinuationCommandHistory.activity_frame_absent (program : Program) (query : ActivityOccurrenceId → Bool)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (valid : (initial.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false) :
    (final.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
  induction history with
  | initial => exact valid
  | @internalStep before after earlier record history replayed kind outside ih =>
      exact replayed_activity_frame_absent program query before after record kind ih replayed
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
      obtain ⟨actualStimulus, actualRest, admitted, successors, shape, committed, stateEq, length, last, aligned⟩ :=
        committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
      cases shape
      apply ordered_activity_frame_absent program query admitted after rest successors length last aligned kinds
      rw [← stateEq]
      exact admitStimulus_activity_frame_absent program query before stimulus selected completion ih

end ParallelScopeReplay
end BpmnSemantics.SemanticProcess
