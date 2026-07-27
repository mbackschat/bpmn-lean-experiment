import BpmnSemantics.SemanticProcess

/-! # Typed BPMN Error and interrupting boundary conformance

This module owns the direct Lean account for the exact A12-shaped caught-Error capsule. The profile-scoped CIB mapping rule applies a validated pre-error local patch through the committed output mapping before local cleanup and boundary routing.
-/

namespace BpmnSemantics.BoundaryErrorConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:a12-delegate:v1"
    handler := "createRelationshipLinkDelegate" }

def inputMappings : List VariableMapping :=
  [{ target := "relationshipModel"
     expression := .stringLiteral "RelationshipModel" }]

def outputMappings : List VariableMapping :=
  [{ target := "relationshipLinkId"
     expression := .localVariable "newLinkId" }]

def checkedRoute : CheckedBpmnErrorRoute :=
  { boundaryEventId := ⟨"BoundaryEvent_LinkLimitReached"⟩
    boundaryEventName := some "Link Limit Reached Boundary"
    attachedToRef := ⟨"CreateRelationshipLinkTask"⟩
    errorDefinitionId := ⟨"ErrorEventDefinition_LinkLimitReached"⟩
    errorElementId := ⟨"Error_LinkLimitReached"⟩
    errorName := some "Link Limit Reached"
    code := "LinkLimitReachedError"
    outputFlowId := ⟨"Flow_ErrorToUserTask"⟩ }

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"cibseven-2.0.0-a12-boundary-error-draft"⟩
        sourceId := ⟨"a12-boundary-error"⟩
        sourceSha256 :=
          "68ad931204e62da12494766393b380026addb1e230d5a3a64205e655831f62b6" }
    processId := ⟨"Process_BoundaryError"⟩
    nodes :=
      [ .serviceTask
          ⟨"CreateRelationshipLinkTask"⟩
          descriptor.protocol
          (.a12BoundaryError
            "http://camunda.org/schema/1.0/bpmn"
            "#{createRelationshipLinkDelegate}"
            "urn:bpmn-lean:a12-delegate:v1"
            "http://camunda.org/schema/1.0/bpmn"
            "relationshipModel"
            "RelationshipModel"
            "relationshipLinkId"
            "${newLinkId}")
          inputMappings
          outputMappings
          (some checkedRoute)
      , .noneEndEvent ⟨"EndEvent_AfterError"⟩
      , .noneEndEvent ⟨"EndEvent_Normal"⟩
      , .userTask
          ⟨"ExpectedUserTaskAfterBPMNError"⟩
          (some "Expected User Task After BPMN Error")
      , .noneStartEvent ⟨"StartEvent_None"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ErrorToUserTask"⟩
          sourceId := checkedRoute.boundaryEventId
          targetId := ⟨"ExpectedUserTaskAfterBPMNError"⟩ }
      , { id := ⟨"Flow_ServiceToEnd"⟩
          sourceId := ⟨"CreateRelationshipLinkTask"⟩
          targetId := ⟨"EndEvent_Normal"⟩ }
      , { id := ⟨"Flow_StartToService"⟩
          sourceId := ⟨"StartEvent_None"⟩
          targetId := ⟨"CreateRelationshipLinkTask"⟩ }
      , { id := ⟨"Flow_UserTaskToEnd"⟩
          sourceId := ⟨"ExpectedUserTaskAfterBPMNError"⟩
          targetId := ⟨"EndEvent_AfterError"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def effectId : EffectOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"CreateRelationshipLinkTask"⟩
    activation := 1 }

def taskId : UserTaskInstanceId :=
  { processInstanceId := effectId.processInstanceId
    elementId := ⟨"ExpectedUserTaskAfterBPMNError"⟩
    activation := 1 }

def errorResult (message : Option String) : EffectExecutionResult :=
  .bpmnError
    "LinkLimitReachedError"
    message
    [{ name := "newLinkId", value := .null }]

def route : BpmnErrorRoute :=
  { code := checkedRoute.code
    output := ⟨"place:Flow_ErrorToUserTask"⟩
    origin :=
      { boundaryEventId := checkedRoute.boundaryEventId
        errorDefinitionId := checkedRoute.errorDefinitionId
        errorElementId := checkedRoute.errorElementId
        sequenceFlowId := checkedRoute.outputFlowId } }

def effectWait : EffectWait :=
  { processInstanceId := effectId.processInstanceId
    elementId := ⟨effectId.elementId.value⟩
    activation := effectId.activation
    descriptor
    arguments :=
      [{ name := "relationshipModel"
         value := .string "RelationshipModel" }]
    outputMappings
    output := ⟨"place:Flow_ServiceToEnd"⟩
    bpmnErrorRoute := some route }

def waitingState : RuntimeState :=
  singletonEffectWaitingState effectWait

def startStimulus : Stimulus :=
  .startProcess
    ⟨"start-boundary-error"⟩
    ⟨"Process_BoundaryError"⟩
    effectId.processInstanceId

def scenario : Scenario :=
  { kind := .scenario
    id := ⟨"a12-boundary-error-caught"⟩
    profile := checkedProcess.identity.semanticProfile
    bpmn :=
      { id := checkedProcess.identity.sourceId
        relativePath := "scenarios/boundary-error/process.bpmn"
        sha256 := checkedProcess.identity.sourceSha256 }
    stimuli :=
      [ startStimulus
      , .completeEffect
          ⟨"complete-effect-sha256:49ddf71a5f8e23b59c039a65bd64a2ed16232c31a47790b2273e1b05c3c971d5"⟩
          effectId
          (errorResult (some "Link limit reached"))
      , .completeUserTaskInstance
          ⟨"complete-boundary-user-task"⟩
          taskId ]
    observations :=
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
    provenance :=
      { normativeRefs :=
          [ "BPMN 2.0.2 §10.3.1"
          , "BPMN 2.0.2 §10.4.3"
          , "BPMN 2.0.2 §13.5.3" ]
        cibRevision := "57ed69550f1c9c2619b9711d8877418bb084a371"
        cibRefs :=
          [ "CIB-AGR-0005"
          , "CIB-EXT-0003"
          , "CIB-EXT-0004"
          , "CIB-OP-0003"
          , "CIB-CFG-0004" ] } }

def expectedVariable : VariableBinding :=
  { name := "relationshipLinkId", value := .null }

def waitingObservation : StateObservation :=
  { instanceId := effectId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := effectId.elementId, kind := .effect, multiplicity := 1 }]
    openUserTasks := []
    openTimers := []
    openEffects :=
      [{ id := effectId
         descriptor
         arguments :=
           [{ name := "relationshipModel"
              value := .string "RelationshipModel" }] }]
    variables := []
    enabledInteractions := []
    logicalTimeMs := 0 }

def caughtObservation : StateObservation :=
  { instanceId := effectId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := taskId.elementId, kind := .userTask, multiplicity := 1 }]
    openUserTasks :=
      [{ id := taskId
         name := some "Expected User Task After BPMN Error"
         state := .active }]
    openTimers := []
    openEffects := []
    variables := [expectedVariable]
    enabledInteractions := [.completeUserTaskInstance taskId]
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { caughtObservation with
    status := .completed
    activeWaits := []
    openUserTasks := []
    enabledInteractions := [] }

def expectedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-boundary-error"⟩ .committed
  , .state waitingObservation
  , .command
      ⟨"complete-effect-sha256:49ddf71a5f8e23b59c039a65bd64a2ed16232c31a47790b2273e1b05c3c971d5"⟩
      .committed
  , .state caughtObservation
  , .command ⟨"complete-boundary-user-task"⟩ .committed
  , .state completedObservation ]

example : checkedWellFormed checkedProcess = true := by decide
example : programWellFormed program = true := by decide

theorem caught_error_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide

theorem null_patch_applies_the_profile_mapping :
    applyEffectResult
        [{ name := "relationshipModel"
           value := .string "RelationshipModel" }]
        outputMappings
        []
        (errorResult none) =
      some [expectedVariable] := by
  decide

theorem message_does_not_affect_caught_transition
    (first second : Option String) :
    applyEffectResult [] outputMappings [] (errorResult first) =
      applyEffectResult [] outputMappings [] (errorResult second) := by
  simp [applyEffectResult, applyEffectPatch, errorResult, outputMappings]

theorem mismatched_error_code_is_rejected
    (commandId : SemanticId) (submittedCode : String)
    (message : Option String)
    (mismatch : submittedCode ≠ checkedRoute.code) :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect commandId effectId
          (.bpmnError submittedCode message
            [{ name := "newLinkId", value := .null }])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact effect_result_route_failure_is_rejected
    program effectWait commandId
      (.bpmnError submittedCode message
        [{ name := "newLinkId", value := .null }])
      0
      (by
        have reversed : checkedRoute.code ≠ submittedCode :=
          Ne.symm mismatch
        simp [effectResultOutput, effectWait, route, reversed])

theorem error_route_and_success_route_are_distinct :
    let waiting :=
      (applyStimulus scenarioClosureLimit program initialState
        startStimulus).state
    let caught :=
      applyStimulus scenarioClosureLimit program waiting
        (.completeEffect ⟨"caught"⟩ effectId (errorResult none))
    let wrong :=
      applyStimulus scenarioClosureLimit program waiting
        (.completeEffect ⟨"wrong-success"⟩ effectId
          (.success [{ name := "newLinkId", value := .string "normal" }]))
    caught.state.waits.length = 1 ∧
      caught.state.endOccurrences = 0 ∧
      wrong.state.waits.length = 0 ∧
      wrong.state.endOccurrences = 1 := by
  decide

end BpmnSemantics.BoundaryErrorConformance
