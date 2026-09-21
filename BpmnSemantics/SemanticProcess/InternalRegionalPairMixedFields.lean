import BpmnSemantics.SemanticProcess.InternalRegionalPairExecutionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairOwnershipFrame
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch

/-! Return and completion share removal fields with cancellation but keep different roots and continuations. These exact record-update laws isolate retained-field algebra from canonical token insertion and end counts. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Exact cancellation populations fix every state-dependent removal predicate before
the Return and cancellation filters commute. Tokens and end counts are handled separately. -/
theorem return_cancel_fields_commute (before returned cancelled : RuntimeState)
    (record : CalledProcessOccurrence) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (returnTokens cancelTokens : List ControlToken) (cancelCount : Nat)
    (returnUpdate : returned = { removeCalledProcessTree before record with tokens := returnTokens })
    (cancelUpdate : cancelled = { cancelScopeSubtree before root disposition with
      tokens := cancelTokens, endOccurrences := cancelCount })
    (returnClosure : ∀ id, (processInstanceClosureWithin cancelled.calledProcessOccurrences
      [record.calledRoot.processInstanceId] (cancelled.calledProcessOccurrences.length + 1)).contains id =
      (processInstanceClosureWithin before.calledProcessOccurrences
        [record.calledRoot.processInstanceId] (before.calledProcessOccurrences.length + 1)).contains id)
    (subtree : ∀ owner, occurrenceInSubtree returned.scopeOccurrences root owner =
      occurrenceInSubtree before.scopeOccurrences root owner)
    (called : ∀ id, (calledInstanceClosure returned root).contains id =
      (calledInstanceClosure before root).contains id)
    (activities : withdrawnByRegion (fun owner => occurrenceInSubtree returned.scopeOccurrences root owner ||
        (calledInstanceClosure returned root).contains owner.processInstanceId) returned.activityOccurrences =
      withdrawnByRegion (fun owner => occurrenceInSubtree before.scopeOccurrences root owner ||
        (calledInstanceClosure before root).contains owner.processInstanceId) before.activityOccurrences)
    (effects : returned.effectWaits.filter (fun wait => occurrenceInSubtree returned.scopeOccurrences root wait.owner ||
        (calledInstanceClosure returned root).contains wait.owner.processInstanceId) =
      before.effectWaits.filter (fun wait => occurrenceInSubtree before.scopeOccurrences root wait.owner ||
        (calledInstanceClosure before root).contains wait.owner.processInstanceId))
    (incidents : returned.effectIncidents.filter (fun incident => occurrenceInSubtree returned.scopeOccurrences root incident.wait.owner ||
        (calledInstanceClosure returned root).contains incident.wait.owner.processInstanceId) =
      before.effectIncidents.filter (fun incident => occurrenceInSubtree before.scopeOccurrences root incident.wait.owner ||
        (calledInstanceClosure before root).contains incident.wait.owner.processInstanceId))
    (triggers : returned.compensationTriggers.filter (fun trigger => occurrenceInSubtree returned.scopeOccurrences root trigger.owner ||
        (calledInstanceClosure returned root).contains trigger.owner.processInstanceId) =
      before.compensationTriggers.filter (fun trigger => occurrenceInSubtree before.scopeOccurrences root trigger.owner ||
        (calledInstanceClosure before root).contains trigger.owner.processInstanceId)) :
    { cancelScopeSubtree returned root disposition with tokens := [], endOccurrences := 0 } =
      { removeCalledProcessTree cancelled record with tokens := [], endOccurrences := 0 } := by
  have parents : compensationParentContextRetentionSurvivesScopeCancellation returned root disposition =
      compensationParentContextRetentionSurvivesScopeCancellation before root disposition := by
    funext retention
    cases retention <;> simp only [compensationParentContextRetentionSurvivesScopeCancellation, subtree, called]
  simp only [cancelScopeSubtree, removeCalledProcessTree]
  simp only [activities, effects, incidents, triggers, parents]
  simp only [subtree, called, returnClosure]
  rw [returnUpdate, cancelUpdate]
  simp only [cancelScopeSubtree, removeCalledProcessTree, retainedByRegion]
  have filters {α : Type} (values : List α) (first second : α → Bool) :
      (values.filter first).filter second = (values.filter second).filter first := by
    simp only [List.filter_filter, Bool.and_comm]
  congr 1
  all_goals first
  | exact filters _ _ _
  | (congr 1; exact filters _ _ _)

/-- Completion retains its selected Activity and Timer masks while cancellation retains
its exact predecessor populations, so both bounded and unbounded field filters commute. -/
theorem completion_cancel_fields_commute (before completed cancelled : RuntimeState)
    (completionRoot root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (keepTimer : TimerWait → Bool) (keepActivity : ActivityOccurrence → Bool)
    (completionTokens cancelTokens : List ControlToken) (cancelCount : Nat)
    (completionUpdate : completed = { before with
      scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ completionRoot))
      timerWaits := before.timerWaits.filter keepTimer
      activityOccurrences := before.activityOccurrences.filter keepActivity
      tokens := completionTokens })
    (cancelUpdate : cancelled = { cancelScopeSubtree before root disposition with
      tokens := cancelTokens, endOccurrences := cancelCount })
    (subtree : ∀ owner, occurrenceInSubtree completed.scopeOccurrences root owner =
      occurrenceInSubtree before.scopeOccurrences root owner)
    (called : ∀ id, (calledInstanceClosure completed root).contains id =
      (calledInstanceClosure before root).contains id)
    (activities : withdrawnByRegion (fun owner => occurrenceInSubtree completed.scopeOccurrences root owner ||
        (calledInstanceClosure completed root).contains owner.processInstanceId) completed.activityOccurrences =
      withdrawnByRegion (fun owner => occurrenceInSubtree before.scopeOccurrences root owner ||
        (calledInstanceClosure before root).contains owner.processInstanceId) before.activityOccurrences)
    (effects : completed.effectWaits.filter (fun wait => occurrenceInSubtree completed.scopeOccurrences root wait.owner ||
        (calledInstanceClosure completed root).contains wait.owner.processInstanceId) =
      before.effectWaits.filter (fun wait => occurrenceInSubtree before.scopeOccurrences root wait.owner ||
        (calledInstanceClosure before root).contains wait.owner.processInstanceId))
    (incidents : completed.effectIncidents.filter (fun incident => occurrenceInSubtree completed.scopeOccurrences root incident.wait.owner ||
        (calledInstanceClosure completed root).contains incident.wait.owner.processInstanceId) =
      before.effectIncidents.filter (fun incident => occurrenceInSubtree before.scopeOccurrences root incident.wait.owner ||
        (calledInstanceClosure before root).contains incident.wait.owner.processInstanceId))
    (triggers : completed.compensationTriggers.filter (fun trigger => occurrenceInSubtree completed.scopeOccurrences root trigger.owner ||
        (calledInstanceClosure completed root).contains trigger.owner.processInstanceId) =
      before.compensationTriggers.filter (fun trigger => occurrenceInSubtree before.scopeOccurrences root trigger.owner ||
        (calledInstanceClosure before root).contains trigger.owner.processInstanceId)) :
    { cancelScopeSubtree completed root disposition with tokens := [], endOccurrences := 0 } =
      { cancelled with
        scopeOccurrences := cancelled.scopeOccurrences.filter (fun scope => decide (scope.id ≠ completionRoot))
        timerWaits := cancelled.timerWaits.filter keepTimer
        activityOccurrences := cancelled.activityOccurrences.filter keepActivity
        tokens := [], endOccurrences := 0 } := by
  have parents : compensationParentContextRetentionSurvivesScopeCancellation completed root disposition =
      compensationParentContextRetentionSurvivesScopeCancellation before root disposition := by
    funext retention
    cases retention <;> simp only [compensationParentContextRetentionSurvivesScopeCancellation, subtree, called]
  simp only [cancelScopeSubtree]
  simp only [activities, effects, incidents, triggers, parents]
  simp only [subtree, called]
  rw [completionUpdate, cancelUpdate]
  simp only [cancelScopeSubtree, retainedByRegion]
  have filters {α : Type} (values : List α) (first second : α → Bool) :
      (values.filter first).filter second = (values.filter second).filter first := by
    simp only [List.filter_filter, Bool.and_comm]
  congr 1
  all_goals first
  | exact filters _ _ _
  | (congr 1; exact filters _ _ _)

end BpmnSemantics.SemanticProcess.InternalCommutation
