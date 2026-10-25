module

public import BpmnSemantics.InterruptingMessageEventSubProcessConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.SemanticProcessJson.CheckedProcess
public import BpmnSemantics.SemanticProcessJson.Program
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessAdmission
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.Transition
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistrationLaws
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence
public import BpmnSemantics.SemanticProcess.TransitionTrace
public import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.SemanticProcess.StructuredCompositionLifecycleProofs
public import BpmnSemantics.SemanticProcess.StructuredCompositionFixtures
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity
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
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
/-! Bounded conformance for the interrupting Message Event Sub-Process account. Strict wire witnesses
separate declaration storage from structural admission; composed execution witnesses belong to this same owner. -/

@[expose] public section

namespace BpmnSemantics.InterruptingMessageEventSubProcessConformance

open Lean SemanticProcess SemanticProcessJson
theorem external_start_implements_declarative_registration :
    EventSubProcessRegistrationStep applicationProgram unregisteredRoot applicationRoot.id startedApplication := by
  apply registerEventSubProcessListener_sound
  decide +kernel

open StructuredComposition StructuredCompositionFixtures in
theorem ordinary_task_domain_excludes_foreign_listener :
    programWellFormed serialProgram = true ∧
      serialProgram.identity.semanticProfile = structuredCompositionCheckpointProfileId ∧
      (programAnalysis serialProgram).isSome = true ∧
      ordinaryTaskWithForeignListener.waits ≠ [] ∧
      ¬ForeignRuntimeEmpty ordinaryTaskWithForeignListener ∧
      ForeignRuntimeEmpty { ordinaryTaskWithForeignListener with eventSubProcessMessageSubscriptions := [] } := by
  refine ⟨by decide +kernel, rfl, by decide +kernel, by decide +kernel, ?_, ?_⟩ <;>
    simp [ForeignRuntimeEmpty, ordinaryTaskWithForeignListener, initialState]

open StructuredComposition StructuredCompositionFixtures in
theorem foreign_listener_does_not_change_ordinary_task_lifetime_or_ownership :
    TaskLifetimeShape serialProgram ordinaryTaskWithForeignListener ∧
      ∀ operation ∈ serialProgram.operations, ∀ wait ∈ ordinaryTaskWithForeignListener.waits,
        operationOwningScope? serialProgram operation.id = some wait.owner.definitionScopeId := by
  constructor
  · apply Or.inr
    refine ⟨ordinaryTaskWait, .awaitUserTask ⟨"operation:Notify"⟩ { elementId := ⟨"Notify"⟩ }
      ⟨"place:c"⟩ ⟨"place:d"⟩ { id := ⟨"Notify"⟩, name := none }, ?_⟩
    simp [ordinaryTaskWithForeignListener, ordinaryTaskWait, ordinaryTaskOwner, serialProgram,
      serialOperations, initialState, emptyScopedVariables]
  · simp [serialProgram, serialOperations, ordinaryTaskWithForeignListener, ordinaryTaskWait,
      ordinaryTaskOwner, operationOwningScope?, dataTask, SemanticOperation.id]

open StructuredCompositionFixtures in
theorem foreign_listener_refuses_every_ordinary_completion_without_mutation
    (commandId : SemanticId) (bindings : List VariableBinding) :
    admitStimulus serialProgram ordinaryTaskWithForeignListener
      (.completeUserTaskInstance commandId ⟨⟨"instance"⟩, ⟨"Notify"⟩, 1⟩ bindings) =
        { outcome := .rejected, state := ordinaryTaskWithForeignListener } := by
  simp [admitStimulus, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid,
    serialProgram, profile, ordinaryTaskWithForeignListener]

theorem scheduled_start_preserves_complete_parallel_frontier_and_publication :
    scheduledStart.result.outcome = .committed ∧ scheduledStart.result.state = waitingReview ∧
      scheduledStart.committedTransitions.length = 5 ∧ scheduledStart.flowNodeOccurrenceLifecycles.length = 5 := by
  decide +kernel

theorem scheduled_withdrawal_publishes_the_external_trigger_and_handler_task :
    scheduledWithdrawal.result.outcome = .committed ∧ scheduledWithdrawal.result.state = handlerWaiting ∧
      scheduledWithdrawal.committedTransitions.length = 2 ∧
      scheduledWithdrawal.flowNodeOccurrenceLifecycles.length = 2 := by
  unfold scheduledWithdrawal
  rw [scheduled_start_preserves_complete_parallel_frontier_and_publication.2.1]
  decide +kernel

theorem scheduled_handler_completion_publishes_all_three_internal_steps :
    scheduledHandlerCompletion.result.outcome = .committed ∧
      scheduledHandlerCompletion.result.state.control = .completed ⟨"application"⟩ ∧
      scheduledHandlerCompletion.result.state.scopeOccurrences = [] ∧
      scheduledHandlerCompletion.committedTransitions.length = 4 ∧
      scheduledHandlerCompletion.flowNodeOccurrenceLifecycles.length = 4 := by
  unfold scheduledHandlerCompletion
  rw [scheduled_withdrawal_publishes_the_external_trigger_and_handler_task.2.1]
  decide +kernel

theorem observable_choice_rejection_finishes_every_complete_schedule :
    completeSchedulesFinish .rejectObservableChoice = true := by
  decide +kernel

theorem required_choice_schedule_finishes_every_complete_schedule :
    completeSchedulesFinish .requireChoiceSchedule = true := by
  decide +kernel

-- Composed from one kernel decision per mode: deciding both modes at once peaked at 2.02 GiB resident on
-- 2026-10-25, above the 2 GiB per-module ceiling in `lakefile.toml`.
theorem both_modes_execute_normal_and_interrupted_schedules_with_valid_prefixes :
    ([InternalSchedulingMode.rejectObservableChoice, .requireChoiceSchedule].all
      completeSchedulesFinish) = true := by
  simp only [List.all_cons, List.all_nil, observable_choice_rejection_finishes_every_complete_schedule,
    required_choice_schedule_finishes_every_complete_schedule, Bool.and_self]

end BpmnSemantics.InterruptingMessageEventSubProcessConformance
