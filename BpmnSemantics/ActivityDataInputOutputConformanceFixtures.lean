import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Composed Activity data-input/output conformance fixtures

Shared exact-source and runtime fixtures for admission and lifetime witnesses. Literal fixtures are
kernel-locked to their original constructions so consumers do not repeat the lifetime reductions.
-/

set_option Elab.async false

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

private def claimDefinitionScopeId : DefinitionScopeId := ⟨"scope:Process_ClaimAssessment"⟩

def claimProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := activityDataInputOutputUserTaskProfileId
        sourceId := ⟨"activity-data-input-output-user-task-process"⟩
        sourceOverlay := none
        sourceSha256 :=
          "32a1fbbb0fe6035d0c80eeadd951e5f1f244e0f03417330cbb46c4904a666724" }
    internalSchedulingMode := .rejectObservableChoice
    processId := claimProcessId
    definitionScopes :=
      [{ id := claimDefinitionScopeId
         parentScopeId := none
         originElementId := ⟨"Process_ClaimAssessment"⟩ }]
    operationScopes :=
      [ { operationId := ⟨"operation:EndEvent_Recorded"⟩, scopeId := claimDefinitionScopeId }
      , { operationId := ⟨"operation:StartEvent_ClaimReceived"⟩, scopeId := claimDefinitionScopeId }
      , { operationId := ⟨"operation:UserTask_AssessClaim"⟩, scopeId := claimDefinitionScopeId }
      , { operationId := ⟨"operation:complete-scope:scope:Process_ClaimAssessment"⟩
          scopeId := claimDefinitionScopeId } ]
    controlPlaceScopes :=
      [ { controlPlaceId := ⟨"place:Flow_AssessClaim_Recorded"⟩, scopeId := claimDefinitionScopeId }
      , { controlPlaceId := ⟨"place:Flow_ClaimReceived_Assess"⟩, scopeId := claimDefinitionScopeId } ]
    controlPlaces :=
      [ { id := ⟨"place:Flow_AssessClaim_Recorded"⟩
          origin := { elementId := ⟨"Flow_AssessClaim_Recorded"⟩ } }
      , { id := ⟨"place:Flow_ClaimReceived_Assess"⟩
          origin := { elementId := ⟨"Flow_ClaimReceived_Assess"⟩ } } ]
    operations :=
      [ .reachNoneEnd ⟨"operation:EndEvent_Recorded"⟩
          { elementId := ⟨"EndEvent_Recorded"⟩ } ⟨"place:Flow_AssessClaim_Recorded"⟩
      , .initiate ⟨"operation:StartEvent_ClaimReceived"⟩
          { elementId := ⟨"StartEvent_ClaimReceived"⟩ } ⟨"place:Flow_ClaimReceived_Assess"⟩
      , .awaitDataInputOutputUserTask ⟨"operation:UserTask_AssessClaim"⟩
          { elementId := ⟨"UserTask_AssessClaim"⟩ }
          ⟨"place:Flow_ClaimReceived_Assess"⟩ ⟨"place:Flow_AssessClaim_Recorded"⟩
          ⟨"UserTask_AssessClaim"⟩ (some "Assess claim") claimDirectInput claimDirectOutput
      , .completeScope ⟨"operation:complete-scope:scope:Process_ClaimAssessment"⟩
          { elementId := ⟨"Process_ClaimAssessment"⟩ } claimDefinitionScopeId none ]
    compensationActivityRetention := none
    compensationEventSubProcessSnapshots := none
    compensationExecution := none }

theorem claimProgram_is_lowered_claimCheckedProcess :
    lowerCheckedProcess claimCheckedProcess = claimProgram := by
  decide +kernel

theorem claimProgram_profile :
    claimProgram.identity.semanticProfile = activityDataInputOutputUserTaskProfileId := by
  decide +kernel

theorem claimProgram_capabilities : programProfileCapabilitiesValid claimProgram = true := by
  decide +kernel

def claimInstanceId : SemanticId := ⟨"ClaimAssessmentInstance_1"⟩

private def claimScopeOwner : ScopeOccurrenceId :=
  { processInstanceId := claimInstanceId
    definitionScopeId := claimDefinitionScopeId
    activation := 1 }

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
  { initialState with
    control := .running claimInstanceId
    scopeOccurrences := [{ id := claimScopeOwner, parent := none }]
    tokens := [{ placeId := ⟨"place:Flow_ClaimReceived_Assess"⟩, owner := claimScopeOwner }]
    variables := { process := { bindings := [summary, unrelated] }, activities := [] }
    scopeActivations := [{ scopeId := claimDefinitionScopeId, count := 1 }] }

theorem seededReady_is_seeded_start :
    (let ready := (runStart startWithoutSummary).state
     { ready with variables :=
         { ready.variables with process := { bindings := [summary, unrelated] } } }) =
      seededReady := by
  decide +kernel

def claimTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := claimInstanceId
    elementId := ⟨"UserTask_AssessClaim"⟩
    activation := 1 }

def claimActivityOwner : ActivityOccurrenceId :=
  { processInstanceId := claimInstanceId
    activityElementId := ⟨"UserTask_AssessClaim"⟩
    activation := 1 }

def active : RuntimeState :=
  { initialState with
    control := .running claimInstanceId
    scopeOccurrences := [{ id := claimScopeOwner, parent := none }]
    waits :=
      [{ processInstanceId := claimInstanceId
         owner := claimScopeOwner
         task := { id := ⟨"UserTask_AssessClaim"⟩, name := some "Assess claim", metadata := none }
         activation := 1
         output := ⟨"place:Flow_AssessClaim_Recorded"⟩
         metadata := none }]
    activityOccurrences :=
      [{ processInstanceId := claimInstanceId
         activityElementId := ⟨"UserTask_AssessClaim"⟩
         activation := 1
         owner := claimScopeOwner
         body := .userTask claimTaskInstanceId
         attachedHandlers := [] }]
    variables :=
      { process := { bindings := [summary, unrelated] }
        activities :=
          [{ owner := .activityOccurrence claimActivityOwner
             bindings := [{ name := claimDirectInput.targetDataInputId, value := summary.value }] }] }
    activations := [{ taskId := ⟨"UserTask_AssessClaim"⟩, count := 1 }]
    scopeActivations := [{ scopeId := claimDefinitionScopeId, count := 1 }]
    activityActivations := [{ taskId := ⟨"UserTask_AssessClaim"⟩, count := 1 }] }

theorem active_is_the_admitted_activation :
    activateDataInputOutputUserTask? seededReady
      ⟨"place:Flow_ClaimReceived_Assess"⟩ ⟨"place:Flow_AssessClaim_Recorded"⟩
      ⟨"UserTask_AssessClaim"⟩ (some "Assess claim") claimDirectInput = some active := by
  decide +kernel

def completeClaim (commandId : String)
    (bindings : List VariableBinding) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ claimTaskInstanceId bindings

def decision (value : VariableValue) : VariableBinding :=
  { name := claimDirectOutput.sourceDataOutputId, value }

def approved : StimulusResult :=
  { outcome := .committed
    state :=
      { initialState with
        control := .completed claimInstanceId
        variables :=
          { process :=
              { bindings :=
                  [{ name := claimDirectOutput.targetPropertyId, value := .string "approve" },
                   summary, unrelated] }
            activities := [] }
        activations := [{ taskId := ⟨"UserTask_AssessClaim"⟩, count := 1 }]
        scopeActivations := [{ scopeId := claimDefinitionScopeId, count := 1 }]
        activityActivations := [{ taskId := ⟨"UserTask_AssessClaim"⟩, count := 1 }]
        endOccurrences := 1 }
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

theorem approved_is_completed_claim :
    applyStimulus scenarioClosureLimit claimProgram active
      (completeClaim "complete-claim" [decision (.string "approve")]) = approved := by
  decide +kernel

def refused (state : RuntimeState) : StimulusResult :=
  { outcome := .rejected
    state
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

end BpmnSemantics.ActivityDataInputOutputConformance
