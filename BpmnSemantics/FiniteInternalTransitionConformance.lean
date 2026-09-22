import BpmnSemantics.SemanticProcess.InternalTransitionCanonicalBatchPublication
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! A structurally admitted claim-routing frontier runs beside human review and input-bound
coverage assessment. Admission here is Program/runtime admission, not registered XML or reachability.
-/

namespace BpmnSemantics.FiniteInternalTransitionConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def processId : ProcessId := ⟨"Process_ClaimAssessment"⟩
private def instanceId : SemanticId := ⟨"claim-4711"⟩
private def commandId : SemanticId := ⟨"claim-routing"⟩
private def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId processId

private def directInput : DirectActivityDataInput :=
  { associationId := "InputAssociation_Coverage"
    sourcePropertyId := "Property_ClaimSummary"
    targetDataInputId := "Input_Coverage"
    targetDataInputName := some "Claim summary" }

private def directOutput : DirectActivityDataOutput :=
  { associationId := "OutputAssociation_Coverage"
    sourceDataOutputId := "Output_Coverage"
    sourceDataOutputName := some "Decision"
    targetPropertyId := "Property_CoverageDecision" }

private def data : SemanticOperation :=
  .awaitDataInputOutputUserTask ⟨"operation:UserTask_Coverage"⟩
    { elementId := ⟨"UserTask_Coverage"⟩ } ⟨"place:Flow_A_Input"⟩ ⟨"place:Flow_A_Output"⟩
    ⟨"UserTask_Coverage"⟩ (some "Coverage") directInput directOutput

private def ordinary : SemanticOperation :=
  .awaitUserTask ⟨"operation:UserTask_Review"⟩ { elementId := ⟨"UserTask_Review"⟩ }
    ⟨"place:Flow_B_Input"⟩ ⟨"place:Flow_B_Output"⟩
    { id := ⟨"UserTask_Review"⟩, name := some "Review" }

private def routing : SemanticOperation :=
  .duplicate ⟨"operation:Route_Claim"⟩ { elementId := ⟨"Route_Claim"⟩ }
    ⟨"place:Flow_C_Input"⟩ [⟨"place:Flow_C_Archive"⟩, ⟨"place:Flow_C_Notify"⟩]

private def operations : List SemanticOperation :=
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

private def places : List ControlPlace :=
  ["Flow_A_Input", "Flow_A_Output", "Flow_B_Input", "Flow_B_Output", "Flow_C_Archive",
    "Flow_C_Input", "Flow_C_Notify", "Flow_Entry", "Flow_Join"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := { elementId := ⟨name⟩ } }

private def program : Program :=
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

private def summary : VariableBinding :=
  { name := "Property_ClaimSummary", value := .string "Claim summary" }

private def ready : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := rootDefinitionScopeId processId, count := 1 }]
    tokens := ["place:Flow_A_Input", "place:Flow_B_Input", "place:Flow_C_Input"].map fun place =>
      { placeId := ⟨place⟩, owner }
    activations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 2 }]
    activityActivations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 7 }]
    logicalTimeMs := 321
    variables := { process := { bindings := [summary] }, activities := [] } }

private def frontier : List SemanticOperation := [data, ordinary, routing]
private def prepared : List PreparedInternalTransition :=
  (prepareInternalTransitionBatch? program ready frontier).getD []

theorem fixture_is_admitted :
    programWellFormed program = true ∧
      runtimeStateWellFormed program instanceId ready = true ∧
      (projectOpenFlowNodeOccurrences? program ready).isSome = true := by
  decide +kernel

theorem mixed_frontier_is_classified :
    prepareInternalTransitionBatch? program ready frontier = some prepared ∧
      prepared.length = 3 ∧
      prepared.map (fun
        | .arming (.data _ _) => "composed-data"
        | .arming (.ordinary _ _) => "ordinary"
        | .localControl _ => "local-control"
        | .scopeCreation _ => "scope-creation"
        | .regional _ => "regional"
        | .ordinaryEnd _ => "ordinary-end") =
        ["composed-data", "ordinary", "local-control"] := by
  decide +kernel

theorem every_permutation_has_one_defined_canonical_publication
    (reordered : List PreparedInternalTransition) (permutation : prepared.Perm reordered) :
    ∃ final publications,
      acceptedPreparedTransitionBatch? program instanceId commandId 37 ready prepared =
        some (final, publications) ∧
      acceptedPreparedTransitionBatch? program instanceId commandId 37 ready reordered =
        some (final, publications) ∧
      applyInternalTransitionBatch program ready prepared = final ∧
      applyInternalTransitionBatch program ready reordered = final ∧
      runPreparedTransitionBatch? program ready prepared = some final ∧
      runPreparedTransitionBatch? program ready reordered = some final ∧
      fireInternalTransitionBatch? program ready
        (prepared.map PreparedInternalTransition.operation) = some final ∧
      fireInternalTransitionBatch? program ready
        (reordered.map PreparedInternalTransition.operation) = some final ∧
      runtimeStateWellFormed program instanceId final = true ∧
      final.control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true := by
  have selected := prepareInternalTransitionBatch_sound program ready frontier prepared
    mixed_frontier_is_classified.1
  exact prepared_transition_canonical_batch_publication_perm program ready prepared reordered
    instanceId commandId 37 fixture_is_admitted.1 fixture_is_admitted.2.1 rfl
    fixture_is_admitted.2.2 rfl selected.2.1 selected.2.2.2.1 selected.2.2.1 selected.1 permutation

private def templates : List InternalTransitionPublicationTemplate :=
  (prepared.mapM (preparedTransitionPublicationTemplate? program ready)).getD []

private def publications : List InstantiatedInternalTransitionPublication :=
  instantiateTransitionPublicationBatch commandId 37 templates

theorem original_templates_are_defined :
    prepared.mapM (preparedTransitionPublicationTemplate? program ready) = some templates := by
  decide +kernel

theorem actual_batch_uses_the_complete_original_templates :
    acceptedPreparedTransitionBatch? program instanceId commandId 37 ready prepared =
      some (applyInternalTransitionBatch program ready prepared, publications) := by
  have selected := prepareInternalTransitionBatch_sound program ready frontier prepared
    mixed_frontier_is_classified.1
  obtain ⟨values, found, actual⟩ := prepared_transition_canonical_batch_publication
    program ready prepared instanceId commandId 37 fixture_is_admitted.1
    fixture_is_admitted.2.1 rfl fixture_is_admitted.2.2 rfl selected.2.1
    selected.2.2.2.1 selected.2.2.1 selected.1
  rw [original_templates_are_defined] at found
  cases found
  exact actual

theorem canonical_numbering_keeps_records_and_local_lifecycle_aligned :
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
          ended := [{ anchor := .transition commandId 37 0, terminal := .completed }] } := by
  decide +kernel

private def alteredLocal : Option PreparedInternalTransition :=
  (prepareInternalTransition? program ready routing).map fun
    | .localControl selected => .localControl
        { selected with publicationTemplate :=
            { selected.publicationTemplate with logicalTimeMs := 322 } }
    | other => other

theorem same_operation_with_altered_publication_time_is_refused :
    alteredLocal.map PreparedInternalTransition.operation = some routing ∧
      alteredLocal.bind (applyPreparedInternalTransition? program ready) = none ∧
      (prepareInternalTransition? program { ready with logicalTimeMs := 322 } routing).isSome = true ∧
      (prepareInternalTransition? program ready routing).bind
        (applyPreparedInternalTransition? program { ready with logicalTimeMs := 322 }) = none := by
  decide +kernel

private def conflictingRouting : SemanticOperation :=
  .duplicate ⟨"operation:Route_Claim"⟩ { elementId := ⟨"Route_Claim"⟩ }
    ⟨"place:Flow_C_Input"⟩ [⟨"place:Flow_A_Input"⟩, ⟨"place:Flow_C_Notify"⟩]

private def conflictingProgram : Program :=
  { program with operations := operations.map fun operation =>
      if operation.id = routing.id then conflictingRouting else operation }

theorem individually_prepared_input_writer_and_reader_cannot_form_a_batch :
    [data, ordinary, conflictingRouting].all
      (fun operation => (prepareInternalTransition? conflictingProgram ready operation).isSome) = true ∧
      prepareInternalTransitionBatch? conflictingProgram ready
        [data, ordinary, conflictingRouting] = none := by
  decide +kernel

private def numberedBeforeSorting (values : List InternalTransitionPublicationTemplate) :
    List InstantiatedInternalTransitionPublication :=
  canonicalInstantiatedTransitionPublications
    (numberTransitionPublicationTemplates commandId 37 values)

theorem numbering_before_sort_changes_the_local_lifecycle_anchor :
    (numberedBeforeSorting templates).head?.map
        (fun publication => publication.lifecycle.started.map (·.anchor)) =
      some [.transition commandId 39 0] ∧
      (numberedBeforeSorting templates.reverse).head?.map
        (fun publication => publication.lifecycle.started.map (·.anchor)) =
      some [.transition commandId 37 0] := by
  decide +kernel

theorem canonical_numbering_ignores_reversed_execution_order :
    instantiateTransitionPublicationBatch commandId 37 templates =
      instantiateTransitionPublicationBatch commandId 37 templates.reverse := by
  have selected := prepareInternalTransitionBatch_sound program ready frontier prepared
    mixed_frontier_is_classified.1
  have distinct := prepared_transition_batch_template_ids_unique program ready prepared templates
    original_templates_are_defined selected.2.2.1
  exact instantiateTransitionPublicationBatch_perm commandId 37 templates templates.reverse
    distinct (List.reverse_perm _).symm

private def ending : SemanticOperation :=
  .reachNoneEnd ⟨"operation:End_Claim"⟩ { elementId := ⟨"End_Claim"⟩ } ⟨"place:Flow_Join"⟩

private def endReady : RuntimeState :=
  { ready with tokens := addToken ready.tokens ⟨"place:Flow_Join"⟩ owner, endOccurrences := 7 }

private def endFrontier : List SemanticOperation := frontier ++ [ending]
private def endPrepared : List PreparedInternalTransition :=
  (prepareInternalTransitionBatch? program endReady endFrontier).getD []

/-- The extra token is a constructed admitted state, not a claim of reachability in this model. -/
theorem mixed_end_frontier_has_joint_predecessor_premises :
    runtimeStateWellFormed program instanceId endReady = true ∧
      (projectOpenFlowNodeOccurrences? program endReady).isSome = true ∧
      prepareInternalTransitionBatch? program endReady endFrontier = some endPrepared ∧
      endPrepared.length = 4 ∧
      endPrepared.any (fun | .ordinaryEnd _ => true | _ => false) = true := by
  decide +kernel

theorem mixed_end_permutations_have_exact_accepted_publication
    (reordered : List PreparedInternalTransition) (permutation : endPrepared.Perm reordered) :
    ∃ final publications,
      acceptedPreparedTransitionBatch? program instanceId commandId 41 endReady endPrepared =
        some (final, publications) ∧
      acceptedPreparedTransitionBatch? program instanceId commandId 41 endReady reordered =
        some (final, publications) ∧
      fireInternalTransitionBatch? program endReady
        (reordered.map PreparedInternalTransition.operation) = some final ∧
      runtimeStateWellFormed program instanceId final = true := by
  have premise := mixed_end_frontier_has_joint_predecessor_premises
  have selected := prepareInternalTransitionBatch_sound program endReady endFrontier endPrepared premise.2.2.1
  obtain ⟨final, publications, left, right, _, _, _, _, _, fired, valid, _⟩ :=
    prepared_transition_canonical_batch_publication_perm program endReady endPrepared reordered
      instanceId commandId 41 fixture_is_admitted.1 premise.1 rfl premise.2.1 rfl
      selected.2.1 selected.2.2.2.1 selected.2.2.1 selected.1 permutation
  exact ⟨final, publications, left, right, fired, valid⟩

theorem ordinary_end_retains_relative_count_and_canonical_index :
    (applyInternalTransitionBatch program endReady endPrepared).endOccurrences = 8 ∧
      ((endPrepared.mapM (preparedTransitionPublicationTemplate? program endReady)).map
        (instantiateTransitionPublicationBatch commandId 41)).map
          (fun publications => publications.head?.map fun publication =>
            (publication.record.operationId, publication.transitionIndex,
              publication.lifecycle.started.map (·.anchor))) =
        some (some (ending.id, 41, [.transition commandId 41 0])) := by
  decide +kernel

end BpmnSemantics.FiniteInternalTransitionConformance
