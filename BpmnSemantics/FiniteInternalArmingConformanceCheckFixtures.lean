module

public import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.InternalPreparedArming
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.TransitionTrace
public import BpmnSemantics.SemanticProcess.ValueDomain

/-! Fixture definitions and executable checks of [`FiniteInternalArmingConformance`](FiniteInternalArmingConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.FiniteInternalArmingConformance


open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def processId : ProcessId := ⟨"Process_ClaimAssessment"⟩
def instanceId : SemanticId := ⟨"claim-4711"⟩
def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId processId

def directInput : DirectActivityDataInput :=
  { associationId := "InputAssociation_Coverage"
    source := .property "Property_ClaimSummary"
    targetDataInputId := "Input_Coverage"
    targetDataInputName := some "Claim summary" }

def directOutput : DirectActivityDataOutput :=
  { associationId := "OutputAssociation_Coverage"
    sourceDataOutputId := "Output_Coverage"
    sourceDataOutputName := some "Decision"
    target := .property "Property_CoverageDecision" }

def data : SemanticOperation :=
  .awaitDataInputOutputUserTask ⟨"operation:UserTask_Coverage"⟩
    { elementId := ⟨"UserTask_Coverage"⟩ } ⟨"place:Flow_A_Input"⟩ ⟨"place:Flow_A_Output"⟩
    ⟨"UserTask_Coverage"⟩ (some "Coverage") directInput directOutput

def ordinary : SemanticOperation :=
  .awaitUserTask ⟨"operation:UserTask_Review"⟩ { elementId := ⟨"UserTask_Review"⟩ }
    ⟨"place:Flow_B_Input"⟩ ⟨"place:Flow_B_Output"⟩
    { id := ⟨"UserTask_Review"⟩, name := some "Review" }

def timer : SemanticOperation :=
  .awaitTimer ⟨"operation:Timer_Claim"⟩ { elementId := ⟨"Timer_Claim"⟩ }
    ⟨"place:Flow_C_Input"⟩ ⟨"place:Flow_C_Output"⟩
    { elementId := ⟨"Timer_Claim"⟩, durationMs := 1000 }

def operations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End_Claim"⟩ { elementId := ⟨"End_Claim"⟩ }
      ⟨"place:Flow_Join"⟩
  , .duplicate ⟨"operation:Fork_Claim"⟩ { elementId := ⟨"Fork_Claim"⟩ }
      ⟨"place:Flow_Entry"⟩ [⟨"place:Flow_A_Input"⟩, ⟨"place:Flow_B_Input"⟩, ⟨"place:Flow_C_Input"⟩]
  , .synchronize ⟨"operation:Join_Claim"⟩ { elementId := ⟨"Join_Claim"⟩ }
      [⟨"place:Flow_A_Output"⟩, ⟨"place:Flow_B_Output"⟩, ⟨"place:Flow_C_Output"⟩]
      ⟨"place:Flow_Join"⟩
  , .initiate ⟨"operation:Start_Claim"⟩ { elementId := ⟨"Start_Claim"⟩ } ⟨"place:Flow_Entry"⟩
  , timer, data, ordinary
  , .completeScope ⟨"operation:complete-scope:scope:Process_ClaimAssessment"⟩
      { elementId := ⟨"Process_ClaimAssessment"⟩ } (rootDefinitionScopeId processId) none ]

def places : List ControlPlace :=
  ["Flow_A_Input", "Flow_A_Output", "Flow_B_Input", "Flow_B_Output", "Flow_C_Input",
    "Flow_C_Output", "Flow_Entry", "Flow_Join"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := { elementId := ⟨name⟩ } }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := activityDataInputOutputUserTaskProfileId
        sourceId := ⟨"finite-claim-frontier"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes := [rootDefinitionScope processId]
    operationScopes := operations.map fun operation =>
      { operationId := operation.id, scopeId := rootDefinitionScopeId processId }
    controlPlaceScopes := places.map fun place =>
      { controlPlaceId := place.id, scopeId := rootDefinitionScopeId processId }
    controlPlaces := places
    operations }

def summary : VariableBinding :=
  { name := "Property_ClaimSummary", value := .string "Claim summary" }

def ready : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := rootDefinitionScopeId processId, count := 1 }]
    tokens := ["place:Flow_A_Input", "place:Flow_B_Input", "place:Flow_C_Input"].map fun place =>
      { placeId := ⟨place⟩, owner }
    activations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 2 }]
    activityActivations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 7 }]
    logicalTimeMs := 321
    variables := { process := { bindings := [summary] }, activities := [], processInterfaces := [], scopes := [] } }

def frontier : List SemanticOperation := [data, ordinary, timer]
def prepared : List PreparedInternalArming :=
  (prepareInternalArmingBatch? program ready frontier).getD []

def staleStates : List RuntimeState :=
  [ { ready with variables :=
        { ready.variables with process := { bindings := [{ summary with value := .string "Changed" }] } } }
  , { ready with logicalTimeMs := 322 }
  , { ready with activations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 3 }] }
  , { ready with activityActivations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 8 }] } ]

def changed_complete_preparations_refuse_the_same_operation_id : Bool := decide <|
    staleStates.all (fun state =>
      (prepareInternalArming? program state data).isSome &&
      ((prepareInternalArming? program ready data).bind
        (applyPreparedInternalArming? program state)).isNone) = true

def start : Stimulus :=
  .startProcess ⟨"start-claim-batch"⟩ ⟨processId.value⟩ instanceId [summary]

def committed_start_closes_the_mixed_frontier : Bool := decide <|
    (applyStimulus 5 program initialState start).outcome = .committed

def trace : TracedStimulusResult :=
  applyStimulusTraced 5 program initialState start

def committed_publication_keeps_the_complete_batch_aligned : Bool := decide <|
    trace.committedTransitions.length = 6 ∧
      trace.flowNodeOccurrenceLifecycles.length = 6 ∧
      ((trace.committedTransitions.drop 3).filterMap fun
        | .internalOperation record => some record.operationId
        | .externalStimulus _ => none) =
        [⟨"operation:Timer_Claim"⟩, ⟨"operation:UserTask_Coverage"⟩,
          ⟨"operation:UserTask_Review"⟩] ∧
      ((trace.flowNodeOccurrenceLifecycles.drop 3).flatMap fun delta =>
        delta.started.map (·.elementId)) =
        [⟨"Timer_Claim"⟩, ⟨"UserTask_Coverage"⟩, ⟨"UserTask_Review"⟩] ∧
      runtimeStateWellFormed program instanceId trace.result.state = true

def insufficient_batch_fuel_restores_the_whole_command : Bool := decide <|
    let refused := applyStimulusTraced 4 program initialState start
    refused.result =
        { outcome := .rolledBack, state := initialState,
          internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      refused.committedTransitions = [] ∧
      refused.flowNodeOccurrenceLifecycles = []

def standaloneInput : SemanticOperation :=
  .awaitDataInputUserTask ⟨"operation:UserTask_Coverage"⟩
    { elementId := ⟨"UserTask_Coverage"⟩ } ⟨"place:Flow_A_Input"⟩ ⟨"place:Flow_A_Output"⟩
    ⟨"UserTask_Coverage"⟩ (some "Coverage") directInput

def standaloneOutput : SemanticOperation :=
  .awaitDataOutputUserTask ⟨"operation:UserTask_Review"⟩ { elementId := ⟨"UserTask_Review"⟩ }
    ⟨"place:Flow_B_Input"⟩ ⟨"place:Flow_B_Output"⟩ ⟨"UserTask_Review"⟩ (some "Review") directOutput

def standaloneProgram : Program :=
  { program with
    identity := { program.identity with semanticProfile := activityDataInputUserTaskProfileId }
    operations := program.operations.map fun operation =>
      if operation.id = data.id then standaloneInput
      else if operation.id = ordinary.id then standaloneOutput
      else operation }

def standaloneFrontier : List SemanticOperation := [standaloneInput, standaloneOutput, timer]
def standalonePrepared : List PreparedInternalArming :=
  (prepareInternalArmingBatch? standaloneProgram ready standaloneFrontier).getD []

def standalone_output_prepares_an_empty_scope_without_Process_data : Bool := decide <|
    let missing := { ready with variables := { ready.variables with process := { bindings := [] } } }
    prepareInternalArming? standaloneProgram missing standaloneInput = none ∧
      (match prepareInternalArming? standaloneProgram missing standaloneOutput with
        | some (.data contract patch) => patch.bindings.isEmpty &&
            (footprintOfDataPatch contract patch).reads.all (fun atom =>
              match atom with | .processVariable _ => false | _ => true)
        | _ => false) = true

def standalone_start_publishes_or_rolls_back_the_complete_frontier : Bool := decide <|
    let accepted := applyStimulusTraced 5 standaloneProgram initialState start
    let refused := applyStimulusTraced 4 standaloneProgram initialState start
    accepted.result.outcome = .committed ∧
      accepted.committedTransitions.length = 6 ∧
      accepted.flowNodeOccurrenceLifecycles.length = 6 ∧
      runtimeStateWellFormed standaloneProgram instanceId accepted.result.state = true ∧
      refused.result =
        { outcome := .rolledBack
          state := initialState
          internalStepBoundExceeded := true
          ambiguousInternalChoice := false } ∧
      refused.committedTransitions = [] ∧ refused.flowNodeOccurrenceLifecycles = []

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("changed_complete_preparations_refuse_the_same_operation_id", changed_complete_preparations_refuse_the_same_operation_id),
  ("committed_start_closes_the_mixed_frontier", committed_start_closes_the_mixed_frontier),
  ("committed_publication_keeps_the_complete_batch_aligned", committed_publication_keeps_the_complete_batch_aligned),
  ("insufficient_batch_fuel_restores_the_whole_command", insufficient_batch_fuel_restores_the_whole_command),
  ("standalone_output_prepares_an_empty_scope_without_Process_data", standalone_output_prepares_an_empty_scope_without_Process_data),
  ("standalone_start_publishes_or_rolls_back_the_complete_frontier", standalone_start_publishes_or_rolls_back_the_complete_frontier)
]

end BpmnSemantics.FiniteInternalArmingConformance
