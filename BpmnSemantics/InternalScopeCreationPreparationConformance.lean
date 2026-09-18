import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation

/-! # Complete scope-creation preparation witnesses

Constructed Programs and predecessor states distinguish local preparation and retained publication.
They establish no source admission, aggregate preservation, or regional batch execution.
-/

namespace BpmnSemantics.InternalScopeCreationPreparationConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def root : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"process"⟩, activation := 1 }

private def before : RuntimeState :=
  { initialState with
    control := .running root.processInstanceId
    scopeOccurrences := [{ id := root, parent := none }]
    tokens := [{ placeId := ⟨"input"⟩, owner := root }]
    scopeActivations := [{ scopeId := ⟨"child"⟩, count := 9 },
      { scopeId := ⟨"process"⟩, count := 1 }]
    callActivations := [{ elementId := ⟨"call"⟩, count := 9 }]
    logicalTimeMs := 42 }

private def childOperation : SemanticOperation :=
  .enterScope ⟨"enter"⟩ ⟨⟨"subprocess"⟩⟩ ⟨"input"⟩ ⟨"entry"⟩ ⟨"child"⟩

private def callOperation : SemanticOperation :=
  .invokeProcess ⟨"invoke"⟩ ⟨⟨"call"⟩⟩ ⟨"input"⟩ ⟨"callee"⟩
    ⟨"called-root"⟩ ⟨"entry"⟩ ⟨"return"⟩

private def childDefinition : DefinitionScope :=
  { id := ⟨"child"⟩, parentScopeId := some root.definitionScopeId,
    originElementId := ⟨"subprocess"⟩ }

private def calledDefinition : DefinitionScope :=
  { id := ⟨"called-root"⟩, parentScopeId := none, originElementId := ⟨"callee"⟩ }

private def programFor (operation : SemanticOperation) (created : DefinitionScope) : Program :=
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

private def childProgram := programFor childOperation childDefinition
private def callProgram := programFor callOperation calledDefinition

private def childId : ScopeOccurrenceId :=
  { root with definitionScopeId := childDefinition.id, activation := 10 }

private def calledId : ScopeOccurrenceId :=
  { processInstanceId := deriveCalledProcessInstanceId root.processInstanceId ⟨"call"⟩ 10,
    definitionScopeId := calledDefinition.id, activation := 1 }

private def applyPrepared (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option RuntimeState := do
  let prepared ← prepareInternalScopeCreation? program state operation
  applyPreparedInternalScopeCreation? program state prepared

theorem both_creation_preparations_are_nonvacuous_and_refine_the_raw_evaluator :
    (prepareInternalScopeCreation? childProgram before childOperation).isSome = true ∧
      (prepareInternalScopeCreation? callProgram before callOperation).isSome = true ∧
      applyPrepared childProgram before childOperation = fire? childProgram childOperation before ∧
      applyPrepared callProgram before callOperation = fire? callProgram callOperation before := by
  decide +kernel

theorem publication_retains_both_owners_and_the_created_definition_origin :
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
          exitedScopes := [] } := by
  decide +kernel

theorem lifecycle_templates_retain_distinct_scope_and_call_anchors_without_numbering :
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
          ended := [] } := by
  decide +kernel

theorem footprints_protect_censuses_parentage_and_the_exact_issuance_domain :
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
            calledRoot := calledId, returnOperationId := ⟨"return"⟩ })) = some true := by
  decide +kernel

private def alteredPreparations (prepared : PreparedInternalScopeCreation) :=
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

theorem checked_application_refuses_every_altered_preparation_component :
    (prepareInternalScopeCreation? childProgram before childOperation).map (fun prepared =>
      (alteredPreparations prepared).all fun altered =>
        (applyPreparedInternalScopeCreation? childProgram before altered).isNone) = some true := by
  decide +kernel

theorem child_entry_preserves_excess_units_while_call_refuses_repeated_input :
    let repeated := { before with tokens := before.tokens ++ before.tokens }
    (prepareInternalScopeCreation? childProgram repeated childOperation).isSome = true ∧
      (applyPrepared childProgram repeated childOperation).map
        (fun state => tokenMultiplicity state ⟨"input"⟩) = some 1 ∧
      prepareInternalScopeCreation? callProgram repeated callOperation = none := by
  decide +kernel

theorem duplicate_definition_identity_is_refused_before_matching_parent_metadata :
    prepareInternalScopeCreation?
      { childProgram with definitionScopes :=
          { childDefinition with parentScopeId := none } :: childProgram.definitionScopes }
      before childOperation = none ∧
      prepareInternalScopeCreation?
        { callProgram with definitionScopes :=
            { calledDefinition with parentScopeId := some root.definitionScopeId } ::
              callProgram.definitionScopes }
        before callOperation = none := by
  decide +kernel

theorem duplicate_operation_identity_is_refused_before_matching_its_payload :
    prepareInternalScopeCreation?
      { childProgram with
        operations := .enterScope ⟨"enter"⟩ ⟨⟨"other"⟩⟩ ⟨"input"⟩ ⟨"entry"⟩ ⟨"child"⟩ ::
          childProgram.operations }
      before childOperation = none := by
  decide +kernel

theorem duplicate_owner_identity_is_refused_before_matching_parent_metadata :
    prepareInternalScopeCreation? childProgram
      { before with scopeOccurrences :=
          { id := root, parent := some { root with activation := 2 } } :: before.scopeOccurrences }
      childOperation = none := by
  decide +kernel

theorem unsafe_time_and_counter_issuance_are_refused :
    prepareInternalScopeCreation? childProgram
      { before with logicalTimeMs := 9007199254740992 } childOperation = none ∧
      prepareInternalScopeCreation? childProgram
        { before with scopeActivations := [{ scopeId := ⟨"child"⟩, count := 9007199254740991 }] }
        childOperation = none ∧
      prepareInternalScopeCreation? callProgram
        { before with callActivations := [{ elementId := ⟨"call"⟩, count := 9007199254740991 }] }
        callOperation = none := by
  decide +kernel

theorem duplicate_issuance_counters_are_refused_before_selecting_a_value :
    prepareInternalScopeCreation? childProgram
      { before with scopeActivations :=
          { scopeId := ⟨"child"⟩, count := 3 } :: before.scopeActivations }
      childOperation = none ∧
      prepareInternalScopeCreation? callProgram
        { before with callActivations :=
            { elementId := ⟨"call"⟩, count := 3 } :: before.callActivations }
        callOperation = none := by
  decide +kernel

theorem position_origins_and_ownership_are_checked_before_publication :
    prepareInternalScopeCreation?
      { childProgram with controlPlaces :=
          [{ id := ⟨"input"⟩, origin := ⟨⟨"same-flow"⟩⟩ },
            { id := ⟨"entry"⟩, origin := ⟨⟨"same-flow"⟩⟩ }] }
      before childOperation = none ∧
      prepareInternalScopeCreation?
        { callProgram with controlPlaceScopes :=
            [{ controlPlaceId := ⟨"input"⟩, scopeId := root.definitionScopeId },
              { controlPlaceId := ⟨"entry"⟩, scopeId := root.definitionScopeId }] }
        before callOperation = none := by
  decide +kernel

theorem snapshot_declarations_are_refused_for_both_creation_families :
    prepareInternalScopeCreation?
      { childProgram with
        compensationEventSubProcessSnapshots :=
          some { targets := [], maxRecords := 4, maxCanonicalBytes := 1000 } }
      before childOperation = none ∧
      prepareInternalScopeCreation?
        { callProgram with
          compensationEventSubProcessSnapshots :=
            some { targets := [], maxRecords := 4, maxCanonicalBytes := 1000 } }
        before callOperation = none := by
  decide +kernel

end BpmnSemantics.InternalScopeCreationPreparationConformance
