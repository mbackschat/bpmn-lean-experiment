module

public import BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
public import BpmnSemantics.SemanticProcess.CallActivity

/-! Reference retention agrees with Call-aware regional removal and cancellation. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem callReferenceRetention_matches_removal (state : RuntimeState) (record : CalledProcessOccurrence) :
    regionalReferenceFieldsMatch state (removeCalledProcessTree state record)
      (callReferenceRetention state record) := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

theorem cancellationReferenceRetention_matches_removal (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) :
    regionalReferenceFieldsMatch state (cancelScopeSubtree state root disposition)
      (cancellationReferenceRetention state root disposition) := by
  cases disposition <;> exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

end BpmnSemantics.SemanticProcess
