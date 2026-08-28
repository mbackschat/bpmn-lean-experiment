import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateClosingTerminalPreservation

/-! # Parallel Multi-Instance closing-route preservation

This module selects the exact shared terminal-preservation account for final completion, early
completion, and deadline interruption. The common region-withdrawal proof remains in the upstream
terminal owner.

Scope boundary: route selection and result-publication framing only. The shared terminal proof,
progress, evaluator lifting, command traces, host behavior, and semantic account remain outside.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Final child completion closes the region and publishes the exact bounded result list. -/
theorem sharedParallelFinal_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId instanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (results : List String)
    (running : before.control = .running instanceId)
    (selectedController : parallelControllerForTask? arm before taskId = some controller)
    (selectedRecord : parallelControllerRecord? before controller = some record)
    (regionValid : parallelRegionValid arm before controller record = true)
    (_withinLimits : withinParallelMultiInstanceLimits arm results = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId
      (closeSharedParallelRegion before controller record arm.normalOutput
        (publishSharedParallelResults before arm results)) = true := by
  have selection := completionClosingSelectionFacts program expectedInstanceId instanceId arm
    ownerScope account before taskId controller record running selectedController selectedRecord
    regionValid wellFormed
  exact sharedParallelTerminal_preserves_runtimeStateWellFormed program expectedInstanceId
    instanceId arm ownerScope account before controller record arm.normalOutput
    (publishSharedParallelResults before arm results) running
    selection.toParallelClosingSelectionFacts (by simp [publishSharedParallelResults])
    account.normalOutputDeclared account.normalOutputOwner wellFormed

/-- Early completion closes the region without changing scoped variables. -/
theorem sharedParallelEarly_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId instanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (running : before.control = .running instanceId)
    (selectedController : parallelControllerForTask? arm before taskId = some controller)
    (selectedRecord : parallelControllerRecord? before controller = some record)
    (regionValid : parallelRegionValid arm before controller record = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId
      (closeSharedParallelRegion before controller record arm.normalOutput before.variables) = true := by
  have selection := completionClosingSelectionFacts program expectedInstanceId instanceId arm
    ownerScope account before taskId controller record running selectedController selectedRecord
    regionValid wellFormed
  exact sharedParallelTerminal_preserves_runtimeStateWellFormed program expectedInstanceId
    instanceId arm ownerScope account before controller record arm.normalOutput before.variables
    running selection.toParallelClosingSelectionFacts rfl account.normalOutputDeclared
    account.normalOutputOwner wellFormed

/-- Deadline interruption closes the region through the declared Timer output without changing
scoped variables. -/
theorem sharedParallelTimer_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId instanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (timerId : TimerOccurrenceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (running : before.control = .running instanceId)
    (selectedController : parallelControllerForTimer? arm before timerId = some controller)
    (selectedRecord : parallelControllerRecord? before controller = some record)
    (regionValid : parallelRegionValid arm before controller record = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId
      (closeSharedParallelRegion before controller record arm.boundaryTimer.output
        before.variables) = true := by
  have selection := timerClosingSelectionFacts program expectedInstanceId instanceId arm ownerScope
    account before timerId controller record running selectedController selectedRecord regionValid
    wellFormed
  exact sharedParallelTerminal_preserves_runtimeStateWellFormed program expectedInstanceId
    instanceId arm ownerScope account before controller record arm.boundaryTimer.output
    before.variables running selection.toParallelClosingSelectionFacts rfl
    account.timerOutputDeclared account.timerOutputOwner wellFormed

end BpmnSemantics.SemanticProcess
