import BpmnSemantics.RuntimeStateWellFormedFixtures

/-! # Runtime-state well-formedness invariant negatives

This module owns the kernel-decided ordinary invariant refusals and their sibling-conjunct
attribution checks without importing the event-race or successor reduction families.
-/

set_option Elab.async false

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

private def unorderedActivityCounters : RuntimeState :=
  { armedState with activityActivations :=
      [{ taskId := ⟨"z-counter"⟩, count := 1 }, { taskId := ⟨"a-counter"⟩, count := 1 }] }

theorem unordered_activity_counters_fail_order_with_ownership_intact :
    canonicalCollectionOrder unorderedActivityCounters = false ∧
      waitOwnersLive unorderedActivityCounters = true := by decide +kernel

theorem not_started_with_pending_initiation_is_refused :
    runtimeStateWellFormed program instanceId notStartedWithPendingInitiationState = false := by
  decide +kernel

theorem not_started_with_pending_initiation_fails_lifecycle :
    notStartedStateEmpty notStartedWithPendingInitiationState = false ∧
      waitOwnersLive notStartedWithPendingInitiationState = true ∧
      waitIdentitiesUnique notStartedWithPendingInitiationState = true ∧
      canonicalCollectionOrder notStartedWithPendingInitiationState = true := by decide +kernel

private def notStartedWithActivityData : RuntimeState :=
  { initialState with variables :=
      { initialState.variables with activities :=
        [{ owner := .activityOccurrence
            { processInstanceId := instanceId, activityElementId := ⟨"Activity"⟩, activation := 1 }
           bindings := [] }] } }

theorem not_started_with_activity_data_fails_only_lifecycle :
    notStartedStateEmpty notStartedWithActivityData = false ∧
      runtimeStateWellFormed program instanceId notStartedWithActivityData = false ∧
      canonicalCollectionOrder notStartedWithActivityData = true ∧
      waitOwnersLive notStartedWithActivityData = true := by
  decide +kernel

private def orphanCompensationTrigger : CompensationTriggerExecution :=
  { id := { processInstanceId := instanceId, elementId := ⟨"throw"⟩, activation := 1 }
    owner := { processInstanceId := instanceId, definitionScopeId := ⟨"missing"⟩, activation := 1 }
    output := ⟨"out"⟩, lifecycle := .active, handlers := [], dependencies := [] }

private def orphanCompensationWait : CompensationHandlerEffectWait :=
  { id := { processInstanceId := instanceId, elementId := ⟨"effect"⟩, activation := 1 }
    triggerId := orphanCompensationTrigger.id
    handlerId := { processInstanceId := instanceId, elementId := ⟨"handler"⟩, activation := 1 }
    descriptor := { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
                    operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }
    arguments := [] }

theorem not_started_compensation_collections_fail_lifecycle_and_aggregate :
    notStartedStateEmpty { initialState with compensationTriggers := [orphanCompensationTrigger] }
        = false ∧
      notStartedStateEmpty
        { initialState with compensationHandlerEffectWaits := [orphanCompensationWait] } = false ∧
      runtimeStateWellFormed program instanceId
        { initialState with compensationTriggers := [orphanCompensationTrigger] } = false ∧
      runtimeStateWellFormed program instanceId
        { initialState with compensationHandlerEffectWaits := [orphanCompensationWait] } = false := by
  decide +kernel

theorem aggregate_rejects_orphan_compensation_work_in_running_state :
    runtimeStateWellFormed program instanceId
      { armedState with compensationTriggers := [orphanCompensationTrigger] } = false ∧
      runtimeStateWellFormed program instanceId
        { armedState with compensationHandlerEffectWaits := [orphanCompensationWait] } = false := by
  decide +kernel

theorem empty_state_remains_well_formed :
    notStartedStateEmpty initialState = true ∧
      runtimeStateWellFormed program instanceId initialState = true := by
  decide +kernel

end BpmnSemantics.RuntimeStateWellFormedConformance
