module

public import BpmnSemantics.CommittedExecutionPublicationConformanceCheckFixtures
public import BpmnSemantics.CommittedExecutionPublicationFixtures
public import BpmnSemantics.SemanticProcess.ControlPosition
public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.ParallelScopeTransitionTraceProofs
public import BpmnSemantics.SemanticProcess.Fixtures
public import BpmnSemantics.CallActivityConformanceFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
/-! # Committed execution publication conformance

This module owns the separating executable facts for revision-free committed transition traces, strict replay, public control-position projection, and delta folding. Publication revisioning and hosting remain outside the Lean semantic authority lane.
-/

@[expose] public section

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

end BpmnSemantics.CommittedExecutionPublicationConformance
