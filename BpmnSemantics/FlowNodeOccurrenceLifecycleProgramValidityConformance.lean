import BpmnSemantics.FlowNodeOccurrenceLifecycleFixtures
import BpmnSemantics.EmbeddedSubProcessCompletionConformance
import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.ConfiguredTaskConformance
import BpmnSemantics.CallActivityConformance

/-! # Flow-node occurrence lifecycle program-validity conformance

This module owns exact rejection witnesses for malformed runtime state and program-foreign lifecycle candidates.
-/

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def sequentialAwaitBeforeState : RuntimeState :=
  { (runningProgramStartState? SequentialUserTask.program ⟨"Instance_1"⟩
      SequentialUserTask.initialBindings).getD initialState with
    initiationPending := false
    tokens :=
      [rootToken ⟨"Instance_1"⟩ SequentialUserTask.program.processId
        ⟨"place:Flow_StartToTask"⟩] }

def corruptedSequentialTaskStart : UnnumberedFlowNodeOccurrenceStart :=
  { anchor := sequentialTaskAnchor
    processId := ⟨"Process_Corrupted"⟩
    elementId := ⟨"UserTask_Approve"⟩
    owner := SequentialUserTask.rootOwner }

def corruptedSequentialTaskDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [corruptedSequentialTaskStart], ended := [] }

/-- A candidate cannot smuggle a false Process identity through an otherwise exact open-state oracle. -/
theorem corrupted_candidate_process_id_is_rejected_while_open_oracle_is_exact :
    projectOpenFlowNodeOccurrences? SequentialUserTask.program sequentialAwaitBeforeState = some [] ∧
      projectOpenFlowNodeOccurrences? SequentialUserTask.program
        SequentialUserTask.afterStartState =
          some
            [{ anchor := sequentialTaskAnchor
               processId := SequentialUserTask.program.processId
               elementId := ⟨"UserTask_Approve"⟩
               owner := SequentialUserTask.rootOwner }] ∧
      acceptFlowNodeOccurrenceCandidate? SequentialUserTask.program sequentialAwaitBeforeState
        SequentialUserTask.afterStartState corruptedSequentialTaskDelta = none := by
  decide +kernel

def selfParentedEmbeddedState : RuntimeState :=
  { EmbeddedSubProcessCompletionConformance.childWaiting.state with
    scopeOccurrences :=
      EmbeddedSubProcessCompletionConformance.childWaiting.state.scopeOccurrences.map fun occurrence =>
        if occurrence.id.definitionScopeId = EmbeddedSubProcessCompletionConformance.childScopeId then
          { occurrence with parent := some occurrence.id }
        else occurrence }

def terminalStateWithActivityLocal : RuntimeState :=
  { initialState with
    control := .completed ⟨"instance:terminal-activity-local"⟩
    variables :=
      { emptyScopedVariables with
        activities :=
          [{ owner := .effectOccurrence ConfiguredTaskConformance.effectId,
             bindings := [] }] } }

def configuredMissingActivityLocal : RuntimeState :=
  { ConfiguredTaskConformance.startedResult.state with
    variables := { ConfiguredTaskConformance.startedResult.state.variables with activities := [] } }

def configuredDuplicateActivityLocal : RuntimeState :=
  { ConfiguredTaskConformance.startedResult.state with
    variables :=
      { ConfiguredTaskConformance.startedResult.state.variables with
        activities := ConfiguredTaskConformance.startedResult.state.variables.activities ++
          ConfiguredTaskConformance.startedResult.state.variables.activities } }

def configuredUnownedActivityLocal : RuntimeState :=
  { ConfiguredTaskConformance.startedResult.state with
    variables :=
      { ConfiguredTaskConformance.startedResult.state.variables with
        activities := ConfiguredTaskConformance.startedResult.state.variables.activities ++
          [{ owner := .effectOccurrence
              { ConfiguredTaskConformance.effectId with activation := 2 },
             bindings := [] }] } }

/-- Open projection rejects malformed scope trees, residual terminal locals, and every non-exact effect-local association. -/
theorem independent_open_projection_rejects_every_runtime_validity_counterexample :
    projectOpenFlowNodeOccurrences? EmbeddedSubProcessCompletionConformance.program
        selfParentedEmbeddedState = none ∧
      projectOpenFlowNodeOccurrences? SequentialUserTask.program
        terminalStateWithActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredMissingActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredDuplicateActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredUnownedActivityLocal = none := by
  decide +kernel

def foreignUserTaskState : RuntimeState :=
  { SequentialUserTask.afterStartState with
    waits := SequentialUserTask.afterStartState.waits.map fun wait =>
      { wait with task := { wait.task with id := ⟨"UserTask_Foreign"⟩ } } }

def orphanBoundaryDeadlineState : RuntimeState :=
  { ActivityBoundaryTimerConformance.armedState with waits := [] }

def foreignCallRecordState : RuntimeState :=
  { CallActivityConformance.calledWaiting.state with
    calledProcessOccurrences :=
      CallActivityConformance.calledWaiting.state.calledProcessOccurrences.map fun record =>
        { record with returnOperationId := ⟨"operation:foreign-return"⟩ } }

theorem independent_open_projection_rejects_program_foreign_user_task :
    projectOpenFlowNodeOccurrences? SequentialUserTask.program foreignUserTaskState = none := by
  decide +kernel

theorem independent_open_projection_rejects_orphan_boundary_deadline :
    projectOpenFlowNodeOccurrences? ActivityBoundaryTimerConformance.program
      orphanBoundaryDeadlineState = none := by
  decide +kernel

theorem independent_open_projection_rejects_program_foreign_call_record :
    projectOpenFlowNodeOccurrences? CallActivityConformance.program foreignCallRecordState = none := by
  decide +kernel

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
