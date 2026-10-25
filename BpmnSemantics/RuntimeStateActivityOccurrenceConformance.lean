module

public import BpmnSemantics.RuntimeStateWellFormedFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Runtime-state Activity occurrence negative fixtures

This module owns the kernel-decided Activity occurrence fixtures separately from the sequential
Multi-Instance controller reductions so the independent proof families do not accumulate in one
kernel target under the repository's hard 3 GiB Lean measurement bound.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem armed_state_is_well_formed :
    runtimeStateWellFormed program instanceId armedState = true := by decide +kernel

/-- `A1`, violating `AOO-BODY-01`: a record whose body has been removed while it survives. -/
def strandedActivityBodyState : RuntimeState :=
  { armedState with waits := [] }

def stranded_activity_body_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId strandedActivityBodyState = false

def stranded_activity_body_fails_ownership_with_siblings_intact : Bool := decide <|
    activityRecordsOwnLiveWork strandedActivityBodyState = false ∧
      attachedTimersUnambiguous strandedActivityBodyState = true ∧
      activityIdentitiesUnique strandedActivityBodyState = true ∧
      waitOwnersLive strandedActivityBodyState = true

/-- `A2`, violating `AOO-ATTACH-01`: two records claiming one live deadline. -/
def ambiguousAttachedTimerState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++
      armedState.activityOccurrences.map fun record =>
        { record with activityElementId := { value := record.activityElementId.value ++ "_Other" } }
    activityActivations := armedState.activityActivations ++
      armedState.activityOccurrences.map fun record =>
        { taskId := { value := record.activityElementId.value ++ "_Other" }
          count := record.activation } }

def ambiguous_attached_timer_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId ambiguousAttachedTimerState = false

def ambiguous_attached_timer_fails_attachment_with_identity_intact : Bool := decide <|
    attachedTimersUnambiguous ambiguousAttachedTimerState = false ∧
      activityIdentitiesUnique ambiguousAttachedTimerState = true

/-- A Message handler with the same occurrence coordinates as a live Timer cannot satisfy Timer ownership. -/
def sameShapedMessageHandlerState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with
        attachedHandlers := record.attachedHandlers.map fun
          | .timer occurrence => .message occurrence
          | handler => handler } }

def same_shaped_message_handler_is_not_a_timer_owner : Bool := decide <|
    runtimeStateWellFormed program instanceId sameShapedMessageHandlerState = false

/-- `A3`, violating `AOO-ID-01`: one Activity occurrence identity carried twice. -/
def duplicateActivityIdentityState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++ armedState.activityOccurrences }

def duplicate_activity_identity_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId duplicateActivityIdentityState = false

def duplicate_activity_identity_fails_uniqueness : Bool := decide <|
    activityIdentitiesUnique duplicateActivityIdentityState = false

/-- The incidental Activity/task counter agreement is asserted nowhere, so disagreement stays admitted. -/
def disagreeingActivityCounterState : RuntimeState :=
  { armedState with
    activityActivations := armedState.activityActivations.map fun activation =>
      { activation with count := activation.count + 4 } }

def disagreeing_activity_counter_is_admitted : Bool := decide <|
    runtimeStateWellFormed program instanceId disagreeingActivityCounterState = true

def ownerA : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := ⟨"scope:A"⟩, activation := 1 }

def ownerB : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := ⟨"scope:B"⟩, activation := 1 }

def ownedTaskId : OccurrenceId :=
  { processInstanceId := instanceId, elementId := ⟨"Task"⟩, activation := 1 }

def ownedTaskWait (owner : ScopeOccurrenceId) : UserTaskWait :=
  { processInstanceId := instanceId, task := { id := ⟨"Task"⟩, name := none }
    activation := 1, owner, output := ⟨"out"⟩ }

def ownershipState (body : ActivityBody) (waits : List UserTaskWait) : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := ownerA, parent := none }, { id := ownerB, parent := some ownerA }]
    waits
    activityOccurrences :=
      [{ processInstanceId := instanceId, activityElementId := ⟨"Activity"⟩, activation := 1
         owner := ownerA, body, attachedHandlers := [] }] }

def task_body_owner_must_agree_for_singular_and_parallel_bodies : Bool := decide <|
    activityRecordsOwnLiveWork
      (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerB]) = false ∧
      activityRecordsOwnLiveWork
        (ownershipState (.parallelUserTasks ownedTaskId []) [ownedTaskWait ownerB]) = false ∧
      activityRecordsOwnLiveWork
        (ownershipState (.parallelUserTasks ownedTaskId [{ ownedTaskId with activation := 2 }])
          [ownedTaskWait ownerA, { ownedTaskWait ownerB with activation := 2 }]) = false ∧
      waitOwnersLive (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerB]) = true ∧
      waitIdentitiesUnique (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerB]) = true

def owner_filter_cannot_hide_a_duplicate_task_identity : Bool := decide <|
    activityRecordsOwnLiveWork (ownershipState (.userTask ownedTaskId)
      [ownedTaskWait ownerA, ownedTaskWait ownerB]) = false ∧
      activityRecordsOwnLiveWork (ownershipState (.parallelUserTasks ownedTaskId [])
        [ownedTaskWait ownerA, ownedTaskWait ownerB]) = false

def task_owner_agreement_preserves_child_scope_identity : Bool := decide <|
    activityRecordsOwnLiveWork
      (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerA]) = true ∧
      activityRecordsOwnLiveWork
        (ownershipState (.parallelUserTasks ownedTaskId []) [ownedTaskWait ownerA]) = true ∧
      activityRecordsOwnLiveWork (ownershipState (.childScope ownerB) []) = true ∧
      decide (ownerA = ownerB) = false

def scopeIteration (activation index : Nat) : ParallelScopeIteration :=
  { scope := { ownerB with activation }, loopCounter := index, item := "applicant" }

def parallelScopeState : RuntimeState :=
  { ownershipState (.parallelChildScopes (scopeIteration 1 0) [scopeIteration 2 2]) [] with
    scopeOccurrences := [{ id := ownerA, parent := none },
      { id := ownerB, parent := some ownerA },
      { id := { ownerB with activation := 2 }, parent := some ownerA }] }

def parallel_scope_membership_preserves_gaps_and_equal_items : Bool := decide <|
    activityRecordsOwnLiveWork parallelScopeState = true ∧
      activityBodyScopeClaims (.parallelChildScopes (scopeIteration 1 0) [scopeIteration 2 2]) =
        [ownerB, { ownerB with activation := 2 }]

def every_parallel_scope_member_requires_exact_live_parentage : Bool := decide <|
    activityRecordsOwnLiveWork
      { parallelScopeState with scopeOccurrences := parallelScopeState.scopeOccurrences.take 2 } = false ∧
    activityRecordsOwnLiveWork
      { parallelScopeState with scopeOccurrences := parallelScopeState.scopeOccurrences.map fun scope =>
          if scope.id.activation = 2 then { scope with parent := none } else scope } = false

def parallel_scope_membership_refuses_duplicate_identity_and_index : Bool := decide <|
    activityRecordsOwnLiveWork
      { parallelScopeState with activityOccurrences := parallelScopeState.activityOccurrences.map fun record =>
          { record with body := .parallelChildScopes (scopeIteration 1 0) [scopeIteration 1 2] } } = false ∧
    activityRecordsOwnLiveWork
      { parallelScopeState with activityOccurrences := parallelScopeState.activityOccurrences.map fun record =>
          { record with body := .parallelChildScopes (scopeIteration 1 0) [scopeIteration 2 0] } } = false

def parallelController : ParallelScopeController :=
  { id := { processInstanceId := instanceId, activityElementId := ⟨"Activity"⟩, activation := 1 }
    total := 3, completed := 1 }

def parallel_controller_counts_bind_both_ways_to_activity_membership : Bool := decide <|
    parallelScopeControllersConsistent
      { parallelScopeState with parallelScopeControllers := [parallelController] } = true ∧
    parallelScopeControllersConsistent parallelScopeState = false ∧
    parallelScopeControllersConsistent
      { parallelScopeState with parallelScopeControllers := [parallelController, parallelController] } = false ∧
    parallelScopeControllersConsistent
      { parallelScopeState with parallelScopeControllers := [{ parallelController with total := 4 }] } = false ∧
    parallelScopeControllersConsistent
      { parallelScopeState with parallelScopeControllers := [parallelController], activityOccurrences := [] } = false

/-- Every executable check of this module, named for the driver's failure report. -/
def runtimeStateActivityOccurrenceConformanceChecks : List (String × Bool) := [
  ("stranded_activity_body_is_refused", stranded_activity_body_is_refused),
  ("stranded_activity_body_fails_ownership_with_siblings_intact", stranded_activity_body_fails_ownership_with_siblings_intact),
  ("ambiguous_attached_timer_is_refused", ambiguous_attached_timer_is_refused),
  ("ambiguous_attached_timer_fails_attachment_with_identity_intact", ambiguous_attached_timer_fails_attachment_with_identity_intact),
  ("same_shaped_message_handler_is_not_a_timer_owner", same_shaped_message_handler_is_not_a_timer_owner),
  ("duplicate_activity_identity_is_refused", duplicate_activity_identity_is_refused),
  ("duplicate_activity_identity_fails_uniqueness", duplicate_activity_identity_fails_uniqueness),
  ("disagreeing_activity_counter_is_admitted", disagreeing_activity_counter_is_admitted),
  ("task_body_owner_must_agree_for_singular_and_parallel_bodies", task_body_owner_must_agree_for_singular_and_parallel_bodies),
  ("owner_filter_cannot_hide_a_duplicate_task_identity", owner_filter_cannot_hide_a_duplicate_task_identity),
  ("task_owner_agreement_preserves_child_scope_identity", task_owner_agreement_preserves_child_scope_identity),
  ("parallel_scope_membership_preserves_gaps_and_equal_items", parallel_scope_membership_preserves_gaps_and_equal_items),
  ("every_parallel_scope_member_requires_exact_live_parentage", every_parallel_scope_member_requires_exact_live_parentage),
  ("parallel_scope_membership_refuses_duplicate_identity_and_index", parallel_scope_membership_refuses_duplicate_identity_and_index),
  ("parallel_controller_counts_bind_both_ways_to_activity_membership", parallel_controller_counts_bind_both_ways_to_activity_membership)
]

end BpmnSemantics.RuntimeStateWellFormedConformance
