import BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance
import BpmnSemantics.SemanticProcess.TransitionTrace

/-! ESL-MESSAGE/SPAWN/CLOSE finite command witnesses retain two overlapping handler activations.
The quantified lifetime laws own arbitrary multiplicity; the pipeline owns source and E1/E2 parity. -/

namespace BpmnSemantics.RepeatableMessageLifetimeConformance

open BpmnSemantics.SemanticProcess
open RepeatableEventSubscriptionAdmissionConformance (program)
open ActivityBoundaryMessageConformance (armedState instanceId taskId subscriptionId channel)

private def deliver (command : String) (state : RuntimeState) : StimulusResult :=
  applyStimulus scenarioClosureLimit program state (.deliverMessage ⟨command⟩ subscriptionId channel)

private def first := deliver "first" armedState
private def second := deliver "second" first.state
private def completed := applyStimulus scenarioClosureLimit program second.state
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
