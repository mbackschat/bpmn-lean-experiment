import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Configured Task conformance

This module owns the proved checkpoint for one configured Task lowered to the existing effect wait.
It preserves a distinct checked-source constructor while keeping the runtime operation, stimulus,
state, and observation contracts unchanged.
-/

namespace BpmnSemantics.ConfiguredTaskConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  configuredTaskCheckpointProfileId

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation := "urn:bpmn-lean:effect-operation:probe-v1" }

def driftedDescriptor : EffectDescriptor :=
  { descriptor with operation := "urn:bpmn-lean:effect-operation:wrong-v1" }

def processId : ProcessId := ⟨"Process_ConfiguredTask"⟩
def configuredTaskId : NodeId := ⟨"ConfiguredTask_Probe"⟩
def userTaskId : NodeId := ⟨"UserTask_Review"⟩
def startId : NodeId := ⟨"StartEvent_1"⟩
def endId : NodeId := ⟨"EndEvent_1"⟩

def configuredInput : ControlPlaceId := ⟨"place:Flow_StartToConfigured"⟩
def configuredOutput : ControlPlaceId := ⟨"place:Flow_ConfiguredToUser"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"configured-task-source-test"⟩
        sourceSha256 :=
          "0e50a82a24ac4f2a61e1ddafcc2cf4d2e71b7beffcfb6c06bd5120ce100934ba" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [configuredTaskId, endId, startId, userTaskId]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_ConfiguredToUser"⟩
      , ⟨"Flow_StartToConfigured"⟩
      , ⟨"Flow_UserToEnd"⟩ ]
    nodes :=
      [ .configuredTask configuredTaskId descriptor
      , .noneEndEvent endId
      , .noneStartEvent startId
      , .userTask userTaskId (some "Review") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ConfiguredToUser"⟩
          sourceId := configuredTaskId
          targetId := userTaskId }
      , { id := ⟨"Flow_StartToConfigured"⟩
          sourceId := startId
          targetId := configuredTaskId }
      , { id := ⟨"Flow_UserToEnd"⟩
          sourceId := userTaskId
          targetId := endId } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

/-- Wrong descriptor binding is already shaped at checked source and must refuse before runtime. -/
def descriptorDriftCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun node =>
      if node.id = configuredTaskId then
        .configuredTask configuredTaskId driftedDescriptor
      else node }

/-- Wrong pass-through lowering makes the trailing User Task reachable without effect completion. -/
def passThroughProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .awaitEffect id origin input output _ _ =>
          .duplicate id origin input [output]
      | other => other }

def instanceId : SemanticId := ⟨"ConfiguredTaskInstance_1"⟩

def effectId : EffectOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨configuredTaskId.value⟩
    activation := 1 }

def taskOccurrenceId : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨userTaskId.value⟩
    activation := 1 }

def startStimulus : Stimulus :=
  .startProcess ⟨"start-configured-task"⟩ ⟨processId.value⟩ instanceId []

def completeEffectStimulus : Stimulus :=
  .completeEffect ⟨"complete-configured-effect"⟩ effectId (.success [])

def completeUserTaskStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-trailing-task"⟩ taskOccurrenceId []

def startedResult : StimulusResult :=
  applyStimulus 2 program initialState startStimulus

def effectCompletedResult : StimulusResult :=
  applyStimulus 1 program startedResult.state completeEffectStimulus

def completedResult : StimulusResult :=
  applyStimulus 2 program effectCompletedResult.state completeUserTaskStimulus

def descriptorDriftProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .awaitEffect id origin input output effect route =>
          .awaitEffect id origin input output
            { effect with descriptor := driftedDescriptor } route
      | other => other }

def reversedTaskOrder : CheckedProcess :=
  { checkedProcess with
    sequenceFlows :=
      [ { id := ⟨"Flow_ConfiguredToUser"⟩
          sourceId := userTaskId
          targetId := configuredTaskId }
      , { id := ⟨"Flow_StartToConfigured"⟩
          sourceId := startId
          targetId := userTaskId }
      , { id := ⟨"Flow_UserToEnd"⟩
          sourceId := configuredTaskId
          targetId := endId } ] }

def serviceComparisonCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun node =>
      match node with
      | .configuredTask id effectDescriptor =>
          .serviceTask id effectDescriptor [] [] none
      | other => other }

theorem configured_and_service_tasks_are_distinct :
    CheckedNode.configuredTask configuredTaskId descriptor ≠
      CheckedNode.serviceTask configuredTaskId descriptor [] [] none := by
  decide +kernel

/-- Exact checked topology, descriptor, local arity, and checkpoint capability admit together. -/
theorem checked_binding_topology_and_arity_are_exact :
    checkedWellFormed checkedProcess = true ∧
      checkedProfileCapabilitiesValid checkedProcess = true ∧
      (checkedProcess.sequenceFlows.filter fun flow =>
        flow.targetId = configuredTaskId).length = 1 ∧
      (checkedProcess.sequenceFlows.filter fun flow =>
        flow.sourceId = configuredTaskId).length = 1 ∧
      checkedProcess.sequenceFlows.map (fun flow =>
        (flow.sourceId, flow.targetId)) =
        [ (configuredTaskId, userTaskId)
        , (startId, configuredTaskId)
        , (userTaskId, endId) ] := by
  decide +kernel

/-- Lowering emits the existing effect operation with exact origin, endpoints, empty maps, and no Error route. -/
theorem configured_task_lowering_is_endpoint_only :
    (program.operations.filter fun operation =>
      operation.id = nodeOperationId configuredTaskId) =
      [ .awaitEffect
          (nodeOperationId configuredTaskId)
          { elementId := configuredTaskId }
          configuredInput
          configuredOutput
          { elementId := configuredTaskId
            descriptor
            inputMappings := []
            outputMappings := [] }
          none ] ∧
      programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true := by
  decide +kernel

/-- A checked Service Task stays a different constructor even though normalized lowering agrees exactly. -/
theorem normalized_service_task_lowering_preserves_checked_distinction :
    serviceComparisonCheckedProcess.nodes ≠ checkedProcess.nodes ∧
      lowerCheckedProcess serviceComparisonCheckedProcess = program := by
  decide +kernel

/-- Descriptor and topology drift refuse at profile admission, before any runtime state exists. -/
theorem descriptor_and_order_drift_refuse_before_runtime :
    checkedProfileCapabilitiesValid descriptorDriftCheckedProcess = false ∧
      checkedWellFormed descriptorDriftCheckedProcess = false ∧
      programProfileCapabilitiesValid descriptorDriftProgram = false ∧
      checkedProfileCapabilitiesValid reversedTaskOrder = false ∧
      checkedWellFormed reversedTaskOrder = false := by
  decide +kernel

/-- Start closes in two uniquely enabled steps to the sole stable configured effect wait. -/
theorem start_closure_is_exact_and_stable :
    let admitted :=
      (runningProgramStartState? program instanceId []).getD initialState
    let initiated :=
      (step program admitted (nodeOperationId startId)).getD initialState
    enabledInternalOperationCount program admitted = 1 ∧
      enabledInternalOperationCount program initiated = 1 ∧
      startedResult.outcome = .committed ∧
      startedResult.internalStepBoundExceeded = false ∧
      startedResult.ambiguousInternalChoice = false ∧
      effectWaitMultiplicity startedResult.state configuredTaskId = 1 ∧
      waitMultiplicity startedResult.state ⟨userTaskId.value⟩ = 0 ∧
      enabledInternalOperationCount program startedResult.state = 0 ∧
      stableStateResumable startedResult.state = true ∧
      (applyStimulus 1 program initialState startStimulus).internalStepBoundExceeded =
        true := by
  decide +kernel

/-- Exact effect completion closes in one uniquely enabled step to the sole stable User Task wait. -/
theorem effect_completion_closure_is_exact_and_stable :
    let offered :=
      (completeEffect startedResult.state effectId (.success [])).getD initialState
    enabledInternalOperationCount program offered = 1 ∧
      effectCompletedResult.outcome = .committed ∧
      effectCompletedResult.internalStepBoundExceeded = false ∧
      effectCompletedResult.ambiguousInternalChoice = false ∧
      effectWaitMultiplicity effectCompletedResult.state configuredTaskId = 0 ∧
      waitMultiplicity effectCompletedResult.state ⟨userTaskId.value⟩ = 1 ∧
      enabledInternalOperationCount program effectCompletedResult.state = 0 ∧
      stableStateResumable effectCompletedResult.state = true ∧
      (applyStimulus 0 program startedResult.state
        completeEffectStimulus).internalStepBoundExceeded = true := by
  decide +kernel

/-- User Task completion closes through None End and existing root scope completion in exactly two steps. -/
theorem user_task_completion_closure_is_exact :
    let offered :=
      (completeUserTask effectCompletedResult.state instanceId
        ⟨userTaskId.value⟩ 1).getD
        initialState
    let reachedEnd :=
      (step program offered (nodeOperationId endId)).getD initialState
    enabledInternalOperationCount program offered = 1 ∧
      enabledInternalOperationCount program reachedEnd = 1 ∧
      completedResult.outcome = .committed ∧
      completedResult.state.control = .completed instanceId ∧
      completedResult.internalStepBoundExceeded = false ∧
      completedResult.ambiguousInternalChoice = false ∧
      stableStateResumable completedResult.state = true ∧
      (applyStimulus 1 program effectCompletedResult.state
        completeUserTaskStimulus).internalStepBoundExceeded = true := by
  decide +kernel

/-- Effect completion admits only the exact occurrence identity and preserves the stable state byte-for-byte otherwise. -/
theorem effect_occurrence_identity_mismatch_rejects_exactly :
    let wrongActivation := { effectId with activation := 2 }
    let wrongElement := { effectId with elementId := ⟨"OtherTask"⟩ }
    let wrongInstance :=
      { effectId with processInstanceId := ⟨"OtherInstance"⟩ }
    applyStimulus scenarioClosureLimit program startedResult.state
        (.completeEffect ⟨"wrong-activation"⟩ wrongActivation (.success [])) =
      { outcome := .rejected
        state := startedResult.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } ∧
      applyStimulus scenarioClosureLimit program startedResult.state
          (.completeEffect ⟨"wrong-element"⟩ wrongElement (.success [])) =
        { outcome := .rejected
          state := startedResult.state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      applyStimulus scenarioClosureLimit program startedResult.state
          (.completeEffect ⟨"wrong-instance"⟩ wrongInstance (.success [])) =
        { outcome := .rejected
          state := startedResult.state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      applyStimulus scenarioClosureLimit program effectCompletedResult.state
          (.completeEffect ⟨"stale"⟩ effectId (.success [])) =
        { outcome := .rejected
          state := effectCompletedResult.state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      applyStimulus scenarioClosureLimit program initialState
          (.completeEffect ⟨"not-running"⟩ effectId (.success [])) =
        { outcome := .rejected
          state := initialState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

/-- The realistic pass-through mutation exposes the trailing User Task at start and erases the effect wait. -/
theorem pass_through_mutation_reaches_public_discriminator :
    let wrong := applyStimulus 3 passThroughProgram initialState startStimulus
    effectWaitMultiplicity wrong.state configuredTaskId = 0 ∧
      waitMultiplicity wrong.state ⟨userTaskId.value⟩ = 1 ∧
      effectWaitMultiplicity startedResult.state configuredTaskId = 1 ∧
      waitMultiplicity startedResult.state ⟨userTaskId.value⟩ = 0 ∧
      (observeStableState passThroughProgram wrong.state).map (fun snapshot =>
        (snapshot.openEffects.length, snapshot.openUserTasks.length)) =
          some (0, 1) ∧
      (observeStableState program startedResult.state).map (fun snapshot =>
        (snapshot.openEffects.length, snapshot.openUserTasks.length)) =
          some (1, 0) := by
  decide +kernel

end BpmnSemantics.ConfiguredTaskConformance
