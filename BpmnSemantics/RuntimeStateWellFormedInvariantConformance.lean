module

public import BpmnSemantics.RuntimeStateWellFormedFixtures

/-! # Runtime-state well-formedness invariant negatives

This module owns the kernel-decided ordinary invariant refusals and their sibling-conjunct
attribution checks without importing the event-race or successor reduction families.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def stranded_timer_owner_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId strandedTimerOwnerState = false

def stranded_timer_owner_fails_ownership_with_siblings_intact : Bool := decide <|
    waitOwnersLive strandedTimerOwnerState = false ∧
      waitIdentitiesUnique strandedTimerOwnerState = true ∧
      canonicalCollectionOrder strandedTimerOwnerState = true

def duplicate_timer_key_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId duplicateTimerKeyState = false

def duplicate_timer_key_fails_uniqueness_with_ownership_intact : Bool := decide <|
    waitIdentitiesUnique duplicateTimerKeyState = false ∧
      waitOwnersLive duplicateTimerKeyState = true

def undeclared_timer_element_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId undeclaredTimerElementState = false

def undeclared_timer_element_fails_declaration_with_siblings_intact : Bool := decide <|
    waitDeclarationsValid program instanceId undeclaredTimerElementState = false ∧
      waitOwnersLive undeclaredTimerElementState = true ∧
      waitIdentitiesUnique undeclaredTimerElementState = true

def unordered_activations_are_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId unorderedActivationsState = false

def unordered_activations_fail_order_with_ownership_intact : Bool := decide <|
    canonicalCollectionOrder unorderedActivationsState = false ∧
      waitOwnersLive unorderedActivationsState = true

def unorderedActivityCounters : RuntimeState :=
  { armedState with activityActivations :=
      [{ taskId := ⟨"z-counter"⟩, count := 1 }, { taskId := ⟨"a-counter"⟩, count := 1 }] }

def unordered_activity_counters_fail_order_with_ownership_intact : Bool := decide <|
    canonicalCollectionOrder unorderedActivityCounters = false ∧
      waitOwnersLive unorderedActivityCounters = true

def not_started_with_pending_initiation_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId notStartedWithPendingInitiationState = false

def not_started_with_pending_initiation_fails_lifecycle : Bool := decide <|
    notStartedStateEmpty notStartedWithPendingInitiationState = false ∧
      waitOwnersLive notStartedWithPendingInitiationState = true ∧
      waitIdentitiesUnique notStartedWithPendingInitiationState = true ∧
      canonicalCollectionOrder notStartedWithPendingInitiationState = true

def notStartedWithActivityData : RuntimeState :=
  { initialState with variables :=
      { initialState.variables with activities :=
        [{ owner := .activityOccurrence
            { processInstanceId := instanceId, activityElementId := ⟨"Activity"⟩, activation := 1 }
           bindings := [] }] } }

def not_started_with_activity_data_fails_only_lifecycle : Bool := decide <|
    notStartedStateEmpty notStartedWithActivityData = false ∧
      runtimeStateWellFormed program instanceId notStartedWithActivityData = false ∧
      canonicalCollectionOrder notStartedWithActivityData = true ∧
      waitOwnersLive notStartedWithActivityData = true

def orphanCompensationTrigger : CompensationTriggerExecution :=
  { id := { processInstanceId := instanceId, elementId := ⟨"throw"⟩, activation := 1 }
    owner := { processInstanceId := instanceId, definitionScopeId := ⟨"missing"⟩, activation := 1 }
    output := ⟨"out"⟩, lifecycle := .active, handlers := [], dependencies := [] }

def orphanCompensationWait : CompensationHandlerEffectWait :=
  { id := { processInstanceId := instanceId, elementId := ⟨"effect"⟩, activation := 1 }
    triggerId := orphanCompensationTrigger.id
    handlerId := { processInstanceId := instanceId, elementId := ⟨"handler"⟩, activation := 1 }
    descriptor := { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
                    operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }
    arguments := [] }

def not_started_compensation_collections_fail_lifecycle_and_aggregate : Bool := decide <|
    notStartedStateEmpty { initialState with compensationTriggers := [orphanCompensationTrigger] }
        = false ∧
      notStartedStateEmpty
        { initialState with compensationHandlerEffectWaits := [orphanCompensationWait] } = false ∧
      runtimeStateWellFormed program instanceId
        { initialState with compensationTriggers := [orphanCompensationTrigger] } = false ∧
      runtimeStateWellFormed program instanceId
        { initialState with compensationHandlerEffectWaits := [orphanCompensationWait] } = false

def aggregate_rejects_orphan_compensation_work_in_running_state : Bool := decide <|
    runtimeStateWellFormed program instanceId
      { armedState with compensationTriggers := [orphanCompensationTrigger] } = false ∧
      runtimeStateWellFormed program instanceId
        { armedState with compensationHandlerEffectWaits := [orphanCompensationWait] } = false

def empty_state_remains_well_formed : Bool := decide <|
    notStartedStateEmpty initialState = true ∧
      runtimeStateWellFormed program instanceId initialState = true

/-- Every executable check of this module, named for the driver's failure report. -/
def runtimeStateWellFormedInvariantConformanceChecks : List (String × Bool) := [
  ("stranded_timer_owner_is_refused", stranded_timer_owner_is_refused),
  ("stranded_timer_owner_fails_ownership_with_siblings_intact", stranded_timer_owner_fails_ownership_with_siblings_intact),
  ("duplicate_timer_key_is_refused", duplicate_timer_key_is_refused),
  ("duplicate_timer_key_fails_uniqueness_with_ownership_intact", duplicate_timer_key_fails_uniqueness_with_ownership_intact),
  ("undeclared_timer_element_is_refused", undeclared_timer_element_is_refused),
  ("undeclared_timer_element_fails_declaration_with_siblings_intact", undeclared_timer_element_fails_declaration_with_siblings_intact),
  ("unordered_activations_are_refused", unordered_activations_are_refused),
  ("unordered_activations_fail_order_with_ownership_intact", unordered_activations_fail_order_with_ownership_intact),
  ("unordered_activity_counters_fail_order_with_ownership_intact", unordered_activity_counters_fail_order_with_ownership_intact),
  ("not_started_with_pending_initiation_is_refused", not_started_with_pending_initiation_is_refused),
  ("not_started_with_pending_initiation_fails_lifecycle", not_started_with_pending_initiation_fails_lifecycle),
  ("not_started_with_activity_data_fails_only_lifecycle", not_started_with_activity_data_fails_only_lifecycle),
  ("not_started_compensation_collections_fail_lifecycle_and_aggregate", not_started_compensation_collections_fail_lifecycle_and_aggregate),
  ("aggregate_rejects_orphan_compensation_work_in_running_state", aggregate_rejects_orphan_compensation_work_in_running_state),
  ("empty_state_remains_well_formed", empty_state_remains_well_formed)
]

end BpmnSemantics.RuntimeStateWellFormedConformance
