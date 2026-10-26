module

public import BpmnSemantics.SemanticProcess.ExecutionRuntime
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.Lowering

/-! Fixture definitions and executable checks of [`MappedSuccessConformance`](MappedSuccessConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

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

def observations : List ObservationKind :=
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

def literal_input_commits_exact_arguments : Bool := decide <|
    evaluateInputMappings inputMappings = some arguments

def expectedWaitingVariables : ScopedVariables :=
  { process := { bindings := [] }
    activities :=
      [{ owner := .effectOccurrence effectId, bindings := arguments }]
    processInterfaces := [], scopes := [] }

def secondEffectId : EffectOccurrenceId :=
  { effectId with activation := 2 }

def twoOwnedScopes : ScopedVariables :=
  addActivityVariableScope expectedWaitingVariables secondEffectId arguments

def duplicate_owned_scope_is_rejected : Bool := decide <|
    completeActivityVariableScope
        { expectedWaitingVariables with
          activities :=
            expectedWaitingVariables.activities ++
              expectedWaitingVariables.activities }
        effectId outputMappings (successResult "example-result") = none

def missingOwnedScopeState : RuntimeState :=
  { waitingState with variables := emptyScopedVariables }

def missing_owned_scope_rejects_with_exact_state_preservation : Bool := decide <|
    applyStimulus scenarioClosureLimit program missingOwnedScopeState
        (.completeEffect ⟨"missing-owned-scope"⟩ effectId
          (successResult "example-result")) =
      { outcome := .rejected
        state := missingOwnedScopeState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def privateLocalState : RuntimeState :=
  { waitingState with
    variables :=
      { process := expectedWaitingVariables.process
        activities :=
          [{ owner := .effectOccurrence effectId
             bindings :=
               arguments ++
                 [{ name := "privateOnly", value := .string "secret" }] }]
        processInterfaces := [], scopes := [] } }

def scoped_data_adds_no_closure_step : Bool := decide <|
    scenarioClosureLimit = 8 ∧
    (applyStimulus 2 program initialState
        (.startProcess ⟨"start-mapped-success"⟩
          ⟨"Process_MappedSuccess"⟩ effectId.processInstanceId [])
      ).internalStepBoundExceeded = false ∧
      (applyStimulus 1 program initialState
        (.startProcess ⟨"start-mapped-success"⟩
          ⟨"Process_MappedSuccess"⟩ effectId.processInstanceId [])
      ).internalStepBoundExceeded = true

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

def scoped_data_does_not_change_internal_enabledness : Bool := decide <|
    program.operations.map (fun operation =>
        (fire? program operation beforeEffectActivationState).isSome) =
      program.operations.map (fun operation =>
        (fire? program operation beforeEffectActivationWithUnrelatedData).isSome)

def successful_mapping_trace_is_exact : Bool := decide <|
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace }

/-- The checked overlay lane records finite identity retention and semantic non-interference; it does not claim a new transition theorem. -/
def source_overlay_identity_is_checked_noninterference : Bool := decide <|
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
      runScenario overlaidProgram overlaidScenario = runScenario program scenario

def source_overlay_identity_mismatch_is_unsupported : Bool := decide <|
    supportsScenario overlaidProgram scenario = false ∧
      supportsScenario program overlaidScenario = false

/-- Executable wrong account: the host writes the Worker's local patch directly into Process scope instead of applying the admitted output mapping. -/
def writeLocalPatchToProcessScope (state : RuntimeState) : RuntimeState :=
  { state with
    effectWaits := []
    tokens := addToken state.tokens effectWait.output effectWait.owner
    variables :=
      { process :=
          { bindings :=
              [ { name := "result", value := .string "example-result" } ] }
        activities := []
        processInterfaces := [], scopes := [] } }

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("literal_input_commits_exact_arguments", literal_input_commits_exact_arguments),
  ("duplicate_owned_scope_is_rejected", duplicate_owned_scope_is_rejected),
  ("missing_owned_scope_rejects_with_exact_state_preservation", missing_owned_scope_rejects_with_exact_state_preservation),
  ("scoped_data_adds_no_closure_step", scoped_data_adds_no_closure_step),
  ("scoped_data_does_not_change_internal_enabledness", scoped_data_does_not_change_internal_enabledness),
  ("successful_mapping_trace_is_exact", successful_mapping_trace_is_exact),
  ("source_overlay_identity_is_checked_noninterference", source_overlay_identity_is_checked_noninterference),
  ("source_overlay_identity_mismatch_is_unsupported", source_overlay_identity_mismatch_is_unsupported)
]

end BpmnSemantics.MappedSuccessConformance
