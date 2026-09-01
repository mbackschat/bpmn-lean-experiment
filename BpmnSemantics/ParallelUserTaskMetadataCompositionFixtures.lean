import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.TransitionTrace

/-! # Parallel User Task metadata composition fixtures

Shared exact-process and runtime fixtures for the proved composition checkpoint over the existing balanced two-branch Parallel Gateway control account and passive User Task assignment/form metadata.
-/

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def processId : ProcessId := ⟨"Process_ParallelUserTaskMetadata"⟩

def instanceId : SemanticId := ⟨"Instance_ParallelUserTaskMetadata"⟩

def contentTaskId : TaskDefinitionId := ⟨"UserTask_ContentReview"⟩

def riskTaskId : TaskDefinitionId := ⟨"UserTask_RiskReview"⟩

def contentMetadata : UserTaskMetadata :=
  { assignment :=
      { candidates := [{ kind := .group, id := "reviewers" }] }
    form :=
      some ({ fields := [{ key := "contentApproved", type := .boolean }] } :
        UserTaskFormMetadata) }

def riskMetadata : UserTaskMetadata :=
  { assignment :=
      { candidates := [{ kind := .group, id := "reviewers" }] }
    form :=
      some ({ fields := [{ key := "riskApproved", type := .boolean }] } :
        UserTaskFormMetadata) }

def contentTask : UserTaskDefinition :=
  { id := contentTaskId
    name := some "Review content"
    metadata := some contentMetadata }

def riskTask : UserTaskDefinition :=
  { id := riskTaskId
    name := some "Review risk"
    metadata := some riskMetadata }

def compositionCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := parallelUserTaskMetadataCheckpointProfileId
        sourceId := ⟨"parallel-user-task-metadata-composition"⟩
        sourceSha256 :=
          "91494fe36496b343d50e1851f1d0b6dda8212ac358f3a1f9bc0833af2ea6c605" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"EndEvent_1"⟩, ⟨"Gateway_Fork"⟩, ⟨"Gateway_Join"⟩
      , ⟨"StartEvent_1"⟩, ⟨"UserTask_ContentReview"⟩
      , ⟨"UserTask_RiskReview"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_ContentToJoin"⟩, ⟨"Flow_ForkToContent"⟩
      , ⟨"Flow_ForkToRisk"⟩, ⟨"Flow_JoinToEnd"⟩
      , ⟨"Flow_RiskToJoin"⟩, ⟨"Flow_StartToFork"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .parallelGateway ⟨"Gateway_Fork"⟩ .diverging
      , .parallelGateway ⟨"Gateway_Join"⟩ .converging
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .userTask ⟨"UserTask_ContentReview"⟩
          (some "Review content") (some contentMetadata)
      , .userTask ⟨"UserTask_RiskReview"⟩
          (some "Review risk") (some riskMetadata) ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ContentToJoin"⟩
          sourceId := ⟨"UserTask_ContentReview"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_ForkToContent"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_ContentReview"⟩ }
      , { id := ⟨"Flow_ForkToRisk"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_RiskReview"⟩ }
      , { id := ⟨"Flow_JoinToEnd"⟩
          sourceId := ⟨"Gateway_Join"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_RiskToJoin"⟩
          sourceId := ⟨"UserTask_RiskReview"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_StartToFork"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"Gateway_Fork"⟩ } ] }

def compositionProgram : Program :=
  lowerCheckedProcess compositionCheckedProcess

private def eraseCheckedMetadata (source : CheckedProcess) : CheckedProcess :=
  { source with
    identity :=
      { source.identity with semanticProfile := ⟨"parallel-fork-join-draft"⟩ }
    nodes := source.nodes.map fun
      | .userTask id name _ => .userTask id name none
      | node => node }

def erasedCheckedProcess : CheckedProcess :=
  eraseCheckedMetadata compositionCheckedProcess

def erasedProgram : Program :=
  lowerCheckedProcess erasedCheckedProcess

def startStimulus : Stimulus :=
  .startProcess ⟨"start-parallel-metadata"⟩ ⟨processId.value⟩ instanceId []

def taskInstanceId (taskId : TaskDefinitionId) : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨taskId.value⟩
    activation := 1 }

def completionStimulus (commandId : String) (taskId : TaskDefinitionId)
    (submittedValues : List VariableBinding) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ (taskInstanceId taskId) submittedValues

def contentPatch : List VariableBinding :=
  [{ name := "contentApproved", value := .boolean true }]

def riskPatch : List VariableBinding :=
  [{ name := "riskApproved", value := .boolean true }]

def compositionStarted : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram initialState startStimulus

def erasedStarted : StimulusResult :=
  applyStimulus scenarioClosureLimit erasedProgram initialState startStimulus

def contentWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootScopeOccurrenceId instanceId processId
    task := contentTask
    activation := 1
    output := ⟨"place:Flow_ContentToJoin"⟩
    metadata := some contentMetadata }

def riskWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootScopeOccurrenceId instanceId processId
    task := riskTask
    activation := 1
    output := ⟨"place:Flow_RiskToJoin"⟩
    metadata := some riskMetadata }

def contentFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-content" contentTaskId contentPatch)

def riskFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-risk" riskTaskId riskPatch)

def contentThenRisk : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram contentFirst.state
    (completionStimulus "complete-risk" riskTaskId riskPatch)

def riskThenContent : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram riskFirst.state
    (completionStimulus "complete-content" contentTaskId contentPatch)

end BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
