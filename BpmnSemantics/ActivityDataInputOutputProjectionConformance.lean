module

public import BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.CallActivity

/-! # Activity-data open lifecycle projection conformance

These witnesses bind the existing data-operation wait contract to the independent open-set oracle.
Effect-local exactness remains confined to its tagged owner family.
-/

@[expose] public section

namespace BpmnSemantics.ActivityDataInputOutputProjectionConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ActivityDataInputOutputConformance

def inputProgram : Program :=
  { claimProgram with
    identity := { claimProgram.identity with semanticProfile := activityDataInputUserTaskProfileId }
    operations := claimProgram.operations.map fun
      | .awaitDataInputOutputUserTask id origin input output taskId taskName directInput _ =>
          .awaitDataInputUserTask id origin input output taskId taskName directInput
      | other => other }

def outputProgram : Program :=
  { claimProgram with
    identity := { claimProgram.identity with semanticProfile := activityDataOutputUserTaskProfileId }
    operations := claimProgram.operations.map fun
      | .awaitDataInputOutputUserTask id origin input output taskId taskName _ directOutput =>
          .awaitDataOutputUserTask id origin input output taskId taskName directOutput
      | other => other }

def outputActive : RuntimeState :=
  { active with variables := { active.variables with activities :=
      [{ owner := .activityOccurrence claimActivityOwner, bindings := [] }] } }

def expectedOpen : List OpenSemanticFlowNodeOccurrence :=
  [{ anchor := .wait claimTaskInstanceId
     processId := claimProcessId
     elementId := ⟨"UserTask_AssessClaim"⟩
     owner := { processInstanceId := claimInstanceId
                definitionScopeId := ⟨"scope:Process_ClaimAssessment"⟩
                activation := 1 } }]

def projectionWitnessesUseAdmittedProgramsAndStates : Bool := decide <|
    [(claimProgram, active), (inputProgram, active), (outputProgram, outputActive)].all
      (fun (program, state) => programWellFormed program &&
        runtimeStateWellFormed program claimInstanceId state) = true

def allThreeDataOperationsProjectTheirExactLiveTask : Bool := decide <|
    projectOpenFlowNodeOccurrences? claimProgram active = some expectedOpen ∧
      projectOpenFlowNodeOccurrences? inputProgram active = some expectedOpen ∧
      projectOpenFlowNodeOccurrences? outputProgram outputActive = some expectedOpen

def wrongOutput : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with output := ⟨"place:Flow_ClaimReceived_Assess"⟩ } }

def wrongName : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with task := { wait.task with name := some "Wrong task" } } }

def wrongOwner : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with owner := { wait.owner with activation := 2 } } }

def metadata : UserTaskMetadata :=
  { assignment := { candidates := [{ kind := .group, id := "reviewers" }] } }

def wrongTaskMetadata : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with task := { wait.task with metadata := some metadata } } }

def wrongWaitMetadata : RuntimeState :=
  { active with waits := active.waits.map fun wait =>
      { wait with metadata := some metadata } }

def dataWaitsStillRequireExactProgramCorrespondence : Bool := decide <|
    [claimProgram, inputProgram, outputProgram].all (fun program =>
      [wrongOutput, wrongName, wrongOwner, wrongTaskMetadata, wrongWaitMetadata].all fun state =>
        (projectOpenFlowNodeOccurrences? program state).isNone) = true

def orphanEffectScope : RuntimeState :=
  { active with variables := { active.variables with activities :=
      { owner := .effectOccurrence claimTaskInstanceId, bindings := [] } ::
        active.variables.activities } }

def activityOwnerDoesNotLicenseAnOrphanEffectScope : Bool := decide <|
    projectOpenFlowNodeOccurrences? claimProgram orphanEffectScope = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("projectionWitnessesUseAdmittedProgramsAndStates", projectionWitnessesUseAdmittedProgramsAndStates),
  ("allThreeDataOperationsProjectTheirExactLiveTask", allThreeDataOperationsProjectTheirExactLiveTask),
  ("dataWaitsStillRequireExactProgramCorrespondence", dataWaitsStillRequireExactProgramCorrespondence),
  ("activityOwnerDoesNotLicenseAnOrphanEffectScope", activityOwnerDoesNotLicenseAnOrphanEffectScope)
]

end BpmnSemantics.ActivityDataInputOutputProjectionConformance
