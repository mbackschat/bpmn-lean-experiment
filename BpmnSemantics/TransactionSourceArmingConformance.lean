module

public import BpmnSemantics.TransactionSourceArmingConformanceCheckFixtures
public import BpmnSemantics.TransactionSourceConformance
public import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
public import BpmnSemantics.SemanticProcess.InternalSnapshotArming
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
/-! # Selected Transaction child Task arming

This finite source-derived witness instantiates the existing quantified prepared-batch laws at a
reachable post-split state. It does not prove reachable-frontier completeness for arbitrary admitted
Transaction graphs. The missing-register discriminator separates two enabled operation identities
from the full predecessor validity required by those laws.
-/

@[expose] public section

namespace BpmnSemantics.TransactionSourceArmingConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
open BpmnSemantics.TransactionSourceConformance
theorem selected_program_is_source_lowered_and_admitted :
    programWellFormed program = true ∧ programProfileCapabilitiesValid program = true :=
  ⟨short_lowered_program_is_well_formed, short_lowered_program_is_profile_admitted⟩

theorem reached_predecessor_is_runtime_valid :
    runtimeStateWellFormed program instanceId ready = true := by
  decide +kernel

theorem reached_predecessor_has_an_open_projection :
    (projectOpenFlowNodeOccurrences? program ready).isSome = true := by
  decide +kernel

theorem selected_program_and_reached_predecessor_have_no_snapshots :
    program.compensationEventSubProcessSnapshots = none ∧
      ready.compensationParentContextRetentions = [] := by
  decide +kernel

theorem reached_frontier_retains_both_complete_preparations :
    prepareInternalArmingBatch? program ready frontier = some prepared ∧
      prepared.length = 2 := by
  decide +kernel

theorem reached_preparations_are_selected_and_pairwise_independent :
    PreparedArmingList program ready prepared ∧
      prepared.Pairwise PreparedInternalArming.Independent ∧
      prepared.map PreparedInternalArming.operation = frontier := by
  have selected := prepareInternalArmingBatch_sound program ready frontier prepared
    reached_frontier_retains_both_complete_preparations.1
  exact ⟨selected.2.1, selected.2.2.1, selected.2.2.2⟩

theorem every_selected_arming_permutation_has_defined_canonical_state_and_accepted_publication
    (reordered : List PreparedInternalArming) (permutation : prepared.Perm reordered) :
    ∃ final publications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true ∧
      canonicalCollectionOrder final = true ∧
      acceptedPreparedArmingBatch? program instanceId commandId 4 ready prepared =
        some (final, publications) ∧
      acceptedPreparedArmingBatch? program instanceId commandId 4 ready reordered =
        some (final, publications) := by
  exact prepared_arming_batch_publication_perm program instanceId commandId 4 ready prepared reordered
    selected_program_is_source_lowered_and_admitted.1 reached_predecessor_is_runtime_valid
    reached_predecessor_has_an_open_projection selected_program_and_reached_predecessor_have_no_snapshots.1
    reached_preparations_are_selected_and_pairwise_independent.1
    reached_preparations_are_selected_and_pairwise_independent.2.1 permutation

theorem every_selected_arming_permutation_agrees_in_the_production_evaluator
    (reordered : List PreparedInternalArming) (permutation : prepared.Perm reordered) :
    ∃ final leftPublications rightPublications,
      fireInternalBatch? program commandId ready prepared =
        some { state := final, publications := leftPublications } ∧
      fireInternalBatch? program commandId ready reordered =
        some { state := final, publications := rightPublications } ∧
      canonicalPublicationPairs leftPublications = canonicalPublicationPairs rightPublications := by
  exact prepared_arming_evaluator_batch_perm program instanceId commandId ready prepared reordered
    selected_program_is_source_lowered_and_admitted.1 reached_predecessor_is_runtime_valid
    reached_predecessor_has_an_open_projection selected_program_and_reached_predecessor_have_no_snapshots.1
    reached_preparations_are_selected_and_pairwise_independent.1
    reached_preparations_are_selected_and_pairwise_independent.2.1 permutation

theorem both_child_task_orders_have_one_defined_accepted_publication :
    ∃ final publications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true ∧
      canonicalCollectionOrder final = true ∧
      acceptedPreparedArmingBatch? program instanceId commandId 4 ready prepared =
        some (final, publications) ∧
      acceptedPreparedArmingBatch? program instanceId commandId 4 ready prepared.reverse =
        some (final, publications) := by
  exact every_selected_arming_permutation_has_defined_canonical_state_and_accepted_publication
    prepared.reverse (List.reverse_perm prepared).symm

theorem selected_arming_preserves_the_empty_child_register_and_has_no_snapshots :
    (applyInternalArmingBatch ready prepared).compensationActivityRetentions = childRegister ∧
      (applyInternalArmingBatch ready prepared).compensationParentContextRetentions = [] ∧
      (applyInternalArmingBatch ready prepared).waits.map (·.owner) = [childOwner, childOwner] := by
  decide +kernel

theorem every_selected_arming_order_preserves_the_same_child_register
    (reordered : List PreparedInternalArming) (permutation : prepared.Perm reordered) :
    (applyInternalArmingBatch ready reordered).compensationActivityRetentions = childRegister ∧
      (applyInternalArmingBatch ready reordered).compensationParentContextRetentions = [] := by
  have same := prepared_arming_batch_perm program ready prepared reordered instanceId
    selected_program_is_source_lowered_and_admitted.1 reached_predecessor_is_runtime_valid
    reached_predecessor_has_an_open_projection reached_preparations_are_selected_and_pairwise_independent.1
    reached_preparations_are_selected_and_pairwise_independent.2.1 permutation
  rw [← same]
  exact ⟨selected_arming_preserves_the_empty_child_register_and_has_no_snapshots.1,
    selected_arming_preserves_the_empty_child_register_and_has_no_snapshots.2.1⟩

end BpmnSemantics.TransactionSourceArmingConformance
