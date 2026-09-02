import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCompletionSoundness

/-! # Compensation handler failure cancellation conformance -/

namespace BpmnSemantics.CompensationTriggerHandlerCancellationConformance

open BpmnSemantics
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess

private def selectedC : SelectedCompensationHandler :=
  { wait := waitC, trigger := activeTrigger, handler := compensatingHandlerC }

theorem handler_failure_evaluator_realizes_the_complete_declarative_cancellation :
    CompensationHandlerFailureCancellationStep triggeredState waitC activeTrigger
      compensatingHandlerC "compensation-rejected" (some "downstream rejected the reversal")
      failedState := by
  have sound := compensationFailureSuccessor_cancellation_sound triggeredState selectedC
    "compensation-rejected" (some "downstream rejected the reversal")
  have exactState : compensationFailureSuccessor triggeredState selectedC
      "compensation-rejected" (some "downstream rejected the reversal") = failedState := by
    decide +kernel
  rw [exactState] at sound
  exact sound

private def delayedSelectedC : SelectedCompensationHandler :=
  { wait := delayedWaitC, trigger := delayedActiveTrigger, handler := compensatingHandlerC }

private def delayedFailedState : RuntimeState :=
  compensationFailureSuccessor delayedTriggeredState delayedSelectedC
    "compensation-rejected" (some "downstream rejected the reversal")

theorem sibling_failure_disposes_pending_restored_context_and_every_live_root_region :
    CompensationHandlerFailureCancellationStep delayedTriggeredState delayedWaitC
        delayedActiveTrigger compensatingHandlerC "compensation-rejected"
        (some "downstream rejected the reversal") delayedFailedState ∧
      delayedFailedState.compensationTriggers =
        [{ delayedActiveTrigger with
          lifecycle := .failed
          handlers := [terminatedHandlerA, terminatedHandlerB, failedHandlerC] }] ∧
      delayedFailedState.compensationHandlerEffectWaits = [] ∧
      delayedFailedState.scopeOccurrences = [] ∧
      delayedFailedState.waits = [] ∧
      delayedFailedState.messageWaits = [] ∧
      delayedFailedState.timerWaits = [] ∧
      delayedFailedState.effectWaits = [] ∧
      delayedFailedState.effectIncidents = [] ∧
      delayedFailedState.activityOccurrences = [] ∧
      delayedFailedState.variables.activities = [] := by
  constructor
  · exact compensationFailureSuccessor_cancellation_sound delayedTriggeredState delayedSelectedC
      "compensation-rejected" (some "downstream rejected the reversal")
  · decide +kernel

end BpmnSemantics.CompensationTriggerHandlerCancellationConformance
