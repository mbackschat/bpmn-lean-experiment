module

public import BpmnSemantics.CommittedExecutionPublicationFixtures
public import BpmnSemantics.SemanticProcess.ControlPosition
public import BpmnSemantics.SemanticProcess.Fixtures
public import BpmnSemantics.CallActivityConformanceFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic

/-! Fixture definitions and executable checks of [`CommittedExecutionPublicationConformance`](CommittedExecutionPublicationConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.CommittedExecutionPublicationConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess
/-- Rejection, closure-bound exhaustion, and unresolved internal ambiguity expose no trace. -/
def every_unpublishable_outcome_has_no_public_trace : Bool := decide <|
    (applyStimulusTraced scenarioClosureLimit sequentialProgram initialState
      wrongProcessStimulus).committedTransitions = [] ∧
      (applyStimulusTraced 1 sequentialProgram initialState startStimulus).committedTransitions = [] ∧
      (applyStimulusTraced scenarioClosureLimit ambiguousProgram tracedStart.result.state
        completeTaskStimulus).committedTransitions = []

/-- Every transition delta is derived from its exact before and after states and folds to the independent head projection. -/
def admitted_start_deltas_fold_to_independent_head_position : Bool := decide <|
    traceControlPositionDeltas? sequentialProgram instanceId initialState exactTrace =
        some (expectedDeltas, expectedHeadPosition) ∧
      foldControlPositionDeltas emptyPublicControlPosition expectedDeltas =
        some expectedHeadPosition

/-- Independent validity admits the real running host, its real called tree, and a clean completed lifecycle. -/
def valid_running_called_and_completed_positions_are_projectable : Bool := decide <|
    runtimePositionValid sequentialProgram instanceId tracedStart.result.state = true ∧
      runtimePositionValid CallActivityConformance.program
          CallActivityConformance.callerInstanceId
          CallActivityConformance.calledWaiting.state = true ∧
      projectControlPosition? sequentialProgram instanceId cleanCompletedState =
        some emptyPublicControlPosition

/-- Actual projection rejects mutated runtime parentage and token-to-definition ownership. -/
def public_position_projection_fails_closed_on_binding_corruption : Bool := decide <|
    projectControlPosition? sequentialProgram instanceId stateWithBadScopeParent = none ∧
      projectControlPosition? sequentialProgram instanceId stateWithBadTokenOwner = none

/-- Projection admits no unassociated parentless runtime root. -/
def public_position_projection_rejects_unassociated_parentless_root : Bool := decide <|
    projectControlPosition? sequentialProgram instanceId unassociatedParentlessRootState = none

/-- Completed lifecycle state admits no retained live scope or token position. -/
def public_position_projection_rejects_completed_state_with_live_positions : Bool := decide <|
    projectControlPosition? sequentialProgram instanceId completedWithLivePositionsState = none

/-- A called root is bound to the exact called Process named by its association. -/
def public_position_projection_rejects_called_root_process_drift : Bool := decide <|
    projectControlPosition? CallActivityConformance.program
        CallActivityConformance.callerInstanceId calledRootProcessDriftState = none

/-- A public delta cannot manufacture a zero-multiplicity position. -/
def public_position_delta_rejects_nonpositive_multiplicity : Bool := decide <|
    applyControlPositionDelta? emptyPublicControlPosition zeroMultiplicityDelta = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("every_unpublishable_outcome_has_no_public_trace", every_unpublishable_outcome_has_no_public_trace),
  ("admitted_start_deltas_fold_to_independent_head_position", admitted_start_deltas_fold_to_independent_head_position),
  ("valid_running_called_and_completed_positions_are_projectable", valid_running_called_and_completed_positions_are_projectable),
  ("public_position_projection_fails_closed_on_binding_corruption", public_position_projection_fails_closed_on_binding_corruption),
  ("public_position_projection_rejects_unassociated_parentless_root", public_position_projection_rejects_unassociated_parentless_root),
  ("public_position_projection_rejects_completed_state_with_live_positions", public_position_projection_rejects_completed_state_with_live_positions),
  ("public_position_projection_rejects_called_root_process_drift", public_position_projection_rejects_called_root_process_drift),
  ("public_position_delta_rejects_nonpositive_multiplicity", public_position_delta_rejects_nonpositive_multiplicity)
]

end BpmnSemantics.CommittedExecutionPublicationConformance
