import BpmnSemantics.SemanticProcess.InternalRegionalArmingPublicationFrame
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch
import BpmnSemantics.SemanticProcess.InternalRegionalOrderFacts
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationEffectValidity

/-! Exact pair equality requires canonical list order, including continuation-token
insertion and owner-filtered cancellation, rather than equality of memberships. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem arming_addToken_commutes (state : RuntimeState) (arm : PreparedInternalArming)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (ordered : orderedBy controlTokenBefore state.tokens = true)
    (different : ({ placeId := output, owner } : ControlToken) ≠
      { placeId := arm.scopeFramePatch.input, owner := arm.scopeFramePatch.owner }) :
    { arm.apply state with tokens := addToken (arm.apply state).tokens output owner } =
      arm.apply { state with tokens := addToken state.tokens output owner } := by
  let tokenPatch : TokenPatch :=
    { owner := arm.scopeFramePatch.owner, consumed := [arm.scopeFramePatch.input], produced := [] }
  have commute := tokenPatch.commutes state.tokens { owner, consumed := [], produced := [output] }
    ordered (by simp [tokenPatch]) (by simpa [tokenPatch] using different)
  change addToken (removeToken state.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner) output owner =
    removeToken (addToken state.tokens output owner) arm.scopeFramePatch.input arm.scopeFramePatch.owner at commute
  cases arm with
  | ordinary operation patch =>
      cases write : patch.write <;>
        simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write,
          PreparedInternalArming.scopeFramePatch] at commute ⊢ <;> rw [commute]
  | data contract patch =>
      cases write : patch.arm.write <;>
        simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write,
          PreparedInternalArming.scopeFramePatch] at commute ⊢ <;> rw [commute]

theorem arming_cancellation_commutes (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prepared : prepareInternalArm? program state operation = some patch)
    (canonical : canonicalCollectionOrder state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (incidents : effectIncidentAssociationsValid state = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root patch.owner ||
      (calledInstanceClosure state root).contains patch.owner.processInstanceId) = false) :
    cancelScopeSubtree (applyInternalArmingPatch state patch) root disposition =
      applyInternalArmingPatch (cancelScopeSubtree state root disposition) patch := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  have populations := preparedArming_cancellation_populations program state (.ordinary operation patch)
    cancelled prepared outside
  have unattached := preparedArm_new_wait_unattached program state operation patch
    (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))
    (fun _ member => (List.mem_filter.mp member).1) live prepared
  have assigned := preparedArming_write_owner program state (.ordinary operation patch) prepared
  have tokenFrame : (removeToken state.tokens patch.input patch.owner).filter (fun token => !cancelled token.owner) =
      removeToken (state.tokens.filter fun token => !cancelled token.owner) patch.input patch.owner := by
    rw [removeToken_eq_erase, ← List.erase_filter, removeToken_eq_erase]
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
  cases write : patch.write with
  | userTask wait =>
      have ownerEq : wait.owner = patch.owner := by
        simpa only [PreparedInternalArming.scopeFramePatch, write, InternalArmingWrite.owner] using assigned
      have kept : (!cancelled wait.owner) = true := by
        simp only [ownerEq, show cancelled patch.owner = false from outside, Bool.not_false]
      have filtered := filter_canonicalInsertBy_retained userTaskWaitBefore userTaskWaitBefore_compose
        (fun wait => !cancelled wait.owner) wait state.waits canonical.2.2.1 kept
      simp only [applyInternalArmingPatch, write, cancelScopeSubtree, insertUserTaskWait_eq_canonicalInsertBy]
      dsimp only [cancelled] at filtered tokenFrame
      simp only [calledInstanceClosure] at filtered tokenFrame ⊢
      rw [filtered, tokenFrame]
      congr 1 <;> rfl
  | message wait =>
      simp only [write] at unattached
      have ownerEq : wait.owner = patch.owner := by
        simpa only [PreparedInternalArming.scopeFramePatch, write, InternalArmingWrite.owner] using assigned
      have kept : (!cancelled wait.owner &&
          !activityRecordsAttachMessageWait (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)) wait) = true := by
        simp only [ownerEq, show cancelled patch.owner = false from outside, unattached, Bool.not_false, Bool.and_self]
      have filtered := filter_canonicalInsertBy_retained messageWaitBefore regional_messageWaitBefore_compose
        (fun wait => !cancelled wait.owner &&
          !activityRecordsAttachMessageWait (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)) wait)
        wait state.messageWaits canonical.2.2.2.2.1 kept
      simp only [applyInternalArmingPatch, write, cancelScopeSubtree, insertMessageWait]
      dsimp only [cancelled] at filtered tokenFrame
      simp only [calledInstanceClosure] at filtered tokenFrame ⊢
      rw [filtered, tokenFrame]
      congr 1 <;> rfl
  | timer wait =>
      simp only [write] at unattached
      have ownerEq : wait.owner = patch.owner := by
        simpa only [PreparedInternalArming.scopeFramePatch, write, InternalArmingWrite.owner] using assigned
      have kept : (!cancelled wait.owner &&
          !anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))) wait) = true := by
        simp only [ownerEq, show cancelled patch.owner = false from outside, unattached, Bool.not_false, Bool.and_self]
      have filtered := filter_canonicalInsertBy_retained timerWaitBefore regional_timerWaitBefore_compose
        (fun wait => !cancelled wait.owner &&
          !anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))) wait)
        wait state.timerWaits canonical.2.2.2.2.2.1 kept
      simp only [applyInternalArmingPatch, write, cancelScopeSubtree, insertTimerWait]
      dsimp only [cancelled] at filtered tokenFrame
      simp only [calledInstanceClosure] at filtered tokenFrame ⊢
      rw [filtered, tokenFrame]
      congr 1 <;> rfl
  | effect wait bindings =>
      have ownerEq : wait.owner = patch.owner := by
        simpa only [PreparedInternalArming.scopeFramePatch, write, InternalArmingWrite.owner] using assigned
      have kept : (!cancelled wait.owner) = true := by
        simp only [ownerEq, show cancelled patch.owner = false from outside, Bool.not_false]
      have filtered := filter_canonicalInsertBy_retained effectWaitBefore regional_effectWaitBefore_compose
        (fun wait => !cancelled wait.owner) wait state.effectWaits canonical.2.2.2.2.2.2.1 kept
      obtain ⟨shape, absent⟩ := prepared_arm_anchor_shape program state operation patch prepared
      have processEq : wait.processInstanceId = patch.owner.processInstanceId := by
        simpa only [write, InternalArmingWrite.occurrence, effectWaitOccurrence] using
          congrArg OccurrenceId.processInstanceId shape
      have missing : effectWaitOccurrence wait ∉ openWaitAnchors state := by
        simpa [write, InternalArmingWrite.occurrence, openWaitAnchorAbsent, List.contains_eq_mem] using absent
      have absentWait (old : EffectWait) (member : old ∈ state.effectWaits) :
          effectWaitOccurrenceId old ≠ effectWaitOccurrence wait := by
        intro same
        apply missing
        simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
        exact Or.inr (Or.inr (Or.inr (Or.inl ⟨old, member, same⟩)))
      have absentIncident (incident : SemanticEffectIncident) (member : incident ∈ state.effectIncidents) :
          incident.id.effectId ≠ effectWaitOccurrence wait := by
        rw [incident_association_wait_identity state incidents incident member]
        intro same
        apply missing
        simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
        exact Or.inr (Or.inr (Or.inr (Or.inr ⟨incident, member, same⟩)))
      let scope : ActivityVariableScope :=
        { owner := .effectOccurrence (effectWaitOccurrence wait), bindings }
      have effectsAbsent : ((state.effectWaits.filter fun old => cancelled old.owner).any
          fun old => activityScopeMatches (effectWaitOccurrenceId old) scope) = false := by
        apply List.any_eq_false.mpr
        intro old member
        simpa [activityScopeMatches, localDataOwnerMatches, scope] using
          absentWait old (List.mem_filter.mp member).1
      have incidentsAbsent : ((state.effectIncidents.filter fun incident => cancelled incident.wait.owner).any
          fun incident => activityScopeMatches incident.id.effectId scope) = false := by
        apply List.any_eq_false.mpr
        intro incident member
        simpa [activityScopeMatches, localDataOwnerMatches, scope] using
          absentIncident incident (List.mem_filter.mp member).1
      have calledOutside : (calledInstanceClosure state root).contains wait.processInstanceId = false := by
        rw [processEq]
        exact (Bool.or_eq_false_iff.mp outside).2
      have localResult : (cancelScopeSubtree
          { state with variables := { state.variables with activities := [scope] } }
          root disposition).variables.activities = [scope] := by
        change [scope].filter (fun activity =>
          !(calledInstanceClosure state root).contains activity.owner.processInstanceId &&
            !((withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)).any fun record =>
              activityOccurrenceScopeMatches (activityOwnerForRecord record) activity) &&
            !((state.effectWaits.filter fun old => cancelled old.owner).any fun old =>
              activityScopeMatches (effectWaitOccurrenceId old) activity) &&
            !((state.effectIncidents.filter fun incident => cancelled incident.wait.owner).any fun incident =>
              activityScopeMatches incident.id.effectId activity)) = [scope]
        simp only [List.filter_cons, effectsAbsent, incidentsAbsent, Bool.not_false, Bool.and_true,
          List.filter_nil]
        simp only [scope, LocalDataOwner.processInstanceId, effectWaitOccurrence, calledOutside]
        simp [activityOccurrenceScopeMatches, localDataOwnerMatches]
      simp only [cancelScopeSubtree, calledInstanceClosure] at localResult
      have localKept := (List.filter_eq_self.mp localResult)
        { owner := .effectOccurrence (effectWaitOccurrence wait), bindings } (by simp [scope])
      dsimp only [cancelled] at populations filtered tokenFrame
      simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write, insertEffectWait] at populations
      simp only [applyInternalArmingPatch, write, cancelScopeSubtree,
        insertEffectWait]
      simp only [calledInstanceClosure] at filtered tokenFrame populations ⊢
      rw [filtered, tokenFrame]
      rw [populations.2]
      congr 1 <;> try rfl
      congr 1
      simp only [insertActivityVariableScope_eq_canonicalInsertBy]
      exact filter_canonicalInsertBy_retained activityVariableScopeBefore
        regional_activityVariableScopeBefore_compose _ _ state.variables.activities
        canonical.2.2.2.2.2.2.2.2.2.2.1 localKept

end BpmnSemantics.SemanticProcess.InternalCommutation
