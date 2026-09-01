import BpmnSemantics.CompensationActivityRetentionConformance
import BpmnSemantics.ParallelMultiInstanceConformance
import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SequentialMultiInstanceConformance

/-! # Compensation Activity retention producer conformance

Kernel-decided integration witnesses for the independently approved hidden retention account. The
closed producer matrix requires one retained outer identity for an eligible ordinary User Task, a
zero- or positive-item sequential Multi-Instance all-success completion, and a zero- or positive-item
parallel Multi-Instance all-success completion, including one-item `first`. Parallel `first` with
more than one planned child, non-final child success, and both Multi-Instance Timer interruptions
retain nothing. Capacity refusal precedes every terminal or zero-item mutation, while absent
declarations, non-targets, and excluded ordinary operation families preserve their existing bytes.
This module makes no source, profile, public-observation, or Temporal-hosting claim.
-/

namespace BpmnSemantics.CompensationActivityRetentionProducerConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.CompensationActivityRetentionConformance

def oneRecordOrdinaryProgram : Program :=
  retentionProgramFor 1 65536

def ordinaryWait (activation : Nat) : UserTaskWait :=
  { processInstanceId := instanceId
    owner
    task :=
      { id := ⟨target.activityElementId.value⟩
        name := some "Approve" }
    activation
    output := ⟨"place:Flow_TaskToEnd"⟩ }

def ordinaryWaitingState : RuntimeState :=
  { startState with
    initiationPending := false
    waits := [ordinaryWait 1]
    activations := [{ taskId := ⟨target.activityElementId.value⟩, count := 1 }] }

def ordinaryRetainedState : RuntimeState :=
  { ordinaryWaitingState with compensationActivityRetentions := [firstRetention] }

/-- The approved classifier names the exact outer occurrence and prior ordinal before a producer
performs any completion rewrite. -/
theorem ordinary_classifier_selects_the_exact_first_record :
    retainCompletedCompensableActivity oneRecordOrdinaryProgram owner ordinaryFacts
        ordinaryWaitingState =
      .retained ordinaryRetainedState firstRecord := by
  decide +kernel

def ordinaryCapacityState : RuntimeState :=
  { ordinaryWaitingState with
    waits := [ordinaryWait 2]
    activations := [{ taskId := ⟨target.activityElementId.value⟩, count := 2 }]
    activityActivations := [{ taskId := ⟨target.activityElementId.value⟩, count := 1 }]
    compensationActivityRetentions := [firstRetention] }

def ordinaryCapacityStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-at-retention-capacity"⟩
    { processInstanceId := instanceId
      elementId := ⟨target.activityElementId.value⟩
      activation := 2 }
    []

/-- Retention capacity is decided before the ordinary completion can consume its wait or publish its
output token. -/
theorem ordinary_capacity_refuses_before_completion_and_preserves_the_exact_state :
    (dispatchStimulus oneRecordOrdinaryProgram ordinaryCapacityState
        ordinaryCapacityStimulus).outcome = .rejected ∧
      (dispatchStimulus oneRecordOrdinaryProgram ordinaryCapacityState
        ordinaryCapacityStimulus).state = ordinaryCapacityState := by
  decide +kernel

def oneRecordSequentialProgram : Program :=
  { multiInstanceProgram with
    compensationActivityRetention := some (declarationFor 1 65536) }

def sequentialZeroEntryFixture? : Option (SemanticOperation × RuntimeState) := do
  let operation ← sequentialMultiInstanceOperationForTask? oneRecordSequentialProgram
    ⟨target.activityElementId.value⟩
  let arm ← SequentialMultiInstanceArm.ofOperation? operation
  let started ← runningProgramStartState? oneRecordSequentialProgram instanceId
    [{ name := arm.data.inputDataObjectReferenceId, value := .stringList [] }]
  pure
    (operation,
      { started with
        initiationPending := false
        tokens := [{ placeId := arm.input, owner }]
        activityActivations := [{ taskId := arm.taskId, count := 1 }]
        compensationActivityRetentions := [firstRetention] })

/-- Closed check that the production transition is undefined and therefore projects the submitted
state unchanged at retention capacity. -/
def sequentialZeroItemCapacityRefused : Bool :=
  match sequentialZeroEntryFixture? with
  | none => false
  | some (operation, before) =>
      compensationActivityRetentionStateValid oneRecordSequentialProgram before &&
        (fire? oneRecordSequentialProgram operation before).isNone &&
        decide ((fire? oneRecordSequentialProgram operation before).getD before = before)

/-- A zero-item outer identity is checked for retention capacity before the atomic entry can consume
its input, publish the empty output, or advance its Activity high-water mark. -/
theorem sequential_zero_item_capacity_refuses_before_atomic_completion :
    sequentialZeroItemCapacityRefused = true := by
  decide +kernel

def retainedRecords (state : RuntimeState) : List CompletedCompensableActivity :=
  state.compensationActivityRetentions.flatMap (fun retention => retention.records)

def ordinarySuccessStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-retained-ordinary"⟩
    { processInstanceId := instanceId
      elementId := ⟨target.activityElementId.value⟩
      activation := 1 }
    []

def ordinarySuccess : ExternalAdmission :=
  dispatchStimulus oneRecordOrdinaryProgram ordinaryWaitingState ordinarySuccessStimulus

def repeatedOrdinarySuccess : ExternalAdmission :=
  dispatchStimulus oneRecordOrdinaryProgram ordinarySuccess.state ordinarySuccessStimulus

theorem ordinary_target_retains_the_exact_wait_identity_once :
    ordinarySuccess.outcome = .committed ∧
      retainedRecords ordinarySuccess.state = [firstRecord] ∧
      activityActivationCount ordinarySuccess.state ⟨target.activityElementId.value⟩ = 1 ∧
      repeatedOrdinarySuccess.outcome = .rejected ∧
      retainedRecords repeatedOrdinarySuccess.state = [firstRecord] := by
  decide +kernel

def reviewTarget : BoundaryCompensationTarget :=
  { activityElementId := ⟨"UserTask_Review"⟩
    boundaryEventElementId := ⟨"BoundaryEvent_ReviewCompensation"⟩
    compensationActivityElementId := ⟨"ServiceTask_UndoReview"⟩ }

def escalationTarget : BoundaryCompensationTarget :=
  { activityElementId := ⟨"UserTask_Escalation"⟩
    boundaryEventElementId := ⟨"BoundaryEvent_EscalationCompensation"⟩
    compensationActivityElementId := ⟨"ServiceTask_UndoEscalation"⟩ }

def programWithRetentionTarget (program : Program) (target : BoundaryCompensationTarget)
    (maxRecords : Nat := 4) : Program :=
  { program with
    compensationActivityRetention := some
      { definitionScopeId := rootDefinitionScopeId program.processId
        targets := [target]
        maxRecords
        maxCanonicalBytes := 65536 } }

def reviewActivity (instanceId : SemanticId) (activation : Nat) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨reviewTarget.activityElementId.value⟩
    activation }

def reviewRecord (instanceId : SemanticId) (activation completionOrdinal : Nat) :
    CompletedCompensableActivity :=
  { id := reviewActivity instanceId activation, completionOrdinal }

def fullReviewRegisterState (program : Program) (instanceId : SemanticId)
    (record : CompletedCompensableActivity) (state : RuntimeState) : RuntimeState :=
  { state with
    activityActivations := setActivationCount state.activityActivations
      ⟨record.id.activityElementId.value⟩
      (Nat.max (activityActivationCount state ⟨record.id.activityElementId.value⟩)
        record.id.activation)
    compensationActivityRetentions :=
      [{ owner := rootScopeOccurrenceId instanceId program.processId
         nextCompletionOrdinal := 2
         records := [record] }] }

def sequentialProgram : Program :=
  programWithRetentionTarget
    BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.program reviewTarget

def sequentialProgramAtCapacity : Program :=
  programWithRetentionTarget
    BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.program reviewTarget 1

def sequentialPreEntryWith (program : Program) (items : List String) : Option RuntimeState := do
  let arm ← BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?
  let started ← runningProgramStartState? program
    BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.instanceId
    [{ name := arm.data.inputDataObjectReferenceId, value := .stringList items }]
  let owner ← rootScopeOccurrence? started
  pure
    { started with
      initiationPending := false
      tokens := [{ placeId := arm.input, owner }] }

def sequentialEntered? : Option RuntimeState := do
  let arm ← BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?
  let state ← sequentialPreEntryWith sequentialProgram
    BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.batch
  enterSequentialMultiInstanceWithCompensation? sequentialProgram arm state

def completeSequential (program : Program) (state? : Option RuntimeState)
    (result : String) : Option RuntimeState := do
  let arm ← BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?
  let state ← state?
  let record ← state.activityOccurrences.head?
  let body ← activityBodyTask? record
  completeSequentialMultiInstanceWithCompensation? program arm state body
    [{ name := arm.data.taskDataOutputId, value := .string result }]

def sequentialAfterFirst? : Option RuntimeState :=
  completeSequential sequentialProgram sequentialEntered? "Reviewed_1"

def sequentialAfterSecond? : Option RuntimeState :=
  completeSequential sequentialProgram sequentialAfterFirst? "Reviewed_2"

def sequentialCompleted? : Option RuntimeState :=
  completeSequential sequentialProgram sequentialAfterSecond? "Reviewed_3"

theorem sequential_nonfinal_children_do_not_retain_and_terminal_all_success_retains_once :
    sequentialAfterFirst?.map retainedRecords = some [] ∧
      sequentialAfterSecond?.map retainedRecords = some [] ∧
      sequentialCompleted?.map retainedRecords =
        some [reviewRecord
          BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.instanceId 1 1] := by
  decide +kernel

def sequentialZeroCompleted? : Option RuntimeState := do
  let arm ← BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?
  let state ← sequentialPreEntryWith sequentialProgram []
  enterSequentialMultiInstanceWithCompensation? sequentialProgram arm state

theorem sequential_zero_retains_one_fresh_outer_identity_without_inner_work :
    sequentialZeroCompleted?.map (fun state =>
      (retainedRecords state, activityActivationCount state ⟨"UserTask_Review"⟩,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.sequentialMultiInstanceControllers.length)) =
      some ([reviewRecord
        BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.instanceId 1 1],
        1, 0, 0, 0, 0) := by
  decide +kernel

def sequentialInterrupted? : Option RuntimeState := do
  let arm ← BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?
  let state ← sequentialAfterFirst?
  let record ← state.activityOccurrences.head?
  let timer ← record.timerHandlerOccurrences.head?
  let deadline ← state.timerWaits.find? (timerIdNamesWait timer)
  interruptSequentialMultiInstanceWithCompensation? sequentialProgram arm state timer
    deadline.deadlineMs

theorem sequential_timer_interruption_retains_nothing :
    sequentialInterrupted?.map retainedRecords = some [] := by
  decide +kernel

def sequentialTerminalCapacityRefused : Bool :=
  match sequentialAfterSecond? with
  | none => false
  | some state =>
      let before := fullReviewRegisterState sequentialProgramAtCapacity
        BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.instanceId
        (reviewRecord BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.instanceId
          2 1)
        state
      match BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?,
          before.activityOccurrences.head? with
      | some arm, some occurrence =>
          match activityBodyTask? occurrence with
          | none => false
          | some body =>
              let result := completeSequentialMultiInstanceWithCompensation?
                sequentialProgramAtCapacity arm before body
                [{ name := arm.data.taskDataOutputId, value := .string "Reviewed_3" }]
              compensationActivityRetentionStateValid sequentialProgramAtCapacity before &&
                result.isNone && decide (result.getD before = before)
      | _, _ => false

theorem sequential_terminal_capacity_refuses_before_mutation :
    sequentialTerminalCapacityRefused = true := by
  decide +kernel

def parallelProgram : Program :=
  programWithRetentionTarget BpmnSemantics.ParallelMultiInstanceConformance.program reviewTarget

def parallelProgramAtCapacity : Program :=
  programWithRetentionTarget BpmnSemantics.ParallelMultiInstanceConformance.program reviewTarget 1

def parallelPreEntryWith (program : Program) (items : List String)
    (policy : String) : Option RuntimeState := do
  let arm ← BpmnSemantics.ParallelMultiInstanceConformance.programArm?
  let started ← runningProgramStartState? program
    ⟨"ParallelMultiInstance_Foundation"⟩
    [ { name := arm.data.input.dataObjectReferenceId, value := .stringList items }
    , { name := "completionPolicy", value := .string policy } ]
  let owner ← rootScopeOccurrence? started
  pure
    { started with
      initiationPending := false
      tokens := [{ placeId := arm.input, owner }] }

def parallelEnteredWith (program : Program) (items : List String)
    (policy : String) : Option RuntimeState := do
  let arm ← BpmnSemantics.ParallelMultiInstanceConformance.programArm?
  let state ← parallelPreEntryWith program items policy
  enterParallelMultiInstanceWithCompensation? program arm state

def completeParallel (program : Program) (state? : Option RuntimeState)
    (activation : Nat) (result : String) : Option RuntimeState := do
  let arm ← BpmnSemantics.ParallelMultiInstanceConformance.programArm?
  let state ← state?
  completeParallelMultiInstanceWithCompensation? program arm state
    (BpmnSemantics.ParallelMultiInstanceConformance.taskId activation)
    (BpmnSemantics.ParallelMultiInstanceConformance.submittedResult result)

def parallelAllEntered? : Option RuntimeState :=
  parallelEnteredWith parallelProgram ["Invoice_1", "Invoice_2", "Invoice_3"] "all"

def parallelAllAfterThird? : Option RuntimeState :=
  completeParallel parallelProgram parallelAllEntered? 3 "Reviewed_3"

def parallelAllAfterFirst? : Option RuntimeState :=
  completeParallel parallelProgram parallelAllAfterThird? 1 "Reviewed_1"

def parallelAllCompleted? : Option RuntimeState :=
  completeParallel parallelProgram parallelAllAfterFirst? 2 "Reviewed_2"

theorem parallel_all_filled_retains_the_exact_outer_identity_once :
    parallelAllAfterThird?.map retainedRecords = some [] ∧
      parallelAllAfterFirst?.map retainedRecords = some [] ∧
      parallelAllCompleted?.map retainedRecords =
        some [reviewRecord ⟨"ParallelMultiInstance_Foundation"⟩ 1 1] := by
  decide +kernel

def parallelOneFirstCompleted? : Option RuntimeState :=
  completeParallel parallelProgram
    (parallelEnteredWith parallelProgram ["Invoice_1"] "first") 1 "Reviewed_1"

theorem parallel_one_item_first_is_all_success_and_retains :
    parallelOneFirstCompleted?.map retainedRecords =
      some [reviewRecord ⟨"ParallelMultiInstance_Foundation"⟩ 1 1] := by
  decide +kernel

def parallelManyFirstCompleted? : Option RuntimeState :=
  completeParallel parallelProgram
    (parallelEnteredWith parallelProgram ["Invoice_1", "Invoice_2", "Invoice_3"] "first")
    3 "Reviewed_3"

theorem parallel_many_item_first_is_early_and_retains_nothing :
    parallelManyFirstCompleted?.map retainedRecords = some [] := by
  decide +kernel

def parallelInterrupted? : Option RuntimeState := do
  let arm ← BpmnSemantics.ParallelMultiInstanceConformance.programArm?
  let state ← parallelAllEntered?
  let record ← state.activityOccurrences.head?
  let timer ← record.timerHandlerOccurrences.head?
  let deadline ← state.timerWaits.find? (timerIdNamesWait timer)
  interruptParallelMultiInstanceWithCompensation? parallelProgram arm state timer
    deadline.deadlineMs

theorem parallel_timer_interruption_retains_nothing :
    parallelInterrupted?.map retainedRecords = some [] := by
  decide +kernel

def parallelZeroCompleted? : Option RuntimeState :=
  parallelEnteredWith parallelProgram [] "all"

theorem parallel_zero_retains_one_fresh_outer_identity_without_inner_work :
    parallelZeroCompleted?.map (fun state =>
      (retainedRecords state, activityActivationCount state ⟨"UserTask_Review"⟩,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.parallelMultiInstanceControllers.length)) =
      some ([reviewRecord ⟨"ParallelMultiInstance_Foundation"⟩ 1 1], 1, 0, 0, 0, 0) := by
  decide +kernel

def parallelTerminalCapacityRefused : Bool :=
  match parallelEnteredWith parallelProgramAtCapacity ["Invoice_1"] "all" with
  | none => false
  | some state =>
      let before := fullReviewRegisterState parallelProgramAtCapacity
        ⟨"ParallelMultiInstance_Foundation"⟩
        (reviewRecord ⟨"ParallelMultiInstance_Foundation"⟩ 2 1) state
      match BpmnSemantics.ParallelMultiInstanceConformance.programArm? with
      | none => false
      | some arm =>
          let result := completeParallelMultiInstanceWithCompensation?
            parallelProgramAtCapacity arm before
            (BpmnSemantics.ParallelMultiInstanceConformance.taskId 1)
            (BpmnSemantics.ParallelMultiInstanceConformance.submittedResult "Reviewed_1")
          compensationActivityRetentionStateValid parallelProgramAtCapacity before &&
            result.isNone && decide (result.getD before = before)

theorem parallel_terminal_capacity_refuses_before_mutation :
    parallelTerminalCapacityRefused = true := by
  decide +kernel

def parallelZeroCapacityRefused : Bool :=
  match parallelPreEntryWith parallelProgramAtCapacity [] "all" with
  | none => false
  | some state =>
      let before :=
        { fullReviewRegisterState parallelProgramAtCapacity
            ⟨"ParallelMultiInstance_Foundation"⟩
            (reviewRecord ⟨"ParallelMultiInstance_Foundation"⟩ 1 1) state with
          activityActivations := [{ taskId := ⟨"UserTask_Review"⟩, count := 1 }] }
      match BpmnSemantics.ParallelMultiInstanceConformance.programArm? with
      | none => false
      | some arm =>
          let result := enterParallelMultiInstanceWithCompensation?
            parallelProgramAtCapacity arm before
          compensationActivityRetentionStateValid parallelProgramAtCapacity before &&
            result.isNone && decide (result.getD before = before)

theorem parallel_zero_capacity_refuses_before_atomic_completion :
    parallelZeroCapacityRefused = true := by
  decide +kernel

def sequentialEscalationRetentionProgram : Program :=
  programWithRetentionTarget
    BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.program escalationTarget

def ordinaryAbsentState : RuntimeState :=
  { ordinaryWaitingState with compensationActivityRetentions := [] }

theorem absent_and_non_target_producers_are_legacy_equal :
    completeOrdinaryUserTaskWithCompensation? completeUserTask
        BpmnSemantics.SemanticProcess.sequentialProgram ordinaryAbsentState
        { processInstanceId := instanceId
          elementId := ⟨target.activityElementId.value⟩
          activation := 1 } =
      completeUserTask ordinaryAbsentState instanceId ⟨target.activityElementId.value⟩ 1 ∧
      (do
        let arm ← BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?
        let state ← sequentialPreEntryWith sequentialEscalationRetentionProgram
          BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.batch
        enterSequentialMultiInstanceWithCompensation? sequentialEscalationRetentionProgram arm
          state) =
      (do
        let arm ← BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.arm?
        let state ← sequentialPreEntryWith sequentialEscalationRetentionProgram
          BpmnSemantics.SequentialMultiInstanceProgramBindingConformance.batch
        enterSequentialMultiInstance? arm state) := by
  decide +kernel

def excludedOrdinaryCompletion : ExternalAdmission :=
  dispatchStimulus excludedOperationProgram ordinaryWaitingState ordinarySuccessStimulus

theorem excluded_operation_declaration_cannot_emit_retention_facts :
    excludedOrdinaryCompletion.outcome = .committed ∧
      retainedRecords excludedOrdinaryCompletion.state = [] := by
  decide +kernel

end BpmnSemantics.CompensationActivityRetentionProducerConformance
