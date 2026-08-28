import BpmnSemantics.RuntimeStateActivityConformance

/-! # Activity body-claim uniqueness conformance

Kernel-decided separating witnesses for `AOO-CLAIM-01`. The malformed states keep the existing
Activity ownership, attachment, and identity siblings intact while two distinct records claim one
live body. Positive witnesses keep the rule cross-record only, including one parallel body that
repeats a task claim inside that single record.
-/

namespace BpmnSemantics.ActivityBodyClaimUniquenessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def instanceId : SemanticId :=
  RuntimeStateWellFormedConformance.instanceId

def program : Program :=
  RuntimeStateWellFormedConformance.program

def armedState : RuntimeState :=
  RuntimeStateWellFormedConformance.armedState

def rootScope : ScopeOccurrenceId :=
  rootScopeOccurrenceId instanceId ⟨"Process_ActivityBoundaryTimer"⟩

def taskClaim : OccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"BoundedTask"⟩
    activation := 1 }

def parallelAliasRecord : ActivityOccurrence :=
  { processInstanceId := instanceId
    activityElementId := ⟨"ParallelAlias"⟩
    activation := 1
    owner := rootScope
    body := .parallelUserTasks taskClaim []
    attachedTimers := [] }

/-- One singular and one parallel record claim the same live User Task. -/
def duplicateTaskBodyClaimState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++ [parallelAliasRecord]
    activityActivations := armedState.activityActivations ++
      [{ taskId := ⟨"ParallelAlias"⟩, count := 1 }] }

theorem duplicate_task_body_claim_is_refused :
    runtimeStateWellFormed program instanceId duplicateTaskBodyClaimState = false := by
  decide +kernel

theorem duplicate_task_body_claim_fails_only_the_claim_rule :
    activityBodyClaimsUnique duplicateTaskBodyClaimState.activityOccurrences = false ∧
      activityRecordsOwnLiveWork duplicateTaskBodyClaimState = true ∧
      attachedTimersUnambiguous duplicateTaskBodyClaimState = true ∧
      activityIdentitiesUnique duplicateTaskBodyClaimState = true := by
  decide +kernel

def firstScopeAliasRecord : ActivityOccurrence :=
  { processInstanceId := instanceId
    activityElementId := ⟨"ScopeAliasA"⟩
    activation := 1
    owner := rootScope
    body := .childScope rootScope
    attachedTimers := [] }

def secondScopeAliasRecord : ActivityOccurrence :=
  { firstScopeAliasRecord with activityElementId := ⟨"ScopeAliasB"⟩ }

/-- Two distinct Activity records claim the same live child scope. -/
def duplicateScopeBodyClaimState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++
      [firstScopeAliasRecord, secondScopeAliasRecord]
    activityActivations := armedState.activityActivations ++
      [ { taskId := ⟨"ScopeAliasA"⟩, count := 1 }
      , { taskId := ⟨"ScopeAliasB"⟩, count := 1 } ] }

theorem duplicate_scope_body_claim_is_refused :
    runtimeStateWellFormed program instanceId duplicateScopeBodyClaimState = false := by
  decide +kernel

theorem duplicate_scope_body_claim_fails_only_the_claim_rule :
    activityBodyClaimsUnique duplicateScopeBodyClaimState.activityOccurrences = false ∧
      activityRecordsOwnLiveWork duplicateScopeBodyClaimState = true ∧
      attachedTimersUnambiguous duplicateScopeBodyClaimState = true ∧
      activityIdentitiesUnique duplicateScopeBodyClaimState = true := by
  decide +kernel

def singularClaimRecord : ActivityOccurrence :=
  { parallelAliasRecord with
    activityElementId := ⟨"SingularClaim"⟩
    body := .userTask taskClaim }

def otherTaskClaim : OccurrenceId :=
  { taskClaim with elementId := ⟨"OtherTask"⟩ }

def otherTaskClaimRecord : ActivityOccurrence :=
  { parallelAliasRecord with
    activityElementId := ⟨"OtherTaskClaim"⟩
    body := .userTask otherTaskClaim }

def otherScopeClaim : ScopeOccurrenceId :=
  { rootScope with activation := 2 }

def otherScopeClaimRecord : ActivityOccurrence :=
  { secondScopeAliasRecord with
    body := .childScope otherScopeClaim }

def repeatedTaskInsideOneRecord : ActivityOccurrence :=
  { parallelAliasRecord with
    body := .parallelUserTasks taskClaim [taskClaim] }

/-- The rule admits multiple records when their task or scope claims differ, and it does not turn a
repeated member inside one parallel body into a second owner. -/
theorem distinct_records_and_one_repeated_parallel_body_are_admitted :
    activityBodyClaimsUnique [singularClaimRecord, otherTaskClaimRecord] = true ∧
      activityBodyClaimsUnique [firstScopeAliasRecord, otherScopeClaimRecord] = true ∧
      activityBodyClaimsUnique [repeatedTaskInsideOneRecord] = true := by
  decide +kernel

end BpmnSemantics.ActivityBodyClaimUniquenessConformance
