module

import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.SemanticProcess.InternalExecutionFrontier

/-! # Terminate End Event fixtures

This module owns the exact checked graph, independent expected program, and synthetic root program used by the proved Terminate End checkpoint. The representative source is one nested parallel Trigger/Sibling region followed by one Outer User Task. The root program exercises the same generic operation without registering a second source profile. The expected program is separate from lowering so the exact-lowering law can detect a changed result, as required by AA-25 in the assurance architecture repair proposal.
-/

@[expose] public section

namespace BpmnSemantics.TerminateEndEventFixtures

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId := terminateEndCheckpointProfileId

def processId : ProcessId := ⟨"Process_Terminate"⟩
def rootScopeId : DefinitionScopeId := ⟨"scope:Process_Terminate"⟩
def childScopeId : DefinitionScopeId := ⟨"scope:SubProcess_Terminate"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"terminate-end-checkpoint"⟩
        sourceSha256 :=
          "1111111111111111111111111111111111111111111111111111111111111111" }
    processId
    definitionScopes :=
      [ { id := rootScopeId, parentScopeId := none
          originElementId := ⟨processId.value⟩ }
      , { id := childScopeId, parentScopeId := some rootScopeId
          originElementId := ⟨"H_SubProcess"⟩ } ]
    nodeScopes :=
      [ { nodeId := ⟨"A_ChildEnd"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"B_ChildFork"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"C_ChildStart"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"D_OuterEnd"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"E_OuterTask"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"F_RootStart"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"G_Sibling"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"H_SubProcess"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"I_Terminate"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"J_Trigger"⟩, scopeId := childScopeId } ]
    sequenceFlowScopes :=
      [ { sequenceFlowId := ⟨"Flow_ChildForkSibling"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildForkTrigger"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildStartFork"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_OuterEnd"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_RootStartSubProcess"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_SiblingEnd"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_SubProcessOuter"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_TriggerTerminate"⟩, scopeId := childScopeId } ]
    nodes :=
      [ .noneEndEvent ⟨"A_ChildEnd"⟩
      , .parallelGateway ⟨"B_ChildFork"⟩ .diverging
      , .noneStartEvent ⟨"C_ChildStart"⟩
      , .noneEndEvent ⟨"D_OuterEnd"⟩
      , .userTask ⟨"E_OuterTask"⟩ (some "Outer")
      , .noneStartEvent ⟨"F_RootStart"⟩
      , .userTask ⟨"G_Sibling"⟩ (some "Sibling")
      , .embeddedSubProcess ⟨"H_SubProcess"⟩ childScopeId
      , .terminateEndEvent ⟨"I_Terminate"⟩
      , .userTask ⟨"J_Trigger"⟩ (some "Trigger") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ChildForkSibling"⟩
          sourceId := ⟨"B_ChildFork"⟩, targetId := ⟨"G_Sibling"⟩ }
      , { id := ⟨"Flow_ChildForkTrigger"⟩
          sourceId := ⟨"B_ChildFork"⟩, targetId := ⟨"J_Trigger"⟩ }
      , { id := ⟨"Flow_ChildStartFork"⟩
          sourceId := ⟨"C_ChildStart"⟩, targetId := ⟨"B_ChildFork"⟩ }
      , { id := ⟨"Flow_OuterEnd"⟩
          sourceId := ⟨"E_OuterTask"⟩, targetId := ⟨"D_OuterEnd"⟩ }
      , { id := ⟨"Flow_RootStartSubProcess"⟩
          sourceId := ⟨"F_RootStart"⟩, targetId := ⟨"H_SubProcess"⟩ }
      , { id := ⟨"Flow_SiblingEnd"⟩
          sourceId := ⟨"G_Sibling"⟩, targetId := ⟨"A_ChildEnd"⟩ }
      , { id := ⟨"Flow_SubProcessOuter"⟩
          sourceId := ⟨"H_SubProcess"⟩, targetId := ⟨"E_OuterTask"⟩ }
      , { id := ⟨"Flow_TriggerTerminate"⟩
          sourceId := ⟨"J_Trigger"⟩, targetId := ⟨"I_Terminate"⟩ } ] }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := profileId
        sourceId := ⟨"terminate-end-checkpoint"⟩
        sourceSha256 := "1111111111111111111111111111111111111111111111111111111111111111" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes :=
      [{ id := rootScopeId, parentScopeId := none, originElementId := ⟨"Process_Terminate"⟩ },
       { id := childScopeId, parentScopeId := some rootScopeId, originElementId := ⟨"H_SubProcess"⟩ }]
    operationScopes :=
      [("A_ChildEnd", childScopeId), ("B_ChildFork", childScopeId),
       ("D_OuterEnd", rootScopeId), ("E_OuterTask", rootScopeId), ("F_RootStart", rootScopeId),
       ("G_Sibling", childScopeId), ("H_SubProcess", rootScopeId), ("I_Terminate", childScopeId),
       ("J_Trigger", childScopeId), ("complete-scope:scope:Process_Terminate", rootScopeId),
       ("complete-scope:scope:SubProcess_Terminate", childScopeId)].map fun (name, scopeId) =>
        { operationId := ⟨"operation:" ++ name⟩, scopeId }
    controlPlaceScopes :=
      [("Flow_ChildForkSibling", childScopeId), ("Flow_ChildForkTrigger", childScopeId),
       ("Flow_ChildStartFork", childScopeId), ("Flow_OuterEnd", rootScopeId),
       ("Flow_RootStartSubProcess", rootScopeId), ("Flow_SiblingEnd", childScopeId),
       ("Flow_SubProcessOuter", rootScopeId), ("Flow_TriggerTerminate", childScopeId)].map fun (name, scopeId) =>
        { controlPlaceId := ⟨"place:" ++ name⟩, scopeId }
    controlPlaces := ["Flow_ChildForkSibling", "Flow_ChildForkTrigger", "Flow_ChildStartFork",
      "Flow_OuterEnd", "Flow_RootStartSubProcess", "Flow_SiblingEnd", "Flow_SubProcessOuter",
      "Flow_TriggerTerminate"].map fun name => { id := ⟨"place:" ++ name⟩, origin := ⟨⟨name⟩⟩ }
    operations :=
      [ .reachNoneEnd ⟨"operation:A_ChildEnd"⟩ ⟨⟨"A_ChildEnd"⟩⟩ ⟨"place:Flow_SiblingEnd"⟩
      , .duplicate ⟨"operation:B_ChildFork"⟩ ⟨⟨"B_ChildFork"⟩⟩ ⟨"place:Flow_ChildStartFork"⟩
          [⟨"place:Flow_ChildForkSibling"⟩, ⟨"place:Flow_ChildForkTrigger"⟩]
      , .reachNoneEnd ⟨"operation:D_OuterEnd"⟩ ⟨⟨"D_OuterEnd"⟩⟩ ⟨"place:Flow_OuterEnd"⟩
      , .awaitUserTask ⟨"operation:E_OuterTask"⟩ ⟨⟨"E_OuterTask"⟩⟩
          ⟨"place:Flow_SubProcessOuter"⟩ ⟨"place:Flow_OuterEnd"⟩ { id := ⟨"E_OuterTask"⟩, name := some "Outer" }
      , .initiate ⟨"operation:F_RootStart"⟩ ⟨⟨"F_RootStart"⟩⟩ ⟨"place:Flow_RootStartSubProcess"⟩
      , .awaitUserTask ⟨"operation:G_Sibling"⟩ ⟨⟨"G_Sibling"⟩⟩
          ⟨"place:Flow_ChildForkSibling"⟩ ⟨"place:Flow_SiblingEnd"⟩ { id := ⟨"G_Sibling"⟩, name := some "Sibling" }
      , .enterScope ⟨"operation:H_SubProcess"⟩ ⟨⟨"H_SubProcess"⟩⟩
          ⟨"place:Flow_RootStartSubProcess"⟩ ⟨"place:Flow_ChildStartFork"⟩ childScopeId
      , .terminateScope ⟨"operation:I_Terminate"⟩ ⟨⟨"I_Terminate"⟩⟩ ⟨"place:Flow_TriggerTerminate"⟩ childScopeId
      , .awaitUserTask ⟨"operation:J_Trigger"⟩ ⟨⟨"J_Trigger"⟩⟩
          ⟨"place:Flow_ChildForkTrigger"⟩ ⟨"place:Flow_TriggerTerminate"⟩ { id := ⟨"J_Trigger"⟩, name := some "Trigger" }
      , .completeScope ⟨"operation:complete-scope:scope:Process_Terminate"⟩ ⟨⟨"Process_Terminate"⟩⟩ rootScopeId none
      , .completeScope ⟨"operation:complete-scope:scope:SubProcess_Terminate"⟩ ⟨⟨"H_SubProcess"⟩⟩
          childScopeId (some ⟨"place:Flow_SubProcessOuter"⟩) ] }

def semanticInstanceId : SemanticId := ⟨"TerminateInstance"⟩

def startStimulus : Stimulus :=
  .startProcess ⟨"command:start"⟩ ⟨processId.value⟩ semanticInstanceId []

def triggerOccurrence : UserTaskInstanceId :=
  { processInstanceId := semanticInstanceId
    elementId := ⟨"J_Trigger"⟩
    activation := 1 }

def siblingOccurrence : UserTaskInstanceId :=
  { processInstanceId := semanticInstanceId
    elementId := ⟨"G_Sibling"⟩
    activation := 1 }

def outerOccurrence : UserTaskInstanceId :=
  { processInstanceId := semanticInstanceId
    elementId := ⟨"E_OuterTask"⟩
    activation := 1 }

def completeTrigger : Stimulus :=
  .completeUserTaskInstance ⟨"command:trigger"⟩ triggerOccurrence []

def completeSibling : Stimulus :=
  .completeUserTaskInstance ⟨"command:sibling"⟩ siblingOccurrence []

def completeOuter : Stimulus :=
  .completeUserTaskInstance ⟨"command:outer"⟩ outerOccurrence []

def rootSyntheticScopeId : DefinitionScopeId := ⟨"scope:RootSynthetic"⟩
def rootSyntheticInput : ControlPlaceId := ⟨"place:Flow_RootTerminate"⟩

def rootSyntheticProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := profileId
        sourceId := ⟨"terminate-root-synthetic"⟩
        sourceSha256 :=
          "2222222222222222222222222222222222222222222222222222222222222222" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"RootSynthetic"⟩
    definitionScopes :=
      [{ id := rootSyntheticScopeId, parentScopeId := none
         originElementId := ⟨"RootSynthetic"⟩ }]
    operationScopes :=
      [ { operationId := ⟨"operation:RootStart"⟩, scopeId := rootSyntheticScopeId }
      , { operationId := ⟨"operation:RootTerminate"⟩, scopeId := rootSyntheticScopeId }
      , { operationId := ⟨"operation:complete-scope:scope:RootSynthetic"⟩
          scopeId := rootSyntheticScopeId } ]
    controlPlaceScopes :=
      [{ controlPlaceId := rootSyntheticInput, scopeId := rootSyntheticScopeId }]
    controlPlaces :=
      [{ id := rootSyntheticInput
         origin := { elementId := ⟨"Flow_RootTerminate"⟩ } }]
    operations :=
      [ .initiate ⟨"operation:RootStart"⟩ { elementId := ⟨"RootStart"⟩ }
          rootSyntheticInput
      , .terminateScope ⟨"operation:RootTerminate"⟩
          { elementId := ⟨"RootTerminate"⟩ } rootSyntheticInput rootSyntheticScopeId
      , .completeScope ⟨"operation:complete-scope:scope:RootSynthetic"⟩
          { elementId := ⟨"RootSynthetic"⟩ } rootSyntheticScopeId none ] }

def rootSyntheticOwner : ScopeOccurrenceId :=
  { processInstanceId := semanticInstanceId
    definitionScopeId := rootSyntheticScopeId
    activation := 1 }

def rootSyntheticOfferedState : RuntimeState :=
  { initialState with
    control := .running semanticInstanceId
    scopeOccurrences := [{ id := rootSyntheticOwner, parent := none }]
    tokens := [{ placeId := rootSyntheticInput, owner := rootSyntheticOwner }]
    scopeActivations := [{ scopeId := rootSyntheticScopeId, count := 1 }] }

end BpmnSemantics.TerminateEndEventFixtures
