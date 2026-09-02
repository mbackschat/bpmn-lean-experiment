import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition

/-! # Compensation handler failure cancellation

This module owns the declarative handler-terminalization and root-cleanup relation required by
`COMPH-CANCEL-01`. It is intentionally independent of the executable failure successor.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- One handler's exact terminal disposition after a sibling compensation handler fails. -/
inductive CompensationHandlerFailureDisposition (failedHandlerId : OccurrenceId) :
    CompensationHandlerExecution → CompensationHandlerExecution → Prop where
  | failed (identity : CompensationHandlerIdentity) (lifecycle : CompensationHandlerLifecycle)
      (selected : (identity.id == failedHandlerId) = true) :
      CompensationHandlerFailureDisposition failedHandlerId
        { identity, lifecycle }
        { identity, lifecycle := .failed }
  | terminatedPending (identity : CompensationHandlerIdentity)
      (restoredContext : Option CompensationParentContextSnapshot)
      (unselected : (identity.id == failedHandlerId) = false) :
      CompensationHandlerFailureDisposition failedHandlerId
        { identity, lifecycle := .pending restoredContext }
        { identity, lifecycle := .terminated }
  | terminatedCompensating (identity : CompensationHandlerIdentity)
      (restoredContext : Option CompensationParentContextSnapshot)
      (effectId : EffectOccurrenceId)
      (unselected : (identity.id == failedHandlerId) = false) :
      CompensationHandlerFailureDisposition failedHandlerId
        { identity, lifecycle := .compensating restoredContext effectId }
        { identity, lifecycle := .terminated }
  | preserveCompensated (identity : CompensationHandlerIdentity)
      (unselected : (identity.id == failedHandlerId) = false) :
      CompensationHandlerFailureDisposition failedHandlerId
        { identity, lifecycle := .compensated }
        { identity, lifecycle := .compensated }
  | preserveFailed (identity : CompensationHandlerIdentity)
      (unselected : (identity.id == failedHandlerId) = false) :
      CompensationHandlerFailureDisposition failedHandlerId
        { identity, lifecycle := .failed }
        { identity, lifecycle := .failed }
  | preserveTerminated (identity : CompensationHandlerIdentity)
      (unselected : (identity.id == failedHandlerId) = false) :
      CompensationHandlerFailureDisposition failedHandlerId
        { identity, lifecycle := .terminated }
        { identity, lifecycle := .terminated }

/-- Pointwise terminal disposition without adding, removing, or reordering handler identities. -/
inductive CompensationHandlerFailureDispositions (failedHandlerId : OccurrenceId) :
    List CompensationHandlerExecution → List CompensationHandlerExecution → Prop where
  | nil : CompensationHandlerFailureDispositions failedHandlerId [] []
  | cons (before after : CompensationHandlerExecution)
      (beforeTail afterTail : List CompensationHandlerExecution)
      (head : CompensationHandlerFailureDisposition failedHandlerId before after)
      (tail : CompensationHandlerFailureDispositions failedHandlerId beforeTail afterTail) :
      CompensationHandlerFailureDispositions failedHandlerId
        (before :: beforeTail) (after :: afterTail)

/-- Declarative fail-fast cancellation of every live root and handler region. -/
inductive CompensationHandlerFailureCancellationStep (before : RuntimeState)
    (wait : CompensationHandlerEffectWait) (trigger : CompensationTriggerExecution)
    (handler : CompensationHandlerExecution) (code : String) (message : Option String) :
    RuntimeState → Prop where
  | cancel (handlers : List CompensationHandlerExecution)
      (failedTrigger : CompensationTriggerExecution)
      (failure : CompensationHandlerFailure) (after : RuntimeState)
      (terminalized : CompensationHandlerFailureDispositions handler.identity.id
        trigger.handlers handlers)
      (triggerShape : failedTrigger = { trigger with lifecycle := .failed, handlers })
      (failureShape : failure =
        { kind := .compensationHandlerFailure
          triggerId := trigger.id
          handlerId := handler.identity.id
          effectId := wait.id
          code
          message })
      (afterShape : after =
        { before with
          control := .failed trigger.owner.processInstanceId failure
          initiationPending := false
          scopeOccurrences := []
          tokens := []
          waits := []
          messageWaits := []
          timerWaits := []
          effectWaits := []
          effectIncidents := []
          selectedBranchSets := []
          eventRaces := []
          calledProcessOccurrences := []
          activityOccurrences := []
          sequentialMultiInstanceControllers := []
          parallelMultiInstanceControllers := []
          compensationActivityRetentions := []
          compensationParentContextRetentions := []
          compensationTriggers := before.compensationTriggers.map fun candidate =>
            if candidate.id == trigger.id then failedTrigger else candidate
          compensationHandlerEffectWaits := []
          variables := { before.variables with activities := [] } }) :
      CompensationHandlerFailureCancellationStep before wait trigger handler code message after

theorem CompensationHandlerFailureCancellationStep.activity_identity_discipline
    (step : CompensationHandlerFailureCancellationStep before wait trigger handler code message after) :
    activityIdentityIssuingDiscipline before after = true := by
  cases step with
  | cancel handlers failedTrigger failure after terminalized triggerShape failureShape afterShape =>
      subst after
      apply activityIdentityIssuingDiscipline_of_subset
      intro record present
      simp at present

end BpmnSemantics.SemanticProcess
