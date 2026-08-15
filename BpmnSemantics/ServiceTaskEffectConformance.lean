import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # BpmnSemantics.ServiceTaskEffectConformance — exact effect-intent locks

These checks own the direct Lean account for the admitted success-only Service Task effect slice. They establish checked-source lowering, effect activation and observation, exact completion, full-identity refusal, and the nearest accept-any-result non-law without importing a host retry or Activity model.
-/

namespace BpmnSemantics.ServiceTaskEffectConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation := "urn:bpmn-lean:effect-operation:probe-v1" }

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"cibseven-2.2.0-service-task-effect-draft"⟩
        sourceId := ⟨"service-task-effect-phase-zero-probe"⟩
        sourceSha256 :=
          "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d" }
    processId := ⟨"Process_ServiceTaskEffectProbe"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_ServiceTaskEffectProbe"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_ServiceTaskEffectProbe"⟩
      [⟨"EndEvent_1"⟩, ⟨"ServiceTask_Record"⟩, ⟨"StartEvent_1"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_ServiceTaskEffectProbe"⟩
      [⟨"Flow_ServiceToEnd"⟩, ⟨"Flow_StartToService"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .serviceTask
          ⟨"ServiceTask_Record"⟩
          descriptor
          []
          []
          none
      , .noneStartEvent ⟨"StartEvent_1"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ServiceToEnd"⟩
          sourceId := ⟨"ServiceTask_Record"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_StartToService"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"ServiceTask_Record"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def effectId : EffectOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"ServiceTask_Record"⟩
    activation := 1 }

def effectWait : EffectWait :=
  { processInstanceId := effectId.processInstanceId
    owner := rootScopeOccurrenceId effectId.processInstanceId program.processId
    elementId := ⟨effectId.elementId.value⟩
    activation := effectId.activation
    descriptor
    arguments := []
    outputMappings := []
    output := ⟨"place:Flow_ServiceToEnd"⟩
    bpmnErrorRoute := none }

def scenario : Scenario :=
  { kind := .scenario
    id := ⟨"service-task-effect-success"⟩
    profile := ⟨"cibseven-2.2.0-service-task-effect-draft"⟩
    bpmn :=
      { id := ⟨"service-task-effect-phase-zero-probe"⟩
        relativePath := "scenarios/service-task-effect/process.bpmn"
        sha256 :=
          "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d"
        sourceOverlay := none }
    stimuli :=
      [ .startProcess
          ⟨"start-process"⟩
          ⟨"Process_ServiceTaskEffectProbe"⟩
          ⟨"Instance_1"⟩
          []
      , .completeEffect ⟨"complete-effect"⟩ effectId (.success []) ]
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
    openMessageSubscriptions := []
    openTimers := []
    openEffects := [{ id := effectId, descriptor, arguments := [] }]
    variables := []
    enabledInteractions := []
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .completed
    activeWaits := []
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions := []
    logicalTimeMs := 0 }

def expectedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state waitingObservation
  , .command ⟨"complete-effect"⟩ .committed
  , .state completedObservation ]

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel


theorem successful_effect_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide +kernel

theorem start_prefix_projects_one_effect_intent :
    (runScenario program
      { scenario with stimuli := scenario.stimuli.take 1 }).trace =
      [ .deployment .committed
      , .command ⟨"start-process"⟩ .committed
      , .state waitingObservation ] := by
  decide +kernel

theorem wrong_effect_activation_is_rejected :
    applyStimulus scenarioClosureLimit program
        (singletonEffectWaitingState effectWait)
        (.completeEffect ⟨"wrong-activation"⟩
          { effectId with activation := 2 } (.success [])) =
      { outcome := .rejected
        state := singletonEffectWaitingState effectWait
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  effect_identity_mismatch_is_rejected
    program effectWait ⟨"wrong-activation"⟩
    { effectId with activation := 2 } (.success []) 0 (by decide +kernel)

/-- Executable wrong account: accepting an arbitrary result would advance even when no effect occurrence was ever activated. -/
private def acceptAnyEffectResult (state : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId) : RuntimeState :=
  { state with tokens := addToken state.tokens output owner }

theorem accept_any_effect_result_is_a_non_law :
    let before :=
      (runningProgramStartState? program ⟨"Instance_1"⟩ []).getD initialState
    let submitted :=
      Stimulus.completeEffect ⟨"never-activated"⟩ effectId (.success [])
    (acceptAnyEffectResult before effectWait.owner
      ⟨"place:Flow_ServiceToEnd"⟩).tokens =
        [rootToken ⟨"Instance_1"⟩ program.processId
          ⟨"place:Flow_ServiceToEnd"⟩] ∧
      applyStimulus scenarioClosureLimit program before submitted =
        { outcome := .rejected
          state := before
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

end BpmnSemantics.ServiceTaskEffectConformance
