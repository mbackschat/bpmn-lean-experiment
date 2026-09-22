import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.InternalTimerTaskOrdinaryFrames
import BpmnSemantics.SemanticProcess.InternalTimerTaskDataFrames
import BpmnSemantics.SemanticProcess.InternalTimerTaskScopeFrames
import BpmnSemantics.SemanticProcess.InternalTimerTaskTokenCommutation
import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalCommutation

/-! The finite dispatcher consumes the complete Timer-task pair laws for every prepared family.
No family is admitted through a weaker pair-specific preparation or successor premise. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_timer_task_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (other : PreparedInternalTransition)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (taskFound : prepareInternalTimerTaskContract? program state contract = some patch)
    (otherFound : other.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : (PreparedInternalTransition.timerTask contract patch).Independent other) :
    other.Prepared program (applyInternalTimerTaskPatch state patch) ∧
      prepareInternalTimerTaskContract? program (other.apply program state) contract = some patch ∧
      other.apply program (applyInternalTimerTaskPatch state patch) =
        applyInternalTimerTaskPatch (other.apply program state) patch := by
  cases other with
  | timerTask otherContract otherPatch =>
      exact prepared_timer_task_pair_commutes program state contract otherContract patch otherPatch
        taskFound otherFound canonical independent
  | arming arm =>
      cases arm with
      | ordinary operation ordinary =>
          have pair := prepared_timer_task_ordinary_pair_commutes program state contract patch operation ordinary
            taskFound otherFound canonical independent
          exact ⟨pair.2.1, pair.1, pair.2.2⟩
      | data dataContract data =>
          have pair := prepared_timer_task_data_pair_commutes program state contract patch dataContract data
            taskFound otherFound canonical independent
          exact ⟨pair.2.1, pair.1, pair.2.2⟩
  | localControl control =>
      have pair := prepared_timer_task_local_control_pair program state control.operation control contract patch
        otherFound taskFound canonical independent
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | scopeCreation creation =>
      have pair := prepared_timer_task_scope_creation_pair program state contract patch creation.selection.operation
        creation taskFound otherFound canonical independent
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | ordinaryEnd ending =>
      have pair := prepared_timer_task_end_pair_commutes program state ending.operation ending contract patch
        otherFound taskFound independent
      exact ⟨pair.1, pair.2.1, pair.2.2.symm⟩
  | mergeInput merge =>
      have pair := prepared_timer_task_merge_pair_commutes program state merge.selection.operation
        merge.selection.alternative merge contract patch otherFound taskFound canonical independent
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | regional regional =>
      have running := (preparedTimerTask_owner_facts program state contract patch taskFound).2.2
      have same := runtimePositionValid_running_instance program instanceId patch.arm.runtimeInstanceId state
        (runtimeStateWellFormed_position program instanceId state stateValid) running
      have valid : runtimeStateWellFormed program patch.arm.runtimeInstanceId state = true := by
        simpa only [same] using stateValid
      obtain ⟨frame, after, applied, taskFrame, commute⟩ := prepared_regional_timer_task_pair_commutes
        program state regional.selection.operation regional contract patch programValid valid otherFound taskFound
        (regionalStateFootprintsIndependent_symmetric _ _ independent)
      refine ⟨frame, ?_, ?_⟩
      · simpa only [PreparedInternalTransition.apply, applied, Option.getD_some] using taskFrame
      · simp only [PreparedInternalTransition.apply, applied, commute, Option.getD_some]

end BpmnSemantics.SemanticProcess.InternalCommutation
