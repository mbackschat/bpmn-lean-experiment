import BpmnSemantics.SemanticProcess.InternalMessageTaskRegionalOwnership
import BpmnSemantics.SemanticProcess.InternalMessageTaskAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalRegionalArmingPublicationFrame

/-! The subscription account publishes both Message-host anchors atomically. Regional cleanup
preserves its complete predecessor-selected publication through the actual two-anchor projection. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem messageTask_handler_withdrawal_frame (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch) (root : ScopeOccurrenceId)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (live : activityRecordsOwnLiveWork state = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root patch.arm.owner ||
      (calledInstanceClosure state root).contains patch.arm.owner.processInstanceId) = false)
    (id : OccurrenceId) (disposition : SelectedScopeDisposition := .remove) :
    scopeCancellationWithdrawsHandler program (applyInternalMessageTaskPatch state patch) root id disposition =
      scopeCancellationWithdrawsHandler program state root id disposition := by
  have classification (wait : TimerWait) : flowNodeOccurrenceBoundaryTimerBound program
      (applyInternalMessageTaskPatch state patch) wait = flowNodeOccurrenceBoundaryTimerBound program state wait := by
    have matching := funext (prepared_message_task_preserves_existing_timer_match program state contract patch prepared wait)
    simp only [flowNodeOccurrenceBoundaryTimerBound, matching]
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let patch := makeInternalMessageTaskPatch program state contract owner instanceId processId origin
  let after := applyInternalMessageTaskPatch state patch
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  change cancelled owner = false at outside
  have populations : withdrawnByRegion cancelled after.activityOccurrences (retainedCancellationRoot root disposition) =
      withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition) := by
    change withdrawnByRegion cancelled (insertActivityOccurrence patch.record state.activityOccurrences) (retainedCancellationRoot root disposition) = _
    rw [withdrawnByRegion, insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by simp [patch, makeInternalMessageTaskPatch, recordInRegion, outside])]
    rfl
  have unattached := preparedMessageTask_new_wait_unattached program state contract patch
    (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))
    (fun _ member => (List.mem_filter.mp member).1) live prepared
  have calls : calledInstanceClosure after root = calledInstanceClosure state root := rfl
  have scopes : after.scopeOccurrences = state.scopeOccurrences := rfl
  have messages : after.messageWaits = insertMessageWait patch.message state.messageWaits := rfl
  have timers : after.timerWaits = state.timerWaits := rfl
  have classified : flowNodeOccurrenceBoundaryTimerBound program after =
      flowNodeOccurrenceBoundaryTimerBound program state := funext classification
  change scopeCancellationWithdrawsHandler program after root id disposition = _
  dsimp only [cancelled] at populations unattached
  simp only [scopeCancellationWithdrawsHandler, scopes, calls, populations, messages, timers, classified]
  simp only [insertMessageWait, List.any_eq_not_all_not, all_canonicalInsertBy, unattached,
    Bool.and_false, Bool.not_false, Bool.true_and]

private theorem regionalLifecycleTemplate_after_message_pair (program : Program) (state after : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence) (task message : OpenSemanticFlowNodeOccurrence)
    (taskId messageId : OccurrenceId) (taskAnchor : task.anchor = .wait taskId)
    (messageAnchor : message.anchor = .wait messageId)
    (taskFresh : openWaitAnchorAbsent state taskId = true)
    (messageFresh : openWaitAnchorAbsent state messageId = true)
    (taskOutside : region.contains task.owner = false) (messageOutside : region.contains message.owner = false)
    (handler : ∀ id disposition, scopeCancellationWithdrawsHandler program after region.root id disposition =
      scopeCancellationWithdrawsHandler program state region.root id disposition)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    regionalLifecycleTemplate? program after selected region (sortFlowNodeOccurrenceStarts (task :: message :: current)) =
      regionalLifecycleTemplate? program state selected region current := by
  have filtered (predicate : OpenSemanticFlowNodeOccurrence → Bool)
      (taskRejected : predicate task = false) (messageRejected : predicate message = false) :
      (sortFlowNodeOccurrenceStarts (task :: message :: current)).filter predicate = current.filter predicate := by
    rw [← sortFlowNodeOccurrenceStarts_filter]
    simp only [List.filter_cons, taskRejected, messageRejected, Bool.false_eq_true, ↓reduceIte]
    rw [sortFlowNodeOccurrenceStarts_filter, projectOpenFlowNodeOccurrences_sorted program state current projected]
  have predicate (retainRoot : Bool) (value : OpenSemanticFlowNodeOccurrence) :
      regionalCancelsOpenOccurrence program after region retainRoot value =
        regionalCancelsOpenOccurrence program state region retainRoot value := by
    cases value.anchor <;> simp only [regionalCancelsOpenOccurrence, handler]
  have cancellation (retainRoot : Bool) : regionalCancellationEnds program after region retainRoot
      (sortFlowNodeOccurrenceStarts (task :: message :: current)) =
        regionalCancellationEnds program state region retainRoot current := by
    simp only [regionalCancellationEnds, funext (predicate retainRoot)]
    rw [filtered _ (by simp [regionalCancelsOpenOccurrence, taskAnchor, taskOutside,
      absent_wait_anchor_not_withdrawn program state region.root taskId taskFresh _])
      (by simp [regionalCancelsOpenOccurrence, messageAnchor, messageOutside,
      absent_wait_anchor_not_withdrawn program state region.root messageId messageFresh _])]
  have calls (id : OccurrenceId) := filtered (fun value => value.anchor == .callActivity id)
    (by simp [taskAnchor]) (by simp [messageAnchor])
  have scopes (id : ScopeOccurrenceId) := filtered (fun value => value.anchor == .scope id)
    (by simp [taskAnchor]) (by simp [messageAnchor])
  simp only [regionalLifecycleTemplate?, cancellation, calls, scopes]

theorem regionalPublicationTemplate_after_message_task (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (template : InternalRegionalPublicationTemplate)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program patch.arm.runtimeInstanceId state = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (outside : region.contains patch.arm.owner = false)
    (cancelled : (occurrenceInSubtree state.scopeOccurrences region.root patch.arm.owner ||
      (calledInstanceClosure state region.root).contains patch.arm.owner.processInstanceId) = false)
    (found : regionalPublicationTemplate? program state selected region = some template) :
    regionalPublicationTemplate? program (applyInternalMessageTaskPatch state patch)
      selected region = some template := by
  obtain ⟨hosting, positions, current, delta, identities, ends,
    running, projected, opened, positioned, lifecycle, rfl⟩ :=
    regionalPublicationTemplate_facts program state selected region template found
  have armRunning := (preparedMessageTask_owner_facts program state contract patch prepared).2.2
  have hostingEq : hosting = patch.arm.runtimeInstanceId := by
    simpa [runningInstance?, armRunning] using running.symm
  subst hosting
  obtain ⟨task, message, taskStarted, messageStarted, _⟩ := prepared_message_task_lifecycle_pair
    program state contract patch patch.arm.runtimeInstanceId patch.arm.runtimeInstanceId 0
    admitted programValid stateValid (by simp [opened]) prepared
  have nextFound := prepared_message_task_open_projection_exact program state contract patch
    patch.arm.runtimeInstanceId admitted programValid stateValid prepared current opened
    task message taskStarted messageStarted
  have afterWF := prepared_message_task_preserves_runtime program state contract patch
    patch.arm.runtimeInstanceId prepared stateValid
  have live : activityRecordsOwnLiveWork state = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have occurrenceValidity := (projectOpenFlowNodeOccurrences_validities program state current
    patch.arm.runtimeInstanceId armRunning opened).1
  have aligned := prepared_message_task_owner_instance program state contract patch admitted occurrenceValidity prepared
  obtain ⟨_, owner, runtime, inputOrigin, processId, _, _, _, _, _, _, _, _, taskFresh, messageFresh, _, _, patchEq⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have aligned' : runtime = owner.processInstanceId := by simpa [patchEq, makeInternalMessageTaskPatch] using aligned
  have taskAnchor := waitStart_anchor_of_eq program state _ _ _ task taskStarted
  have messageAnchor := waitStart_anchor_of_eq program state _ _ _ message messageStarted
  have anchors : task.anchor = .wait patch.arm.write.occurrence ∧
      message.anchor = .wait (messageWaitOccurrence patch.message) := by
    simpa [patchEq, makeInternalMessageTaskPatch, InternalArmingWrite.occurrence,
      InternalArmingWrite.elementId, userTaskWaitOccurrence, messageWaitOccurrence, aligned'] using And.intro taskAnchor messageAnchor
  have startOwner (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
      (entry : OpenSemanticFlowNodeOccurrence)
      (started : waitStart? program state owner element activation = some entry) : entry.owner = owner := by
    unfold waitStart? at started
    obtain ⟨_, _, started⟩ := Option.bind_eq_some_iff.mp started
    cases started
    rfl
  have taskOwner := startOwner _ _ _ task taskStarted
  have messageOwner := startOwner _ _ _ message messageStarted
  have sameOwner : patch.message.owner = patch.arm.owner := by rw [patchEq]; rfl
  have lifecycleFrame := regionalLifecycleTemplate_after_message_pair program state
    (applyInternalMessageTaskPatch state patch) selected region current task message
    _ _ anchors.1 anchors.2 taskFresh messageFresh
    (by simpa only [taskOwner] using outside)
    (by simpa only [messageOwner, sameOwner] using outside)
    (fun id disposition => messageTask_handler_withdrawal_frame program state contract patch region.root prepared live cancelled id disposition) opened
  have fields := scopeArming_scope_read_projections state (.ordinary patch.arm.operation patch.arm)
  have control : (applyInternalMessageTaskPatch state patch).control = state.control := fields.1
  have time : (applyInternalMessageTaskPatch state patch).logicalTimeMs = state.logicalTimeMs := fields.2.1
  have scopes : (applyInternalMessageTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := fields.2.2.1
  have tokens : (applyInternalMessageTaskPatch state patch).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner) := by
    rw [show (applyInternalMessageTaskPatch state patch).tokens =
      removeToken state.tokens patch.arm.input patch.arm.owner from fields.2.2.2.2.2.2]
    exact filter_removeToken_of_rejected _ _ _ _ outside
  have tokenProjection :
      (projectTokens program (applyInternalMessageTaskPatch state patch).tokens).filter
          (fun token => region.contains token.owner) =
        (projectTokens program state.tokens).filter (fun token => region.contains token.owner) := by
    rw [← projectTokens_filter_by_owner, ← projectTokens_filter_by_owner]
    exact congrArg (projectTokens program) tokens
  have afterValid : runtimePositionValid program patch.arm.runtimeInstanceId
      (applyInternalMessageTaskPatch state patch) = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have afterRunning : runningInstance? (applyInternalMessageTaskPatch state patch) =
      some patch.arm.runtimeInstanceId := by
    simpa only [runningInstance?, control] using running
  unfold projectControlPosition? at projected
  split at projected
  · cases projected
    have deltaFrame : regionalPositionDelta? program selected region
        { controlTokens := projectTokens program (applyInternalMessageTaskPatch state patch).tokens
          scopes := projectScopes program state.scopeOccurrences } = some delta := by
      simpa only [regionalPositionDelta?, tokenProjection] using positioned
    simp only [regionalPublicationTemplate?, afterRunning, projectControlPosition?, afterValid,
      ↓reduceIte, scopes, nextFound, deltaFrame, lifecycleFrame, lifecycle, time,
      Option.bind_eq_bind, Option.bind_some]
    rfl
  · contradiction

/-- Regional preparation, including its publication, is preserved by the complete joined insertion. -/
theorem prepareInternalRegional_after_independent_message_task (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program patch.arm.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (messageTaskStateFootprint patch) = true) :
    prepareInternalRegional? program (applyInternalMessageTaskPatch state patch) operation = some regional := by
  obtain ⟨snapshots, declared, time, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection closed).1
  have position : runtimePositionValid program patch.arm.runtimeInstanceId state = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have live : activityRecordsOwnLiveWork state = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have outside := messageTask_regional_scope_outside state regional.selection regional.region
    regional.footprint patch footprint independent
  have cancelled := messageTask_cancelled_outside program state contract patch regional.selection.root.id
    regional.region position prepared derived outside
  have rootEq := (deriveInternalOccurrenceRegion_spec state _ _ derived).1
  have selectionFrame := regionalOwnershipSelection_after_independent_message_task program state operation
    regional contract patch position live regionalFound prepared independent
  have dependencies := messageTask_regional_footprint_frame program state operation regional.selection
    regional.region regional.footprint contract patch position live selected prepared derived footprint independent
  have published := regionalPublicationTemplate_after_message_task program state contract patch regional.selection
    regional.region regional.publicationTemplate admitted programValid stateValid prepared outside
    (by simpa only [rootEq] using cancelled) publication
  have fields := scopeArming_scope_read_projections state (.ordinary patch.arm.operation patch.arm)
  have scopes : (applyInternalMessageTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := fields.2.2.1
  have calls : (applyInternalMessageTaskPatch state patch).calledProcessOccurrences = state.calledProcessOccurrences := fields.2.2.2.1
  have logicalTime : (applyInternalMessageTaskPatch state patch).logicalTimeMs = state.logicalTimeMs := fields.2.1
  have members (seed : List ScopeOccurrenceId) (fuel : Nat) :
      occurrenceRegionMembersWithin (applyInternalMessageTaskPatch state patch) seed fuel =
        occurrenceRegionMembersWithin state seed fuel := by
    induction fuel generalizing seed with
    | zero => rfl
    | succ fuel ih =>
        have expanded : expandOccurrenceRegionMembers (applyInternalMessageTaskPatch state patch) seed =
            expandOccurrenceRegionMembers state seed := by
          simp only [expandOccurrenceRegionMembers, scopes, calls]
        simp only [occurrenceRegionMembersWithin, expanded, ih]
  have graph : scopeOwnershipGraphExact (applyInternalMessageTaskPatch state patch) =
      scopeOwnershipGraphExact state := by
    cases write : patch.arm.write <;>
      simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write] <;> rfl
  have regionFrame : deriveInternalOccurrenceRegion? (applyInternalMessageTaskPatch state patch)
      regional.selection.root.id = some regional.region := by
    simpa only [deriveInternalOccurrenceRegion?, graph, scopes, members] using derived
  have result := prepareInternalRegional_of_components program (applyInternalMessageTaskPatch state patch)
    operation regional.selection regional.region regional.footprint regional.publicationTemplate
    snapshots declared (by simpa only [logicalTime] using time) selectionFrame regionFrame dependencies published
  cases regional
  exact result

end BpmnSemantics.SemanticProcess.InternalCommutation
