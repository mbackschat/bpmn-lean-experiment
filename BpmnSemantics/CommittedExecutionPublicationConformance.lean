import BpmnSemantics.CommittedExecutionPublicationFixtures
import BpmnSemantics.SemanticProcess.ControlPosition
import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.ParallelScopeTransitionTraceProofs
import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.CallActivityConformanceFixtures

/-! # Committed execution publication conformance

This module owns the separating executable facts for revision-free committed transition traces, strict replay, public control-position projection, and delta folding. Publication revisioning and hosting remain outside the Lean semantic authority lane.
-/

namespace BpmnSemantics.CommittedExecutionPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- A real admitted start records the exact stimulus and its two actually selected operations. -/
theorem admitted_start_emits_exact_external_and_two_internal_transitions :
    tracedStart.committedTransitions = exactTrace := by
  decide +kernel

/-- Trace erasure preserves the existing result-only evaluator contract. -/
theorem traced_start_erases_to_existing_applyStimulus :
    tracedStart.result = applyStimulus scenarioClosureLimit sequentialProgram initialState startStimulus :=
  applyStimulusTraced_erases_to_applyStimulus _ _ _ _

/-- The generic replay theorem reconstructs the exact RuntimeState for this emitted trace. -/
theorem admitted_start_trace_replays_to_exact_result :
    replayCommittedTransitions sequentialProgram initialState exactTrace = some tracedStart.result.state := by
  rw [← admitted_start_emits_exact_external_and_two_internal_transitions]
  rw [traced_start_erases_to_existing_applyStimulus]
  change replayCommittedTransitions sequentialProgram initialState
      (applyStimulusTraced scenarioClosureLimit sequentialProgram initialState
        startStimulus).committedTransitions =
    some (applyStimulus scenarioClosureLimit sequentialProgram initialState startStimulus).state
  exact applyStimulusTraced_emitted_trace_replays_of_unselected_parallel_scope scenarioClosureLimit sequentialProgram
    initialState startStimulus (by decide +kernel) (by decide +kernel)

/-- Drop, order, multiplicity, ID, kind, origin, and dynamic-owner corruption cannot replay as the committed result. -/
theorem trace_corruption_is_not_replay_of_committed_result :
    replayCommittedTransitions sequentialProgram initialState droppedTrace ≠ some tracedStart.result.state ∧
      replayCommittedTransitions sequentialProgram initialState swappedTrace ≠ some tracedStart.result.state ∧
      replayCommittedTransitions sequentialProgram initialState duplicatedTrace ≠ some tracedStart.result.state ∧
      replayCommittedTransitions sequentialProgram initialState
          (traceWithFirstRecord substitutedIdRecord) ≠ some tracedStart.result.state ∧
      replayCommittedTransitions sequentialProgram initialState
          (traceWithFirstRecord substitutedKindRecord) ≠ some tracedStart.result.state ∧
      replayCommittedTransitions sequentialProgram initialState
          (traceWithFirstRecord substitutedOriginRecord) ≠ some tracedStart.result.state ∧
      replayCommittedTransitions sequentialProgram initialState
          (traceWithFirstRecord substitutedOwnerRecord) ≠ some tracedStart.result.state := by
  decide +kernel

/-- Rejection, closure-bound exhaustion, and unresolved internal ambiguity expose no trace. -/
theorem every_unpublishable_outcome_has_no_public_trace :
    (applyStimulusTraced scenarioClosureLimit sequentialProgram initialState
      wrongProcessStimulus).committedTransitions = [] ∧
      (applyStimulusTraced 1 sequentialProgram initialState startStimulus).committedTransitions = [] ∧
      (applyStimulusTraced scenarioClosureLimit ambiguousProgram tracedStart.result.state
        completeTaskStimulus).committedTransitions = [] := by
  decide +kernel

/-- Every transition delta is derived from its exact before and after states and folds to the independent head projection. -/
theorem admitted_start_deltas_fold_to_independent_head_position :
    traceControlPositionDeltas? sequentialProgram instanceId initialState exactTrace =
        some (expectedDeltas, expectedHeadPosition) ∧
      foldControlPositionDeltas emptyPublicControlPosition expectedDeltas =
        some expectedHeadPosition := by
  decide +kernel

/-- The exact replayed internal record is a Program step and binds every published field to its selected operation. -/
theorem replayed_internal_record_binds_the_exact_program_step :
    ProgramStep sequentialProgram admittedStartState startRecord.operationId initiatedState ∧
      ∃ operation,
        operation ∈ sequentialProgram.operations ∧
          operation.id = startRecord.operationId ∧
          operation.kind = startRecord.operationKind ∧
          operation.origin = startRecord.origin ∧
          selectedOperationOwner? admittedStartState operation = some startRecord.owner := by
  constructor
  · exact (replayInternalTransition_sound sequentialProgram admittedStartState initiatedState
      startRecord (by decide +kernel)).1
  · decide +kernel

/-- Independent validity admits the real running host, its real called tree, and a clean completed lifecycle. -/
theorem valid_running_called_and_completed_positions_are_projectable :
    runtimePositionValid sequentialProgram instanceId tracedStart.result.state = true ∧
      runtimePositionValid CallActivityConformance.program
          CallActivityConformance.callerInstanceId
          CallActivityConformance.calledWaiting.state = true ∧
      projectControlPosition? sequentialProgram instanceId cleanCompletedState =
        some emptyPublicControlPosition := by
  decide +kernel

/-- Actual projection rejects mutated runtime parentage and token-to-definition ownership. -/
theorem public_position_projection_fails_closed_on_binding_corruption :
    projectControlPosition? sequentialProgram instanceId stateWithBadScopeParent = none ∧
      projectControlPosition? sequentialProgram instanceId stateWithBadTokenOwner = none := by
  decide +kernel

/-- Projection admits no unassociated parentless runtime root. -/
theorem public_position_projection_rejects_unassociated_parentless_root :
    projectControlPosition? sequentialProgram instanceId unassociatedParentlessRootState = none := by
  decide +kernel

/-- Completed lifecycle state admits no retained live scope or token position. -/
theorem public_position_projection_rejects_completed_state_with_live_positions :
    projectControlPosition? sequentialProgram instanceId completedWithLivePositionsState = none := by
  decide +kernel

/-- A called root is bound to the exact called Process named by its association. -/
theorem public_position_projection_rejects_called_root_process_drift :
    projectControlPosition? CallActivityConformance.program
        CallActivityConformance.callerInstanceId calledRootProcessDriftState = none := by
  decide +kernel

/-- A public delta cannot manufacture a zero-multiplicity position. -/
theorem public_position_delta_rejects_nonpositive_multiplicity :
    applyControlPositionDelta? emptyPublicControlPosition zeroMultiplicityDelta = none := by
  decide +kernel

end BpmnSemantics.CommittedExecutionPublicationConformance
