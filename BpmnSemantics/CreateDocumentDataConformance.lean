import BpmnSemantics.SemanticProcess

/-! # A12 CreateDocument data and mapping locks

These checks own the direct Lean account for the exact string-only CreateDocument capsule. They establish independent checked-source normalization, committed effect arguments, typed local-patch validation, Process-scope output mapping, exact state preservation on refusal, and the nearest accept-unvalidated-patch non-law.
-/

namespace BpmnSemantics.CreateDocumentDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation := "urn:bpmn-lean:effect-operation:mapped-success-v1" }

def inputMappings : List VariableMapping :=
  [{ target := "documentModelName"
     expression := .stringLiteral "MyDocumentModel" }]

def outputMappings : List VariableMapping :=
  [{ target := "myDocumentReference"
     expression := .localVariable "newDocRef" }]

def arguments : List VariableBinding :=
  [{ name := "documentModelName"
     value := .string "MyDocumentModel" }]

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"cibseven-2.0.0-a12-create-document-draft"⟩
        sourceId := ⟨"a12-create-document-data"⟩
        sourceSha256 :=
          "34b2b2e6592e04d0d5821099b4deca9ddb84b12fb349ce16abee656a79849b13" }
    processId := ⟨"Process_A12CreateDocument"⟩
    nodes :=
      [ .serviceTask
          ⟨"CreateDocument"⟩
          descriptor
          inputMappings
          outputMappings
          none
      , .noneEndEvent ⟨"EndEvent_CreateDocument"⟩
      , .noneStartEvent ⟨"StartEvent_CreateDocument"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_CreateToEnd"⟩
          sourceId := ⟨"CreateDocument"⟩
          targetId := ⟨"EndEvent_CreateDocument"⟩ }
      , { id := ⟨"Flow_StartToCreate"⟩
          sourceId := ⟨"StartEvent_CreateDocument"⟩
          targetId := ⟨"CreateDocument"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def effectId : EffectOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"CreateDocument"⟩
    activation := 1 }

def successResult (reference : String) : EffectExecutionResult :=
  .success
    [{ name := "newDocRef"
       value := .string reference }]

def expectedVariable (reference : String) : VariableBinding :=
  { name := "myDocumentReference"
    value := .string reference }

def effectWait : EffectWait :=
  { processInstanceId := effectId.processInstanceId
    elementId := ⟨effectId.elementId.value⟩
    activation := effectId.activation
    descriptor
    arguments
    outputMappings
    output := ⟨"place:Flow_CreateToEnd"⟩
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
    id := ⟨"a12-create-document-data"⟩
    profile := checkedProcess.identity.semanticProfile
    bpmn :=
      { id := checkedProcess.identity.sourceId
        relativePath := "scenarios/create-document-data/process.bpmn"
        sha256 := checkedProcess.identity.sourceSha256 }
    stimuli :=
      [ .startProcess
          ⟨"start-create-document"⟩
          ⟨"Process_A12CreateDocument"⟩
          effectId.processInstanceId
      , .completeEffect
          ⟨"complete-effect-sha256:f596120e7c23b39e80a25da929e64ee8c5a311a0f8281a132833d6afd33f4c88"⟩
          effectId
          (successResult "Document:42") ]
    observations
    provenance :=
      { normativeRefs :=
          [ "BPMN 2.0.2 §10.3.1"
          , "BPMN 2.0.2 §10.3.4"
          , "BPMN 2.0.2 §13.3.3" ]
        cibRevision := "57ed69550f1c9c2619b9711d8877418bb084a371"
        cibRefs := ["CIB-EXT-0002", "CIB-OP-0002", "CIB-CFG-0003"] } }

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
    variables := [expectedVariable "Document:42"]
    enabledInteractions := []
    logicalTimeMs := 0 }

def expectedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-create-document"⟩ .committed
  , .state waitingObservation
  , .command ⟨"complete-effect-sha256:f596120e7c23b39e80a25da929e64ee8c5a311a0f8281a132833d6afd33f4c88"⟩ .committed
  , .state completedObservation ]

example : checkedWellFormed checkedProcess = true := by decide
example : programWellFormed program = true := by decide

theorem literal_input_commits_exact_arguments :
    evaluateInputMappings inputMappings = some arguments := by
  decide

def expectedWaitingVariables : ScopedVariables :=
  { process := { bindings := [] }
    activities := [{ owner := effectId, bindings := arguments }] }

theorem activation_creates_complete_occurrence_owned_local_scope :
    waitingState.variables = expectedWaitingVariables := by
  decide

def secondEffectId : EffectOccurrenceId :=
  { effectId with activation := 2 }

def twoOwnedScopes : ScopedVariables :=
  addActivityVariableScope expectedWaitingVariables secondEffectId arguments

theorem completion_removes_only_the_matching_owned_scope :
    completeActivityVariableScope twoOwnedScopes effectId outputMappings
        (successResult "Document:42") =
      some
        { process := { bindings := [expectedVariable "Document:42"] }
          activities := [{ owner := secondEffectId, bindings := arguments }] } := by
  decide

example :
    completeActivityVariableScope
        { expectedWaitingVariables with
          activities :=
            expectedWaitingVariables.activities ++
              expectedWaitingVariables.activities }
        effectId outputMappings (successResult "Document:42") = none := by
  decide

def missingOwnedScopeState : RuntimeState :=
  { waitingState with variables := emptyScopedVariables }

theorem missing_owned_scope_rejects_with_exact_state_preservation :
    applyStimulus scenarioClosureLimit program missingOwnedScopeState
        (.completeEffect ⟨"missing-owned-scope"⟩ effectId
          (successResult "Document:42")) =
      { outcome := .rejected
        state := missingOwnedScopeState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide

def privateLocalState : RuntimeState :=
  { waitingState with
    variables :=
      { process := expectedWaitingVariables.process
        activities :=
          [{ owner := effectId
             bindings :=
               arguments ++
                 [{ name := "privateOnly", value := .string "secret" }] }] } }

theorem activity_local_bindings_remain_outside_public_observation :
    (observeStableState program privateLocalState).map
        (fun state => (state.variables, state.openEffects)) =
      some ([], waitingObservation.openEffects) := by
  decide

theorem scoped_data_adds_no_closure_step :
    scenarioClosureLimit = 8 ∧
    (applyStimulus 2 program initialState
        (.startProcess ⟨"start-create-document"⟩
          ⟨"Process_A12CreateDocument"⟩ effectId.processInstanceId)
      ).internalStepBoundExceeded = false ∧
      (applyStimulus 1 program initialState
        (.startProcess ⟨"start-create-document"⟩
          ⟨"Process_A12CreateDocument"⟩ effectId.processInstanceId)
      ).internalStepBoundExceeded = true := by
  decide

def beforeEffectActivationState : RuntimeState :=
  { initialState with
    control := .running effectId.processInstanceId
    tokens := [⟨"place:Flow_StartToCreate"⟩] }

def beforeEffectActivationWithUnrelatedData : RuntimeState :=
  { beforeEffectActivationState with
    variables :=
      addActivityVariableScope beforeEffectActivationState.variables
        { effectId with elementId := ⟨"OtherEffect"⟩ } [] }

theorem scoped_data_does_not_change_internal_enabledness :
    program.operations.map (fun operation =>
        (fire? operation beforeEffectActivationState).isSome) =
      program.operations.map (fun operation =>
        (fire? operation beforeEffectActivationWithUnrelatedData).isSome) := by
  decide

theorem successful_mapping_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide

theorem successful_result_maps_only_process_target (reference : String) :
    completeActivityVariableScope expectedWaitingVariables effectId
        outputMappings (successResult reference) =
      some
        { process := { bindings := [expectedVariable reference] }
          activities := [] } := by
  simp [completeActivityVariableScope, expectedWaitingVariables,
    activityScopeMatches, applyEffectResult, applyEffectPatch,
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

example :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"missing-patch"⟩ effectId (.success [])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"missing-patch"⟩ (.success []) (by decide)

example :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"extra-patch"⟩ effectId
          (.success
            [ { name := "newDocRef", value := .string "Document:42" }
            , { name := "extra", value := .string "extra" } ])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"extra-patch"⟩
    (.success
      [ { name := "newDocRef", value := .string "Document:42" }
      , { name := "extra", value := .string "extra" } ])
    (by decide)

example :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"duplicate-patch"⟩ effectId
          (.success
            [ { name := "newDocRef", value := .string "Document:42" }
            , { name := "newDocRef", value := .string "Document:43" } ])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"duplicate-patch"⟩
    (.success
      [ { name := "newDocRef", value := .string "Document:42" }
      , { name := "newDocRef", value := .string "Document:43" } ])
    (by decide)

/-- Executable wrong account: the host writes the Worker's local patch directly into Process scope instead of applying the admitted output mapping. -/
private def writeLocalPatchToProcessScope (state : RuntimeState) : RuntimeState :=
  { state with
    effectWaits := []
    tokens := effectWait.output :: state.tokens
    variables :=
      { process :=
          { bindings :=
              [ { name := "newDocRef", value := .string "Document:42" } ] }
        activities := [] } }

theorem direct_patch_to_process_scope_is_a_non_law :
    (writeLocalPatchToProcessScope waitingState).variables.process.bindings =
      [ { name := "newDocRef", value := .string "Document:42" } ] ∧
      (applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"mapped-patch"⟩ effectId
          (successResult "Document:42"))).state.variables.process.bindings =
        [expectedVariable "Document:42"] := by
  decide

end BpmnSemantics.CreateDocumentDataConformance
