module

public import BpmnSemantics.InterruptingMessageEventSubProcessConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.ExecutionRuntime
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessAdmission
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistrationLaws
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence
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
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.InterruptingMessageEventSubProcessConformanceCheckFixtures
import all BpmnSemantics.SemanticProcess.ActivityBodyClaimUniqueness
import all BpmnSemantics.SemanticProcess.ActivityDataInput
import all BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import all BpmnSemantics.SemanticProcess.ActivityDataOutput
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BoundedTask
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationActivityRetention
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceEffectProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalCommutationRegion
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalLocalControlSelection
import all BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalRegionalCompletionSelection
import all BpmnSemantics.SemanticProcess.InternalRegionalFootprint
import all BpmnSemantics.SemanticProcess.InternalRegionalLocalDataRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnerRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
import all BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import all BpmnSemantics.SemanticProcess.InternalRegionalPublication
import all BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalSelection
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalSelectedBranchPatch
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InternalTransitionPublication
import all BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessCompletion
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessInterruption
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessProgramAdmission
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistration
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageBoundedTask
import all BpmnSemantics.SemanticProcess.MessageMonitoredTask
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.MonitoredTask
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeWellFormedness
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.ParallelScopeReplayExecution
import all BpmnSemantics.SemanticProcess.RuntimeOwnerRemoval
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.ScopeCancellation
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
import all BpmnSemantics.SemanticProcess.SequentialScopeStateValidation
import all BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
import all BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import all BpmnSemantics.SemanticProcess.StructuredCompositionFixtures
import all BpmnSemantics.SemanticProcess.StructuredCompositionLifecycleProofs
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionRecord
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitActivation
import all BpmnSemantics.SemanticProcess.WaitCompletion
import all Lean.Data.Options
meta import BpmnSemantics.PrivateEquationLemmas
import all BpmnSemantics.SemanticProcess.UserTaskMetadata

/-! Bounded conformance for the interrupting Message Event Sub-Process account. Strict wire witnesses
separate declaration storage from structural admission; composed execution witnesses belong to this same owner. -/
run_meta privateEquations `BpmnSemantics.SemanticProcess.SemanticOperation #[`id]

run_meta privateEquations `BpmnSemantics #[`InterruptingMessageEventSubProcessConformance.ordinaryTaskOwner,
  `InterruptingMessageEventSubProcessConformance.ordinaryTaskWait,
  `InterruptingMessageEventSubProcessConformance.ordinaryTaskWithForeignListener,
  `SemanticProcess.StructuredComposition.ForeignRuntimeEmpty, `SemanticProcess.StructuredCompositionFixtures.dataTask,
  `SemanticProcess.StructuredCompositionFixtures.profile,
  `SemanticProcess.StructuredCompositionFixtures.serialOperations,
  `SemanticProcess.StructuredCompositionFixtures.serialProgram, `SemanticProcess.admitStimulus,
  `SemanticProcess.callDataRuntimeStateValid, `SemanticProcess.interruptingMessageEventSubProcessStateValid,
  `SemanticProcess.operationOwningScope?]

public section

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
