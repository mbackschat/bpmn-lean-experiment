import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! An admitted claim-assessment frontier separates retained finite arming from ID-only execution. -/

namespace BpmnSemantics.FiniteInternalArmingConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def processId : ProcessId := ⟨"Process_ClaimAssessment"⟩
private def instanceId : SemanticId := ⟨"claim-4711"⟩
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

private def timer : SemanticOperation :=
  .awaitTimer ⟨"operation:Timer_Claim"⟩ { elementId := ⟨"Timer_Claim"⟩ }
    ⟨"place:Flow_C_Input"⟩ ⟨"place:Flow_C_Output"⟩
    { elementId := ⟨"Timer_Claim"⟩, durationMs := 1000 }

private def operations : List SemanticOperation :=
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

private def places : List ControlPlace :=
  ["Flow_A_Input", "Flow_A_Output", "Flow_B_Input", "Flow_B_Output", "Flow_C_Input",
    "Flow_C_Output", "Flow_Entry", "Flow_Join"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := { elementId := ⟨name⟩ } }

private def program : Program :=
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

private def frontier : List SemanticOperation := [data, ordinary, timer]
private def prepared : List PreparedInternalArming :=
  (prepareInternalArmingBatch? program ready frontier).getD []

theorem fixture_is_admitted :
    programWellFormed program = true ∧
      runtimeStateWellFormed program instanceId ready = true ∧
      (projectOpenFlowNodeOccurrences? program ready).isSome = true := by
  decide +kernel

theorem entire_frontier_is_prepared :
    prepareInternalArmingBatch? program ready frontier = some prepared ∧ prepared.length = 3 := by
  decide +kernel

theorem every_permutation_has_one_defined_canonical_publication
    (reordered : List PreparedInternalArming) (permutation : prepared.Perm reordered) :
    ∃ final publications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true ∧
      canonicalCollectionOrder final = true ∧
      acceptedPreparedArmingBatch? program instanceId ⟨"claim-review"⟩ 37 ready prepared =
        some (final, publications) ∧
      acceptedPreparedArmingBatch? program instanceId ⟨"claim-review"⟩ 37 ready reordered =
        some (final, publications) := by
  have selected := prepareInternalArmingBatch_sound program ready frontier prepared
    entire_frontier_is_prepared.1
  exact prepared_arming_batch_publication_perm program instanceId ⟨"claim-review"⟩ 37 ready
    prepared reordered fixture_is_admitted.1 fixture_is_admitted.2.1 fixture_is_admitted.2.2
    rfl selected.2.1 selected.2.2.1 permutation

private def staleStates : List RuntimeState :=
  [ { ready with variables :=
        { ready.variables with process := { bindings := [{ summary with value := .string "Changed" }] } } }
  , { ready with logicalTimeMs := 322 }
  , { ready with activations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 3 }] }
  , { ready with activityActivations := [{ taskId := ⟨"UserTask_Coverage"⟩, count := 8 }] } ]

theorem changed_complete_preparations_refuse_the_same_operation_id :
    staleStates.all (fun state =>
      (prepareInternalArming? program state data).isSome &&
      ((prepareInternalArming? program ready data).bind
        (applyPreparedInternalArming? program state)).isNone) = true := by
  decide +kernel

private def start : Stimulus :=
  .startProcess ⟨"start-claim-batch"⟩ ⟨processId.value⟩ instanceId [summary]

theorem committed_start_closes_the_mixed_frontier :
    (applyStimulus 5 program initialState start).outcome = .committed := by
  decide +kernel

private def trace : TracedStimulusResult :=
  applyStimulusTraced 5 program initialState start

theorem committed_publication_keeps_the_complete_batch_aligned :
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
      runtimeStateWellFormed program instanceId trace.result.state = true := by
  decide +kernel

theorem insufficient_batch_fuel_restores_the_whole_command :
    let refused := applyStimulusTraced 4 program initialState start
    refused.result =
        { outcome := .rolledBack, state := initialState,
          internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      refused.committedTransitions = [] ∧
      refused.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

private def standaloneInput : SemanticOperation :=
  .awaitDataInputUserTask ⟨"operation:UserTask_Coverage"⟩
    { elementId := ⟨"UserTask_Coverage"⟩ } ⟨"place:Flow_A_Input"⟩ ⟨"place:Flow_A_Output"⟩
    ⟨"UserTask_Coverage"⟩ (some "Coverage") directInput

private def standaloneOutput : SemanticOperation :=
  .awaitDataOutputUserTask ⟨"operation:UserTask_Review"⟩ { elementId := ⟨"UserTask_Review"⟩ }
    ⟨"place:Flow_B_Input"⟩ ⟨"place:Flow_B_Output"⟩ ⟨"UserTask_Review"⟩ (some "Review") directOutput

private def standaloneProgram : Program :=
  { program with
    identity := { program.identity with semanticProfile := activityDataInputUserTaskProfileId }
    operations := program.operations.map fun operation =>
      if operation.id = data.id then standaloneInput
      else if operation.id = ordinary.id then standaloneOutput
      else operation }

private def standaloneFrontier : List SemanticOperation := [standaloneInput, standaloneOutput, timer]
private def standalonePrepared : List PreparedInternalArming :=
  (prepareInternalArmingBatch? standaloneProgram ready standaloneFrontier).getD []

theorem standalone_frontier_has_valid_complete_predecessors :
    programWellFormed standaloneProgram = true ∧
      runtimeStateWellFormed standaloneProgram instanceId ready = true ∧
      (projectOpenFlowNodeOccurrences? standaloneProgram ready).isSome = true ∧
      prepareInternalArmingBatch? standaloneProgram ready standaloneFrontier = some standalonePrepared ∧
      standalonePrepared.length = 3 := by
  decide +kernel

theorem standalone_every_permutation_has_one_defined_publication
    (reordered : List PreparedInternalArming) (permutation : standalonePrepared.Perm reordered) :
    ∃ final publications,
      runtimeStateWellFormed standaloneProgram instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? standaloneProgram final).isSome = true ∧
      canonicalCollectionOrder final = true ∧
      acceptedPreparedArmingBatch? standaloneProgram instanceId ⟨"standalone-review"⟩ 37 ready
        standalonePrepared = some (final, publications) ∧
      acceptedPreparedArmingBatch? standaloneProgram instanceId ⟨"standalone-review"⟩ 37 ready
        reordered = some (final, publications) := by
  obtain ⟨programValid, stateValid, projected, prepared, _⟩ :=
    standalone_frontier_has_valid_complete_predecessors
  have selected := prepareInternalArmingBatch_sound standaloneProgram ready standaloneFrontier
    standalonePrepared prepared
  exact prepared_arming_batch_publication_perm standaloneProgram instanceId ⟨"standalone-review"⟩ 37
    ready standalonePrepared reordered programValid stateValid projected rfl selected.2.1
    selected.2.2.1 permutation

theorem standalone_output_prepares_an_empty_scope_without_Process_data :
    let missing := { ready with variables := { ready.variables with process := { bindings := [] } } }
    prepareInternalArming? standaloneProgram missing standaloneInput = none ∧
      (match prepareInternalArming? standaloneProgram missing standaloneOutput with
        | some (.data contract patch) => patch.bindings.isEmpty &&
            (footprintOfDataPatch contract patch).reads.all (fun atom =>
              match atom with | .processVariable _ => false | _ => true)
        | _ => false) = true := by
  decide +kernel

theorem standalone_start_publishes_or_rolls_back_the_complete_frontier :
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
      refused.committedTransitions = [] ∧ refused.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

end BpmnSemantics.FiniteInternalArmingConformance
