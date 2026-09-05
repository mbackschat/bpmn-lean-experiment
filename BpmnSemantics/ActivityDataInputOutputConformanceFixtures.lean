import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Composed Activity data-input/output conformance fixtures

Shared exact-source and runtime fixtures for admission and lifetime witnesses. Keeping one fixture
owner lets the kernel-decided proof families build separately without transcribing their inputs.
-/

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def claimDirectInput : DirectActivityDataInput :=
  { associationId := "DataInputAssociation_ClaimSummary"
    sourcePropertyId := "Property_ClaimSummary"
    targetDataInputId := "DataInput_ClaimSummary"
    targetDataInputName := some "Claim summary" }

def claimDirectOutput : DirectActivityDataOutput :=
  { associationId := "DataOutputAssociation_ClaimDecision"
    sourceDataOutputId := "DataOutput_ClaimDecision"
    sourceDataOutputName := some "Claim decision"
    targetPropertyId := "Property_ClaimDecision" }

def claimProcessId : ProcessId := ⟨"Process_ClaimAssessment"⟩

def claimCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := activityDataInputOutputUserTaskProfileId
        sourceId := ⟨"activity-data-input-output-user-task-process"⟩
        sourceSha256 :=
          "32a1fbbb0fe6035d0c80eeadd951e5f1f244e0f03417330cbb46c4904a666724" }
    processId := claimProcessId
    definitionScopes := [rootDefinitionScope claimProcessId]
    nodeScopes := rootNodeScopes claimProcessId
      [⟨"EndEvent_Recorded"⟩, ⟨"StartEvent_ClaimReceived"⟩, ⟨"UserTask_AssessClaim"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes claimProcessId
      [⟨"Flow_AssessClaim_Recorded"⟩, ⟨"Flow_ClaimReceived_Assess"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_Recorded"⟩
      , .noneStartEvent ⟨"StartEvent_ClaimReceived"⟩
      , .dataInputOutputUserTask ⟨"UserTask_AssessClaim"⟩ (some "Assess claim")
          claimDirectInput claimDirectOutput ]
    sequenceFlows :=
      [ { id := ⟨"Flow_AssessClaim_Recorded"⟩
          sourceId := ⟨"UserTask_AssessClaim"⟩
          targetId := ⟨"EndEvent_Recorded"⟩ }
      , { id := ⟨"Flow_ClaimReceived_Assess"⟩
          sourceId := ⟨"StartEvent_ClaimReceived"⟩
          targetId := ⟨"UserTask_AssessClaim"⟩ } ] }

def claimProgram : Program := lowerCheckedProcess claimCheckedProcess

def claimInstanceId : SemanticId := ⟨"ClaimAssessmentInstance_1"⟩

def summary : VariableBinding :=
  { name := claimDirectInput.sourcePropertyId, value := .string "claim-4711" }

def nullSummary : VariableBinding :=
  { name := claimDirectInput.sourcePropertyId, value := .null }

def unrelated : VariableBinding :=
  { name := "Property_Unrelated", value := .string "retain-me" }

def startClaim (commandId : String) (bindings : List VariableBinding) : Stimulus :=
  .startProcess ⟨commandId⟩ ⟨claimProcessId.value⟩ claimInstanceId bindings

def startWithSummary : Stimulus :=
  startClaim "start-claim" [summary]

def startWithNullSummary : Stimulus :=
  startClaim "start-null-claim" [nullSummary]

def startWithoutSummary : Stimulus :=
  startClaim "start-missing-claim" []

def runStart (stimulus : Stimulus) : StimulusResult :=
  applyStimulus scenarioClosureLimit claimProgram initialState stimulus

def seededReady : RuntimeState :=
  let ready := (runStart startWithoutSummary).state
  { ready with variables := { ready.variables with process := { bindings := [summary, unrelated] } } }

def active : RuntimeState :=
  (activateDataInputOutputUserTask? seededReady
    ⟨"place:Flow_ClaimReceived_Assess"⟩ ⟨"place:Flow_AssessClaim_Recorded"⟩
    ⟨"UserTask_AssessClaim"⟩ (some "Assess claim") claimDirectInput).getD initialState

def claimTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := claimInstanceId
    elementId := ⟨"UserTask_AssessClaim"⟩
    activation := 1 }

def claimActivityOwner : ActivityOccurrenceId :=
  { processInstanceId := claimInstanceId
    activityElementId := ⟨"UserTask_AssessClaim"⟩
    activation := 1 }

def completeClaim (commandId : String)
    (bindings : List VariableBinding) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ claimTaskInstanceId bindings

def decision (value : VariableValue) : VariableBinding :=
  { name := claimDirectOutput.sourceDataOutputId, value }

def approved : StimulusResult :=
  applyStimulus scenarioClosureLimit claimProgram active
    (completeClaim "complete-claim" [decision (.string "approve")])

def refused (state : RuntimeState) : StimulusResult :=
  { outcome := .rejected
    state
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

end BpmnSemantics.ActivityDataInputOutputConformance
