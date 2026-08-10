import BpmnSemantics.SemanticProcessAdmissionConformance
import BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance
import BpmnSemantics.TimerStartConformance

/-! # BpmnSemantics.SemanticProcessConformance: runtime and evaluator contract checks

These checks own generic runtime closure, resumability, and evaluator behavior. Checked-graph admission, program validation, definition binding, and lowering fixtures live in `SemanticProcessAdmissionConformance` so each kernel-decided lane has an independent build boundary.
-/

namespace BpmnSemantics.SemanticProcessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem timer_user_task_one_step_closure_exhausts_bound :
    (applyStimulus 1 timerUserTaskCompositionProgram initialState
      timerUserTaskCompositionStart).internalStepBoundExceeded = true := by
  decide +kernel

theorem timer_user_task_timer_wait_stays_within_bound :
    timerUserTaskCompositionTimerWait.internalStepBoundExceeded = false := by
  decide +kernel

theorem timer_user_task_timer_wait_has_no_internal_step :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTimerWait.state = 0 := by
  decide +kernel

theorem timer_user_task_timer_wait_is_resumable :
    stableStateResumable timerUserTaskCompositionTimerWait.state = true := by
  decide +kernel

theorem timer_user_task_task_wait_has_no_internal_step :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTaskWait.state = 0 := by
  decide +kernel

theorem timer_user_task_task_wait_is_resumable :
    stableStateResumable timerUserTaskCompositionTaskWait.state = true := by
  decide +kernel

theorem timer_user_task_composition_completes :
    timerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩ := by
  decide +kernel

private def timerUserTaskCompositionStrandedState : RuntimeState :=
  { timerUserTaskCompositionTaskWait.state with
    tokens := [rootToken ⟨"CompositionInstance_1"⟩
      timerUserTaskCompositionProgram.processId ⟨"place:stranded"⟩]
    waits := [] }

theorem stranded_timer_user_task_state_has_no_internal_step :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionStrandedState = 0 := by
  decide +kernel

theorem stranded_timer_user_task_state_is_not_resumable :
    stableStateResumable timerUserTaskCompositionStrandedState = false := by
  decide +kernel

theorem reverse_timer_user_task_task_wait_stays_within_bound :
    reverseTimerUserTaskCompositionTaskWait.internalStepBoundExceeded =
      false := by
  decide +kernel

theorem reverse_timer_user_task_task_wait_has_no_internal_step :
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTaskWait.state = 0 := by
  decide +kernel

theorem reverse_timer_user_task_task_wait_is_resumable :
    stableStateResumable reverseTimerUserTaskCompositionTaskWait.state =
      true := by
  decide +kernel

theorem reverse_timer_user_task_timer_wait_has_no_internal_step :
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTimerWait.state = 0 := by
  decide +kernel

theorem reverse_timer_user_task_timer_wait_is_resumable :
    stableStateResumable reverseTimerUserTaskCompositionTimerWait.state =
      true := by
  decide +kernel

theorem reverse_timer_user_task_composition_completes :
    reverseTimerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩ := by
  decide +kernel

theorem parallel_start_step_is_exact :
    step parallelProgram parallelStartState parallelStartOperation =
      some parallelAfterStart := by
  decide +kernel

theorem parallel_fork_step_is_exact :
    step parallelProgram parallelAfterStart parallelForkOperation =
      some parallelAfterFork := by
  decide +kernel

theorem per_incoming_join_refuses_duplicate_left_tokens :
    step parallelProgram duplicateLeftNoRightState parallelJoinOperation =
      none := by
  decide +kernel

theorem count_based_join_accepts_duplicate_left_tokens :
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true := by
  decide +kernel

theorem per_incoming_join_rejects_duplicate_left_tokens :
    perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false := by
  decide +kernel

theorem parallelEvaluatorSound :
    Obligations.evaluator_sound ProgramStep step :=
  step_sound

end BpmnSemantics.SemanticProcessConformance
