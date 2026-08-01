import BpmnSemantics.SemanticProcess

/-! # BpmnSemantics.SemanticProcessConformance — executable contract checks

These checks are intentionally phrased against the generic Semantic Process language and its bounded checked-source lowering rather than a topology-specific evaluator.
-/

namespace BpmnSemantics.SemanticProcessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def emptyCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with nodes := [], sequenceFlows := [] }

private def flowlessCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with sequenceFlows := [] }

private def danglingCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with
    nodes := []
    sequenceFlows :=
      [{ id := ⟨"Flow_Dangling"⟩
         sourceId := ⟨"Missing_Source"⟩
         targetId := ⟨"Missing_Target"⟩ }] }

theorem sequential_checked_process_is_well_formed :
    checkedWellFormed sequentialCheckedProcess = true := by decide

theorem parallel_checked_process_is_well_formed :
    checkedWellFormed parallelCheckedProcess = true := by decide

theorem timer_user_task_checked_process_is_well_formed :
    checkedWellFormed timerUserTaskCompositionCheckedProcess = true := by
  decide

theorem reverse_timer_user_task_checked_process_is_well_formed :
    checkedWellFormed reverseTimerUserTaskCompositionCheckedProcess = true := by
  decide

theorem empty_checked_graph_is_rejected :
    checkedWellFormed emptyCheckedGraph = false := by decide

theorem flowless_checked_graph_is_rejected :
    checkedWellFormed flowlessCheckedGraph = false := by decide

theorem dangling_checked_graph_is_rejected :
    checkedWellFormed danglingCheckedGraph = false := by decide

theorem sequential_program_is_well_formed :
    programWellFormed sequentialProgram = true := by decide

theorem parallel_program_is_well_formed :
    programWellFormed parallelProgram = true := by decide

theorem timer_user_task_program_is_well_formed :
    programWellFormed timerUserTaskCompositionProgram = true := by decide

theorem timer_user_task_profile_capabilities_are_valid :
    programProfileCapabilitiesValid timerUserTaskCompositionProgram = true := by
  decide

theorem timer_user_task_profile_mismatch_is_rejected :
    programProfileCapabilitiesValid
      { timerUserTaskCompositionProgram with
        identity :=
          { timerUserTaskCompositionProgram.identity with
            semanticProfile :=
              ⟨"cibseven-2.2.0-intermediate-catch-timer-draft"⟩ } } =
      false := by
  decide
theorem sequential_definition_binding_is_valid :
    definitionBindingValid sequentialCheckedProcess sequentialProgram = true := by
  decide

theorem parallel_definition_binding_is_valid :
    definitionBindingValid parallelCheckedProcess parallelProgram = true := by
  decide

theorem sequential_lowering_is_exact :
    lowerCheckedProcess sequentialCheckedProcess = sequentialProgram := by
  decide

theorem parallel_lowering_is_exact :
    lowerCheckedProcess parallelCheckedProcess = parallelProgram := by
  decide

theorem timer_user_task_lowering_is_exact :
    lowerCheckedProcess timerUserTaskCompositionCheckedProcess =
      timerUserTaskCompositionProgram := by
  decide

theorem timer_user_task_one_step_closure_exhausts_bound :
    (applyStimulus 1 timerUserTaskCompositionProgram initialState
      timerUserTaskCompositionStart).internalStepBoundExceeded = true := by
  decide

theorem timer_user_task_timer_wait_stays_within_bound :
    timerUserTaskCompositionTimerWait.internalStepBoundExceeded = false := by
  decide

theorem timer_user_task_timer_wait_has_no_internal_step :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTimerWait.state = 0 := by
  decide

theorem timer_user_task_timer_wait_is_resumable :
    stableStateResumable timerUserTaskCompositionTimerWait.state = true := by
  decide

theorem timer_user_task_task_wait_has_no_internal_step :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTaskWait.state = 0 := by
  decide

theorem timer_user_task_task_wait_is_resumable :
    stableStateResumable timerUserTaskCompositionTaskWait.state = true := by
  decide

theorem timer_user_task_composition_completes :
    timerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩ := by
  decide

private def timerUserTaskCompositionStrandedState : RuntimeState :=
  { timerUserTaskCompositionTaskWait.state with
    tokens := [rootToken ⟨"CompositionInstance_1"⟩
      timerUserTaskCompositionProgram.processId ⟨"place:stranded"⟩]
    waits := [] }

theorem stranded_timer_user_task_state_has_no_internal_step :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionStrandedState = 0 := by
  decide

theorem stranded_timer_user_task_state_is_not_resumable :
    stableStateResumable timerUserTaskCompositionStrandedState = false := by
  decide

theorem reverse_timer_user_task_task_wait_stays_within_bound :
    reverseTimerUserTaskCompositionTaskWait.internalStepBoundExceeded =
      false := by
  decide

theorem reverse_timer_user_task_task_wait_has_no_internal_step :
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTaskWait.state = 0 := by
  decide

theorem reverse_timer_user_task_task_wait_is_resumable :
    stableStateResumable reverseTimerUserTaskCompositionTaskWait.state =
      true := by
  decide

theorem reverse_timer_user_task_timer_wait_has_no_internal_step :
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTimerWait.state = 0 := by
  decide

theorem reverse_timer_user_task_timer_wait_is_resumable :
    stableStateResumable reverseTimerUserTaskCompositionTimerWait.state =
      true := by
  decide

theorem reverse_timer_user_task_composition_completes :
    reverseTimerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩ := by
  decide

theorem parallel_start_step_is_exact :
    step parallelProgram parallelStartState parallelStartOperation =
      some parallelAfterStart := by
  decide

theorem parallel_fork_step_is_exact :
    step parallelProgram parallelAfterStart parallelForkOperation =
      some parallelAfterFork := by
  decide

theorem per_incoming_join_refuses_duplicate_left_tokens :
    step parallelProgram duplicateLeftNoRightState parallelJoinOperation =
      none := by
  decide

theorem count_based_join_accepts_duplicate_left_tokens :
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true := by
  decide

theorem per_incoming_join_rejects_duplicate_left_tokens :
    perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false := by
  decide

theorem parallelEvaluatorSound :
    Obligations.evaluator_sound ProgramStep step :=
  step_sound

end BpmnSemantics.SemanticProcessConformance
