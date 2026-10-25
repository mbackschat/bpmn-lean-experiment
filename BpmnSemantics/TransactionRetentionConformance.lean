import BpmnSemantics.SemanticProcess.CompensationActivityRetention
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration

/-! # Transaction child retention witnesses

TXC-RETAIN-01 distinguishes a child's lifetime and pre-removal wait ownership from the unchanged
root completion-fact contract. These fixtures check those boundaries without claiming graph admission
or a complete cancellation run.
-/

namespace BpmnSemantics.TransactionRetentionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def instanceId : SemanticId := ⟨"i"⟩
def rootOwner : ScopeOccurrenceId := ⟨instanceId, ⟨"r"⟩, 1⟩
def childOwner : ScopeOccurrenceId := ⟨instanceId, ⟨"c"⟩, 1⟩

def target : BoundaryCompensationTarget := ⟨⟨"A"⟩, ⟨"BA"⟩, ⟨"HA"⟩⟩

def retentionDeclaration : CompensationActivityRetentionDeclaration :=
  { definitionScopeId := childOwner.definitionScopeId
    targets := [target], maxRecords := 1, maxCanonicalBytes := 4096 }

def executionDeclaration : CompensationExecutionDeclaration :=
  { definitionScopeId := childOwner.definitionScopeId
    triggerOperationId := ⟨"cancel"⟩
    subjects := [.boundaryActivity ⟨"A"⟩
      { handlerElementId := ⟨"HA"⟩, effectElementId := ⟨"HA"⟩
        descriptor :=
          { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
            operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }
        input := .empty }]
    dependencies := []
    limits := { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 20480 } }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess, semanticProfile := ⟨"transaction"⟩
        sourceId := ⟨"manual"⟩, sourceSha256 := "manual" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"P"⟩
    definitionScopes :=
      [{ id := ⟨"r"⟩, parentScopeId := none, originElementId := ⟨"P"⟩ },
       { id := ⟨"c"⟩, parentScopeId := some ⟨"r"⟩, originElementId := ⟨"T"⟩ }]
    operationScopes :=
      [{ operationId := ⟨"task"⟩, scopeId := ⟨"c"⟩ },
       { operationId := ⟨"cancel"⟩, scopeId := ⟨"c"⟩ }]
    controlPlaceScopes :=
      [{ controlPlaceId := ⟨"in"⟩, scopeId := ⟨"c"⟩ },
       { controlPlaceId := ⟨"out"⟩, scopeId := ⟨"r"⟩ }]
    controlPlaces :=
      [{ id := ⟨"in"⟩, origin := ⟨⟨"FI"⟩⟩ },
       { id := ⟨"out"⟩, origin := ⟨⟨"FO"⟩⟩ }]
    operations :=
      [.awaitUserTask ⟨"task"⟩ ⟨⟨"A"⟩⟩ ⟨"task-in"⟩ ⟨"task-out"⟩
        { id := ⟨"A"⟩, name := none },
       .cancelTransaction ⟨"cancel"⟩ ⟨⟨"CE"⟩⟩ ⟨"c"⟩ ⟨"in"⟩ ⟨"out"⟩ ⟨"CB"⟩]
    compensationActivityRetention := some retentionDeclaration
    compensationExecution := some executionDeclaration }

def beforeEntry : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := rootOwner, parent := none }] }

def child_declaration_accepts_no_register_before_entry : Bool := decide <|
    compensationActivityRetentionStateValid program beforeEntry = true

def emptyRegister : CompensationActivityRetention := ⟨childOwner, 1, []⟩

def liveChild : RuntimeState :=
  { beforeEntry with
    scopeOccurrences := beforeEntry.scopeOccurrences ++
      [{ id := childOwner, parent := some rootOwner }]
    compensationActivityRetentions := [emptyRegister] }

def activity : ActivityOccurrenceId := ⟨instanceId, ⟨"A"⟩, 1⟩
def record : CompletedCompensableActivity := ⟨activity, 1⟩
def completedRegister : CompensationActivityRetention := ⟨childOwner, 2, [record]⟩

def liveWait : UserTaskWait :=
  { processInstanceId := instanceId, owner := childOwner
    task := { id := ⟨"A"⟩, name := none }, activation := 1, output := ⟨"task-out"⟩ }

def beforeCompletion : RuntimeState := { liveChild with waits := [liveWait] }
def afterRetention : RuntimeState :=
  { beforeCompletion with compensationActivityRetentions := [completedRegister] }

def child_declarations_are_admitted_together : Bool := decide <|
    compensationActivityRetentionDeclarationValid program = true ∧
      compensationExecutionDeclarationValid program = true

def live_child_requires_exactly_one_register : Bool := decide <|
    compensationActivityRetentionStateValid program liveChild = true ∧
      compensationActivityRetentionStateValid program
        { liveChild with compensationActivityRetentions := [] } = false ∧
      compensationActivityRetentionStateValid program
        { liveChild with compensationActivityRetentions := [emptyRegister, emptyRegister] } = false

def wrongParent : RuntimeState :=
  { liveChild with
    scopeOccurrences := beforeEntry.scopeOccurrences ++
      [{ id := childOwner, parent := some { rootOwner with activation := 2 } }] }

def wrongOwner : RuntimeState :=
  { liveChild with compensationActivityRetentions := [{ emptyRegister with owner := rootOwner }] }

def wrong_parent_owner_and_orphan_register_reject : Bool := decide <|
    compensationActivityRetentionStateValid program wrongParent = false ∧
      compensationActivityRetentionStateValid program wrongOwner = false ∧
      compensationActivityRetentionStateValid program
        { beforeEntry with compensationActivityRetentions := [emptyRegister] } = false ∧
      compensationActivityRetentionStateValid program
        { liveChild with scopeOccurrences := [{ id := childOwner, parent := some rootOwner }] } = false

def activeTrigger : CompensationTriggerExecution :=
  { id := ⟨instanceId, ⟨"CE"⟩, 1⟩, owner := childOwner, output := ⟨"out"⟩
    lifecycle := .active, handlers := [], dependencies := [] }

def active_child_trigger_requires_consumed_records : Bool := decide <|
    compensationActivityRetentionStateValid program
        { liveChild with compensationTriggers := [activeTrigger] } = true ∧
      compensationActivityRetentionStateValid program
        { liveChild with
          compensationTriggers := [activeTrigger]
          compensationActivityRetentions := [completedRegister] } = false

def disposed_child_has_no_register_while_parent_runs : Bool := decide <|
    compensationActivityRetentionStateValid program
        { beforeEntry with
          compensationTriggers := [{ activeTrigger with lifecycle := .succeeded }] } = true ∧
      compensationActivityRetentionStateValid program
        { beforeEntry with control := .completed instanceId, scopeOccurrences := [] } = true ∧
      compensationActivityRetentionStateValid program
        { liveChild with control := .completed instanceId } = false

def ordinary_completion_retains_exact_live_child_identity : Bool := decide <|
    retainCompletedCompensableActivity program childOwner (.ordinaryUserTask activity)
        beforeCompletion = .retained afterRetention record

def interrupted_completion_without_live_wait_refuses : Bool := decide <|
    retainCompletedCompensableActivity program childOwner (.ordinaryUserTask activity)
        liveChild = .refused .malformedCompletion liveChild

def foreignWaitState : RuntimeState :=
  { liveChild with waits := [{ liveWait with owner := rootOwner }] }

def staleWaitState : RuntimeState :=
  { liveChild with waits := [{ liveWait with activation := 2 }] }

def otherInstanceWaitState : RuntimeState :=
  { liveChild with waits := [{ liveWait with processInstanceId := ⟨"other"⟩ }] }

def duplicateWaitState : RuntimeState :=
  { liveChild with waits := [liveWait, liveWait] }

def full_wait_identity_and_unique_owner_are_required : Bool := decide <|
    retainCompletedCompensableActivity program childOwner (.ordinaryUserTask activity)
        foreignWaitState = .refused .malformedCompletion foreignWaitState ∧
      retainCompletedCompensableActivity program childOwner (.ordinaryUserTask activity)
        staleWaitState = .refused .malformedCompletion staleWaitState ∧
      retainCompletedCompensableActivity program childOwner (.ordinaryUserTask activity)
        otherInstanceWaitState = .refused .malformedCompletion otherInstanceWaitState ∧
      retainCompletedCompensableActivity program childOwner (.ordinaryUserTask activity)
        duplicateWaitState = .refused .malformedCompletion duplicateWaitState

def countFullState : RuntimeState :=
  { liveChild with
    waits := [{ liveWait with activation := 2 }]
    compensationActivityRetentions := [completedRegister] }

def count_refusal_preserves_complete_child_prestate : Bool := decide <|
    retainCompletedCompensableActivity program childOwner
        (.ordinaryUserTask { activity with activation := 2 }) countFullState =
      .refused (.capacity .records 1 2) countFullState

def byteFullProgram : Program :=
  { program with
    compensationActivityRetention :=
      some { retentionDeclaration with maxCanonicalBytes := 2 } }

def byte_refusal_preserves_complete_child_prestate : Bool := decide <|
    retainCompletedCompensableActivity byteFullProgram childOwner (.ordinaryUserTask activity)
        beforeCompletion =
      .refused (.capacity .canonicalBytes 2 (canonicalCompensationRecordsUtf8Bytes [record]))
        beforeCompletion

def rootProgram : Program :=
  { program with
    definitionScopes :=
      [{ id := ⟨"r"⟩, parentScopeId := none, originElementId := ⟨"P"⟩ }]
    operations := [.awaitUserTask ⟨"task"⟩ ⟨⟨"A"⟩⟩ ⟨"task-in"⟩ ⟨"task-out"⟩
      { id := ⟨"A"⟩, name := none }]
    operationScopes := [{ operationId := ⟨"task"⟩, scopeId := rootOwner.definitionScopeId }]
    compensationActivityRetention :=
      some { retentionDeclaration with definitionScopeId := rootOwner.definitionScopeId }
    compensationExecution := none }

def rootState : RuntimeState :=
  { beforeEntry with compensationActivityRetentions := [⟨rootOwner, 1, []⟩] }

def existing_root_completion_facts_remain_sufficient : Bool := decide <|
    compensationActivityRetentionStateValid rootProgram rootState = true ∧
      compensationActivityRetentionStateValid rootProgram beforeEntry = false ∧
      retainCompletedCompensableActivity rootProgram rootOwner (.ordinaryUserTask activity)
        rootState = .retained
          { rootState with compensationActivityRetentions := [⟨rootOwner, 2, [record]⟩] } record

def wrongExecutionScope : Program :=
  { program with
    compensationExecution :=
      some { executionDeclaration with definitionScopeId := rootOwner.definitionScopeId } }

def wrongRetentionScope : Program :=
  { program with
    compensationActivityRetention :=
      some { retentionDeclaration with definitionScopeId := rootOwner.definitionScopeId } }

def root_and_child_declarations_cannot_substitute : Bool := decide <|
    compensationActivityRetentionDeclarationValid wrongExecutionScope = false ∧
      compensationExecutionDeclarationValid wrongExecutionScope = false ∧
      compensationActivityRetentionDeclarationValid wrongRetentionScope = false ∧
      compensationExecutionDeclarationValid wrongRetentionScope = false

def extraTriggerProgram : Program :=
  { program with
    operations := program.operations ++
      [.triggerCompensation ⟨"second"⟩ ⟨⟨"throw"⟩⟩ ⟨"r"⟩ ⟨"x"⟩ ⟨"y"⟩] }

def dependencyProgram : Program :=
  { program with
    compensationExecution := some
      { executionDeclaration with dependencies := [⟨⟨"A"⟩, ⟨"B"⟩⟩] } }

def snapshotProgram : Program :=
  { program with
    compensationEventSubProcessSnapshots := some
      { targets := [], maxRecords := 1, maxCanonicalBytes := 4096 } }

def childLocalOutputProgram : Program :=
  { program with
    controlPlaceScopes :=
      [{ controlPlaceId := ⟨"in"⟩, scopeId := ⟨"c"⟩ },
       { controlPlaceId := ⟨"out"⟩, scopeId := ⟨"c"⟩ }] }

def child_shape_rejects_extra_trigger_dependencies_snapshots_and_local_output : Bool := decide <|
    compensationActivityRetentionDeclarationValid extraTriggerProgram = false ∧
      compensationExecutionDeclarationValid extraTriggerProgram = false ∧
      compensationActivityRetentionDeclarationValid dependencyProgram = false ∧
      compensationActivityRetentionDeclarationValid snapshotProgram = false ∧
      compensationActivityRetentionDeclarationValid childLocalOutputProgram = false

def activeCompletionState : RuntimeState :=
  { beforeCompletion with compensationTriggers := [activeTrigger] }

def active_compensation_cannot_repopulate_consumed_register : Bool := decide <|
    retainCompletedCompensableActivity program childOwner (.ordinaryUserTask activity)
        activeCompletionState = .refused .malformedCompletion activeCompletionState

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("child_declaration_accepts_no_register_before_entry", child_declaration_accepts_no_register_before_entry),
  ("child_declarations_are_admitted_together", child_declarations_are_admitted_together),
  ("live_child_requires_exactly_one_register", live_child_requires_exactly_one_register),
  ("wrong_parent_owner_and_orphan_register_reject", wrong_parent_owner_and_orphan_register_reject),
  ("active_child_trigger_requires_consumed_records", active_child_trigger_requires_consumed_records),
  ("disposed_child_has_no_register_while_parent_runs", disposed_child_has_no_register_while_parent_runs),
  ("ordinary_completion_retains_exact_live_child_identity", ordinary_completion_retains_exact_live_child_identity),
  ("interrupted_completion_without_live_wait_refuses", interrupted_completion_without_live_wait_refuses),
  ("full_wait_identity_and_unique_owner_are_required", full_wait_identity_and_unique_owner_are_required),
  ("count_refusal_preserves_complete_child_prestate", count_refusal_preserves_complete_child_prestate),
  ("byte_refusal_preserves_complete_child_prestate", byte_refusal_preserves_complete_child_prestate),
  ("existing_root_completion_facts_remain_sufficient", existing_root_completion_facts_remain_sufficient),
  ("root_and_child_declarations_cannot_substitute", root_and_child_declarations_cannot_substitute),
  ("child_shape_rejects_extra_trigger_dependencies_snapshots_and_local_output", child_shape_rejects_extra_trigger_dependencies_snapshots_and_local_output),
  ("active_compensation_cannot_repopulate_consumed_register", active_compensation_cannot_repopulate_consumed_register)
]

end BpmnSemantics.TransactionRetentionConformance
