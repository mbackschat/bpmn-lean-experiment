module

import BpmnSemantics.SemanticProcess.RuntimeRemovalPreservation
import BpmnSemantics.SemanticProcess.InternalRegionalCallRemoval
public import BpmnSemantics.SemanticProcess.ParallelMultiInstanceFlowNodeOccurrence
public import BpmnSemantics.SemanticProcess.InternalCommutationRegion

/-! # Canonical order after regional removal

The actual cancellation and called-Process removal operations retain collection order by filtering. The proofs cover the complete canonical collection predicate without assuming validity of the selected region or its successor.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

theorem cancelScopeSubtree_preserves_canonical_order (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (cancelScopeSubtree state root disposition) = true := by
  exact canonicalCollectionOrder_of_removal state _
    List.filter_sublist List.filter_sublist List.filter_sublist List.filter_sublist
    List.filter_sublist List.filter_sublist List.filter_sublist List.filter_sublist
    List.filter_sublist List.filter_sublist List.filter_sublist List.filter_sublist
    List.filter_sublist rfl rfl rfl rfl rfl rfl rfl rfl ordered

theorem removeCalledProcessTree_preserves_canonical_order (state : RuntimeState)
    (record : CalledProcessOccurrence) (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (removeCalledProcessTree state record) = true := by
  exact canonicalCollectionOrder_of_removal state _
    List.filter_sublist List.filter_sublist List.filter_sublist List.filter_sublist
    List.filter_sublist List.filter_sublist List.filter_sublist List.filter_sublist
    List.filter_sublist List.filter_sublist List.filter_sublist List.filter_sublist
    List.filter_sublist rfl rfl rfl rfl rfl rfl rfl rfl ordered

end BpmnSemantics.SemanticProcess
