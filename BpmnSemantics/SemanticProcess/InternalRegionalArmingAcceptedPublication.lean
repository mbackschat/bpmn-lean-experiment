import BpmnSemantics.SemanticProcess.InternalRegionalArmingPublicationFrame
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPairPublication

/-! The arming publication keeps its predecessor-selected start and time across an independent
regional execution. Only the surviving arming owner needs a Process lookup frame.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedArming_regional_start_frame (program : Program) (before after : RuntimeState)
    (regionalOperation : SemanticOperation) (regional : PreparedInternalRegional)
    (arm : PreparedInternalArming) (element : NodeId) (activation : Nat)
    (beforeWF : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (armFound : arm.Prepared program before)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    waitStart? program after arm.scopeFramePatch.owner element activation =
      waitStart? program before arm.scopeFramePatch.owner element activation := by
  have facts := preparedArming_owner_facts program before arm armFound
  have position : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at beforeWF
    exact beforeWF.1
  obtain ⟨snapshots, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program before regionalOperation regional regionalFound
  have selected := (ownershipClosedSelection_facts program before regionalOperation regional.selection closed).1
  have rootMember := regionalSelection_root_member program before regionalOperation regional.selection selected
  have operationEq := regionalSelection_operation program before regionalOperation regional.selection selected
  have outside := arming_regional_scope_outside before regional.selection regional.region
    regional.footprint arm footprint independent
  have cancelled := preparedArming_cancelled_outside program before arm regional.selection.root.id
    regional.region position armFound derived outside
  have different : arm.scopeFramePatch.owner ≠ regional.selection.root.id := by
    intro same
    have inside : regional.region.contains regional.selection.root.id = true :=
      List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec before _ _ derived).2.1
    rw [same, inside] at outside
    contradiction
  obtain ⟨actual, fired, actualApplied⟩ :=
    prepareInternalRegional_executes program before regionalOperation regional regionalFound
  have actualEq : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  cases regionalOperation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApply, kind, _, _, _, _, update, _⟩ :=
        preparedReturn_quiescent_fields program before arm.scopeFramePatch.runtimeInstanceId id origin
          process definition output regional beforeWF regionalFound
      have same : returned = after := Option.some.inj (returnedApply.symm.trans applied)
      rw [same] at update
      obtain ⟨chosen, chosenKind, _, census⟩ := regionalSelection_return_record program before
        id origin process definition output regional.selection selected
      have recordEq : chosen = record := by simpa using chosenKind.symm.trans kind
      subst chosen
      have member : record ∈ before.calledProcessOccurrences :=
        (List.mem_filter.mp (show record ∈ before.calledProcessOccurrences.filter _ by rw [census]; simp)).1
      have retained := preparedArming_return_outside program before _ regional.selection regional.region arm
        position selected armFound derived outside record kind
      have calls := runtimePositionValid_called_associations program arm.scopeFramePatch.runtimeInstanceId
        arm.scopeFramePatch.runtimeInstanceId before position facts.2.2
      have frame := removeCalledProcessTree_wait_start_frame program before record arm.scopeFramePatch.owner
        element activation calls member (by simpa using retained)
      rw [update]
      exact frame
  | completeScope id origin definition output =>
      cases output with
      | some output =>
          obtain ⟨completed, completedApply, _, control, calls, scopes⟩ :=
            preparedChildComplete_projection_lookup_fields program before id origin definition output regional regionalFound
          have same : completed = after := Option.some.inj (completedApply.symm.trans applied)
          subst completed
          exact regional_child_wait_start_frame program before after regional.selection.root.id
            arm.scopeFramePatch.owner element activation scopes control calls different
      | none =>
          obtain ⟨withdrawal, kind, _⟩ := regionalSelection_complete_census program before id origin definition none
            regional.selection selected
          obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before
            arm.scopeFramePatch.runtimeInstanceId regional.selection regional.region regional.footprint facts.2.2 footprint
          have untouched := arming_regional_control_not_written regional.footprint arm independent
          cases parent : regional.selection.root.parent with
          | none =>
              simp only [regionalBaseFootprint?, operationEq, kind, parent] at baseFound
              cases baseFound
              exact False.elim (untouched (baseWrites _ (by simp)))
          | some owner => simp [regionalBaseFootprint?, operationEq, kind, parent] at baseFound
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨parent, _, parentEq, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler regional.selection selected raw
      have frame := cancelScopeSubtree_child_wait_start_frame program before
        arm.scopeFramePatch.runtimeInstanceId arm.scopeFramePatch.runtimeInstanceId regional.selection.root
        .remove arm.scopeFramePatch.owner element activation position facts.2.2 rootMember
        (by simp [parentEq]) cancelled
      rw [update]
      exact frame
  | terminateScope id origin input definition =>
      have chosen := (regionalSelection_terminate_owner program before id origin input definition regional.selection selected).1
      have child : regional.selection.root.parent ≠ none := by
        intro parentless
        have hosting := selectedTerminateOwner_hosting program before arm.scopeFramePatch.runtimeInstanceId
          id origin input definition regional.selection.root.id facts.2.2 chosen
        obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true facts.2.1)
        have member : scope ∈ before.scopeOccurrences.filter
            (fun scope => decide (scope.id = arm.scopeFramePatch.owner)) := by rw [census]; simp
        obtain ⟨member, same⟩ := List.mem_filter.mp member
        have inside := hosting_cancellation_covers_live_scope program before
          arm.scopeFramePatch.runtimeInstanceId arm.scopeFramePatch.runtimeInstanceId position facts.2.2
          regional.selection.root rootMember parentless hosting scope member
        have same := of_decide_eq_true same
        rw [same, cancelled] at inside
        contradiction
      have frame := cancelScopeSubtree_child_wait_start_frame program before
        arm.scopeFramePatch.runtimeInstanceId arm.scopeFramePatch.runtimeInstanceId regional.selection.root
        .retain arm.scopeFramePatch.owner element activation position facts.2.2 rootMember child cancelled
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      exact frame
  | _ => simp [selectInternalRegional?] at selected

theorem preparedArming_regional_publication_frame (program : Program) (commandId : SemanticId)
    (before after : RuntimeState) (regionalOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (armFound : arm.Prepared program before)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    ∃ publication,
      publication.pair.footprint = arm.footprint ∧
      preparedArmingPublication? program arm.scopeFramePatch.runtimeInstanceId commandId before arm = some publication ∧
      preparedArmingPublication? program arm.scopeFramePatch.runtimeInstanceId commandId after arm = some publication := by
  obtain ⟨publishedAfter, publishedApplied, published⟩ := prepareInternalRegional_execution_publication program before
    regionalOperation regional arm.scopeFramePatch.runtimeInstanceId commandId 0 programWF beforeWF regionalFound
  have same : publishedAfter = after := Option.some.inj (publishedApplied.symm.trans applied)
  subst publishedAfter
  obtain ⟨_, _, openedBefore, openedAfter, _⟩ :=
    accepted_operation_delta_equals_independent_open_projection program before after regionalOperation
      commandId 0 _ published.lifecycle
  have afterFound := prepareInternalArming_after_independent_regional program before after regionalOperation
    regional arm beforeWF regionalFound armFound independent applied
  have facts := preparedArming_owner_facts program before arm armFound
  have control := arming_regional_control_frame program before after regionalOperation regional arm
    beforeWF facts.2.2 regionalFound applied independent
  have startFrame := preparedArming_regional_start_frame program before after regionalOperation regional arm
    arm.scopeFramePatch.write.elementId arm.scopeFramePatch.write.occurrence.activation
    beforeWF regionalFound armFound independent applied
  cases arm with
  | ordinary operation patch =>
      exact prepared_ordinary_publication_frame program patch.runtimeInstanceId commandId before after operation patch
        programWF beforeWF published.wellFormed (by simp [openedBefore]) (by simp [openedAfter])
        armFound afterFound control.2.1 startFrame
  | data contract patch =>
      exact prepared_data_publication_frame program patch.arm.runtimeInstanceId commandId before after contract patch
        programWF beforeWF published.wellFormed (by simp [openedBefore]) (by simp [openedAfter])
        armFound afterFound control.2.1 startFrame

end BpmnSemantics.SemanticProcess.InternalCommutation
