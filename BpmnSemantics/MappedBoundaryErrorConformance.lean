import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Typed BPMN Error and interrupting boundary conformance

This module owns the direct Lean account for the exact mapped boundary-Error capsule. The profile-scoped CIB mapping rule applies a validated pre-error local patch through the committed output mapping before local cleanup and boundary routing.
-/

namespace BpmnSemantics.MappedBoundaryErrorConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation :=
      "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1" }

def inputMappings : List VariableMapping :=
  [{ target := "requestValue"
     expression := .stringLiteral "example-input" }]

def outputMappings : List VariableMapping :=
  [{ target := "resultValue"
     expression := .localVariable "result" }]

def checkedRoute : CheckedBpmnErrorRoute :=
  { boundaryEventId := ⟨"BoundaryEvent_MappedBusinessError"⟩
    boundaryEventName := some "Mapped Business Error Boundary"
    attachedToRef := ⟨"MappedBoundaryEffectTask"⟩
    errorDefinitionId := ⟨"ErrorEventDefinition_MappedBusinessError"⟩
    errorElementId := ⟨"Error_MappedBusinessError"⟩
    errorName := some "Mapped Business Error"
    code := "MappedBusinessError"
    outputFlowId := ⟨"Flow_ErrorToReviewMappedError"⟩ }

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile :=
          ⟨"cibseven-2.0.0-mapped-boundary-error-service-task-draft"⟩
        sourceId := ⟨"mapped-boundary-error-service-task"⟩
        sourceOverlay := none
        sourceSha256 :=
          "0102c7af3c934157dc235485e956f49ec166c16ea2d503bb2ab5a14ad1714386" }
    processId := ⟨"Process_MappedBoundaryError"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_MappedBoundaryError"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_MappedBoundaryError"⟩
      [ ⟨"EndEvent_AfterMappedError"⟩, ⟨"EndEvent_Normal"⟩
      , ⟨"MappedBoundaryEffectTask"⟩, ⟨"ReviewMappedError"⟩
      , ⟨"StartEvent_MappedBoundaryError"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_MappedBoundaryError"⟩
      [ ⟨"Flow_ErrorToReviewMappedError"⟩
      , ⟨"Flow_MappedBoundaryEffectToEnd"⟩
      , ⟨"Flow_ReviewMappedErrorToEnd"⟩
      , ⟨"Flow_StartToMappedBoundaryEffect"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_AfterMappedError"⟩
      , .noneEndEvent ⟨"EndEvent_Normal"⟩
      , .serviceTask
          ⟨"MappedBoundaryEffectTask"⟩
          descriptor
          inputMappings
          outputMappings
          (some checkedRoute)
      , .userTask
          ⟨"ReviewMappedError"⟩
          (some "ReviewMappedError")
      , .noneStartEvent ⟨"StartEvent_MappedBoundaryError"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ErrorToReviewMappedError"⟩
          sourceId := checkedRoute.boundaryEventId
          targetId := ⟨"ReviewMappedError"⟩ }
      , { id := ⟨"Flow_MappedBoundaryEffectToEnd"⟩
          sourceId := ⟨"MappedBoundaryEffectTask"⟩
          targetId := ⟨"EndEvent_Normal"⟩ }
      , { id := ⟨"Flow_ReviewMappedErrorToEnd"⟩
          sourceId := ⟨"ReviewMappedError"⟩
          targetId := ⟨"EndEvent_AfterMappedError"⟩ }
      , { id := ⟨"Flow_StartToMappedBoundaryEffect"⟩
          sourceId := ⟨"StartEvent_MappedBoundaryError"⟩
          targetId := ⟨"MappedBoundaryEffectTask"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def effectId : EffectOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"MappedBoundaryEffectTask"⟩
    activation := 1 }

def taskId : UserTaskInstanceId :=
  { processInstanceId := effectId.processInstanceId
    elementId := ⟨"ReviewMappedError"⟩
    activation := 1 }

def errorResult (message : Option String) : EffectExecutionResult :=
  .bpmnError
    "MappedBusinessError"
    message
    [{ name := "result", value := .null }]

def route : BpmnErrorRoute :=
  { code := checkedRoute.code
    output := ⟨"place:Flow_ErrorToReviewMappedError"⟩
    origin :=
      { boundaryEventId := checkedRoute.boundaryEventId
        errorDefinitionId := checkedRoute.errorDefinitionId
        errorElementId := checkedRoute.errorElementId
        sequenceFlowId := checkedRoute.outputFlowId } }

def effectWait : EffectWait :=
  { processInstanceId := effectId.processInstanceId
    owner := rootScopeOccurrenceId effectId.processInstanceId program.processId
    elementId := ⟨effectId.elementId.value⟩
    activation := effectId.activation
    descriptor
    arguments :=
      [{ name := "requestValue"
         value := .string "example-input" }]
    outputMappings
    output := ⟨"place:Flow_MappedBoundaryEffectToEnd"⟩
    bpmnErrorRoute := some route }

def waitingState : RuntimeState :=
  singletonEffectWaitingState effectWait

def startStimulus : Stimulus :=
  .startProcess
    ⟨"start-mapped-boundary-error"⟩
    ⟨"Process_MappedBoundaryError"⟩
    effectId.processInstanceId
    []

def scenario : Scenario :=
  { kind := .scenario
    id := ⟨"mapped-boundary-error-service-task-caught"⟩
    profile := checkedProcess.identity.semanticProfile
    bpmn :=
      { id := checkedProcess.identity.sourceId
        relativePath :=
          "scenarios/mapped-boundary-error-service-task/process.bpmn"
        sha256 := checkedProcess.identity.sourceSha256
        sourceOverlay := none }
    stimuli :=
      [ startStimulus
      , .completeEffect
          ⟨"complete-mapped-boundary-effect"⟩
          effectId
          (errorResult (some "mapped business error"))
      , .completeUserTaskInstance
          ⟨"complete-mapped-error-review"⟩
          taskId
          [] ]
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
          [ "CIB-AGR-0010"
          , "CIB-EXT-0008"
          , "CIB-EXT-0009"
          , "CIB-OP-0007"
          , "CIB-CFG-0007" ] } }

def expectedVariable : VariableBinding :=
  { name := "resultValue", value := .null }

def waitingObservation : StateObservation :=
  { instanceId := effectId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := effectId.elementId, kind := .effect, multiplicity := 1 }]
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects :=
      [{ id := effectId
         descriptor
         arguments :=
           [{ name := "requestValue"
              value := .string "example-input" }] }]
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
         name := some "ReviewMappedError"
         state := .active }]
    openMessageSubscriptions := []
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
  , .command ⟨"start-mapped-boundary-error"⟩ .committed
  , .state waitingObservation
  , .command ⟨"complete-mapped-boundary-effect"⟩ .committed
  , .state caughtObservation
  , .command ⟨"complete-mapped-error-review"⟩ .committed
  , .state completedObservation ]

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel

theorem caught_error_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide +kernel

theorem null_patch_applies_the_profile_mapping :
    applyEffectResult
        [{ name := "requestValue"
           value := .string "example-input" }]
        outputMappings
        []
        (errorResult none) =
      some [expectedVariable] := by
  decide +kernel

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
            [{ name := "result", value := .null }])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact effect_result_route_failure_is_rejected
    program effectWait commandId
      (.bpmnError submittedCode message
        [{ name := "result", value := .null }])
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
          (.success [{ name := "result", value := .string "normal" }]))
    caught.state.waits.length = 1 ∧
      caught.state.endOccurrences = 0 ∧
      wrong.state.waits.length = 0 ∧
      wrong.state.endOccurrences = 1 := by
  decide +kernel

end BpmnSemantics.MappedBoundaryErrorConformance
