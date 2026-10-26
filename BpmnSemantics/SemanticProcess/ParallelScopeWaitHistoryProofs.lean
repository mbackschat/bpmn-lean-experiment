module

public import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
import BpmnSemantics.SemanticProcess.ParallelScopeWaitDeclarationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeWaitCompletionProofs
import BpmnSemantics.SemanticProcess.ParallelScopeWaitIssuanceProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Declaration provenance along actual parallel-scope histories

RSI-BIND-04 is established by Start and carried through actual successful
execution, so later reservation proofs need not assume provenance at every step.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Actual pre-entry execution carries the Start instance's canonical wait declarations. -/
theorem ParallelScopeParentHistory.wait_declarations (program : Program)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (wellFormed : programWellFormed program = true)
    (history : ParallelScopeParentHistory program entry parent state) :
    waitDeclarationsValid program parent.processInstanceId state = true := by
  induction history with
  | start instanceId root values state selected started owner distinct =>
      subst parent
      exact runningProgramStartState_wait_declarations program instanceId values state started
  | @initiate before after history output declared applied ih =>
      unfold initiateState? at applied
      obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      split at applied <;> try contradiction
      cases Option.some.inj applied
      exact ih
  | @body before after history candidate operation resolved kind applied ih =>
      apply applyInternalOperationOccurrence_body_wait_declarations
        (before := before) (candidate := candidate) (operation := operation) <;> assumption
  | @human before after history id values wait selected ordinary applied ih =>
      exact ParallelScopeCommand.completeTask_wait_declarations program parent.processInstanceId
        before after id values ih applied
  | @service before after history id values wait selected ordinary applied ih =>
      exact ParallelScopeCommand.completeEffect_success_wait_declarations program parent.processInstanceId
        before after id values ih applied

namespace ParallelScopeReplay

private theorem replayed_wait_declarations (program : Program) (hosting : SemanticId)
    (wellFormed : programWellFormed program = true) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (valid : waitDeclarationsValid program hosting before = true)
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    waitDeclarationsValid program hosting after = true := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    replayInternalOperationOccurrence_sound program before after record replayed
  rcases kind with body | retirement
  · apply applyInternalOperationOccurrence_body_wait_declarations
      (before := before) (candidate := ⟨record.operationId, record.owner⟩) (operation := operation)
    all_goals first | assumption | (rw [metadata]; exact body)
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact completeParallelScope_preserves_wait_declarations program hosting entry record.owner before after valid completed

private theorem ordered_wait_declarations (program : Program) (hosting : SemanticId)
    (wellFormed : programWellFormed program = true)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (valid : waitDeclarationsValid program hosting initial = true) :
    waitDeclarationsValid program hosting final = true := by
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
          have first := replayed_wait_declarations program hosting wellFormed initial next record
            (same ▸ kinds head (by simp)) valid actual
          exact ih next tail (by simpa using length) (by simpa using last)
            (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
            (fun record member => kinds record (by simp [member])) first

/-- Actual completion ingress preserves declarations even when it refuses unchanged. -/
theorem admitStimulus_wait_declarations (program : Program) (hosting : SemanticId)
    (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus)
    (valid : waitDeclarationsValid program hosting before = true) :
    waitDeclarationsValid program hosting (admitStimulus program before stimulus).state = true := by
  apply admitStimulus_wait_preserves program before stimulus selected completion
    (fun state => waitDeclarationsValid program hosting state = true) valid
  · intro id values after completed
    exact ParallelScopeCommand.completeTask_wait_declarations program hosting before after id values valid completed
  · intro id values after completed
    exact ParallelScopeCommand.completeEffect_success_wait_declarations program hosting before after id values valid completed

/-- Every successful continuation command and internal prefix retains its initial canonical declarations. -/
theorem ContinuationCommandHistory.wait_declarations (program : Program) (hosting : SemanticId)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (wellFormed : programWellFormed program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (valid : waitDeclarationsValid program hosting initial = true) :
    waitDeclarationsValid program hosting final = true := by
  induction history with
  | initial => exact valid
  | @internalStep before after earlier record history replayed kind outside ih =>
      exact replayed_wait_declarations program hosting wellFormed before after record kind ih replayed
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
      obtain ⟨actualStimulus, actualRest, admitted, successors, shape, committed, stateEq, length, last, aligned⟩ :=
        committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
      cases shape
      apply ordered_wait_declarations program hosting wellFormed admitted after rest successors length last aligned kinds
      rw [← stateEq]
      exact admitStimulus_wait_declarations program hosting before stimulus selected completion ih

end ParallelScopeReplay
end BpmnSemantics.SemanticProcess
