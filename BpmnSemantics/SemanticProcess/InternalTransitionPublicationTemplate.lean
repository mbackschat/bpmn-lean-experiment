import BpmnSemantics.SemanticProcess.InternalTransitionPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationAcceptance
import BpmnSemantics.SemanticProcess.InternalRegionalArmingAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalEndPublication
import BpmnSemantics.SemanticProcess.InternalMergePublication
import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalPairPublication
import BpmnSemantics.SemanticProcess.InternalMessageTaskAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalBoundedScopePublication

/-! Predecessor-only mixed publication templates implement the numbering boundary in the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem actualInternalAlternativePublication_operation (program : Program) (instanceId : SemanticId)
    (before after : RuntimeState) (operation : SemanticOperation) (commandId : SemanticId) (index : Nat) :
    actualInternalAlternativePublication? program instanceId before after operation (.operation operation.id) commandId index =
      actualInternalTransitionPublication? program instanceId before after operation commandId index := by
  simp [actualInternalAlternativePublication?]

/-- Every actual publication component is accepted at any later assigned index and equals the
predecessor template; acceptance and position correspondence are derived, never premises. -/
theorem prepared_transition_publication_template_accepted (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepared.Prepared program state) :
    ∃ template,
      preparedTransitionPublicationTemplate? program state prepared = some template ∧
      actualInternalAlternativePublication? program instanceId state (prepared.apply program state)
        prepared.operation prepared.alternative commandId transitionIndex = some (template.instantiate commandId transitionIndex) := by
  cases prepared <;> simp only [PreparedInternalTransition.operation, PreparedInternalTransition.alternative,
    actualInternalAlternativePublication_operation]
  case arming arm =>
      cases arm with
      | ordinary operation patch =>
          exact prepared_ordinary_publication_template_accepted program state operation patch instanceId
            commandId transitionIndex programWF beforeWF projectable found
      | data contract patch =>
          exact prepared_data_publication_template_accepted program state contract patch instanceId
            commandId transitionIndex programWF beforeWF projectable found
  case timerTask contract patch =>
      exact prepared_timer_task_publication_template_accepted program state contract patch instanceId
        commandId transitionIndex programWF beforeWF projectable found
  case messageTask contract patch =>
      exact prepared_message_task_publication_template_accepted program state contract patch instanceId
        commandId transitionIndex found.1.2.2 programWF beforeWF projectable found.2
  case boundedScope contract scope =>
      obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
      have accepted := prepared_bounded_scope_publication_accepted program state contract scope instanceId
        commandId transitionIndex current programWF beforeWF projected found.2
      have operation : scope.selection.creation.operation = contract.operation := by
        obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
          prepareInternalBoundedScope_facts program state contract scope found.2
        obtain ⟨entry, _, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
        rfl
      exact ⟨internalBoundedScopePublicationTemplate scope,
        by simp only [preparedTransitionPublicationTemplate?, operation, ↓reduceIte], accepted⟩
  case localControl localPrepared =>
      have record := prepareInternalLocalControl_record program state localPrepared.operation localPrepared found
      have lifecycle := prepareInternalLocalControl_accepted_lifecycle program state localPrepared.operation
        localPrepared instanceId commandId transitionIndex beforeWF running projectable found
      have position := internalLocalControlPositionDelta?_corresponds program state localPrepared.operation
        localPrepared instanceId programWF beforeWF running found
      have time := (prepareInternalLocalControl_template_facts program state localPrepared.operation
        localPrepared found).2
      refine ⟨internalLocalControlPublicationTemplate localPrepared, rfl, ?_⟩
      change actualInternalTransitionPublication? program instanceId state (localPrepared.selection.apply state)
        localPrepared.operation commandId transitionIndex = _
      simp only [actualInternalTransitionPublication?, record, lifecycle, position,
        time]
      rfl
  case scopeCreation scopePrepared =>
      exact ⟨internalScopeCreationPublicationTemplate scopePrepared, rfl,
        prepared_scope_creation_publication_template_accepted program state scopePrepared instanceId
          commandId transitionIndex programWF beforeWF projectable found⟩
  case ordinaryEnd ending =>
      have record := prepareInternalEnd_record program state ending.operation ending found
      have lifecycle := prepareInternalEnd_accepted_lifecycle program state ending.operation ending
        instanceId commandId transitionIndex running projectable found
      have position := prepareInternalEnd_position program state ending.operation ending instanceId beforeWF found
      have time : ending.publicationTemplate.logicalTimeMs = state.logicalTimeMs := by
        obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
          prepareInternalEnd_facts program state ending.operation ending found
        rfl
      refine ⟨internalEndPublicationTemplate ending, rfl, ?_⟩
      change actualInternalTransitionPublication? program instanceId state (ending.selection.apply state)
        ending.operation commandId transitionIndex = _
      simp only [actualInternalTransitionPublication?, record, lifecycle, position,
        internalEndPublicationTemplate, InternalTransitionPublicationTemplate.instantiate, time]
      rfl
  case regional regional =>
      obtain ⟨after, applied, published⟩ := prepareInternalRegional_execution_publication program state _ regional
        instanceId commandId transitionIndex programWF beforeWF found
      refine ⟨internalRegionalPublicationTemplate regional, rfl, ?_⟩
      have record := published.record
      rw [published.operationBound] at record
      simp only [PreparedInternalTransition.apply, applied, Option.getD_some,
        actualInternalTransitionPublication?, record, published.lifecycle, published.position,
        internalRegionalPublicationTemplate, InternalTransitionPublicationTemplate.instantiate,
        InternalTransitionLifecycleTemplate.instantiate, InternalRegionalPublicationTemplate.lifecycle,
        published.logicalTime]
      rfl
  case mergeInput merge =>
      exact ⟨internalMergePublicationTemplate merge, rfl,
        prepareInternalMerge_accepted_publication program state merge.selection.operation merge.selection.alternative merge
          instanceId commandId transitionIndex beforeWF running projectable found⟩

theorem prepared_transition_template_operation_id (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (template : InternalTransitionPublicationTemplate)
    (found : preparedTransitionPublicationTemplate? program state prepared = some template) :
    template.record.operationId = prepared.operation.id := by
  cases prepared with
  | messageTask contract patch =>
      obtain ⟨task, _, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨message, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      rfl
  | boundedScope contract scope =>
      simp only [preparedTransitionPublicationTemplate?] at found
      split at found
      · next same =>
          cases found
          exact congrArg SemanticOperation.id same
      · contradiction
  | timerTask contract patch =>
      obtain ⟨start, _, found⟩ := Option.map_eq_some_iff.mp found
      cases found
      rfl
  | arming arm =>
      cases arm with
      | ordinary operation patch | data operation patch =>
          obtain ⟨start, _, found⟩ := Option.map_eq_some_iff.mp found
          cases found
          rfl
  | localControl localPrepared => cases found; rfl
  | scopeCreation scopePrepared => cases found; rfl
  | regional regional => cases found; rfl
  | ordinaryEnd ending => cases found; rfl
  | mergeInput merge => cases found; rfl

theorem prepared_transition_template_frame (program : Program) (before after : RuntimeState)
    (prepared : PreparedInternalTransition)
    (template : InternalTransitionPublicationTemplate)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (starts : ∀ owner element activation start,
      waitStart? program before owner element activation = some start →
      waitStart? program after owner element activation = some start)
    (found : preparedTransitionPublicationTemplate? program before prepared = some template) :
    preparedTransitionPublicationTemplate? program after prepared = some template := by
  cases prepared with
  | messageTask contract patch =>
      obtain ⟨task, taskStarted, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨message, messageStarted, templateEq⟩ := Option.bind_eq_some_iff.mp found
      cases templateEq
      simp only [preparedTransitionPublicationTemplate?, internalMessageTaskPublicationTemplate?,
        starts _ _ _ _ taskStarted, starts _ _ _ _ messageStarted, Option.bind_eq_bind, Option.bind_some, time]
  | boundedScope _ _ => exact found
  | timerTask contract patch =>
      obtain ⟨start, started, templateEq⟩ := Option.map_eq_some_iff.mp found
      cases templateEq
      simp only [preparedTransitionPublicationTemplate?, internalArmingPublicationTemplate?,
        starts _ _ _ _ started, Option.map_some, time]
  | arming arm =>
      cases arm with
      | ordinary operation patch | data operation patch =>
          obtain ⟨start, started, templateEq⟩ := Option.map_eq_some_iff.mp found
          cases templateEq
          simp only [preparedTransitionPublicationTemplate?, internalArmingPublicationTemplate?,
            starts _ _ _ _ started, Option.map_some, time]
  | localControl _ => exact found
  | scopeCreation _ => exact found
  | regional _ => exact found
  | ordinaryEnd _ => exact found
  | mergeInput _ => exact found

theorem prepared_transition_template_after_step (program : Program) (state : RuntimeState)
    (step query : PreparedInternalTransition) (instanceId : SemanticId)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (stepPrepared : step.Prepared program state) (queryPrepared : query.Prepared program state)
    (independent : step.Independent query) :
    preparedTransitionPublicationTemplate? program (step.apply program state) query =
      preparedTransitionPublicationTemplate? program state query := by
  obtain ⟨template, found, _⟩ := prepared_transition_publication_template_accepted program state query
    instanceId instanceId 0 programWF beforeWF running projectable queryPrepared
  rw [found]
  cases step with
  | boundedScope contract scope =>
      obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, preparedEq⟩ :=
        prepareInternalBoundedScope_facts program state contract scope stepPrepared.2
      obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
      have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
      apply prepared_transition_template_frame program state (scope.selection.apply state) query template _ _ found
      · simp only [preparedEq, makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
          makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child]
      · intro owner element activation start prior
        have framed := scopeCreation_wait_start_preserved program state contract.entryOperation entry
          owner element activation start entryFound prior
        simpa only [preparedEq, makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
          makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child,
          waitStart?, processIdForOwner?, hostingInstanceId?, flowNodeOccurrenceOwnerLiveUnique] using framed
  | messageTask contract patch =>
      apply prepared_transition_template_frame program state (applyInternalMessageTaskPatch state patch) query template
        (show (applyInternalMessageTaskPatch state patch).logicalTimeMs = state.logicalTimeMs from
          prepared_arming_time_frame state (.ordinary patch.arm.operation patch.arm)) _ found
      intro owner element activation start prior
      rw [messageTaskWaitStart_frame]
      exact prior
  | timerTask contract patch =>
      apply prepared_transition_template_frame program state (applyInternalTimerTaskPatch state patch) query template
        (show (applyInternalTimerTaskPatch state patch).logicalTimeMs = state.logicalTimeMs from
          prepared_arming_time_frame state (.ordinary patch.arm.operation patch.arm)) _ found
      intro owner element activation start prior
      rw [timerTaskWaitStart_frame]
      exact prior
  | arming arm =>
      exact prepared_transition_template_frame program state (arm.apply state) query template
        (prepared_arming_time_frame state arm)
        (fun owner element activation start prior => by
          rw [prepared_arming_start_frame program state arm owner element activation]
          exact prior) found
  | localControl control =>
      exact prepared_transition_template_frame program state (control.selection.apply state) query template
        rfl (fun _ _ _ _ prior => prior) found
  | ordinaryEnd ending =>
      exact prepared_transition_template_frame program state (ending.selection.apply state) query template
        rfl (fun _ _ _ _ prior => prior) found
  | mergeInput merge =>
      exact prepared_transition_template_frame program state (merge.selection.apply state) query template
        rfl (fun _ _ _ _ prior => prior) found
  | scopeCreation creation =>
      apply prepared_transition_template_frame program state (creation.selection.apply state) query template
        (scopeCreation_apply_time state creation.selection) _ found
      intro owner element activation start prior
      obtain ⟨selected, hosting, ownerRecord, origin, definition, scopeStart, delta, selection,
        _, _, _, _, _, _, _, _, _, preparedEq⟩ :=
        prepareInternalScopeCreation_facts program state creation.selection.operation creation stepPrepared
      simpa only [preparedEq, makeInternalScopeCreationPreparation] using
        scopeCreation_wait_start_preserved program state _ selected owner element activation start selection prior
  | regional regional =>
      cases query with
      | messageTask contract patch =>
          obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
          have occurrenceValid := (projectOpenFlowNodeOccurrences_validities program state current instanceId
            running projected).1
          have aligned := prepared_message_task_owner_instance program state contract patch
            queryPrepared.1.2.2 occurrenceValid queryPrepared.2
          obtain ⟨_, owner, hosting, inputOrigin, processId, _, hostingFound, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
            prepareInternalMessageTaskContract_facts program state contract patch queryPrepared.2
          have hostingEq : hosting = instanceId := by
            simpa only [runningInstance?, running, Option.some.injEq] using hostingFound.symm
          have patchHosting : patch.arm.runtimeInstanceId = instanceId := by
            simpa only [patchEq, makeInternalMessageTaskPatch] using hostingEq
          have ownerHosting : patch.arm.owner.processInstanceId = instanceId := aligned.symm.trans patchHosting
          have sameOwner : patch.message.owner = patch.arm.owner := by rw [patchEq]; rfl
          obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program state _ regional stepPrepared
          change regionalStateFootprintsIndependent regional.footprint (messageTaskStateFootprint patch) = true at independent
          have footprint := (prepareInternalRegional_facts program state _ regional stepPrepared).2.2.2.2.2.1
          have outside : regional.region.contains patch.arm.owner = false := by
            have separation := regional_independent_read_write _ _ independent _
              (.ordinary (.scopeOccurrence patch.arm.owner))
              (regionalStateFootprint_region_write state regional.selection regional.region regional.footprint footprint)
              (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
            simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using separation
          have controlUnwritten : .ordinary (.runtimeControl instanceId) ∉ regional.footprint.writes := by
            intro written
            have separation := regional_independent_read_write _ _ independent _
              (.ordinary (.runtimeControl patch.arm.runtimeInstanceId)) written
              (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
            simp [patchHosting, regionalStateAtomsConflict] at separation
          have fields := preparedRegional_control_filters program state after instanceId
            regional.selection.operation regional beforeWF running stepPrepared applied
            (fun scope => decide (scope.id = patch.arm.owner)) (fun _ => false) (fun _ => false)
            (by
              intro scope _ selected
              simpa only [of_decide_eq_true selected] using outside)
            (by simp) (by simp) (by simp) controlUnwritten
          have census : flowNodeOccurrenceOwnerLiveUnique after patch.arm.owner =
              flowNodeOccurrenceOwnerLiveUnique state patch.arm.owner := by
            simp only [flowNodeOccurrenceOwnerLiveUnique, fields.2.2.2.1]
          have startFrame (element : NodeId) (activation : Nat) :
              waitStart? program after patch.arm.owner element activation =
                waitStart? program state patch.arm.owner element activation := by
            simp only [waitStart?, processIdForOwner?, hostingInstanceId?, fields.1, running,
              census, ownerHosting, Option.bind_eq_bind, Option.bind_some, ↓reduceIte]
          rw [← found]
          simp only [PreparedInternalTransition.apply, applied, Option.getD_some,
            preparedTransitionPublicationTemplate?, internalMessageTaskPublicationTemplate?,
            sameOwner, startFrame, fields.2.1]
      | timerTask contract patch =>
          have facts := preparedTimerTask_owner_facts program state contract patch queryPrepared
          have hosting := runtimePositionValid_running_instance program instanceId patch.arm.runtimeInstanceId state
            (runtimeStateWellFormed_position program instanceId state beforeWF) facts.2.2
          have valid : runtimeStateWellFormed program patch.arm.runtimeInstanceId state = true := by
            simpa only [hosting] using beforeWF
          obtain ⟨_, after, actualTemplate, applied, _, _, _, _, _, _, _, beforeFound, afterFound, _⟩ :=
            prepared_regional_timer_task_pair_execution_publication program state regional.selection.operation
              regional contract patch instanceId 0 1 programWF valid stepPrepared queryPrepared independent
          have sameTemplate : actualTemplate = template := Option.some.inj (beforeFound.symm.trans found)
          simpa only [PreparedInternalTransition.apply, applied, Option.getD_some,
            preparedTransitionPublicationTemplate?, sameTemplate] using afterFound
      | boundedScope _ _ | localControl _ | scopeCreation _ | regional _ | ordinaryEnd _ | mergeInput _ => exact found
      | arming arm =>
          have facts := preparedArming_owner_facts program state arm queryPrepared
          have hosting := runtimePositionValid_running_instance program instanceId arm.scopeFramePatch.runtimeInstanceId state
            (runtimeStateWellFormed_position program instanceId state beforeWF) facts.2.2
          have valid : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId state = true := by
            simpa only [hosting] using beforeWF
          obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program state _ regional stepPrepared
          have control := arming_regional_control_frame program state after _ regional arm valid facts.2.2
            stepPrepared applied independent
          have startFrame := preparedArming_regional_start_frame program state after _ regional arm
            arm.scopeFramePatch.write.elementId arm.scopeFramePatch.write.occurrence.activation
            valid stepPrepared queryPrepared independent applied
          have armTemplate (current : RuntimeState) :
              preparedTransitionPublicationTemplate? program current (.arming arm) =
                internalArmingPublicationTemplate? program current arm.operation arm.scopeFramePatch := by
            cases arm <;> rfl
          rw [← found, armTemplate, armTemplate]
          simp only [PreparedInternalTransition.apply, applied, Option.getD_some,
            internalArmingPublicationTemplate?, startFrame, control.2.1]

end BpmnSemantics.SemanticProcess.InternalCommutation
