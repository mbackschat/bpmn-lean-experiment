import BpmnSemantics.SemanticProcess.InternalTransitionPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationAcceptance
import BpmnSemantics.SemanticProcess.InternalRegionalArmingAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalEndPublication
import BpmnSemantics.SemanticProcess.InternalMergePublication
import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalPairPublication

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
      | localControl _ | scopeCreation _ | regional _ | ordinaryEnd _ | mergeInput _ => exact found
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
