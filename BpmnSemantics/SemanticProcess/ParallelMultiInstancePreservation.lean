import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition

/-! # Parallel Multi-Instance evaluator soundness and invariant preservation

Each executable evaluator is a checked realization of the corresponding declarative family step.
The post-state invariant check is part of fail-closed evaluation, never a repair: a candidate that
does not satisfy the complete applicable invariant is refused before it can become committed state.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem enterParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : ParallelMultiInstanceRuntimeState)
    (success : enterParallelMultiInstance? arm before = some after) :
    ParallelMultiInstanceEntryStep arm before after := by
  unfold enterParallelMultiInstance? at success
  cases ready : parallelEntryReady arm before with
  | false => simp [ready] at success
  | true =>
    cases admitted : admittedParallelSnapshot? arm before with
    | none => simp [ready, admitted] at success
    | some snapshot =>
        cases post : parallelMultiInstanceRuntimeWellFormed arm
            (parallelEntryState arm before snapshot) with
        | false => simp [ready, admitted, post] at success
        | true =>
          simp [ready, admitted, post] at success
          cases success
          exact .enters before snapshot ready admitted post

theorem completeParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : ParallelMultiInstanceRuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding)
    (success : completeParallelMultiInstance? arm before taskId submitted = some after) :
    ParallelMultiInstanceCompletionStep arm taskId submitted before after := by
  unfold completeParallelMultiInstance? at success
  cases pre : parallelMultiInstanceRuntimeWellFormed arm before with
  | false => simp [pre] at success
  | true =>
    cases candidate : parallelCompletionCandidate? arm before taskId submitted with
    | none => simp [pre, candidate] at success
    | some rewritten =>
        cases post : parallelMultiInstanceRuntimeWellFormed arm rewritten with
        | false => simp [pre, candidate, post] at success
        | true =>
          simp [pre, candidate, post] at success
          cases success
          exact .completes before after pre candidate post

theorem interruptParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : ParallelMultiInstanceRuntimeState) (timer : TimerOccurrenceId)
    (success : interruptParallelMultiInstance? arm before timer = some after) :
    ParallelMultiInstanceTimerStep arm timer before after := by
  unfold interruptParallelMultiInstance? at success
  cases pre : parallelMultiInstanceRuntimeWellFormed arm before with
  | false => simp [pre] at success
  | true =>
    cases candidate : parallelTimerCandidate? arm before timer with
    | none => simp [pre, candidate] at success
    | some rewritten =>
        cases post : parallelMultiInstanceRuntimeWellFormed arm rewritten with
        | false => simp [pre, candidate, post] at success
        | true =>
          simp [pre, candidate, post] at success
          cases success
          exact .interrupts before after pre candidate post

theorem entry_evaluator_preserves_runtime_well_formedness
    (arm : ParallelMultiInstanceArm) (before after : ParallelMultiInstanceRuntimeState)
    (success : enterParallelMultiInstance? arm before = some after) :
    parallelMultiInstanceRuntimeWellFormed arm after = true := by
  cases enterParallelMultiInstance_sound arm before after success
  assumption

theorem completion_evaluator_preserves_runtime_well_formedness
    (arm : ParallelMultiInstanceArm) (before after : ParallelMultiInstanceRuntimeState)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding)
    (success : completeParallelMultiInstance? arm before taskId submitted = some after) :
    parallelMultiInstanceRuntimeWellFormed arm after = true := by
  cases completeParallelMultiInstance_sound arm before after taskId submitted success
  assumption

theorem timer_evaluator_preserves_runtime_well_formedness
    (arm : ParallelMultiInstanceArm) (before after : ParallelMultiInstanceRuntimeState)
    (timer : TimerOccurrenceId)
    (success : interruptParallelMultiInstance? arm before timer = some after) :
    parallelMultiInstanceRuntimeWellFormed arm after = true := by
  cases interruptParallelMultiInstance_sound arm before after timer success
  assumption

/-- Public command application preserves the exact pre-state for every semantic refusal. -/
def completeParallelMultiInstanceOrPreserve (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) : ParallelMultiInstanceRuntimeState :=
  (completeParallelMultiInstance? arm before taskId submitted).getD before

theorem stale_or_duplicate_completion_preserves_exact_state
    (arm : ParallelMultiInstanceArm) (before : ParallelMultiInstanceRuntimeState)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding)
    (refused : completeParallelMultiInstance? arm before taskId submitted = none) :
    completeParallelMultiInstanceOrPreserve arm before taskId submitted = before := by
  simp [completeParallelMultiInstanceOrPreserve, refused]

end BpmnSemantics.SemanticProcess
