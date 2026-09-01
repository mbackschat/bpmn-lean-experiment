import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Fixtures

/-! # Message Start Event conformance fixtures

This module owns the exact standards-only Message Start fixture shared by the independently elaborated admission, closure, identity-refusal, and scenario-ordering proof modules.
-/

namespace BpmnSemantics.MessageStartConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  messageStartProfileId

def channel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩
    ⟨"Message_ApprovalRequest"⟩

def wrongMessageChannel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩
    ⟨"Message_Wrong"⟩

def wrongInterfaceChannel : MessageChannel :=
  .operationMessage
    ⟨"Interface_Wrong"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩
    ⟨"Message_ApprovalRequest"⟩

def wrongInterfaceOperationChannel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_Wrong"⟩
    ⟨"Message_ApprovalRequest"⟩

def sourceIdentity : SourceIdentity :=
  { semanticProfile := profileId
    sourceId := ⟨"message-start-event"⟩
    sourceSha256 :=
      "254823e574c7ba8b69ff3e965a86cc579c3ccfcb42f23f0abb344aacc130099c" }

def processId : ProcessId :=
  ⟨"Process_MessageStart"⟩

def startEventId : NodeId :=
  ⟨"MessageStart_ApprovalRequest"⟩

def taskNodeId : NodeId :=
  ⟨"UserTask_Approve"⟩

def endEventId : NodeId :=
  ⟨"EndEvent_Approved"⟩

def startOutput : ControlPlaceId :=
  ⟨"place:Flow_StartToTask"⟩

def taskOutput : ControlPlaceId :=
  ⟨"place:Flow_TaskToEnd"⟩

def checkedProcess : CheckedProcess :=
  { identity := sourceIdentity
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [endEventId, startEventId, taskNodeId]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [⟨"Flow_StartToTask"⟩, ⟨"Flow_TaskToEnd"⟩]
    nodes :=
      [ .noneEndEvent endEventId
      , .messageStartEvent startEventId channel
      , .userTask taskNodeId (some "Approve") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_StartToTask"⟩
          sourceId := startEventId
          targetId := taskNodeId }
      , { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := taskNodeId
          targetId := endEventId } ] }

def expectedProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := profileId
        sourceId := sourceIdentity.sourceId
        sourceSha256 := sourceIdentity.sourceSha256 }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes := checkedProcess.definitionScopes
    operationScopes :=
      [ { operationId := ⟨"operation:EndEvent_Approved"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId := ⟨"operation:MessageStart_ApprovalRequest"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId := ⟨"operation:UserTask_Approve"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId :=
            ⟨"operation:complete-scope:scope:Process_MessageStart"⟩
          scopeId := rootDefinitionScopeId processId } ]
    controlPlaceScopes := rootSequenceFlowScopes processId
      [⟨"Flow_StartToTask"⟩, ⟨"Flow_TaskToEnd"⟩] |>.map
        fun ownership =>
          { controlPlaceId := flowControlPlaceId ownership.sequenceFlowId
            scopeId := ownership.scopeId }
    controlPlaces := checkedProcess.sequenceFlows.map
      CheckedSequenceFlow.toControlPlace
    operations :=
      [ .reachNoneEnd
          ⟨"operation:EndEvent_Approved"⟩
          { elementId := endEventId }
          taskOutput
      , .initiateMessage
          ⟨"operation:MessageStart_ApprovalRequest"⟩
          { elementId := startEventId }
          channel
          [startOutput]
      , .awaitUserTask
          ⟨"operation:UserTask_Approve"⟩
          { elementId := taskNodeId }
          startOutput
          taskOutput
          { id := ⟨taskNodeId.value⟩, name := some "Approve" }
      , .completeScope
          ⟨"operation:complete-scope:scope:Process_MessageStart"⟩
          { elementId := ⟨processId.value⟩ }
          (rootDefinitionScopeId processId)
          none ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def startOperationId : OperationId :=
  ⟨"operation:MessageStart_ApprovalRequest"⟩

def taskOperationId : OperationId :=
  ⟨"operation:UserTask_Approve"⟩

def instanceId : SemanticId :=
  ⟨"MessageStartInstance_1"⟩

def trigger : Stimulus :=
  .triggerMessageStart
    ⟨"trigger-message-start"⟩
    ⟨processId.value⟩
    instanceId
    ⟨startEventId.value⟩
    channel

private def requiredObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects
  , .variables
  , .enabledInteractions
  , .logicalTime ]

def scenarioForProgram (candidate : Program) (stimuli : List Stimulus) :
    Scenario :=
  { kind := .scenario
    id := ⟨"message-start-pairing"⟩
    profile := candidate.identity.semanticProfile
    bpmn :=
      { id := candidate.identity.sourceId
        relativePath := "message-start-pairing.bpmn"
        sha256 := candidate.identity.sourceSha256
        sourceOverlay := candidate.identity.sourceOverlay }
    stimuli
    observations := requiredObservations
    provenance :=
      { normativeRefs := []
        cibRevision := "not-applicable"
        cibRefs := [] } }

def rootOwner (id : SemanticId) : ScopeOccurrenceId :=
  rootScopeOccurrenceId id processId

def admittedState : RuntimeState :=
  (admitMessageStart? program initialState ⟨processId.value⟩ instanceId
    ⟨startEventId.value⟩ channel).getD initialState

def initiatedState : RuntimeState :=
  (step program admittedState startOperationId).getD initialState

def exactWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootOwner instanceId
    task := { id := ⟨taskNodeId.value⟩, name := some "Approve" }
    activation := 1
    output := taskOutput }

def waitingState : RuntimeState :=
  { admittedState with
    initiationPending := false
    waits := [exactWait]
    activations := [{ taskId := exactWait.task.id, count := 1 }] }

def noneStartInstanceId : SemanticId :=
  ⟨"NoneStartInstance_1"⟩

def noneStartAdmittedState : RuntimeState :=
  (runningProgramStartState? sequentialProgram noneStartInstanceId []).getD
    initialState

def noneStartInitiatedState : RuntimeState :=
  (step sequentialProgram noneStartAdmittedState
    ⟨"operation:StartEvent_1"⟩).getD initialState

def startIdentityRenaming : StartControlIdentityRenaming :=
  { leftInstanceId := instanceId
    rightInstanceId := noneStartInstanceId
    leftRootScopeId := rootDefinitionScopeId processId
    rightRootScopeId := rootDefinitionScopeId sequentialProgram.processId
    leftOutput := startOutput
    rightOutput := ⟨"place:Flow_StartToTask"⟩ }

end BpmnSemantics.MessageStartConformance
