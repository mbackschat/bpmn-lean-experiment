module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleFixtures
public import BpmnSemantics.EmbeddedSubProcessCompletionConformance
import BpmnSemantics.ActivityBoundaryTimerConformance
public import BpmnSemantics.ConfiguredTaskConformance
public import BpmnSemantics.CallActivityConformanceFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
public import BpmnSemantics.ActivityBoundaryTimerFixtures

/-! Fixture definitions and executable checks of [`FlowNodeOccurrenceLifecycleProgramValidityConformance`](FlowNodeOccurrenceLifecycleProgramValidityConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

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
def corrupted_candidate_process_id_is_rejected_while_open_oracle_is_exact : Bool := decide <|
    projectOpenFlowNodeOccurrences? SequentialUserTask.program sequentialAwaitBeforeState = some [] ∧
      projectOpenFlowNodeOccurrences? SequentialUserTask.program
        SequentialUserTask.afterStartState =
          some
            [{ anchor := sequentialTaskAnchor
               processId := SequentialUserTask.program.processId
               elementId := ⟨"UserTask_Approve"⟩
               owner := SequentialUserTask.rootOwner }] ∧
      acceptFlowNodeOccurrenceCandidate? SequentialUserTask.program sequentialAwaitBeforeState
        SequentialUserTask.afterStartState corruptedSequentialTaskDelta = none

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

def independent_open_projection_rejects_program_foreign_user_task : Bool := decide <|
    projectOpenFlowNodeOccurrences? SequentialUserTask.program foreignUserTaskState = none

def independent_open_projection_rejects_orphan_boundary_deadline : Bool := decide <|
    projectOpenFlowNodeOccurrences? ActivityBoundaryTimerConformance.program
      orphanBoundaryDeadlineState = none

def independent_open_projection_rejects_program_foreign_call_record : Bool := decide <|
    projectOpenFlowNodeOccurrences? CallActivityConformance.program foreignCallRecordState = none

/-- Every executable check of this module, named for the driver's failure report. -/
def flowNodeOccurrenceLifecycleProgramValidityConformanceChecks : List (String × Bool) := [
  ("corrupted_candidate_process_id_is_rejected_while_open_oracle_is_exact", corrupted_candidate_process_id_is_rejected_while_open_oracle_is_exact),
  ("independent_open_projection_rejects_program_foreign_user_task", independent_open_projection_rejects_program_foreign_user_task),
  ("independent_open_projection_rejects_orphan_boundary_deadline", independent_open_projection_rejects_orphan_boundary_deadline),
  ("independent_open_projection_rejects_program_foreign_call_record", independent_open_projection_rejects_program_foreign_call_record)
]

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
