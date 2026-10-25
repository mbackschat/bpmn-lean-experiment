module

public import BpmnSemantics.SubProcessBoundaryTimerConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.List.Control
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice
import all Lean.Data.Json.Basic
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream
public import BpmnSemantics.ActivityBoundaryTimerFixtures
public import BpmnSemantics.RuntimeStateWellFormedFixtures
public import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! # Activity body-claim uniqueness conformance

Kernel-decided separating witnesses for `AOO-CLAIM-01`. The malformed states keep the existing
Activity ownership, attachment, and identity siblings intact while two distinct records claim one
live body. Positive witnesses keep the rule cross-record only, including one parallel body that
repeats a task claim inside that single record.
-/

@[expose] public section

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
    attachedHandlers := [] }

/-- One singular and one parallel record claim the same live User Task. -/
def duplicateTaskBodyClaimState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++ [parallelAliasRecord]
    activityActivations := armedState.activityActivations ++
      [{ taskId := ⟨"ParallelAlias"⟩, count := 1 }] }

def duplicate_task_body_claim_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId duplicateTaskBodyClaimState = false

def duplicate_task_body_claim_fails_only_the_claim_rule : Bool := decide <|
    activityBodyClaimsUnique duplicateTaskBodyClaimState.activityOccurrences = false ∧
      activityRecordsOwnLiveWork duplicateTaskBodyClaimState = true ∧
      attachedTimersUnambiguous duplicateTaskBodyClaimState = true ∧
      activityIdentitiesUnique duplicateTaskBodyClaimState = true

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

def scope_negative_uses_a_live_non_root_child : Bool := decide <|
    { id := liveChildScope, parent := some scopeParent } ∈ scopeArmedState.scopeOccurrences ∧
      liveChildScope ≠ scopeParent

def scopeAliasRecord : ActivityOccurrence :=
  { processInstanceId := scopeInstanceId
    activityElementId := ⟨"Scope"⟩
    activation := 2
    owner := scopeParent
    body := .childScope liveChildScope
    attachedHandlers := [] }

/-- Two distinct Activity records claim the same live child scope. -/
def duplicateScopeBodyClaimState : RuntimeState :=
  { scopeArmedState with
    activityOccurrences := scopeArmedState.activityOccurrences ++ [scopeAliasRecord]
    activityActivations := scopeArmedState.activityActivations.map fun activation =>
      if activation.taskId.value = scopeAliasRecord.activityElementId.value then
        { activation with count := 2 }
      else activation }

def duplicate_scope_body_claim_is_refused : Bool := decide <|
    runtimeStateWellFormed scopeProgram scopeInstanceId duplicateScopeBodyClaimState = false

def duplicate_scope_body_claim_fails_only_the_claim_rule : Bool := decide <|
    activityBodyClaimsUnique duplicateScopeBodyClaimState.activityOccurrences = false ∧
      activityRecordsOwnLiveWork duplicateScopeBodyClaimState = true ∧
      attachedTimersUnambiguous duplicateScopeBodyClaimState = true ∧
      activityIdentitiesUnique duplicateScopeBodyClaimState = true

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
def distinct_records_and_one_repeated_parallel_body_are_admitted : Bool := decide <|
    activityBodyClaimsUnique [singularClaimRecord, otherTaskClaimRecord] = true ∧
      activityBodyClaimsUnique [scopeAliasRecord, otherScopeClaimRecord] = true ∧
      activityBodyClaimsUnique [repeatedTaskInsideOneRecord] = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("duplicate_task_body_claim_is_refused", duplicate_task_body_claim_is_refused),
  ("duplicate_task_body_claim_fails_only_the_claim_rule", duplicate_task_body_claim_fails_only_the_claim_rule),
  ("scope_negative_uses_a_live_non_root_child", scope_negative_uses_a_live_non_root_child),
  ("duplicate_scope_body_claim_is_refused", duplicate_scope_body_claim_is_refused),
  ("duplicate_scope_body_claim_fails_only_the_claim_rule", duplicate_scope_body_claim_fails_only_the_claim_rule),
  ("distinct_records_and_one_repeated_parallel_body_are_admitted", distinct_records_and_one_repeated_parallel_body_are_admitted)
]

end BpmnSemantics.ActivityBodyClaimUniquenessConformance
