import BpmnSemantics.SemanticProcess.InternalSnapshotArmingBatch
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.CompensationSourceLoweringFixtures

/-! Six ordinary wait families exercise retained preparation across a dormant snapshot declaration. -/

namespace BpmnSemantics.SnapshotInternalArmingConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def processId : ProcessId := ⟨"P"⟩
private def instanceId : SemanticId := ⟨"i"⟩
private def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId processId

private def ordinary : List SemanticOperation :=
  [ .awaitUserTask ⟨"a"⟩ { elementId := ⟨"a"⟩ } ⟨"a0"⟩ ⟨"a1"⟩ { id := ⟨"a"⟩, name := none }
  , .awaitMessage ⟨"b"⟩ { elementId := ⟨"b"⟩ } ⟨"b0"⟩ ⟨"b1"⟩
      { elementId := ⟨"b"⟩, channel := .directMessage ⟨"b"⟩ }
  , .awaitPayloadMessage ⟨"c"⟩ { elementId := ⟨"c"⟩ } ⟨"c0"⟩ ⟨"c1"⟩
      { elementId := ⟨"c"⟩, channel := .operationMessage ⟨"ci"⟩ ⟨"co"⟩ ⟨"cm"⟩ }
      { associationId := "o", sourceDataOutputId := "d", sourceDataOutputName := none,
        targetPropertyId := "v" }
  , .awaitCorrelatedPayloadMessage ⟨"d"⟩ { elementId := ⟨"d"⟩ } ⟨"d0"⟩ ⟨"d1"⟩
      { elementId := ⟨"d"⟩, channel := .operationMessage ⟨"di"⟩ ⟨"do"⟩ ⟨"dm"⟩ } "k" "cp"
      { language := correlationScalarPathLanguage, body := "payload" }
      { language := correlationScalarPathLanguage, body := "property:v", propertyId := "v" }
  , .awaitTimer ⟨"e"⟩ { elementId := ⟨"e"⟩ } ⟨"e0"⟩ ⟨"e1"⟩
      { elementId := ⟨"e"⟩, durationMs := 1000 }
  , .awaitEffect ⟨"f"⟩ { elementId := ⟨"f"⟩ } ⟨"f0"⟩ ⟨"f1"⟩
      { elementId := ⟨"f"⟩,
        descriptor := { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := "urn:bpmn-lean:effect-operation:probe-v1" },
        inputMappings := [], outputMappings := [] } none ]

private def operations : List SemanticOperation := ordinary ++
  [ .duplicate ⟨"g"⟩ { elementId := ⟨"g"⟩ } ⟨"z0"⟩
      [⟨"a0"⟩, ⟨"b0"⟩, ⟨"c0"⟩, ⟨"d0"⟩, ⟨"e0"⟩, ⟨"f0"⟩]
  , .synchronize ⟨"h"⟩ { elementId := ⟨"h"⟩ }
      [⟨"a1"⟩, ⟨"b1"⟩, ⟨"c1"⟩, ⟨"d1"⟩, ⟨"e1"⟩, ⟨"f1"⟩] ⟨"z1"⟩
  , .reachNoneEnd ⟨"i"⟩ { elementId := ⟨"i"⟩ } ⟨"z1"⟩
  , .initiate ⟨"j"⟩ { elementId := ⟨"j"⟩ } ⟨"z0"⟩
  , .completeScope ⟨"k"⟩ { elementId := ⟨"P"⟩ } (rootDefinitionScopeId processId) none ]

private def places : List ControlPlace :=
  ["a0", "a1", "b0", "b1", "c0", "c1", "d0", "d1", "e0", "e1", "f0", "f1", "z0", "z1"].map
    fun name => { id := ⟨name⟩, origin := { elementId := ⟨name⟩ } }

private def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"parallel-fork-join-draft"⟩
        sourceId := ⟨"s"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes := [rootDefinitionScope processId,
      { id := ⟨"scope:Z"⟩, parentScopeId := some (rootDefinitionScopeId processId), originElementId := ⟨"Z"⟩ }]
    operationScopes := operations.map fun operation =>
      { operationId := operation.id, scopeId := rootDefinitionScopeId processId }
    controlPlaceScopes := places.map fun place =>
      { controlPlaceId := place.id, scopeId := rootDefinitionScopeId processId }
    controlPlaces := places
    operations
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId := rootDefinitionScopeId processId, handlerScopeId := ⟨"scope:Z"⟩ }],
        maxRecords := 1, maxCanonicalBytes := 4096 } }

private def ready : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := rootDefinitionScopeId processId, count := 1 }]
    tokens := ["a0", "b0", "c0", "d0", "e0", "f0"].map fun name => { placeId := ⟨name⟩, owner }
    variables := { process := { bindings := [{ name := "v", value := .string "x" }] }, activities := [] }
    compensationParentContextRetentions := [.provisional { id := owner, parent := none } ⟨"scope:Z"⟩] }

private def prepared : List PreparedInternalArming :=
  (prepareSnapshotArmingBatch? program ready ordinary).getD []

theorem six_family_predecessor_is_valid :
    programWellFormed program = true ∧
      runtimeStateWellFormed program instanceId ready = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program ready).isSome = true := by
  decide +kernel

theorem six_families_retain_complete_preparations :
    prepareSnapshotArmingBatch? program ready ordinary = some prepared ∧ prepared.length = 6 ∧
      internalOperationFrontierPairwiseIndependent? program ready ordinary = false := by
  decide +kernel

theorem six_family_permutations_preserve_state_and_accepted_publication
    (reordered : List PreparedInternalArming) (permutation : prepared.Perm reordered) :
    ∃ final leftPublications rightPublications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program final).isSome = true ∧
      runPreparedSnapshotArmingBatch? program instanceId ⟨"c"⟩ ready prepared =
        some (final, leftPublications) ∧
      runPreparedSnapshotArmingBatch? program instanceId ⟨"c"⟩ ready reordered =
        some (final, rightPublications) ∧
      canonicalAcceptedInternalPublicationPairs leftPublications =
        canonicalAcceptedInternalPublicationPairs rightPublications := by
  have selected := prepareSnapshotArmingBatch_sound program ready ordinary prepared
    six_families_retain_complete_preparations.1
  exact snapshot_prepared_batch_publication_perm program instanceId ⟨"c"⟩ ready prepared reordered
    six_family_predecessor_is_valid.1 six_family_predecessor_is_valid.2.1
    six_family_predecessor_is_valid.2.2 selected.2.2.1 selected.2.2.2.1 permutation

theorem changed_predecessor_rejects_retained_preparation :
    prepared.all (fun entry =>
      (prepareSnapshotArming? program { ready with logicalTimeMs := 1 } entry.operation).isSome &&
      (applyPreparedSnapshotArming? program { ready with logicalTimeMs := 1 } entry).isNone) = true := by
  decide +kernel

theorem duplicate_operation_refuses_batching :
    (prepareSnapshotArmingBatch? program ready (ordinary ++ ordinary)).isNone = true := by
  decide +kernel

private def sourceStart : Stimulus :=
  .startProcess ⟨"s"⟩ ⟨CompensationSourceLoweringConformance.expectedProgram.processId.value⟩ ⟨"i"⟩
    [{ name := "Property_TravelDetails", value := .string "trip" }]

private def sourceTrace : TracedStimulusResult :=
  applyStimulusTracedWithCompensationSnapshots 4 CompensationSourceLoweringConformance.expectedProgram
    initialState sourceStart

theorem reviewed_source_start_commits_both_tasks_and_complete_publication :
    sourceTrace.result.outcome = .committed ∧
      sourceTrace.result.state.waits.length = 2 ∧
      sourceTrace.committedTransitions.length = 5 ∧
      sourceTrace.flowNodeOccurrenceLifecycles.length = 5 := by
  decide +kernel

theorem reviewed_source_insufficient_fuel_rolls_back_without_publication :
    let traced := applyStimulusTracedWithCompensationSnapshots 3
      CompensationSourceLoweringConformance.expectedProgram initialState sourceStart
    traced.result =
      { outcome := .rolledBack, state := initialState,
        internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      traced.committedTransitions = [] ∧ traced.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

end BpmnSemantics.SnapshotInternalArmingConformance
