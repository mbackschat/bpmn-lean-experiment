import BpmnSemantics.SemanticProcess.InternalRegionalRemovalAgreement

/-! # Compensation removal and prepared regions

Compensation history can outlive its original scope. The Internal Commutation account must retain
the additional called-instance ownership test when it uses a region of currently live scopes.
Parent-context retention also distinguishes retaining a selected root from removing it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Exact Compensation cleanup follows the full predecessor ownership mask, including historical
owners, both parent-context coordinates, and handler waits attached through cancelled triggers. -/
theorem cancelScopeSubtree_compensation_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    let cancelled := fun owner => region.contains owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId
    let keepParent := fun parent : RuntimeScopeOccurrence =>
      match disposition with
      | .retain => decide (parent.id = root) || !cancelled parent.id
      | .remove => !cancelled parent.id
    (cancelScopeSubtree state root disposition).compensationActivityRetentions =
        state.compensationActivityRetentions.filter (fun retention => !cancelled retention.owner) ∧
      (cancelScopeSubtree state root disposition).compensationParentContextRetentions =
        state.compensationParentContextRetentions.filter (fun retention =>
          match retention with
          | .provisional parent _ => keepParent parent
          | .promoted parent _ _ =>
              match parent.parent with
              | none => keepParent parent
              | some ownerRoot =>
                  if ownerRoot = root then disposition == .retain else !cancelled ownerRoot) ∧
      (cancelScopeSubtree state root disposition).compensationTriggers =
        state.compensationTriggers.filter (fun trigger => !cancelled trigger.owner) ∧
      (cancelScopeSubtree state root disposition).compensationHandlerEffectWaits =
        state.compensationHandlerEffectWaits.filter (fun wait =>
          !((state.compensationTriggers.filter fun trigger => cancelled trigger.owner).any
            fun trigger => trigger.id == wait.triggerId)) := by
  have mask := regional_cancellation_full_owner_mask program state expectedInstanceId instanceId
    valid running root region prepared
  simp only [cancelScopeSubtree, mask, and_self, true_and, and_true]
  apply List.filter_congr
  intro retention _
  unfold compensationParentContextRetentionSurvivesScopeCancellation
  dsimp only
  rw [funext mask]
  simp only [mask]
  cases disposition <;> cases retention <;> rfl

/-- A dead scope inside a cancelled called Process still has cancelled ownership; a live-scope-only
mask would retain its historical records incorrectly. -/
theorem called_historical_owner_separates_region_mask (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (owner : ScopeOccurrenceId) (dead : owner ∉ state.scopeOccurrences.map (·.id))
    (called : owner.processInstanceId ∈ calledInstanceClosure state root) :
    region.contains owner = false ∧
      (occurrenceInSubtree state.scopeOccurrences root owner ||
        (calledInstanceClosure state root).contains owner.processInstanceId) = true := by
  have regionLive := (deriveInternalOccurrenceRegion_spec state root region prepared).2.2.2.1
  have outside : owner ∉ region.members := fun member => dead (regionLive member)
  constructor
  · simp [InternalOccurrenceRegion.contains, outside]
  · rw [regional_cancellation_full_owner_mask program state expectedInstanceId instanceId
      valid running root region prepared owner]
    simp [called]

end BpmnSemantics.SemanticProcess
