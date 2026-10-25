module

public import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.InternalBoundedScopeSelection
public import BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
public import BpmnSemantics.SemanticProcess.InternalEndPreparation
public import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
public import BpmnSemantics.SemanticProcess.InternalMessageTaskPreparation
public import BpmnSemantics.SemanticProcess.InternalOperationAttempt
public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
public import BpmnSemantics.SemanticProcess.InternalPreparedArming
public import BpmnSemantics.SemanticProcess.InternalPreparedTransition
public import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparation
public import BpmnSemantics.SemanticProcess.InternalTransitionPublication
public import BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore
public import BpmnSemantics.SemanticProcess.RuntimePositionValidity
public import BpmnSemantics.SemanticProcess.ValueDomain

/-! Fixture definitions and executable checks of [`FiniteInternalTransitionConformance`](FiniteInternalTransitionConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.FiniteInternalTransitionConformance


open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def processId : ProcessId := ⟨"Process_ClaimAssessment"⟩
def instanceId : SemanticId := ⟨"claim-4711"⟩
def commandId : SemanticId := ⟨"claim-routing"⟩
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

def routing : SemanticOperation :=
  .duplicate ⟨"operation:Route_Claim"⟩ { elementId := ⟨"Route_Claim"⟩ }
    ⟨"place:Flow_C_Input"⟩ [⟨"place:Flow_C_Archive"⟩, ⟨"place:Flow_C_Notify"⟩]

def operations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End_Claim"⟩ { elementId := ⟨"End_Claim"⟩ }
      ⟨"place:Flow_Join"⟩
  , .duplicate ⟨"operation:Fork_Claim"⟩ { elementId := ⟨"Fork_Claim"⟩ }
      ⟨"place:Flow_Entry"⟩ [⟨"place:Flow_A_Input"⟩, ⟨"place:Flow_B_Input"⟩, ⟨"place:Flow_C_Input"⟩]
  , .synchronize ⟨"operation:Join_Claim"⟩ { elementId := ⟨"Join_Claim"⟩ }
      [⟨"place:Flow_A_Output"⟩, ⟨"place:Flow_B_Output"⟩,
        ⟨"place:Flow_C_Archive"⟩, ⟨"place:Flow_C_Notify"⟩] ⟨"place:Flow_Join"⟩
  , routing
  , .initiate ⟨"operation:Start_Claim"⟩ { elementId := ⟨"Start_Claim"⟩ } ⟨"place:Flow_Entry"⟩
  , data, ordinary
  , .completeScope ⟨"operation:complete-scope:scope:Process_ClaimAssessment"⟩
      { elementId := ⟨"Process_ClaimAssessment"⟩ } (rootDefinitionScopeId processId) none ]

def places : List ControlPlace :=
  ["Flow_A_Input", "Flow_A_Output", "Flow_B_Input", "Flow_B_Output", "Flow_C_Archive",
    "Flow_C_Input", "Flow_C_Notify", "Flow_Entry", "Flow_Join"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := { elementId := ⟨name⟩ } }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := activityDataInputOutputUserTaskProfileId
        sourceId := ⟨"finite-mixed-claim-frontier"⟩
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

def frontier : List SemanticOperation := [data, ordinary, routing]
def prepared : List PreparedInternalTransition :=
  (prepareInternalTransitionBatch? program ready frontier).getD []

instance : InterruptionInvocationsRooted program :=
  .of_check program (by decide +kernel)

def templates : List InternalTransitionPublicationTemplate :=
  (prepared.mapM (preparedTransitionPublicationTemplate? program ready)).getD []

def publications : List InstantiatedInternalTransitionPublication :=
  instantiateTransitionPublicationBatch commandId 37 templates

def canonical_numbering_keeps_records_and_local_lifecycle_aligned : Bool := decide <|
    publications.map (·.transitionIndex) = [37, 38, 39] ∧
      publications.map (·.record) =
        [ { operationId := routing.id, operationKind := routing.kind,
            origin := routing.origin, owner }
        , { operationId := data.id, operationKind := data.kind, origin := data.origin, owner }
        , { operationId := ordinary.id, operationKind := ordinary.kind,
            origin := ordinary.origin, owner } ] ∧
      publications.map (·.logicalTimeMs) = [321, 321, 321] ∧
      publications.head?.map (·.positionDelta) = some
        { consumedTokens := [⟨⟨"Flow_C_Input"⟩, owner, 1⟩]
          producedTokens := [⟨⟨"Flow_C_Archive"⟩, owner, 1⟩, ⟨⟨"Flow_C_Notify"⟩, owner, 1⟩]
          enteredScopes := [], exitedScopes := [] } ∧
      publications.head?.map (·.lifecycle) = some
        { started :=
            [{ anchor := .transition commandId 37 0, processId,
               elementId := ⟨"Route_Claim"⟩, owner }]
          ended := [{ anchor := .transition commandId 37 0, terminal := .completed }] }

def alteredLocal : Option PreparedInternalTransition :=
  (prepareInternalTransition? program ready routing).map fun
    | .localControl selected => .localControl
        { selected with publicationTemplate :=
            { selected.publicationTemplate with logicalTimeMs := 322 } }
    | other => other

def same_operation_with_altered_publication_time_is_refused : Bool := decide <|
    alteredLocal.map PreparedInternalTransition.operation = some routing ∧
      alteredLocal.bind (applyPreparedInternalTransition? program ready) = none ∧
      (prepareInternalTransition? program { ready with logicalTimeMs := 322 } routing).isSome = true ∧
      (prepareInternalTransition? program ready routing).bind
        (applyPreparedInternalTransition? program { ready with logicalTimeMs := 322 }) = none

def conflictingRouting : SemanticOperation :=
  .duplicate ⟨"operation:Route_Claim"⟩ { elementId := ⟨"Route_Claim"⟩ }
    ⟨"place:Flow_C_Input"⟩ [⟨"place:Flow_A_Input"⟩, ⟨"place:Flow_C_Notify"⟩]

def conflictingProgram : Program :=
  { program with operations := operations.map fun operation =>
      if operation.id = routing.id then conflictingRouting else operation }

def individually_prepared_input_writer_and_reader_cannot_form_a_batch : Bool := decide <|
    [data, ordinary, conflictingRouting].all
      (fun operation => (prepareInternalTransition? conflictingProgram ready operation).isSome) = true ∧
      prepareInternalTransitionBatch? conflictingProgram ready
        [data, ordinary, conflictingRouting] = none

def numberedBeforeSorting (values : List InternalTransitionPublicationTemplate) :
    List InstantiatedInternalTransitionPublication :=
  canonicalInstantiatedTransitionPublications
    (numberTransitionPublicationTemplates commandId 37 values)

def numbering_before_sort_changes_the_local_lifecycle_anchor : Bool := decide <|
    (numberedBeforeSorting templates).head?.map
        (fun publication => publication.lifecycle.started.map (·.anchor)) =
      some [.transition commandId 39 0] ∧
      (numberedBeforeSorting templates.reverse).head?.map
        (fun publication => publication.lifecycle.started.map (·.anchor)) =
      some [.transition commandId 37 0]

def ending : SemanticOperation :=
  .reachNoneEnd ⟨"operation:End_Claim"⟩ { elementId := ⟨"End_Claim"⟩ } ⟨"place:Flow_Join"⟩

def endReady : RuntimeState :=
  { ready with tokens := addToken ready.tokens ⟨"place:Flow_Join"⟩ owner, endOccurrences := 7 }

def endFrontier : List SemanticOperation := frontier ++ [ending]
def endPrepared : List PreparedInternalTransition :=
  (prepareInternalTransitionBatch? program endReady endFrontier).getD []

def ordinary_end_retains_relative_count_and_canonical_index : Bool := decide <|
    (applyInternalTransitionBatch program endReady endPrepared).endOccurrences = 8 ∧
      ((endPrepared.mapM (preparedTransitionPublicationTemplate? program endReady)).map
        (instantiateTransitionPublicationBatch commandId 41)).map
          (fun publications => publications.head?.map fun publication =>
            (publication.record.operationId, publication.transitionIndex,
              publication.lifecycle.started.map (·.anchor))) =
        some (some (ending.id, 41, [.transition commandId 41 0]))

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("canonical_numbering_keeps_records_and_local_lifecycle_aligned", canonical_numbering_keeps_records_and_local_lifecycle_aligned),
  ("same_operation_with_altered_publication_time_is_refused", same_operation_with_altered_publication_time_is_refused),
  ("individually_prepared_input_writer_and_reader_cannot_form_a_batch", individually_prepared_input_writer_and_reader_cannot_form_a_batch),
  ("numbering_before_sort_changes_the_local_lifecycle_anchor", numbering_before_sort_changes_the_local_lifecycle_anchor),
  ("ordinary_end_retains_relative_count_and_canonical_index", ordinary_end_retains_relative_count_and_canonical_index)
]

end BpmnSemantics.FiniteInternalTransitionConformance
