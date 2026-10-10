import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.TransitionTrace

/-! Shared executable fixtures retain the conformance declaration bodies without importing their proofs. -/

namespace BpmnSemantics.CallActivityConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-called-process-call-activity-draft"⟩

def callerProcessId : ProcessId := ⟨"CallerProcess"⟩
def calledProcessId : ProcessId := ⟨"CalledProcess"⟩
def calledScopeId : DefinitionScopeId := ⟨"scope:Called"⟩
def callerScopeId : DefinitionScopeId := ⟨"scope:Caller"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"called-process-call-activity"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := callerProcessId
    definitionScopes :=
      [ { id := calledScopeId, parentScopeId := none,
          originElementId := ⟨calledProcessId.value⟩ }
      , { id := callerScopeId, parentScopeId := none,
          originElementId := ⟨callerProcessId.value⟩ } ]
    nodeScopes :=
      [ { nodeId := ⟨"A_CallerStart"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"B_Call"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"C_CallerTask"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"D_CallerEnd"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"E_CalledStart"⟩, scopeId := calledScopeId }
      , { nodeId := ⟨"F_CalledTask"⟩, scopeId := calledScopeId }
      , { nodeId := ⟨"G_CalledEnd"⟩, scopeId := calledScopeId } ]
    sequenceFlowScopes :=
      [ { sequenceFlowId := ⟨"F1_CallerStartCall"⟩, scopeId := callerScopeId }
      , { sequenceFlowId := ⟨"F2_CallCallerTask"⟩, scopeId := callerScopeId }
      , { sequenceFlowId := ⟨"F3_CallerTaskEnd"⟩, scopeId := callerScopeId }
      , { sequenceFlowId := ⟨"F4_CalledStartTask"⟩, scopeId := calledScopeId }
      , { sequenceFlowId := ⟨"F5_CalledTaskEnd"⟩, scopeId := calledScopeId } ]
    nodes :=
      [ .noneStartEvent ⟨"A_CallerStart"⟩
      , .callActivity ⟨"B_Call"⟩ calledProcessId
      , .userTask ⟨"C_CallerTask"⟩ (some "Caller task")
      , .noneEndEvent ⟨"D_CallerEnd"⟩
      , .noneStartEvent ⟨"E_CalledStart"⟩
      , .userTask ⟨"F_CalledTask"⟩ (some "Called task")
      , .noneEndEvent ⟨"G_CalledEnd"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"F1_CallerStartCall"⟩, sourceId := ⟨"A_CallerStart"⟩,
          targetId := ⟨"B_Call"⟩ }
      , { id := ⟨"F2_CallCallerTask"⟩, sourceId := ⟨"B_Call"⟩,
          targetId := ⟨"C_CallerTask"⟩ }
      , { id := ⟨"F3_CallerTaskEnd"⟩, sourceId := ⟨"C_CallerTask"⟩,
          targetId := ⟨"D_CallerEnd"⟩ }
      , { id := ⟨"F4_CalledStartTask"⟩, sourceId := ⟨"E_CalledStart"⟩,
          targetId := ⟨"F_CalledTask"⟩ }
      , { id := ⟨"F5_CalledTaskEnd"⟩, sourceId := ⟨"F_CalledTask"⟩,
          targetId := ⟨"G_CalledEnd"⟩ } ] }

def program : Program := lowerCheckedProcess checkedProcess

def callerInstanceId : SemanticId := ⟨"Caller:Instance:é"⟩
def calledInstanceId : SemanticId :=
  deriveCalledProcessInstanceId callerInstanceId ⟨"B_Call"⟩ 1

def calledTaskId : UserTaskInstanceId :=
  { processInstanceId := calledInstanceId
    elementId := ⟨"F_CalledTask"⟩
    activation := 1 }

def callerTaskId : UserTaskInstanceId :=
  { processInstanceId := callerInstanceId
    elementId := ⟨"C_CallerTask"⟩
    activation := 1 }

def start : Stimulus :=
  .startProcess ⟨"start-call"⟩ ⟨callerProcessId.value⟩ callerInstanceId []

def completeCalled : Stimulus :=
  .completeUserTaskInstance ⟨"complete-called"⟩ calledTaskId []

def completeCaller : Stimulus :=
  .completeUserTaskInstance ⟨"complete-caller"⟩ callerTaskId []

def calledWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState start

def callerWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program calledWaiting.state completeCalled

def completed : StimulusResult :=
  applyStimulus scenarioClosureLimit program callerWaiting.state completeCaller

end BpmnSemantics.CallActivityConformance
