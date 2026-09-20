import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.NonInterruptingBoundaryTimerConformance
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! BTP-LEGACY-HOST-01 affects both Task arms as well as bounded scopes. These constructed
states distinguish AOO-JOIN-03's exact attachment from the retired ordinal coincidence;
they establish no additional profile reachability. -/

namespace BpmnSemantics.BoundaryTimerProjectionConformance

open BpmnSemantics.SemanticProcess

private def ownershipRefusal (program : Program) (expected : SemanticId) (state : RuntimeState) : Prop :=
  let missingRecord := { state with activityOccurrences := [] }
  let missingAttachment := { state with activityOccurrences := state.activityOccurrences.map fun record =>
    { record with attachedHandlers := [] } }
  runtimeStateWellFormed program expected missingRecord = true ∧
    runtimeStateWellFormed program expected missingAttachment = true ∧
    projectOpenFlowNodeOccurrences? program missingRecord = none ∧
    projectOpenFlowNodeOccurrences? program missingAttachment = none

private def divergentProjection (program : Program) (expected : SemanticId) (state : RuntimeState) : Prop :=
  let after := { state with
    timerWaits := state.timerWaits.map fun wait => { wait with activation := 2 }
    timerActivations := state.timerActivations.map fun counter => { counter with count := 2 }
    activityOccurrences := state.activityOccurrences.map fun record =>
      { record with attachedHandlers := record.attachedHandlers.map fun handler =>
          match handler with
          | .timer occurrence => .timer { occurrence with activation := 2 }
          | .message occurrence => .message occurrence } }
  state.waits.map (·.activation) = [1] ∧ after.timerWaits.map (·.activation) = [2] ∧
    runtimeStateWellFormed program expected after = true ∧
    (projectOpenFlowNodeOccurrences? program state).isSome = true ∧
    projectOpenFlowNodeOccurrences? program after = projectOpenFlowNodeOccurrences? program state

theorem bounded_task_missing_ownership_refused : ownershipRefusal
    ActivityBoundaryTimerConformance.program ActivityBoundaryTimerConformance.instanceId
    ActivityBoundaryTimerConformance.armedState := by
  unfold ownershipRefusal
  decide +kernel

theorem monitored_task_missing_ownership_refused : ownershipRefusal
    NonInterruptingBoundaryTimerConformance.program NonInterruptingBoundaryTimerConformance.instanceId
    NonInterruptingBoundaryTimerConformance.armedState := by
  unfold ownershipRefusal
  decide +kernel

theorem bounded_task_divergent_deadline_projected : divergentProjection
    ActivityBoundaryTimerConformance.program ActivityBoundaryTimerConformance.instanceId
    ActivityBoundaryTimerConformance.armedState := by
  unfold divergentProjection
  decide +kernel

theorem monitored_task_divergent_deadline_projected : divergentProjection
    NonInterruptingBoundaryTimerConformance.program NonInterruptingBoundaryTimerConformance.instanceId
    NonInterruptingBoundaryTimerConformance.armedState := by
  unfold divergentProjection
  decide +kernel

end BpmnSemantics.BoundaryTimerProjectionConformance
