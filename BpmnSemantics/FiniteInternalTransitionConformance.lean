module

public import BpmnSemantics.FiniteInternalTransitionConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.InternalTransitionCanonicalBatchPublication
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.InternalTransitionBatch
public import BpmnSemantics.SemanticProcess.InternalRegionalParallelCensus
import BpmnSemantics.SemanticProcess.InternalTransitionBatchPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationOrder
import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation
/-! A structurally admitted claim-routing frontier runs beside human review and input-bound
coverage assessment. Admission here is Program/runtime admission, not registered XML or reachability.
-/

@[expose] public section

namespace BpmnSemantics.FiniteInternalTransitionConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
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
        | .timerTask _ _ => "timer-task"
        | .messageTask _ _ => "message-task"
        | .boundedScope _ _ => "bounded-scope"
        | .localControl _ => "local-control"
        | .scopeCreation _ => "scope-creation"
        | .regional _ => "regional"
        | .ordinaryEnd _ => "ordinary-end"
        | .mergeInput _ => "merge-input") =
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
  have ordinary : ∀ member ∈ prepared, member.alternative = .operation member.operation.id := by decide +kernel
  have result := prepared_transition_canonical_batch_publication_perm program ready prepared reordered
    instanceId commandId 37 fixture_is_admitted.1 fixture_is_admitted.2.1 rfl
    fixture_is_admitted.2.2 rfl selected.2.1 selected.2.2.2.1 selected.2.2.1 selected.1 permutation
  rw [fireInternalAlternativeBatch_ordinary_preparations program ready prepared ordinary,
    fireInternalAlternativeBatch_ordinary_preparations program ready reordered
      (fun member present => ordinary member (permutation.mem_iff.mpr present))] at result
  exact result

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

theorem canonical_numbering_ignores_reversed_execution_order :
    instantiateTransitionPublicationBatch commandId 37 templates =
      instantiateTransitionPublicationBatch commandId 37 templates.reverse := by
  have selected := prepareInternalTransitionBatch_sound program ready frontier prepared
    mixed_frontier_is_classified.1
  have distinct := prepared_transition_batch_template_ids_unique program ready prepared templates
    original_templates_are_defined selected.2.2.1
  exact instantiateTransitionPublicationBatch_perm commandId 37 templates templates.reverse
    distinct (List.reverse_perm _).symm

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
  have ordinary : ∀ member ∈ endPrepared, member.alternative = .operation member.operation.id := by decide +kernel
  rw [fireInternalAlternativeBatch_ordinary_preparations program endReady reordered
    (fun member present => ordinary member (permutation.mem_iff.mpr present))] at fired
  exact ⟨final, publications, left, right, fired, valid⟩

end BpmnSemantics.FiniteInternalTransitionConformance
