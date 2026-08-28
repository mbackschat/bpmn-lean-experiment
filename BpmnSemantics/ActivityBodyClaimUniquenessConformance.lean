import BpmnSemantics.RuntimeStateActivityConformance
import BpmnSemantics.SubProcessBoundaryTimerConformance

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

def scopeInstanceId : SemanticId :=
  SubProcessBoundaryTimerConformance.instanceId

def scopeProgram : Program :=
  SubProcessBoundaryTimerConformance.program

def scopeArmedState : RuntimeState :=
  SubProcessBoundaryTimerConformance.armedState

def scopeParent : ScopeOccurrenceId :=
  rootScopeOccurrenceId scopeInstanceId SubProcessBoundaryTimerConformance.processId

def liveChildScope : ScopeOccurrenceId :=
  { processInstanceId := scopeInstanceId
    definitionScopeId := SubProcessBoundaryTimerConformance.childScopeId
    activation := 1
  }

theorem scope_negative_uses_a_live_non_root_child :
    { id := liveChildScope, parent := some scopeParent } ∈ scopeArmedState.scopeOccurrences ∧
      liveChildScope ≠ scopeParent := by
  decide +kernel

def scopeAliasRecord : ActivityOccurrence :=
  { processInstanceId := scopeInstanceId
    activityElementId := ⟨SubProcessBoundaryTimerConformance.childScopeId.value⟩
    activation := 2
    owner := scopeParent
    body := .childScope liveChildScope
    attachedTimers := [] }

/-- Two distinct Activity records claim the same live child scope. -/
def duplicateScopeBodyClaimState : RuntimeState :=
  { scopeArmedState with
    activityOccurrences := scopeArmedState.activityOccurrences ++ [scopeAliasRecord]
    activityActivations := scopeArmedState.activityActivations.map fun activation =>
      if activation.taskId.value = SubProcessBoundaryTimerConformance.childScopeId.value then
        { activation with count := 2 }
      else activation }

theorem duplicate_scope_body_claim_is_refused :
    runtimeStateWellFormed scopeProgram scopeInstanceId duplicateScopeBodyClaimState = false := by
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
  { liveChildScope with activation := 2 }

def otherScopeClaimRecord : ActivityOccurrence :=
  { scopeAliasRecord with
    body := .childScope otherScopeClaim }

def repeatedTaskInsideOneRecord : ActivityOccurrence :=
  { parallelAliasRecord with
    body := .parallelUserTasks taskClaim [taskClaim] }

/-- The rule admits multiple records when their task or scope claims differ, and it does not turn a
repeated member inside one parallel body into a second owner. -/
theorem distinct_records_and_one_repeated_parallel_body_are_admitted :
    activityBodyClaimsUnique [singularClaimRecord, otherTaskClaimRecord] = true ∧
      activityBodyClaimsUnique [scopeAliasRecord, otherScopeClaimRecord] = true ∧
      activityBodyClaimsUnique [repeatedTaskInsideOneRecord] = true := by
  decide +kernel

end BpmnSemantics.ActivityBodyClaimUniquenessConformance
