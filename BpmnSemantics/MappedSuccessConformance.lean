import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Mapped-success Service Task data and mapping locks

These checks own the direct Lean account for the exact string-only mapped-success capsule. They establish independent checked-source normalization, committed effect arguments, typed local-patch validation, Process-scope output mapping, exact state preservation on refusal, and the nearest accept-unvalidated-patch non-law.
-/

namespace BpmnSemantics.MappedSuccessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation := "urn:bpmn-lean:effect-operation:mapped-success-v1" }

def inputMappings : List VariableMapping :=
  [{ target := "requestValue"
     expression := .stringLiteral "example-input" }]

def outputMappings : List VariableMapping :=
  [{ target := "resultValue"
     expression := .localVariable "result" }]

def arguments : List VariableBinding :=
  [{ name := "requestValue"
     value := .string "example-input" }]

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile :=
          ⟨"cibseven-2.0.0-mapped-success-service-task-draft"⟩
        sourceId := ⟨"mapped-success-service-task"⟩
        sourceOverlay := none
        sourceSha256 :=
          "3b5bcd5167f4d48753f8efede35f47484bddf9c278cc8fe2f4dc87549da26b4a" }
    processId := ⟨"Process_MappedSuccess"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_MappedSuccess"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_MappedSuccess"⟩
      [ ⟨"EndEvent_MappedSuccess"⟩, ⟨"MappedSuccessTask"⟩
      , ⟨"StartEvent_MappedSuccess"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_MappedSuccess"⟩
      [⟨"Flow_MappedSuccessToEnd"⟩, ⟨"Flow_StartToMappedSuccess"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_MappedSuccess"⟩
      , .serviceTask
          ⟨"MappedSuccessTask"⟩
          descriptor
          inputMappings
          outputMappings
          none
      , .noneStartEvent ⟨"StartEvent_MappedSuccess"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_MappedSuccessToEnd"⟩
          sourceId := ⟨"MappedSuccessTask"⟩
          targetId := ⟨"EndEvent_MappedSuccess"⟩ }
      , { id := ⟨"Flow_StartToMappedSuccess"⟩
          sourceId := ⟨"StartEvent_MappedSuccess"⟩
          targetId := ⟨"MappedSuccessTask"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def overlayIdentity : SourceOverlayIdentity :=
  { id := ⟨"example-source-overlay"⟩
    sha256 :=
      "0000000000000000000000000000000000000000000000000000000000000001" }

def overlaidCheckedProcess : CheckedProcess :=
  { checkedProcess with
    identity :=
      { checkedProcess.identity with
        sourceOverlay := some overlayIdentity } }

def overlaidProgram : Program :=
  lowerCheckedProcess overlaidCheckedProcess

def effectId : EffectOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"MappedSuccessTask"⟩
    activation := 1 }

def successResult (value : String) : EffectExecutionResult :=
  .success
    [{ name := "result"
       value := .string value }]

def expectedVariable (value : String) : VariableBinding :=
  { name := "resultValue"
    value := .string value }

def effectWait : EffectWait :=
  { processInstanceId := effectId.processInstanceId
    owner := rootScopeOccurrenceId effectId.processInstanceId program.processId
    elementId := ⟨effectId.elementId.value⟩
    activation := effectId.activation
    descriptor
    arguments
    outputMappings
    output := ⟨"place:Flow_MappedSuccessToEnd"⟩
    bpmnErrorRoute := none }

def waitingState : RuntimeState :=
  singletonEffectWaitingState effectWait

private def observations : List ObservationKind :=
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

def scenario : Scenario :=
  { kind := .scenario
    id := ⟨"mapped-success-service-task"⟩
    profile := checkedProcess.identity.semanticProfile
    bpmn :=
      { id := checkedProcess.identity.sourceId
        relativePath := "scenarios/mapped-success-service-task/process.bpmn"
        sha256 := checkedProcess.identity.sourceSha256
        sourceOverlay := none }
    stimuli :=
      [ .startProcess
          ⟨"start-mapped-success"⟩
          ⟨"Process_MappedSuccess"⟩
          effectId.processInstanceId
          []
      , .completeEffect
          ⟨"complete-mapped-success"⟩
          effectId
          (successResult "example-result") ]
    observations
    provenance :=
      { normativeRefs :=
          [ "BPMN 2.0.2 §10.3.1"
          , "BPMN 2.0.2 §10.3.4"
          , "BPMN 2.0.2 §13.3.3" ]
        cibRevision := "57ed69550f1c9c2619b9711d8877418bb084a371"
        cibRefs := ["CIB-EXT-0007", "CIB-OP-0006", "CIB-CFG-0006"] } }

def overlaidScenario : Scenario :=
  { scenario with
    bpmn := { scenario.bpmn with sourceOverlay := some overlayIdentity } }

def waitingObservation : StateObservation :=
  { instanceId := effectId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := effectId.elementId
         kind := .effect
         multiplicity := 1 }]
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := [{ id := effectId, descriptor, arguments }]
    variables := []
    enabledInteractions := []
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { instanceId := effectId.processInstanceId
    status := .completed
    activeWaits := []
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := [expectedVariable "example-result"]
    enabledInteractions := []
    logicalTimeMs := 0 }

def expectedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-mapped-success"⟩ .committed
  , .state waitingObservation
  , .command ⟨"complete-mapped-success"⟩ .committed
  , .state completedObservation ]

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel

theorem literal_input_commits_exact_arguments :
    evaluateInputMappings inputMappings = some arguments := by
  decide +kernel

def expectedWaitingVariables : ScopedVariables :=
  { process := { bindings := [] }
    activities :=
      [{ owner := .effectOccurrence effectId, bindings := arguments }] }

theorem activation_creates_complete_occurrence_owned_local_scope :
    waitingState.variables = expectedWaitingVariables := by
  decide +kernel

def secondEffectId : EffectOccurrenceId :=
  { effectId with activation := 2 }

def twoOwnedScopes : ScopedVariables :=
  addActivityVariableScope expectedWaitingVariables secondEffectId arguments

theorem completion_removes_only_the_matching_owned_scope :
    completeActivityVariableScope twoOwnedScopes effectId outputMappings
        (successResult "example-result") =
      some
        { process := { bindings := [expectedVariable "example-result"] }
          activities :=
            [{ owner := .effectOccurrence secondEffectId, bindings := arguments }] } := by
  decide +kernel

theorem duplicate_owned_scope_is_rejected :
    completeActivityVariableScope
        { expectedWaitingVariables with
          activities :=
            expectedWaitingVariables.activities ++
              expectedWaitingVariables.activities }
        effectId outputMappings (successResult "example-result") = none := by
  decide +kernel

def missingOwnedScopeState : RuntimeState :=
  { waitingState with variables := emptyScopedVariables }

theorem missing_owned_scope_rejects_with_exact_state_preservation :
    applyStimulus scenarioClosureLimit program missingOwnedScopeState
        (.completeEffect ⟨"missing-owned-scope"⟩ effectId
          (successResult "example-result")) =
      { outcome := .rejected
        state := missingOwnedScopeState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

def privateLocalState : RuntimeState :=
  { waitingState with
    variables :=
      { process := expectedWaitingVariables.process
        activities :=
          [{ owner := .effectOccurrence effectId
             bindings :=
               arguments ++
                 [{ name := "privateOnly", value := .string "secret" }] }] } }

theorem activity_local_bindings_remain_outside_public_observation :
    (observeStableState program privateLocalState).map
        (fun state => (state.variables, state.openEffects)) =
      some ([], waitingObservation.openEffects) := by
  decide +kernel

theorem scoped_data_adds_no_closure_step :
    scenarioClosureLimit = 8 ∧
    (applyStimulus 2 program initialState
        (.startProcess ⟨"start-mapped-success"⟩
          ⟨"Process_MappedSuccess"⟩ effectId.processInstanceId [])
      ).internalStepBoundExceeded = false ∧
      (applyStimulus 1 program initialState
        (.startProcess ⟨"start-mapped-success"⟩
          ⟨"Process_MappedSuccess"⟩ effectId.processInstanceId [])
      ).internalStepBoundExceeded = true := by
  decide +kernel

def beforeEffectActivationState : RuntimeState :=
  { (runningProgramStartState? program effectId.processInstanceId []).getD
      initialState with
    initiationPending := false
    tokens := [rootToken effectId.processInstanceId program.processId
      ⟨"place:Flow_StartToMappedSuccess"⟩] }

def beforeEffectActivationWithUnrelatedData : RuntimeState :=
  { beforeEffectActivationState with
    variables :=
      addActivityVariableScope beforeEffectActivationState.variables
        { effectId with elementId := ⟨"OtherEffect"⟩ } [] }

theorem scoped_data_does_not_change_internal_enabledness :
    program.operations.map (fun operation =>
        (fire? program operation beforeEffectActivationState).isSome) =
      program.operations.map (fun operation =>
        (fire? program operation beforeEffectActivationWithUnrelatedData).isSome) := by
  decide +kernel

theorem successful_mapping_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide +kernel

/-- The checked overlay lane records finite identity retention and semantic non-interference; it does not claim a new transition theorem. -/
theorem source_overlay_identity_is_checked_noninterference :
    checkedProcess.identity.sourceOverlay = none ∧
      overlaidCheckedProcess.identity.sourceOverlay = some overlayIdentity ∧
      { overlaidCheckedProcess.identity with sourceOverlay := none } =
        checkedProcess.identity ∧
      overlaidProgram.identity ≠ program.identity ∧
      overlaidProgram.operations = program.operations ∧
      checkedProfileCapabilitiesValid overlaidCheckedProcess =
        checkedProfileCapabilitiesValid checkedProcess ∧
      programProfileCapabilitiesValid overlaidProgram =
        programProfileCapabilitiesValid program ∧
      runScenario overlaidProgram overlaidScenario = runScenario program scenario := by
  decide +kernel

theorem source_overlay_identity_mismatch_is_unsupported :
    supportsScenario overlaidProgram scenario = false ∧
      supportsScenario program overlaidScenario = false := by
  decide +kernel

theorem successful_result_maps_only_process_target (reference : String) :
    completeActivityVariableScope expectedWaitingVariables effectId
        outputMappings (successResult reference) =
      some
        { process := { bindings := [expectedVariable reference] }
          activities := [] } := by
  simp [completeActivityVariableScope, expectedWaitingVariables,
    activityScopeMatches, localDataOwnerMatches, applyEffectResult, applyEffectPatch,
    outputMappings, successResult, expectedVariable]

/-- Any typed patch outside the exact one-local-string contract is refused with exact semantic-state preservation. -/
theorem invalid_patch_is_rejected
    (commandId : SemanticId)
    (result : EffectExecutionResult)
    (invalid :
      completeActivityVariableScope expectedWaitingVariables effectId
        outputMappings result = none) :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect commandId effectId result) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact effect_result_mapping_failure_is_rejected
    program effectWait commandId result 0 invalid

theorem missing_patch_is_rejected :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"missing-patch"⟩ effectId (.success [])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"missing-patch"⟩ (.success []) (by decide +kernel)

theorem extra_patch_is_rejected :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"extra-patch"⟩ effectId
          (.success
            [ { name := "result", value := .string "example-result" }
            , { name := "extra", value := .string "extra" } ])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"extra-patch"⟩
    (.success
      [ { name := "result", value := .string "example-result" }
      , { name := "extra", value := .string "extra" } ])
    (by decide +kernel)

theorem duplicate_patch_is_rejected :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"duplicate-patch"⟩ effectId
          (.success
            [ { name := "result", value := .string "example-result" }
            , { name := "result", value := .string "other-result" } ])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"duplicate-patch"⟩
    (.success
      [ { name := "result", value := .string "example-result" }
      , { name := "result", value := .string "other-result" } ])
    (by decide +kernel)

/-- Executable wrong account: the host writes the Worker's local patch directly into Process scope instead of applying the admitted output mapping. -/
private def writeLocalPatchToProcessScope (state : RuntimeState) : RuntimeState :=
  { state with
    effectWaits := []
    tokens := addToken state.tokens effectWait.output effectWait.owner
    variables :=
      { process :=
          { bindings :=
              [ { name := "result", value := .string "example-result" } ] }
        activities := [] } }

theorem direct_patch_to_process_scope_is_a_non_law :
    (writeLocalPatchToProcessScope waitingState).variables.process.bindings =
      [ { name := "result", value := .string "example-result" } ] ∧
      (applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"mapped-patch"⟩ effectId
          (successResult "example-result"))).state.variables.process.bindings =
        [expectedVariable "example-result"] := by
  decide +kernel

end BpmnSemantics.MappedSuccessConformance
