import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateClosingProgressPreservation
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateClosingRoutePreservation
import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation

/-! # Parallel Multi-Instance closing preservation

The shared completion relation has three exact successors: final publication, early closure, and a
progress rewrite that retains pending children. The shared Timer relation has one exact successor,
which closes the region and advances logical time. This module composes the route-specific proofs
over those constructors and lifts the result through the executable evaluators' soundness theorems.

Scope boundary: closing-step composition and evaluator lifting only. Entry preservation, the
semantic account, TypeScript realization, command traces, host behavior, and umbrella imports remain
outside this module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Every declarative shared completion route preserves the complete production invariant. -/
theorem sharedParallelCompletionStep_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before after : RuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding)
    (step : SharedParallelMultiInstanceCompletionStep arm taskId submitted before after)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  cases step with
  | final instanceId controller record result conditionValue results running sameInstance
      selectedController selectedRecord regionValid accepted condition completed withinLimits
      rewrite =>
      subst after
      exact sharedParallelFinal_preserves_runtimeStateWellFormed program expectedInstanceId
        instanceId arm ownerScope account before taskId controller record results running
        selectedController selectedRecord regionValid withinLimits wellFormed
  | early instanceId controller record result running sameInstance selectedController selectedRecord
      regionValid accepted condition incomplete rewrite =>
      subst after
      exact sharedParallelEarly_preserves_runtimeStateWellFormed program expectedInstanceId
        instanceId arm ownerScope account before taskId controller record running
        selectedController selectedRecord regionValid wellFormed
  | progresses instanceId controller record result firstPending restPending running sameInstance
      selectedController selectedRecord regionValid accepted condition incomplete pending rewrite =>
      subst after
      exact sharedParallelProgress_preserves_runtimeStateWellFormed program expectedInstanceId
        instanceId arm ownerScope account before taskId controller record result firstPending
        restPending running selectedController selectedRecord regionValid pending wellFormed

/-- Deadline interruption preserves the production invariant for its exact logical-time successor. -/
theorem sharedParallelTimerStep_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before after : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (step : SharedParallelMultiInstanceTimerStep arm timerId logicalTimeMs before after)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  cases step with
  | interrupts instanceId controller record deadline running sameInstance selectedController
      selectedRecord regionValid selectedDeadline due rewrite =>
      subst after
      change runtimeStateWellFormed program expectedInstanceId
        (closeSharedParallelRegion before controller record arm.boundaryTimer.output
          before.variables) = true
      exact sharedParallelTimer_preserves_runtimeStateWellFormed program expectedInstanceId
        instanceId arm ownerScope account before timerId controller record running
        selectedController selectedRecord regionValid wellFormed

/-- Successful shared completion evaluation preserves the complete production invariant. -/
theorem completeSharedParallelMultiInstance_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before after : RuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true)
    (success : completeSharedParallelMultiInstance? arm before taskId submitted = some after) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  exact sharedParallelCompletionStep_preserves_runtimeStateWellFormed program expectedInstanceId
    arm ownerScope account before after taskId submitted
      (completeSharedParallelMultiInstance_sound arm before after taskId submitted success) wellFormed

/-- Successful shared Timer interruption preserves the complete production invariant. -/
theorem interruptSharedParallelMultiInstance_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before after : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true)
    (success : interruptSharedParallelMultiInstance? arm before timerId logicalTimeMs = some after) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  exact sharedParallelTimerStep_preserves_runtimeStateWellFormed program expectedInstanceId arm
    ownerScope account before after timerId logicalTimeMs
      (interruptSharedParallelMultiInstance_sound arm before after timerId logicalTimeMs success)
      wellFormed

end BpmnSemantics.SemanticProcess
