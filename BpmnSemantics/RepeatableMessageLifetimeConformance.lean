module

public import BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance
public import BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
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
import all BpmnSemantics.ActivityBoundaryMessageConformanceCheckFixtures
import all BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance
import all BpmnSemantics.SemanticProcess.ActivityBodyClaimUniqueness
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CompensationActivityRetention
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageBoundedTask
import all BpmnSemantics.SemanticProcess.MessageMonitoredTask
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeWellFormedness
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.SequentialScopeStateValidation
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitActivation

/-! ESL-MESSAGE/SPAWN/CLOSE finite command witnesses retain two overlapping handler activations.
The quantified lifetime laws own arbitrary multiplicity; the pipeline owns source and E1/E2 parity. -/

public section

namespace BpmnSemantics.RepeatableMessageLifetimeConformance

open BpmnSemantics.SemanticProcess
open RepeatableEventSubscriptionAdmissionConformance (program)
open ActivityBoundaryMessageConformance (armedState instanceId taskId subscriptionId channel)

def deliver (command : String) (state : RuntimeState) : StimulusResult :=
  applyStimulus scenarioClosureLimit program state (.deliverMessage ⟨command⟩ subscriptionId channel)

def first := deliver "first" armedState
def second := deliver "second" first.state
def completed := applyStimulus scenarioClosureLimit program second.state
  (.completeUserTaskInstance ⟨"complete-host"⟩ taskId [])

theorem distinct_deliveries_retain_subscription_and_create_distinct_handlers :
    first.outcome = .committed ∧ second.outcome = .committed ∧
      second.state.messageWaits = armedState.messageWaits ∧
      second.state.activityOccurrences = armedState.activityOccurrences ∧
      second.state.messageActivations = armedState.messageActivations ∧
      (second.state.waits.filter (fun wait => wait.task.id == ⟨"HandleWithdrawal"⟩)).map (·.activation) = [1, 2] ∧
      runtimeStateWellFormed program instanceId second.state = true := by
  decide +kernel

theorem host_completion_preserves_both_handlers_and_withdraws_subscription :
    completed.outcome = .committed ∧ completed.state.messageWaits = [] ∧
      completed.state.activityOccurrences = [] ∧
      completed.state.waits.filter (fun wait => wait.task.id == ⟨"HandleWithdrawal"⟩) =
        second.state.waits.filter (fun wait => wait.task.id == ⟨"HandleWithdrawal"⟩) ∧
      runtimeStateWellFormed program instanceId completed.state = true := by
  decide +kernel

theorem completion_wins_against_later_delivery_without_mutation :
    (deliver "late" completed.state).outcome = .rejected ∧
      (deliver "late" completed.state).state = completed.state := by
  decide +kernel

theorem original_interrupting_account_cannot_reuse_the_subscription :
    interruptMessageBoundedUserTask? ActivityBoundaryMessageConformance.program
      ActivityBoundaryMessageConformance.afterMessageVictory subscriptionId channel = none := by
  decide +kernel

end BpmnSemantics.RepeatableMessageLifetimeConformance
