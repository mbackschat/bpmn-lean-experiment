import BpmnSemantics.SemanticProcess

/-! # BpmnSemantics.ServiceTaskEffectConformance — exact effect-intent locks

These checks own the direct Lean account for the admitted success-only Service Task effect slice. They establish checked-source lowering, effect activation and observation, exact completion, full-identity refusal, and the nearest accept-any-result non-law without importing a host retry or Activity model.
-/

namespace BpmnSemantics.ServiceTaskEffectConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect:probe-v1"
    handler := "bpmnLeanEffectHandler" }

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"cibseven-2.2.0-service-task-effect-draft"⟩
        sourceId := ⟨"service-task-effect-phase-zero-probe"⟩
        sourceSha256 :=
          "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d" }
    processId := ⟨"Process_ServiceTaskEffectProbe"⟩
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .serviceTask
          ⟨"ServiceTask_Record"⟩
          "urn:bpmn-lean:effect:probe-v1"
          "http://camunda.org/schema/1.0/bpmn"
          "${bpmnLeanEffectHandler}"
          "http://camunda.org/schema/1.0/bpmn"
          "true"
      , .noneStartEvent ⟨"StartEvent_1"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ServiceToEnd"⟩
          sourceId := ⟨"ServiceTask_Record"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_StartToService"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"ServiceTask_Record"⟩ } ] }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"cibseven-2.2.0-service-task-effect-draft"⟩
        sourceId := ⟨"service-task-effect-phase-zero-probe"⟩
        sourceSha256 :=
          "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d" }
    processId := ⟨"Process_ServiceTaskEffectProbe"⟩
    controlPlaces :=
      [ { id := ⟨"place:Flow_ServiceToEnd"⟩
          origin := { elementId := ⟨"Flow_ServiceToEnd"⟩ } }
      , { id := ⟨"place:Flow_StartToService"⟩
          origin := { elementId := ⟨"Flow_StartToService"⟩ } } ]
    operations :=
      [ .terminate
          ⟨"operation:EndEvent_1"⟩
          { elementId := ⟨"EndEvent_1"⟩ }
          ⟨"place:Flow_ServiceToEnd"⟩
      , .awaitEffect
          ⟨"operation:ServiceTask_Record"⟩
          { elementId := ⟨"ServiceTask_Record"⟩ }
          ⟨"place:Flow_StartToService"⟩
          ⟨"place:Flow_ServiceToEnd"⟩
          { elementId := ⟨"ServiceTask_Record"⟩
            descriptor }
      , .initiate
          ⟨"operation:StartEvent_1"⟩
          { elementId := ⟨"StartEvent_1"⟩ }
          ⟨"place:Flow_StartToService"⟩ ] }

def effectId : EffectOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"ServiceTask_Record"⟩
    activation := 1 }

def effectWait : EffectWait :=
  { processInstanceId := effectId.processInstanceId
    elementId := ⟨effectId.elementId.value⟩
    activation := effectId.activation
    descriptor
    output := ⟨"place:Flow_ServiceToEnd"⟩ }

def scenario : Scenario :=
  { kind := .scenario
    id := ⟨"service-task-effect-success"⟩
    profile := ⟨"cibseven-2.2.0-service-task-effect-draft"⟩
    bpmn :=
      { id := ⟨"service-task-effect-phase-zero-probe"⟩
        relativePath := "scenarios/service-task-effect/process.bpmn"
        sha256 :=
          "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d" }
    stimuli :=
      [ .startProcess
          ⟨"start-process"⟩
          ⟨"Process_ServiceTaskEffectProbe"⟩
          ⟨"Instance_1"⟩
      , .completeEffect ⟨"complete-effect"⟩ effectId ]
    observations :=
      [ .deployment
      , .commandResults
      , .processStatus
      , .activeWaits
      , .openUserTasks
      , .openTimers
      , .openEffects
      , .enabledInteractions
      , .logicalTime ]
    provenance :=
      { normativeRefs := ["BPMN 2.0.2 §13.3.3"]
        cibRevision := "834a9874760de8a0107f7c1b32806e37f17fb017"
        cibRefs := ["ServiceTaskActivityBehavior.java"] } }

def waitingObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .running
    activeWaits :=
      [ { elementId := ⟨"ServiceTask_Record"⟩
          kind := .effect
          multiplicity := 1 } ]
    openUserTasks := []
    openTimers := []
    openEffects := [{ id := effectId, descriptor }]
    enabledInteractions := []
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .completed
    activeWaits := []
    openUserTasks := []
    openTimers := []
    openEffects := []
    enabledInteractions := []
    logicalTimeMs := 0 }

def expectedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state waitingObservation
  , .command ⟨"complete-effect"⟩ .committed
  , .state completedObservation ]

example : checkedWellFormed checkedProcess = true := by decide
example : programWellFormed program = true := by decide
example : lowerCheckedProcess checkedProcess = program := by decide

theorem successful_effect_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide

theorem start_prefix_projects_one_effect_intent :
    (runScenario program
      { scenario with stimuli := scenario.stimuli.take 1 }).trace =
      [ .deployment .committed
      , .command ⟨"start-process"⟩ .committed
      , .state waitingObservation ] := by
  decide

example :
    applyStimulus scenarioClosureLimit program
        (singletonEffectWaitingState effectWait)
        (.completeEffect ⟨"wrong-activation"⟩
          { effectId with activation := 2 }) =
      { outcome := .rejected
        state := singletonEffectWaitingState effectWait
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  effect_identity_mismatch_is_rejected
    program effectWait ⟨"wrong-activation"⟩
    { effectId with activation := 2 } 0 (by decide)

/-- Executable wrong account: accepting an arbitrary result would advance even when no effect occurrence was ever activated. -/
private def acceptAnyEffectResult (state : RuntimeState)
    (output : ControlPlaceId) : RuntimeState :=
  { state with tokens := output :: state.tokens }

theorem accept_any_effect_result_is_a_non_law :
    let before := runningStartState ⟨"Instance_1"⟩
    let submitted :=
      Stimulus.completeEffect ⟨"never-activated"⟩ effectId
    (acceptAnyEffectResult before ⟨"place:Flow_ServiceToEnd"⟩).tokens =
        [⟨"place:Flow_ServiceToEnd"⟩] ∧
      applyStimulus scenarioClosureLimit program before submitted =
        { outcome := .rejected
          state := before
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide

end BpmnSemantics.ServiceTaskEffectConformance
