import BpmnSemantics.SemanticProcess.InternalRegionalArmingRetention
import BpmnSemantics.SemanticProcess.InternalDataArmingFrames
import BpmnSemantics.SemanticProcess.InternalRegionalProjectionRemoval
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationWaitProjection
import BpmnSemantics.SemanticProcess.InternalRegionalPositionAlgebra

/-! Complete regional preparation observes lifecycle publication as well as state.
The arming frame therefore preserves the accepted projection, not only readiness. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedArming_open_projection_exact (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (hosting : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program hosting state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : arm.Prepared program state) :
    ∃ current newStart next,
      projectOpenFlowNodeOccurrences? program state = some current ∧
      waitStart? program state arm.scopeFramePatch.owner arm.scopeFramePatch.write.elementId
        arm.scopeFramePatch.write.occurrence.activation = some newStart ∧
      projectOpenFlowNodeOccurrences? program (arm.apply state) = some next ∧
      next = sortFlowNodeOccurrenceStarts (newStart :: current) ∧
      runtimeStateWellFormed program hosting (arm.apply state) = true := by
  cases arm with
  | ordinary operation patch =>
      exact prepared_arm_preserves_runtime_and_open_projection_exact program state operation patch
        hosting programValid stateValid openBefore prepared
  | data contract patch =>
      exact prepared_data_arm_preserves_runtime_and_open_projection_exact program state contract patch
        hosting programValid stateValid openBefore prepared

theorem preparedArm_boundaryTimer_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) (timer : TimerWait) :
    flowNodeOccurrenceBoundaryTimerBound program (applyInternalArmingPatch state patch) timer =
      flowNodeOccurrenceBoundaryTimerBound program state timer := by
  have unique := (prepared_arm_selection_unique program state operation patch prepared).2.1
  have operationEq := prepared_operation_eq program state operation patch prepared
  have inputSome : (internalArmInput? operation).isSome = true := by
    unfold prepareInternalArm? at prepared
    obtain ⟨input, selected, _⟩ := Option.bind_eq_some_iff.mp prepared
    simp [selected]
  cases write : patch.write with
  | userTask wait =>
      have declarers : userTaskWaitDeclarers program wait.task.id = [operation] := by
        simpa [uniqueFamilyDeclarer?, write, InternalArmingWrite.kind,
          InternalArmingWrite.elementId, operationEq] using unique
      have member : operation ∈ userTaskWaitDeclarers program wait.task.id := by rw [declarers]; simp
      have declares := (List.mem_filter.mp member).2
      cases operation with
      | awaitUserTask id origin input output task =>
          simp only [applyInternalArmingPatch, write]
          change flowNodeOccurrenceBoundaryTimerBound program
            { state with waits := insertUserTaskWait wait state.waits } timer = _
          exact flowNodeOccurrenceBoundaryTimerBound_insertUnboundedUserTask program state _ wait
            (anchor := { wait with task, output, metadata := task.metadata })
            (.ordinary id origin input rfl) declarers timer
      | _ => simp_all [internalArmInput?]
  | message wait | timer wait | effect wait bindings =>
      simp only [flowNodeOccurrenceBoundaryTimerBound, applyInternalArmingPatch, write]
      congr 1

theorem preparedArming_boundaryTimer_frame (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (prepared : arm.Prepared program state) (timer : TimerWait) :
    flowNodeOccurrenceBoundaryTimerBound program (arm.apply state) timer =
      flowNodeOccurrenceBoundaryTimerBound program state timer := by
  cases arm with
  | ordinary operation patch => exact preparedArm_boundaryTimer_frame program state operation patch prepared timer
  | data contract patch => exact prepared_data_arm_boundaryTimer_frame program state contract patch prepared timer

theorem preparedArming_handler_withdrawal_frame (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (root : ScopeOccurrenceId)
    (prepared : arm.Prepared program state) (live : activityRecordsOwnLiveWork state = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root arm.scopeFramePatch.owner ||
      (calledInstanceClosure state root).contains arm.scopeFramePatch.owner.processInstanceId) = false)
    (id : OccurrenceId) :
    scopeCancellationWithdrawsHandler program (arm.apply state) root id =
      scopeCancellationWithdrawsHandler program state root id := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  have fields := scopeArming_scope_read_projections state arm
  have called : calledInstanceClosure (arm.apply state) root = calledInstanceClosure state root := by
    simp only [calledInstanceClosure, fields.2.2.1, fields.2.2.2.1]
  have populations := preparedArming_cancellation_populations program state arm cancelled prepared outside
  dsimp only [cancelled] at populations
  have classification := preparedArming_boundaryTimer_frame program state arm prepared
  simp only [scopeCancellationWithdrawsHandler, fields.2.2.1, called, populations.1, classification]
  cases arm with
  | ordinary operation patch =>
      have unattached := preparedArm_new_wait_unattached program state operation patch
        (withdrawnByRegion cancelled state.activityOccurrences)
        (fun _ member => (List.mem_filter.mp member).1) live prepared
      dsimp only [cancelled] at unattached
      cases write : patch.write <;> simp only [write] at unattached
      all_goals simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write,
        insertMessageWait, insertTimerWait, List.any_eq_not_all_not, all_canonicalInsertBy,
        unattached, Bool.and_false, Bool.not_false, Bool.true_and]
  | data contract patch =>
      obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
        prepareInternalDataArmingContract_facts program state contract patch prepared
      subst patch
      rfl

theorem preparedArming_start_shape (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (prepared : arm.Prepared program state)
    (entry : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state arm.scopeFramePatch.owner arm.scopeFramePatch.write.elementId
      arm.scopeFramePatch.write.occurrence.activation = some entry) :
    entry.owner = arm.scopeFramePatch.owner ∧
      entry.anchor = .wait arm.scopeFramePatch.write.occurrence ∧
      openWaitAnchorAbsent state arm.scopeFramePatch.write.occurrence = true := by
  have shape : arm.scopeFramePatch.write.occurrence =
      { processInstanceId := arm.scopeFramePatch.owner.processInstanceId,
        elementId := ⟨arm.scopeFramePatch.write.elementId.value⟩,
        activation := arm.scopeFramePatch.write.occurrence.activation } ∧
      openWaitAnchorAbsent state arm.scopeFramePatch.write.occurrence = true := by
    cases arm with
    | ordinary operation patch => exact prepared_arm_anchor_shape program state operation patch prepared
    | data contract patch =>
        obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, absent, _, _, patchEq⟩ :=
          prepareInternalDataArmingContract_facts program state contract patch prepared
        subst patch
        exact ⟨rfl, absent⟩
  have anchor := waitStart_anchor_of_eq program state _ _ _ entry started
  have owner : entry.owner = arm.scopeFramePatch.owner := by
    unfold waitStart? at started
    obtain ⟨_, _, started⟩ := Option.bind_eq_some_iff.mp started
    cases started
    rfl
  exact ⟨owner, anchor.trans (congrArg SemanticFlowNodeOccurrenceAnchor.wait shape.1.symm), shape.2⟩

theorem sorted_open_insert_filter_rejected (program : Program) (state : RuntimeState)
    (current : List OpenSemanticFlowNodeOccurrence) (entry : OpenSemanticFlowNodeOccurrence)
    (predicate : OpenSemanticFlowNodeOccurrence → Bool)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (rejected : predicate entry = false) :
    (sortFlowNodeOccurrenceStarts (entry :: current)).filter predicate = current.filter predicate := by
  rw [← sortFlowNodeOccurrenceStarts_filter, List.filter_cons, rejected]
  simp only [Bool.false_eq_true, ↓reduceIte]
  rw [sortFlowNodeOccurrenceStarts_filter, projectOpenFlowNodeOccurrences_sorted program state current projected]

theorem regionalLifecycleTemplate_after_arming (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence) (entry : OpenSemanticFlowNodeOccurrence)
    (prepared : arm.Prepared program state) (live : activityRecordsOwnLiveWork state = true)
    (outside : region.contains arm.scopeFramePatch.owner = false)
    (cancelled : (occurrenceInSubtree state.scopeOccurrences region.root arm.scopeFramePatch.owner ||
      (calledInstanceClosure state region.root).contains arm.scopeFramePatch.owner.processInstanceId) = false)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (started : waitStart? program state arm.scopeFramePatch.owner arm.scopeFramePatch.write.elementId
      arm.scopeFramePatch.write.occurrence.activation = some entry) :
    regionalLifecycleTemplate? program (arm.apply state) selected region
      (sortFlowNodeOccurrenceStarts (entry :: current)) =
      regionalLifecycleTemplate? program state selected region current := by
  obtain ⟨owner, anchor, fresh⟩ := preparedArming_start_shape program state arm prepared entry started
  have handler := preparedArming_handler_withdrawal_frame program state arm region.root prepared live cancelled
  have unattached := absent_wait_anchor_not_withdrawn program state region.root _ fresh
  have predicate (retainRoot : Bool) (value : OpenSemanticFlowNodeOccurrence) :
      regionalCancelsOpenOccurrence program (arm.apply state) region retainRoot value =
        regionalCancelsOpenOccurrence program state region retainRoot value := by
    cases value.anchor <;> simp only [regionalCancelsOpenOccurrence, handler]
  have cancellation (retainRoot : Bool) :
      regionalCancellationEnds program (arm.apply state) region retainRoot
        (sortFlowNodeOccurrenceStarts (entry :: current)) =
      regionalCancellationEnds program state region retainRoot current := by
    have predicateEq := funext (predicate retainRoot)
    simp only [regionalCancellationEnds, predicateEq]
    rw [sorted_open_insert_filter_rejected program state current entry _ projected (by
      simp only [regionalCancelsOpenOccurrence, anchor, owner, outside, unattached, Bool.false_or])]
  have calls (id : OccurrenceId) :
      (sortFlowNodeOccurrenceStarts (entry :: current)).filter (fun value => value.anchor == .callActivity id) =
        current.filter (fun value => value.anchor == .callActivity id) :=
    sorted_open_insert_filter_rejected program state current entry _ projected (by simp [anchor])
  have scopes (id : ScopeOccurrenceId) :
      (sortFlowNodeOccurrenceStarts (entry :: current)).filter (fun value => value.anchor == .scope id) =
        current.filter (fun value => value.anchor == .scope id) :=
    sorted_open_insert_filter_rejected program state current entry _ projected (by simp [anchor])
  simp only [regionalLifecycleTemplate?, cancellation, calls, scopes]

theorem regionalPublicationTemplate_after_arming (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (template : InternalRegionalPublicationTemplate)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId state = true)
    (prepared : arm.Prepared program state)
    (outside : region.contains arm.scopeFramePatch.owner = false)
    (cancelled : (occurrenceInSubtree state.scopeOccurrences region.root arm.scopeFramePatch.owner ||
      (calledInstanceClosure state region.root).contains arm.scopeFramePatch.owner.processInstanceId) = false)
    (found : regionalPublicationTemplate? program state selected region = some template) :
    regionalPublicationTemplate? program (arm.apply state) selected region = some template := by
  obtain ⟨hosting, positions, current, delta, identities, ends,
    running, projected, opened, positioned, lifecycle, rfl⟩ :=
    regionalPublicationTemplate_facts program state selected region template found
  have armRunning := (preparedArming_owner_facts program state arm prepared).2.2
  have hostingEq : hosting = arm.scopeFramePatch.runtimeInstanceId := by
    simpa [runningInstance?, armRunning] using running.symm
  subst hosting
  obtain ⟨previous, entry, next, previousFound, started, nextFound, nextEq, afterWF⟩ :=
    preparedArming_open_projection_exact program state arm arm.scopeFramePatch.runtimeInstanceId
      programValid stateValid (by simp [opened]) prepared
  have previousEq : previous = current := Option.some.inj (previousFound.symm.trans opened)
  subst previous
  subst next
  have live : activityRecordsOwnLiveWork state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at stateValid
    exact stateValid.2.2.2.2.2.2.2.2.2.1
  have lifecycleFrame := regionalLifecycleTemplate_after_arming program state arm selected region current entry
    prepared live outside cancelled opened started
  have fields := scopeArming_scope_read_projections state arm
  have tokens : (arm.apply state).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner) := by
    rw [fields.2.2.2.2.2.2]
    exact filter_removeToken_of_rejected state.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner
      (fun token => region.contains token.owner) outside
  have tokenProjection :
      (projectTokens program (arm.apply state).tokens).filter (fun token => region.contains token.owner) =
        (projectTokens program state.tokens).filter (fun token => region.contains token.owner) := by
    rw [← projectTokens_filter_by_owner, ← projectTokens_filter_by_owner]
    exact congrArg (projectTokens program) tokens
  have afterValid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId (arm.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterWF
    exact afterWF.1
  have afterRunning : runningInstance? (arm.apply state) = some arm.scopeFramePatch.runtimeInstanceId := by
    simpa only [runningInstance?, fields.1] using running
  unfold projectControlPosition? at projected
  split at projected
  · cases projected
    have deltaFrame : regionalPositionDelta? program selected region
        { controlTokens := projectTokens program (arm.apply state).tokens
          scopes := projectScopes program state.scopeOccurrences } = some delta := by
      simpa only [regionalPositionDelta?, tokenProjection] using positioned
    simp only [regionalPublicationTemplate?, afterRunning, projectControlPosition?, afterValid,
      ↓reduceIte, fields.2.2.1, nextFound, deltaFrame, lifecycleFrame, lifecycle, fields.2.1,
      Option.bind_eq_bind, Option.bind_some]
    rfl
  · contradiction

/-- The entire regional artifact survives an independent ordinary or data-bearing wait arm.
All successor selection, ownership, dependency, and publication facts follow from the predecessor. -/
theorem prepareInternalRegional_after_independent_arming (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (armFound : arm.Prepared program state)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    prepareInternalRegional? program (arm.apply state) operation = some regional := by
  obtain ⟨snapshots, declared, time, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection closed).1
  have position : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at stateValid
    exact stateValid.1
  have live : activityRecordsOwnLiveWork state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at stateValid
    exact stateValid.2.2.2.2.2.2.2.2.2.1
  have outside := arming_regional_scope_outside state regional.selection regional.region
    regional.footprint arm footprint independent
  have cancelled := preparedArming_cancelled_outside program state arm regional.selection.root.id regional.region
    position armFound derived outside
  have rootEq := (deriveInternalOccurrenceRegion_spec state _ _ derived).1
  have selectionFrame := regionalOwnershipSelection_after_independent_arming program state operation
    regional arm position live regionalFound armFound independent
  have dependencies := preparedArming_regional_footprint_frame program state operation regional.selection
    regional.region regional.footprint arm position selected armFound derived footprint independent
  have published := regionalPublicationTemplate_after_arming program state arm regional.selection
    regional.region regional.publicationTemplate programValid stateValid armFound outside
    (by simpa only [rootEq] using cancelled) publication
  have fields := scopeArming_scope_read_projections state arm
  have members (seed : List ScopeOccurrenceId) (fuel : Nat) :
      occurrenceRegionMembersWithin (arm.apply state) seed fuel = occurrenceRegionMembersWithin state seed fuel := by
    induction fuel generalizing seed with
    | zero => rfl
    | succ fuel ih =>
        have expanded : expandOccurrenceRegionMembers (arm.apply state) seed =
            expandOccurrenceRegionMembers state seed := by
          simp only [expandOccurrenceRegionMembers, fields.2.2.1, fields.2.2.2.1]
        simp only [occurrenceRegionMembersWithin, expanded, ih]
  have graph : scopeOwnershipGraphExact (arm.apply state) = scopeOwnershipGraphExact state := by
    cases arm with
    | ordinary operation patch =>
        cases write : patch.write <;>
          simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write] <;> rfl
    | data contract patch =>
        cases write : patch.arm.write <;>
          simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write] <;> rfl
  have regionFrame : deriveInternalOccurrenceRegion? (arm.apply state) regional.selection.root.id =
      some regional.region := by
    simpa only [deriveInternalOccurrenceRegion?, graph, fields.2.2.1, members] using derived
  have result := prepareInternalRegional_of_components program (arm.apply state) operation
    regional.selection regional.region regional.footprint regional.publicationTemplate snapshots declared
    (by simpa only [fields.2.1] using time) selectionFrame regionFrame dependencies published
  cases regional
  exact result

end BpmnSemantics.SemanticProcess.InternalCommutation
