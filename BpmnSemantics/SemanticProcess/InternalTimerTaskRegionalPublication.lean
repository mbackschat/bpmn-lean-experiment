import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalOwnership
import BpmnSemantics.SemanticProcess.InternalTimerTaskProjection
import BpmnSemantics.SemanticProcess.InternalRegionalArmingPublicationFrame

/-! Regional publication retains its predecessor-selected position and lifecycle deltas.
The new task is outside the removed region, and its private Timer cannot enter handler withdrawal.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_handler_withdrawal_frame (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch) (root : ScopeOccurrenceId)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (live : activityRecordsOwnLiveWork state = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root patch.arm.owner ||
      (calledInstanceClosure state root).contains patch.arm.owner.processInstanceId) = false)
    (id : OccurrenceId) :
    scopeCancellationWithdrawsHandler program (applyInternalTimerTaskPatch state patch) root id =
      scopeCancellationWithdrawsHandler program state root id := by
  have fresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  have unclaimed := activityRecords_do_not_claim_fresh_timer state patch.timer
    (fun old member => (fresh old member).1) live
  have classification := prepared_timer_task_preserves_existing_timer_binding program state contract patch prepared
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  let after := applyInternalTimerTaskPatch state patch
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  change cancelled owner = false at outside
  have populations : withdrawnByRegion cancelled after.activityOccurrences =
      withdrawnByRegion cancelled state.activityOccurrences := by
    change withdrawnByRegion cancelled (insertActivityOccurrence patch.record state.activityOccurrences) = _
    rw [withdrawnByRegion, insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by simp [patch, makeInternalTimerTaskPatch, recordInRegion, outside])]
    rfl
  have unattached : anyTimerIdNamesWait
      (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)) patch.timer = false := by
    apply List.any_eq_false.mpr
    intro timer member
    obtain ⟨record, recordMember, timerMember⟩ := List.mem_flatMap.mp member
    exact List.any_eq_false.mp (unclaimed record (List.mem_filter.mp recordMember).1) timer timerMember
  have calls : calledInstanceClosure after root = calledInstanceClosure state root := rfl
  have scopes : after.scopeOccurrences = state.scopeOccurrences := rfl
  have messages : after.messageWaits = state.messageWaits := rfl
  have timers : after.timerWaits = insertTimerWait patch.timer state.timerWaits := rfl
  change scopeCancellationWithdrawsHandler program after root id = _
  dsimp only [cancelled] at populations unattached
  simp only [scopeCancellationWithdrawsHandler, scopes, calls, populations, messages, timers]
  congr 1
  simp only [insertTimerWait, List.any_eq_not_all_not, all_canonicalInsertBy, unattached,
    Bool.and_false, Bool.not_false, Bool.true_and]
  apply congrArg Bool.not
  apply Bool.eq_iff_iff.mpr
  simp only [List.all_eq_true]
  constructor <;> intro checked wait member
  all_goals
    have frame : flowNodeOccurrenceBoundaryTimerBound program after wait =
        flowNodeOccurrenceBoundaryTimerBound program state wait := classification wait member
    simpa only [frame] using checked wait member

theorem preparedTimerTask_start_shape (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (entry : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some entry) :
    entry.owner = patch.arm.owner ∧ entry.anchor = .wait patch.arm.write.occurrence ∧
      openWaitAnchorAbsent state patch.arm.write.occurrence = true := by
  have shape : patch.arm.write.occurrence =
      { processInstanceId := patch.arm.owner.processInstanceId,
        elementId := ⟨patch.arm.write.elementId.value⟩,
        activation := patch.arm.write.occurrence.activation } ∧
      openWaitAnchorAbsent state patch.arm.write.occurrence = true := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, absent, _, _, rfl⟩ :=
      prepareInternalTimerTaskContract_facts program state contract patch prepared
    exact ⟨rfl, absent⟩
  have anchor := waitStart_anchor_of_eq program state _ _ _ entry started
  have owner : entry.owner = patch.arm.owner := by
    unfold waitStart? at started
    obtain ⟨_, _, started⟩ := Option.bind_eq_some_iff.mp started
    cases started
    rfl
  exact ⟨owner, anchor.trans (congrArg SemanticFlowNodeOccurrenceAnchor.wait shape.1.symm), shape.2⟩

theorem regionalPublicationTemplate_after_timer_task (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (template : InternalRegionalPublicationTemplate)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program patch.arm.runtimeInstanceId state = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (outside : region.contains patch.arm.owner = false)
    (cancelled : (occurrenceInSubtree state.scopeOccurrences region.root patch.arm.owner ||
      (calledInstanceClosure state region.root).contains patch.arm.owner.processInstanceId) = false)
    (found : regionalPublicationTemplate? program state selected region = some template) :
    regionalPublicationTemplate? program (applyInternalTimerTaskPatch state patch)
      selected region = some template := by
  obtain ⟨hosting, positions, current, delta, identities, ends,
    running, projected, opened, positioned, lifecycle, rfl⟩ :=
    regionalPublicationTemplate_facts program state selected region template found
  have armRunning := (preparedTimerTask_owner_facts program state contract patch prepared).2.2
  have hostingEq : hosting = patch.arm.runtimeInstanceId := by
    simpa [runningInstance?, armRunning] using running.symm
  subst hosting
  obtain ⟨previous, entry, next, previousFound, started, nextFound, nextEq, afterWF⟩ :=
    prepared_timer_task_preserves_runtime_and_open_projection_exact program state contract patch
      patch.arm.runtimeInstanceId programValid stateValid (by simp [opened]) prepared
  have previousEq : previous = current := Option.some.inj (previousFound.symm.trans opened)
  subst previous
  subst next
  have live : activityRecordsOwnLiveWork state = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  obtain ⟨owner, anchor, fresh⟩ := preparedTimerTask_start_shape program state contract patch prepared entry started
  have lifecycleFrame := regionalLifecycleTemplate_after_wait_insertion program state
    (applyInternalTimerTaskPatch state patch) selected region current entry _ anchor fresh
    (by simpa only [owner] using outside)
    (timerTask_handler_withdrawal_frame program state contract patch region.root prepared live cancelled) opened
  have fields := scopeArming_scope_read_projections state (.ordinary patch.arm.operation patch.arm)
  have control : (applyInternalTimerTaskPatch state patch).control = state.control := fields.1
  have time : (applyInternalTimerTaskPatch state patch).logicalTimeMs = state.logicalTimeMs := fields.2.1
  have scopes : (applyInternalTimerTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := fields.2.2.1
  have tokens : (applyInternalTimerTaskPatch state patch).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner) := by
    rw [show (applyInternalTimerTaskPatch state patch).tokens =
      removeToken state.tokens patch.arm.input patch.arm.owner from fields.2.2.2.2.2.2]
    exact filter_removeToken_of_rejected _ _ _ _ outside
  have tokenProjection :
      (projectTokens program (applyInternalTimerTaskPatch state patch).tokens).filter
          (fun token => region.contains token.owner) =
        (projectTokens program state.tokens).filter (fun token => region.contains token.owner) := by
    rw [← projectTokens_filter_by_owner, ← projectTokens_filter_by_owner]
    exact congrArg (projectTokens program) tokens
  have afterValid : runtimePositionValid program patch.arm.runtimeInstanceId
      (applyInternalTimerTaskPatch state patch) = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have afterRunning : runningInstance? (applyInternalTimerTaskPatch state patch) =
      some patch.arm.runtimeInstanceId := by
    simpa only [runningInstance?, control] using running
  unfold projectControlPosition? at projected
  split at projected
  · cases projected
    have deltaFrame : regionalPositionDelta? program selected region
        { controlTokens := projectTokens program (applyInternalTimerTaskPatch state patch).tokens
          scopes := projectScopes program state.scopeOccurrences } = some delta := by
      simpa only [regionalPositionDelta?, tokenProjection] using positioned
    simp only [regionalPublicationTemplate?, afterRunning, projectControlPosition?, afterValid,
      ↓reduceIte, scopes, nextFound, deltaFrame, lifecycleFrame, lifecycle, time,
      Option.bind_eq_bind, Option.bind_some]
    rfl
  · contradiction

/-- Regional preparation, including its publication, is preserved by the complete joined insertion. -/
theorem prepareInternalRegional_after_independent_timer_task (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program patch.arm.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (timerTaskStateFootprint patch) = true) :
    prepareInternalRegional? program (applyInternalTimerTaskPatch state patch) operation = some regional := by
  obtain ⟨snapshots, declared, time, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection closed).1
  have position : runtimePositionValid program patch.arm.runtimeInstanceId state = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have live : activityRecordsOwnLiveWork state = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have outside := timerTask_regional_scope_outside state regional.selection regional.region
    regional.footprint patch footprint independent
  have cancelled := timerTask_cancelled_outside program state contract patch regional.selection.root.id
    regional.region position prepared derived outside
  have rootEq := (deriveInternalOccurrenceRegion_spec state _ _ derived).1
  have selectionFrame := regionalOwnershipSelection_after_independent_timer_task program state operation
    regional contract patch position live regionalFound prepared independent
  have dependencies := timerTask_regional_footprint_frame program state operation regional.selection
    regional.region regional.footprint contract patch position live selected prepared derived footprint independent
  have published := regionalPublicationTemplate_after_timer_task program state contract patch regional.selection
    regional.region regional.publicationTemplate programValid stateValid prepared outside
    (by simpa only [rootEq] using cancelled) publication
  have fields := scopeArming_scope_read_projections state (.ordinary patch.arm.operation patch.arm)
  have scopes : (applyInternalTimerTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := fields.2.2.1
  have calls : (applyInternalTimerTaskPatch state patch).calledProcessOccurrences = state.calledProcessOccurrences := fields.2.2.2.1
  have logicalTime : (applyInternalTimerTaskPatch state patch).logicalTimeMs = state.logicalTimeMs := fields.2.1
  have members (seed : List ScopeOccurrenceId) (fuel : Nat) :
      occurrenceRegionMembersWithin (applyInternalTimerTaskPatch state patch) seed fuel =
        occurrenceRegionMembersWithin state seed fuel := by
    induction fuel generalizing seed with
    | zero => rfl
    | succ fuel ih =>
        have expanded : expandOccurrenceRegionMembers (applyInternalTimerTaskPatch state patch) seed =
            expandOccurrenceRegionMembers state seed := by
          simp only [expandOccurrenceRegionMembers, scopes, calls]
        simp only [occurrenceRegionMembersWithin, expanded, ih]
  have graph : scopeOwnershipGraphExact (applyInternalTimerTaskPatch state patch) =
      scopeOwnershipGraphExact state := by
    cases write : patch.arm.write <;>
      simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write] <;> rfl
  have regionFrame : deriveInternalOccurrenceRegion? (applyInternalTimerTaskPatch state patch)
      regional.selection.root.id = some regional.region := by
    simpa only [deriveInternalOccurrenceRegion?, graph, scopes, members] using derived
  have result := prepareInternalRegional_of_components program (applyInternalTimerTaskPatch state patch)
    operation regional.selection regional.region regional.footprint regional.publicationTemplate
    snapshots declared (by simpa only [logicalTime] using time) selectionFrame regionFrame dependencies published
  cases regional
  exact result

end BpmnSemantics.SemanticProcess.InternalCommutation
