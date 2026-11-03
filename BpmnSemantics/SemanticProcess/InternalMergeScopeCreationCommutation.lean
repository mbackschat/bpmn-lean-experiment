module

import BpmnSemantics.SemanticProcess.InternalMergeCommutation
import BpmnSemantics.SemanticProcess.InternalDeclaredEntryCommutation
import BpmnSemantics.SemanticProcess.InternalLocalControlSelectionFrames
import BpmnSemantics.SemanticProcess.NestedScopeDataLaws
import BpmnSemantics.SemanticProcess.InternalScopeCreationLocalControlCommutation
public import BpmnSemantics.SemanticProcess.InternalMergePreparation
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalMergePreparationLaws
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalLocalControlSelection
import all BpmnSemantics.SemanticProcess.InternalMergeCommutation
import all BpmnSemantics.SemanticProcess.InternalMergePreparation
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
import all BpmnSemantics.SemanticProcess.InternalSelectedBranchPatch

/-! Scope creation frames the exact Merge bucket through the existing patch footprint. This
preserves both complete artifacts under the [complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
A declared entry, which is a scope creation followed by a frame insertion, commutes with the Merge through the same law.
-/

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_merge_scope_creation_pair_commutes (program : Program) (state : RuntimeState)
    (operation scopeOperation : SemanticOperation) (alternative : InternalAlternative)
    (prepared : PreparedInternalMerge) (scopePrepared : PreparedInternalScopeCreation)
    (found : prepareInternalMerge? program state operation alternative = some prepared)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scopePrepared)
    (canonical : canonicalCollectionOrder state = true)
    (independent : localControlStateFootprintsNonInterfering scopePrepared.footprint prepared.footprint = true) :
    prepareInternalMerge? program (scopePrepared.selection.apply state) operation alternative = some prepared ∧
      prepareInternalScopeCreation? program (prepared.selection.apply state) scopeOperation = some scopePrepared ∧
      prepared.selection.apply (scopePrepared.selection.apply state) =
        scopePrepared.selection.apply (prepared.selection.apply state) := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative prepared found
  have separated : localControlStateFootprintsNonInterfering scopePrepared.footprint
      (internalLocalControlStateFootprint state prepared.selection.localControlPatch prepared.runtimeInstanceId) = true := by
    simpa only [view] using independent
  have scopeAfter := prepareInternalScopeCreation_after_local_patch program state scopeOperation scopePrepared
    prepared.selection.localControlPatch prepared.runtimeInstanceId scopeFound separated
  obtain ⟨scope, scopeInstance, scopeOwner, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state scopeOperation scopePrepared scopeFound
  refine ⟨?_, scopeAfter, ?_⟩
  · apply prepareInternalMerge_read_frame program state (scope.apply state) operation alternative prepared found
      (scopeCreation_apply_control state scope) (scopeCreation_apply_time state scope)
    · exact scope_local_scope_frame state scope prepared.selection.localControlPatch scopeInstance
        prepared.runtimeInstanceId scopeOwner separated
    · intro place member
      exact scope_local_bucket_frame state scope prepared.selection.localControlPatch scopeInstance
        prepared.runtimeInstanceId scopeOwner separated prepared.selection.owner place
        (localControl_token_read state prepared.selection.localControlPatch prepared.runtimeInstanceId place member)
  · exact scope_creation_local_control_patches_commute state scope prepared.selection.localControlPatch scopeInstance
      prepared.runtimeInstanceId scopeOwner canonical separated

private theorem merge_apply_scope_data (state : RuntimeState) (selected : InternalMergeSelection)
    (variables : ScopedVariables) :
    (selected.apply state).scopeOccurrences = state.scopeOccurrences ∧
      (selected.apply state).variables = state.variables ∧
      selected.apply { state with variables } = { selected.apply state with variables } := by
  simp only [← InternalMergeSelection.localControlPatch_apply]
  exact localControl_apply_variables state selected.localControlPatch variables

/-- A declared entry beside a one-input Merge on another Parallel branch (PTPB-COMMUTE-01 of the
[pass-through branch proposal](../../docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-PROPOSAL.md#stable-rules)) composes the
Merge's scope-creation law above with the frame insertion: the Merge moves only tokens, so it never reads or writes
the variables the insertion changes. -/
theorem prepared_declared_entry_merge_pair (program : Program) (state : RuntimeState)
    (entryOperation : SemanticOperation) (entry : PreparedInternalDeclaredEntry) (merge : PreparedInternalMerge)
    (entryFound : prepareInternalDeclaredEntry? program state entryOperation = some entry)
    (mergeFound : prepareInternalMerge? program state merge.selection.operation merge.selection.alternative = some merge)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering entry.footprint merge.footprint = true) :
    prepareInternalMerge? program (entry.apply state) merge.selection.operation merge.selection.alternative = some merge ∧
      prepareInternalDeclaredEntry? program (merge.selection.apply state) entryOperation = some entry ∧
      merge.selection.apply (entry.apply state) = entry.apply (merge.selection.apply state) := by
  obtain ⟨reads, writes, _, _, control, _, _⟩ := declared_entry_shape program state entryOperation entry entryFound
  have pair := prepared_merge_scope_creation_pair_commutes program state merge.selection.operation entryOperation
    merge.selection.alternative merge entry.control mergeFound control canonical
    (localControlStateFootprintsNonInterfering_of_subsets _ _ _ reads writes separated)
  have moved := merge_apply_scope_data state merge.selection state.variables
  refine ⟨?_, ?_, ?_⟩
  · rw [PreparedInternalDeclaredEntry.apply_eq]
    exact prepareInternalMerge_read_frame program _ _ _ _ merge pair.1 rfl rfl rfl (fun _ _ => rfl)
  · refine prepareInternalDeclaredEntry_after program state _ entryOperation entry entryFound pair.2.1 ?_ ?_
    · intro record evaluated
      rw [NestedScopeData.evaluateFrame?_frame program state _ moved.1 (by rw [moved.2.1]) (by rw [moved.2.1])]
      exact evaluated
    · intro names reads read
      rw [NestedScopeData.readSet?_frame state _ moved.1 (by rw [moved.2.1])]
      exact read
  · rw [PreparedInternalDeclaredEntry.apply_eq, PreparedInternalDeclaredEntry.apply_eq,
      (merge_apply_scope_data _ merge.selection _).2.2, pair.2.2, scopeCreation_keeps_variables,
      scopeCreation_keeps_variables, moved.2.1]

end BpmnSemantics.SemanticProcess.InternalCommutation
