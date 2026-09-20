import BpmnSemantics.SemanticProcess.InternalRegionalOrderFacts
import BpmnSemantics.SemanticProcess.InternalRegionalCallRemoval

/-! # Canonical order after regional removal

The actual cancellation and called-Process removal operations retain collection order by filtering. The proofs cover the complete canonical collection predicate without assuming validity of the selected region or its successor.
-/

namespace BpmnSemantics.SemanticProcess

theorem cancelScopeSubtree_preserves_canonical_order (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (cancelScopeSubtree state root disposition) = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at ordered
  obtain ⟨tokenOrder, activityCounterOrder, taskOrder, taskCounterOrder,
    messageOrder, timerOrder, effectOrder, messageCounterOrder, timerCounterOrder,
    effectCounterOrder, variableOrder, selectionOrder, raceOrder, callOrder,
    activityOrder, sequentialOrder, parallelOrder, scopeOrder, scopeCounterOrder,
    callCounterOrder, raceCounterOrder⟩ := ordered
  simp only [cancelScopeSubtree, canonicalCollectionOrder, Bool.and_eq_true, and_assoc]
  exact ⟨orderedBy_filter controlTokenBefore_compose _ _ tokenOrder,
    activityCounterOrder, orderedBy_filter userTaskWaitBefore_compose _ _ taskOrder,
    taskCounterOrder, orderedBy_filter regional_messageWaitBefore_compose _ _ messageOrder,
    orderedBy_filter regional_timerWaitBefore_compose _ _ timerOrder,
    orderedBy_filter regional_effectWaitBefore_compose _ _ effectOrder,
    messageCounterOrder, timerCounterOrder, effectCounterOrder,
    orderedBy_filter regional_activityVariableScopeBefore_compose _ _ variableOrder,
    orderedBy_filter regional_selectionBefore_compose _ _ selectionOrder,
    orderedBy_filter regional_eventRaceBefore_compose _ _ raceOrder,
    orderedBy_filter callRecordBefore_compose _ _ callOrder,
    orderedBy_filter regional_activityOccurrenceBefore_compose _ _ activityOrder,
    orderedBy_filter regional_sequentialMultiInstanceControllerBefore_compose _ _ sequentialOrder,
    parallelMultiInstanceControllersOrdered_filter _ _ parallelOrder,
    orderedBy_scopeOccurrence_filter _ _ scopeOrder,
    scopeCounterOrder, callCounterOrder, raceCounterOrder⟩

theorem removeCalledProcessTree_preserves_canonical_order (state : RuntimeState)
    (record : CalledProcessOccurrence) (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (removeCalledProcessTree state record) = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at ordered
  obtain ⟨tokenOrder, activityCounterOrder, taskOrder, taskCounterOrder,
    messageOrder, timerOrder, effectOrder, messageCounterOrder, timerCounterOrder,
    effectCounterOrder, variableOrder, selectionOrder, raceOrder, callOrder,
    activityOrder, sequentialOrder, parallelOrder, scopeOrder, scopeCounterOrder,
    callCounterOrder, raceCounterOrder⟩ := ordered
  simp only [removeCalledProcessTree, canonicalCollectionOrder, Bool.and_eq_true, and_assoc]
  exact ⟨orderedBy_filter controlTokenBefore_compose _ _ tokenOrder,
    activityCounterOrder, orderedBy_filter userTaskWaitBefore_compose _ _ taskOrder,
    taskCounterOrder, orderedBy_filter regional_messageWaitBefore_compose _ _ messageOrder,
    orderedBy_filter regional_timerWaitBefore_compose _ _ timerOrder,
    orderedBy_filter regional_effectWaitBefore_compose _ _ effectOrder,
    messageCounterOrder, timerCounterOrder, effectCounterOrder,
    orderedBy_filter regional_activityVariableScopeBefore_compose _ _ variableOrder,
    orderedBy_filter regional_selectionBefore_compose _ _ selectionOrder,
    orderedBy_filter regional_eventRaceBefore_compose _ _ raceOrder,
    orderedBy_filter callRecordBefore_compose _ _ callOrder,
    orderedBy_filter regional_activityOccurrenceBefore_compose _ _ activityOrder,
    orderedBy_filter regional_sequentialMultiInstanceControllerBefore_compose _ _ sequentialOrder,
    parallelMultiInstanceControllersOrdered_filter _ _ parallelOrder,
    orderedBy_scopeOccurrence_filter _ _ scopeOrder,
    scopeCounterOrder, callCounterOrder, raceCounterOrder⟩

end BpmnSemantics.SemanticProcess
