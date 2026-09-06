import BpmnSemantics.ActivityDataInputOutputConformanceFixtures
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! # Activity-data open lifecycle projection conformance

These witnesses bind the existing data-operation wait contract to the independent open-set oracle.
Effect-local exactness remains confined to its tagged owner family.
-/

set_option Elab.async false

namespace BpmnSemantics.ActivityDataInputOutputProjectionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ActivityDataInputOutputConformance

private def inputProgram : Program :=
  { claimProgram with
    identity := { claimProgram.identity with semanticProfile := activityDataInputUserTaskProfileId }
    operations := claimProgram.operations.map fun
      | .awaitDataInputOutputUserTask id origin input output taskId taskName directInput _ =>
          .awaitDataInputUserTask id origin input output taskId taskName directInput
      | other => other }

private def outputProgram : Program :=
  { claimProgram with
    identity := { claimProgram.identity with semanticProfile := activityDataOutputUserTaskProfileId }
    operations := claimProgram.operations.map fun
      | .awaitDataInputOutputUserTask id origin input output taskId taskName _ directOutput =>
          .awaitDataOutputUserTask id origin input output taskId taskName directOutput
      | other => other }

private def outputActive : RuntimeState :=
  { active with variables := { active.variables with activities :=
      [{ owner := .activityOccurrence claimActivityOwner, bindings := [] }] } }

private def expectedOpen : List OpenSemanticFlowNodeOccurrence :=
  [{ anchor := .wait claimTaskInstanceId
     processId := claimProcessId
     elementId := ⟨"UserTask_AssessClaim"⟩
     owner := { processInstanceId := claimInstanceId
                definitionScopeId := ⟨"scope:Process_ClaimAssessment"⟩
                activation := 1 } }]

theorem projectionWitnessesUseAdmittedProgramsAndStates :
    [(claimProgram, active), (inputProgram, active), (outputProgram, outputActive)].all
      (fun (program, state) => programWellFormed program &&
        runtimeStateWellFormed program claimInstanceId state) = true := by
  decide +kernel

theorem allThreeDataOperationsProjectTheirExactLiveTask :
    projectOpenFlowNodeOccurrences? claimProgram active = some expectedOpen ∧
      projectOpenFlowNodeOccurrences? inputProgram active = some expectedOpen ∧
      projectOpenFlowNodeOccurrences? outputProgram outputActive = some expectedOpen := by
  decide +kernel

private def wrongOutput : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with output := ⟨"place:Flow_ClaimReceived_Assess"⟩ } }

private def wrongName : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with task := { wait.task with name := some "Wrong task" } } }

private def wrongOwner : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with owner := { wait.owner with activation := 2 } } }

private def metadata : UserTaskMetadata :=
  { assignment := { candidates := [{ kind := .group, id := "reviewers" }] } }

private def wrongTaskMetadata : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with task := { wait.task with metadata := some metadata } } }

private def wrongWaitMetadata : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with metadata := some metadata } }

theorem dataWaitsStillRequireExactProgramCorrespondence :
    [claimProgram, inputProgram, outputProgram].all (fun program =>
      [wrongOutput, wrongName, wrongOwner, wrongTaskMetadata, wrongWaitMetadata].all fun state =>
        (projectOpenFlowNodeOccurrences? program state).isNone) = true := by
  decide +kernel

private def orphanEffectScope : RuntimeState :=
  { active with variables := { active.variables with activities :=
      { owner := .effectOccurrence claimTaskInstanceId, bindings := [] } ::
        active.variables.activities } }

theorem activityOwnerDoesNotLicenseAnOrphanEffectScope :
    projectOpenFlowNodeOccurrences? claimProgram orphanEffectScope = none := by
  decide +kernel

end BpmnSemantics.ActivityDataInputOutputProjectionConformance
