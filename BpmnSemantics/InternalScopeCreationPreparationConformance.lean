import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation

/-! # Complete scope-creation preparation witnesses

Constructed Programs and predecessor states distinguish local preparation and retained publication.
They establish no source admission, aggregate preservation, or regional batch execution.
-/

namespace BpmnSemantics.InternalScopeCreationPreparationConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def root : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"process"⟩, activation := 1 }

def before : RuntimeState :=
  { initialState with
    control := .running root.processInstanceId
    scopeOccurrences := [{ id := root, parent := none }]
    tokens := [{ placeId := ⟨"input"⟩, owner := root }]
    scopeActivations := [{ scopeId := ⟨"child"⟩, count := 9 },
      { scopeId := ⟨"process"⟩, count := 1 }]
    callActivations := [{ elementId := ⟨"call"⟩, count := 9 }]
    logicalTimeMs := 42 }

def childOperation : SemanticOperation :=
  .enterScope ⟨"enter"⟩ ⟨⟨"subprocess"⟩⟩ ⟨"input"⟩ ⟨"entry"⟩ ⟨"child"⟩

def callOperation : SemanticOperation :=
  .invokeProcess ⟨"invoke"⟩ ⟨⟨"call"⟩⟩ ⟨"input"⟩ ⟨"callee"⟩
    ⟨"called-root"⟩ ⟨"entry"⟩ ⟨"return"⟩

def childDefinition : DefinitionScope :=
  { id := ⟨"child"⟩, parentScopeId := some root.definitionScopeId,
    originElementId := ⟨"subprocess"⟩ }

def calledDefinition : DefinitionScope :=
  { id := ⟨"called-root"⟩, parentScopeId := none, originElementId := ⟨"callee"⟩ }

def programFor (operation : SemanticOperation) (created : DefinitionScope) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"constructed"⟩
        sourceId := ⟨"constructed"⟩
        sourceSha256 := "constructed" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"process"⟩
    definitionScopes :=
      [{ id := root.definitionScopeId, parentScopeId := none, originElementId := ⟨"process"⟩ },
        created]
    operationScopes := [{ operationId := operation.id, scopeId := root.definitionScopeId }]
    controlPlaceScopes :=
      [{ controlPlaceId := ⟨"input"⟩, scopeId := root.definitionScopeId },
        { controlPlaceId := ⟨"entry"⟩, scopeId := created.id }]
    controlPlaces :=
      [{ id := ⟨"input"⟩, origin := ⟨⟨"input-flow"⟩⟩ },
        { id := ⟨"entry"⟩, origin := ⟨⟨"entry-flow"⟩⟩ }]
    operations := [operation] }

def childProgram := programFor childOperation childDefinition
def callProgram := programFor callOperation calledDefinition

def childId : ScopeOccurrenceId :=
  { root with definitionScopeId := childDefinition.id, activation := 10 }

def calledId : ScopeOccurrenceId :=
  { processInstanceId := deriveCalledProcessInstanceId root.processInstanceId ⟨"call"⟩ 10,
    definitionScopeId := calledDefinition.id, activation := 1 }

def applyPrepared (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option RuntimeState := do
  let prepared ← prepareInternalScopeCreation? program state operation
  applyPreparedInternalScopeCreation? program state prepared

def both_creation_preparations_are_nonvacuous_and_refine_the_raw_evaluator : Bool := decide <|
    (prepareInternalScopeCreation? childProgram before childOperation).isSome = true ∧
      (prepareInternalScopeCreation? callProgram before callOperation).isSome = true ∧
      applyPrepared childProgram before childOperation = fire? childProgram childOperation before ∧
      applyPrepared callProgram before callOperation = fire? callProgram callOperation before

def publication_retains_both_owners_and_the_created_definition_origin : Bool := decide <|
    (prepareInternalScopeCreation? childProgram before childOperation).map
        (·.publicationTemplate.positionDelta) = some
      { consumedTokens := [{ sequenceFlowId := ⟨"input-flow"⟩, owner := root, multiplicity := 1 }]
        producedTokens := [{ sequenceFlowId := ⟨"entry-flow"⟩, owner := childId, multiplicity := 1 }]
        enteredScopes := [{ id := childId, parent := some root, bpmnElementId := ⟨"subprocess"⟩ }]
        exitedScopes := [] } ∧
      (prepareInternalScopeCreation? callProgram before callOperation).map
          (·.publicationTemplate.positionDelta) = some
        { consumedTokens := [{ sequenceFlowId := ⟨"input-flow"⟩, owner := root, multiplicity := 1 }]
          producedTokens := [{ sequenceFlowId := ⟨"entry-flow"⟩, owner := calledId, multiplicity := 1 }]
          enteredScopes := [{ id := calledId, parent := none, bpmnElementId := ⟨"callee"⟩ }]
          exitedScopes := [] }

def lifecycle_templates_retain_distinct_scope_and_call_anchors_without_numbering : Bool := decide <|
    (prepareInternalScopeCreation? childProgram before childOperation).map
        (·.publicationTemplate.lifecycle) = some
      { started :=
          [{ anchor := .scope childId, processId := ⟨"process"⟩,
             elementId := ⟨"subprocess"⟩, owner := root }]
        ended := [] } ∧
      (prepareInternalScopeCreation? callProgram before callOperation).map
          (·.publicationTemplate.lifecycle) = some
        { started :=
            [{ anchor := .callActivity
                { processInstanceId := root.processInstanceId, elementId := ⟨"call"⟩, activation := 10 }
               processId := ⟨"process"⟩, elementId := ⟨"call"⟩, owner := root }]
          ended := [] }

def footprints_protect_censuses_parentage_and_the_exact_issuance_domain : Bool := decide <|
    (prepareInternalScopeCreation? childProgram before childOperation).map (fun prepared =>
      prepared.footprint.reads.contains (.tokenOwners ⟨"input"⟩) &&
      prepared.footprint.reads.contains (.scopeParent root none) &&
      prepared.footprint.writes.contains (.tokenOwners ⟨"entry"⟩) &&
      prepared.footprint.writes.contains (.scopeParent childId (some root)) &&
      prepared.footprint.writes.contains (.activation .scope ⟨"child"⟩) &&
      !prepared.footprint.writes.contains (.activation .call ⟨"child"⟩)) = some true ∧
      (prepareInternalScopeCreation? callProgram before callOperation).map (fun prepared =>
        prepared.footprint.writes.contains (.activation .call ⟨"call"⟩) &&
        prepared.footprint.writes.contains (.callAssociation
          { id := { processInstanceId := root.processInstanceId, elementId := ⟨"call"⟩,
                    activation := 10 }, caller := root, calledProcessId := ⟨"callee"⟩,
            calledRoot := calledId, returnOperationId := ⟨"return"⟩ })) = some true

def alteredPreparations (prepared : PreparedInternalScopeCreation) :=
  [ { prepared with runtimeInstanceId := ⟨"other"⟩ }
  , { prepared with footprint := { reads := [], writes := [] } }
  , { prepared with publicationTemplate :=
        { prepared.publicationTemplate with logicalTimeMs := 43 } }
  , { prepared with publicationTemplate :=
        { prepared.publicationTemplate with lifecycle := { started := [], ended := [] } } }
  , { prepared with publicationTemplate :=
        { prepared.publicationTemplate with positionDelta :=
            { prepared.publicationTemplate.positionDelta with enteredScopes := [] } } }
  , { prepared with selection :=
        { prepared.selection with created :=
            { prepared.selection.created with id := { childId with activation := 11 } } } } ]

def checked_application_refuses_every_altered_preparation_component : Bool := decide <|
    (prepareInternalScopeCreation? childProgram before childOperation).map (fun prepared =>
      (alteredPreparations prepared).all fun altered =>
        (applyPreparedInternalScopeCreation? childProgram before altered).isNone) = some true

def child_entry_preserves_excess_units_while_call_refuses_repeated_input : Bool := decide <|
    let repeated := { before with tokens := before.tokens ++ before.tokens }
    (prepareInternalScopeCreation? childProgram repeated childOperation).isSome = true ∧
      (applyPrepared childProgram repeated childOperation).map
        (fun state => tokenMultiplicity state ⟨"input"⟩) = some 1 ∧
      prepareInternalScopeCreation? callProgram repeated callOperation = none

def duplicate_definition_identity_is_refused_before_matching_parent_metadata : Bool := decide <|
    prepareInternalScopeCreation?
      { childProgram with definitionScopes :=
          { childDefinition with parentScopeId := none } :: childProgram.definitionScopes }
      before childOperation = none ∧
      prepareInternalScopeCreation?
        { callProgram with definitionScopes :=
            { calledDefinition with parentScopeId := some root.definitionScopeId } ::
              callProgram.definitionScopes }
        before callOperation = none

def duplicate_operation_identity_is_refused_before_matching_its_payload : Bool := decide <|
    prepareInternalScopeCreation?
      { childProgram with
        operations := .enterScope ⟨"enter"⟩ ⟨⟨"other"⟩⟩ ⟨"input"⟩ ⟨"entry"⟩ ⟨"child"⟩ ::
          childProgram.operations }
      before childOperation = none

def duplicate_owner_identity_is_refused_before_matching_parent_metadata : Bool := decide <|
    prepareInternalScopeCreation? childProgram
      { before with scopeOccurrences :=
          { id := root, parent := some { root with activation := 2 } } :: before.scopeOccurrences }
      childOperation = none

def unsafe_time_and_counter_issuance_are_refused : Bool := decide <|
    prepareInternalScopeCreation? childProgram
      { before with logicalTimeMs := 9007199254740992 } childOperation = none ∧
      prepareInternalScopeCreation? childProgram
        { before with scopeActivations := [{ scopeId := ⟨"child"⟩, count := 9007199254740991 }] }
        childOperation = none ∧
      prepareInternalScopeCreation? callProgram
        { before with callActivations := [{ elementId := ⟨"call"⟩, count := 9007199254740991 }] }
        callOperation = none

def duplicate_issuance_counters_are_refused_before_selecting_a_value : Bool := decide <|
    prepareInternalScopeCreation? childProgram
      { before with scopeActivations :=
          { scopeId := ⟨"child"⟩, count := 3 } :: before.scopeActivations }
      childOperation = none ∧
      prepareInternalScopeCreation? callProgram
        { before with callActivations :=
            { elementId := ⟨"call"⟩, count := 3 } :: before.callActivations }
        callOperation = none

def position_origins_and_ownership_are_checked_before_publication : Bool := decide <|
    prepareInternalScopeCreation?
      { childProgram with controlPlaces :=
          [{ id := ⟨"input"⟩, origin := ⟨⟨"same-flow"⟩⟩ },
            { id := ⟨"entry"⟩, origin := ⟨⟨"same-flow"⟩⟩ }] }
      before childOperation = none ∧
      prepareInternalScopeCreation?
        { callProgram with controlPlaceScopes :=
            [{ controlPlaceId := ⟨"input"⟩, scopeId := root.definitionScopeId },
              { controlPlaceId := ⟨"entry"⟩, scopeId := root.definitionScopeId }] }
        before callOperation = none

def snapshot_declarations_are_refused_for_both_creation_families : Bool := decide <|
    prepareInternalScopeCreation?
      { childProgram with
        compensationEventSubProcessSnapshots :=
          some { targets := [], maxRecords := 4, maxCanonicalBytes := 1000 } }
      before childOperation = none ∧
      prepareInternalScopeCreation?
        { callProgram with
          compensationEventSubProcessSnapshots :=
            some { targets := [], maxRecords := 4, maxCanonicalBytes := 1000 } }
        before callOperation = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("both_creation_preparations_are_nonvacuous_and_refine_the_raw_evaluator", both_creation_preparations_are_nonvacuous_and_refine_the_raw_evaluator),
  ("publication_retains_both_owners_and_the_created_definition_origin", publication_retains_both_owners_and_the_created_definition_origin),
  ("lifecycle_templates_retain_distinct_scope_and_call_anchors_without_numbering", lifecycle_templates_retain_distinct_scope_and_call_anchors_without_numbering),
  ("footprints_protect_censuses_parentage_and_the_exact_issuance_domain", footprints_protect_censuses_parentage_and_the_exact_issuance_domain),
  ("checked_application_refuses_every_altered_preparation_component", checked_application_refuses_every_altered_preparation_component),
  ("child_entry_preserves_excess_units_while_call_refuses_repeated_input", child_entry_preserves_excess_units_while_call_refuses_repeated_input),
  ("duplicate_definition_identity_is_refused_before_matching_parent_metadata", duplicate_definition_identity_is_refused_before_matching_parent_metadata),
  ("duplicate_operation_identity_is_refused_before_matching_its_payload", duplicate_operation_identity_is_refused_before_matching_its_payload),
  ("duplicate_owner_identity_is_refused_before_matching_parent_metadata", duplicate_owner_identity_is_refused_before_matching_parent_metadata),
  ("unsafe_time_and_counter_issuance_are_refused", unsafe_time_and_counter_issuance_are_refused),
  ("duplicate_issuance_counters_are_refused_before_selecting_a_value", duplicate_issuance_counters_are_refused_before_selecting_a_value),
  ("position_origins_and_ownership_are_checked_before_publication", position_origins_and_ownership_are_checked_before_publication),
  ("snapshot_declarations_are_refused_for_both_creation_families", snapshot_declarations_are_refused_for_both_creation_families)
]

end BpmnSemantics.InternalScopeCreationPreparationConformance
