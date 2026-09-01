import BpmnSemantics.RuntimeStateWellFormedFixtures

/-! # Runtime-state well-formedness invariant negatives

This module owns the kernel-decided ordinary invariant refusals and their sibling-conjunct
attribution checks without importing the event-race or successor reduction families.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem stranded_timer_owner_is_refused :
    runtimeStateWellFormed program instanceId strandedTimerOwnerState = false := by decide +kernel

theorem stranded_timer_owner_fails_ownership_with_siblings_intact :
    waitOwnersLive strandedTimerOwnerState = false ∧
      waitIdentitiesUnique strandedTimerOwnerState = true ∧
      canonicalCollectionOrder strandedTimerOwnerState = true := by decide +kernel

theorem duplicate_timer_key_is_refused :
    runtimeStateWellFormed program instanceId duplicateTimerKeyState = false := by decide +kernel

theorem duplicate_timer_key_fails_uniqueness_with_ownership_intact :
    waitIdentitiesUnique duplicateTimerKeyState = false ∧
      waitOwnersLive duplicateTimerKeyState = true := by decide +kernel

theorem undeclared_timer_element_is_refused :
    runtimeStateWellFormed program instanceId undeclaredTimerElementState = false := by
  decide +kernel

theorem undeclared_timer_element_fails_declaration_with_siblings_intact :
    waitDeclarationsValid program instanceId undeclaredTimerElementState = false ∧
      waitOwnersLive undeclaredTimerElementState = true ∧
      waitIdentitiesUnique undeclaredTimerElementState = true := by decide +kernel

theorem unordered_activations_are_refused :
    runtimeStateWellFormed program instanceId unorderedActivationsState = false := by decide +kernel

theorem unordered_activations_fail_order_with_ownership_intact :
    canonicalCollectionOrder unorderedActivationsState = false ∧
      waitOwnersLive unorderedActivationsState = true := by decide +kernel

theorem not_started_with_pending_initiation_is_refused :
    runtimeStateWellFormed program instanceId notStartedWithPendingInitiationState = false := by
  decide +kernel

theorem not_started_with_pending_initiation_fails_lifecycle :
    notStartedStateEmpty notStartedWithPendingInitiationState = false ∧
      waitOwnersLive notStartedWithPendingInitiationState = true ∧
      waitIdentitiesUnique notStartedWithPendingInitiationState = true ∧
      canonicalCollectionOrder notStartedWithPendingInitiationState = true := by decide +kernel

end BpmnSemantics.RuntimeStateWellFormedConformance
