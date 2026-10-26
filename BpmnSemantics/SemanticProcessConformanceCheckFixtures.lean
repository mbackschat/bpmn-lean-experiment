module

import BpmnSemantics.SemanticProcessAdmissionConformance
public import BpmnSemantics.TimerStartConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries

/-! Fixture definitions and executable checks of [`SemanticProcessConformance`](SemanticProcessConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.SemanticProcessConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

def timer_user_task_one_step_closure_exhausts_bound : Bool := decide <|
    (applyStimulus 1 timerUserTaskCompositionProgram initialState
      timerUserTaskCompositionStart).internalStepBoundExceeded = true

def timer_user_task_timer_wait_stays_within_bound : Bool := decide <|
    timerUserTaskCompositionTimerWait.internalStepBoundExceeded = false

def timer_user_task_timer_wait_has_no_internal_step : Bool := decide <|
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTimerWait.state = 0

def timer_user_task_timer_wait_is_resumable : Bool := decide <|
    stableStateResumable timerUserTaskCompositionTimerWait.state = true

def timer_user_task_task_wait_has_no_internal_step : Bool := decide <|
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTaskWait.state = 0

def timer_user_task_task_wait_is_resumable : Bool := decide <|
    stableStateResumable timerUserTaskCompositionTaskWait.state = true

def timer_user_task_composition_completes : Bool := decide <|
    timerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩

def timerUserTaskCompositionStrandedState : RuntimeState :=
  { timerUserTaskCompositionTaskWait.state with
    tokens := [rootToken ⟨"CompositionInstance_1"⟩
      timerUserTaskCompositionProgram.processId ⟨"place:stranded"⟩]
    waits := [] }

def stranded_timer_user_task_state_has_no_internal_step : Bool := decide <|
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionStrandedState = 0

def stranded_timer_user_task_state_is_not_resumable : Bool := decide <|
    stableStateResumable timerUserTaskCompositionStrandedState = false

def reverse_timer_user_task_task_wait_stays_within_bound : Bool := decide <|
    reverseTimerUserTaskCompositionTaskWait.internalStepBoundExceeded =
      false

def reverse_timer_user_task_task_wait_has_no_internal_step : Bool := decide <|
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTaskWait.state = 0

def reverse_timer_user_task_task_wait_is_resumable : Bool := decide <|
    stableStateResumable reverseTimerUserTaskCompositionTaskWait.state =
      true

def reverse_timer_user_task_timer_wait_has_no_internal_step : Bool := decide <|
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTimerWait.state = 0

def reverse_timer_user_task_timer_wait_is_resumable : Bool := decide <|
    stableStateResumable reverseTimerUserTaskCompositionTimerWait.state =
      true

def reverse_timer_user_task_composition_completes : Bool := decide <|
    reverseTimerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩

def parallel_start_step_is_exact : Bool := decide <|
    step parallelProgram parallelStartState parallelStartOperation =
      some parallelAfterStart

def parallel_fork_step_is_exact : Bool := decide <|
    step parallelProgram parallelAfterStart parallelForkOperation =
      some parallelAfterFork

def per_incoming_join_refuses_duplicate_left_tokens : Bool := decide <|
    step parallelProgram duplicateLeftNoRightState parallelJoinOperation =
      none

def count_based_join_accepts_duplicate_left_tokens : Bool := decide <|
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true

def per_incoming_join_rejects_duplicate_left_tokens : Bool := decide <|
    perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("timer_user_task_one_step_closure_exhausts_bound", timer_user_task_one_step_closure_exhausts_bound),
  ("timer_user_task_timer_wait_stays_within_bound", timer_user_task_timer_wait_stays_within_bound),
  ("timer_user_task_timer_wait_has_no_internal_step", timer_user_task_timer_wait_has_no_internal_step),
  ("timer_user_task_timer_wait_is_resumable", timer_user_task_timer_wait_is_resumable),
  ("timer_user_task_task_wait_has_no_internal_step", timer_user_task_task_wait_has_no_internal_step),
  ("timer_user_task_task_wait_is_resumable", timer_user_task_task_wait_is_resumable),
  ("timer_user_task_composition_completes", timer_user_task_composition_completes),
  ("stranded_timer_user_task_state_has_no_internal_step", stranded_timer_user_task_state_has_no_internal_step),
  ("stranded_timer_user_task_state_is_not_resumable", stranded_timer_user_task_state_is_not_resumable),
  ("reverse_timer_user_task_task_wait_stays_within_bound", reverse_timer_user_task_task_wait_stays_within_bound),
  ("reverse_timer_user_task_task_wait_has_no_internal_step", reverse_timer_user_task_task_wait_has_no_internal_step),
  ("reverse_timer_user_task_task_wait_is_resumable", reverse_timer_user_task_task_wait_is_resumable),
  ("reverse_timer_user_task_timer_wait_has_no_internal_step", reverse_timer_user_task_timer_wait_has_no_internal_step),
  ("reverse_timer_user_task_timer_wait_is_resumable", reverse_timer_user_task_timer_wait_is_resumable),
  ("reverse_timer_user_task_composition_completes", reverse_timer_user_task_composition_completes),
  ("parallel_start_step_is_exact", parallel_start_step_is_exact),
  ("parallel_fork_step_is_exact", parallel_fork_step_is_exact),
  ("per_incoming_join_refuses_duplicate_left_tokens", per_incoming_join_refuses_duplicate_left_tokens),
  ("count_based_join_accepts_duplicate_left_tokens", count_based_join_accepts_duplicate_left_tokens),
  ("per_incoming_join_rejects_duplicate_left_tokens", per_incoming_join_rejects_duplicate_left_tokens)
]

end BpmnSemantics.SemanticProcessConformance
