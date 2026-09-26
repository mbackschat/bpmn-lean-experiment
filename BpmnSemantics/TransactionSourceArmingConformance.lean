import BpmnSemantics.TransactionSourceConformance
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalSnapshotArming

/-! # Selected Transaction child Task arming

This finite source-derived witness instantiates the existing quantified prepared-batch laws at a
reachable post-split state. It does not prove reachable-frontier completeness for arbitrary admitted
Transaction graphs. The missing-register discriminator separates two enabled operation identities
from the full predecessor validity required by those laws.
-/

namespace BpmnSemantics.TransactionSourceArmingConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
open BpmnSemantics.TransactionSourceConformance

private def program : Program := lowerCheckedProcess (transactionCheckedSource "" false)
private def instanceId : SemanticId := ⟨"tx-arming"⟩
private def commandId : SemanticId := ⟨"start-transaction-arming"⟩
private def childOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := ⟨"scope:Transaction"⟩, activation := 1 }

private def start : Stimulus :=
  .startProcess commandId ⟨program.processId.value⟩ instanceId []

private def admitted : ExternalAdmission :=
  admitStimulusWithCompensationSnapshots program initialState start

private def selectedSuccessor? (before : RuntimeState) (element : String) : Option RuntimeState := do
  let operation ← program.operations.find? (fun operation => operation.id.value == "operation:" ++ element)
  match attemptInternalOperation program operation before with
  | .applied step => some step.successor
  | .disabled _ | .refused _ _ => none

private def initiated : RuntimeState :=
  (selectedSuccessor? admitted.state "RootStart").getD initialState
private def entered : RuntimeState :=
  (selectedSuccessor? initiated "Transaction").getD initialState
private def ready : RuntimeState :=
  (selectedSuccessor? entered "Split").getD initialState

private def frontier : List SemanticOperation :=
  (snapshotInternalTransitionFrontier program ready).transitions.map (·.1)
private def prepared : List PreparedInternalArming :=
  (prepareInternalArmingBatch? program ready frontier).getD []

private def childRegister : List CompensationActivityRetention :=
  [{ owner := childOwner, nextCompletionOrdinal := 1, records := [] }]

private def erasedRegister : RuntimeState :=
  { ready with compensationActivityRetentions := [] }

theorem selected_program_is_source_lowered_and_admitted :
    programWellFormed program = true ∧ programProfileCapabilitiesValid program = true :=
  ⟨short_lowered_program_is_well_formed, short_lowered_program_is_profile_admitted⟩

theorem selected_start_commits_without_a_premature_child_register :
    admitted.outcome = .committed ∧ admitted.state.compensationActivityRetentions = [] := by
  decide +kernel

theorem selected_start_reaches_initiated_root :
    selectedSuccessor? admitted.state "RootStart" = some initiated := by
  decide +kernel

theorem selected_entry_reaches_a_registered_child :
    selectedSuccessor? initiated "Transaction" = some entered ∧
      entered.compensationActivityRetentions = childRegister ∧
      entered.scopeOccurrences.any (fun scope => scope.id == childOwner) = true := by
  decide +kernel

theorem selected_split_reaches_exact_child_tokens :
    selectedSuccessor? entered "Split" = some ready ∧
      ready.tokens = [{ placeId := ⟨"place:f5"⟩, owner := childOwner },
        { placeId := ⟨"place:f6"⟩, owner := childOwner }] ∧
      ready.waits = [] ∧ ready.compensationActivityRetentions = childRegister := by
  decide +kernel

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

theorem complete_reached_frontier_contains_only_the_two_child_tasks :
    (snapshotInternalTransitionFrontier program ready).refusal = none ∧
      frontier.map (·.id) = [⟨"operation:Reserve"⟩, ⟨"operation:Withdraw"⟩] ∧
      frontier.all (fun operation => match operation with
        | .awaitUserTask .. => true
        | _ => false) = true := by
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

theorem reversed_order_exercises_withdraw_before_reserve :
    prepared.reverse.map (fun member => member.operation.id) =
      [⟨"operation:Withdraw"⟩, ⟨"operation:Reserve"⟩] := by
  decide +kernel

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

theorem erased_child_register_invalidates_the_same_two_task_offers :
    runtimeStateWellFormed program instanceId erasedRegister = false ∧
      (snapshotInternalTransitionFrontier program erasedRegister).transitions.map (fun step => step.1.id) =
        [⟨"operation:Reserve"⟩, ⟨"operation:Withdraw"⟩] := by
  decide +kernel

end BpmnSemantics.TransactionSourceArmingConformance
