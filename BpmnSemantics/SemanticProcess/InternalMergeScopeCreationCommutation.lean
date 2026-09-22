import BpmnSemantics.SemanticProcess.InternalMergeCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationLocalControlCommutation

/-! Scope creation frames the exact Merge bucket through the existing patch footprint. This
preserves both complete artifacts under the [complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
-/

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

end BpmnSemantics.SemanticProcess.InternalCommutation
