import BpmnSemantics.SemanticProcess.InternalRegionalCancellationOpenProjection
import BpmnSemantics.SemanticProcess.InternalRegionalHostingCancellationProjection
import BpmnSemantics.SemanticProcess.InternalRegionalInstantaneousFold
import BpmnSemantics.SemanticProcess.InternalRegionalErrorPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalTerminationPositionPublication

/-! Cancellation acceptance connects the independently projected raw successor to the
prepared lifecycle fold. Exact predecessor anchors identify each removed occurrence;
instantaneous Error and Boundary events retain the existing candidate account. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regionalCancellation_removal_filter (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence) (retainRoot : Bool)
    (valid : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    removeEndedFlowNodeOccurrences current (regionalCancellationEnds program state region retainRoot current) =
      current.filter (fun entry => (retainRoot && decide (entry.anchor = .scope root)) ||
        !flowNodeOccurrenceOwnedBySubtree program state root entry (if retainRoot then .retain else .remove)) := by
  unfold removeEndedFlowNodeOccurrences regionalCancellationEnds
  apply List.filter_congr
  intro entry member
  simp only [List.map_map, List.contains_map, List.any_filter, Function.comp_apply]
  have names : (current.any fun value =>
      regionalCancelsOpenOccurrence program state region retainRoot value && (entry.anchor == value.anchor)) =
      current.any (fun value => decide (value.anchor = entry.anchor) &&
        regionalCancelsOpenOccurrence program state region retainRoot value) := by
    apply congrArg (fun test => current.any test)
    funext value
    apply Bool.eq_iff_iff.mpr
    simp only [Bool.and_eq_true, decide_eq_true_eq, beq_iff_eq]
    grind
  rw [names, keyed_any_unique current (·.anchor) entry _
    (projectOpenFlowNodeOccurrences_anchor_nodup program state current projected) member]
  rw [regionalCancellation_owner_corresponds program state hosting root region valid running derived entry
    (projectOpen_regional_ownership program state hosting current entry running projected member) retainRoot]
  apply Bool.eq_iff_iff.mpr
  simp [or_comm]

theorem preparedError_accepted_lifecycle (program : Program) (before : RuntimeState)
    (commandId : SemanticId) (transitionIndex : Nat)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler) (prepared : PreparedInternalRegional)
    (unique : attachedMessagesUnambiguous before = true)
    (found : prepareInternalRegional? program before (.throwError id origin input error handler) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceDeltaForOperation? program before after (.throwError id origin input error handler)
        commandId transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨snapshots, _, _, closedSelection, derived, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  have operation := regionalSelection_operation program before _ prepared.selection selection
  have rootMember := regionalSelection_root_member program before _ prepared.selection selection
  obtain ⟨hosting, positions, current, delta, identities, ends, hostRunning, positioned, opened, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have running : before.control = .running hosting := by
    unfold runningInstance? at hostRunning
    split at hostRunning
    · cases hostRunning; assumption
    · contradiction
  have valid : runtimePositionValid program hosting before = true := by
    unfold projectControlPosition? at positioned
    split at positioned
    · assumption
    · contradiction
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : throwErrorState? before input error handler = some after := by
    simp only [fire?, snapshots] at fired
    change throwErrorState? before input error handler = some after at fired
    exact fired
  obtain ⟨parent, kind, parentEq, afterEq⟩ := regionalSelection_error_execution program before after
    id origin input error handler prepared.selection selection result
  have cancellationClosed : regionalOwnershipClosed before
      (cancellationReferenceRetention before prepared.selection.root.id .remove) = true := by
    simpa only [regionalSelectionReferenceRetention, kind] using closed
  have projected := cancelScopeSubtree_child_open_projection program before hosting hosting prepared.selection.root .remove current
    valid running rootMember (by simp [parentEq]) unique cancellationClosed opened
  have afterProjection : projectOpenFlowNodeOccurrences? program after =
      projectOpenFlowNodeOccurrences? program (cancelScopeSubtree before prepared.selection.root.id .remove) := by
    rw [afterEq]
    simp only [projectOpenFlowNodeOccurrences?, show (interruptScope before prepared.selection.root.id parent handler.output).control =
      .running hosting from running,
      show (cancelScopeSubtree before prepared.selection.root.id .remove).control = .running hosting from running]
    rfl
  have retainedEnds : prepared.publicationTemplate.retainedEnds =
      regionalCancellationEnds program before prepared.region false current := by
    simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
    obtain ⟨errorIdentity, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
    obtain ⟨boundaryIdentity, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
    cases lifecycle
    rw [template]
  obtain ⟨foldCurrent, foldOpened, folded⟩ := preparedRegional_lifecycle_fold program before
    (.throwError id origin input error handler) prepared commandId transitionIndex found
  have same : foldCurrent = current := Option.some.inj (foldOpened.symm.trans opened)
  subst foldCurrent
  rw [retainedEnds, regionalCancellation_removal_filter program before hosting prepared.selection.root.id
    prepared.region current false valid running derived opened] at folded
  simp only [reduceCtorEq, decide_false, Bool.false_and, Bool.false_or] at projected
  simp only [Bool.false_and, Bool.false_or] at folded
  refine ⟨after, applied, ?_⟩
  unfold flowNodeOccurrenceDeltaForOperation?
  rw [preparedRegional_lifecycle_candidate program before after _ prepared commandId transitionIndex found]
  simp only [Option.bind_some, acceptFlowNodeOccurrenceCandidate?, opened, afterProjection, projected,
    Option.bind_eq_bind, folded, Bool.false_eq_true, ↓reduceIte]

theorem selectedTerminateOwner_hosting (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (definition : DefinitionScopeId) (owner : ScopeOccurrenceId)
    (running : before.control = .running hosting)
    (selected : selectedTerminateOwner? program before id origin input definition = some owner) :
    owner.processInstanceId = hosting := by
  unfold selectedTerminateOwner? at selected
  repeat' first | (solve | simp_all) | split at selected
  all_goals cases selected; simp_all

theorem preparedTerminate_accepted_lifecycle (program : Program) (before : RuntimeState)
    (commandId : SemanticId) (transitionIndex : Nat)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (definition : DefinitionScopeId)
    (prepared : PreparedInternalRegional)
    (unique : attachedMessagesUnambiguous before = true)
    (owners : waitOwnersLive before = true)
    (found : prepareInternalRegional? program before (.terminateScope id origin input definition) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceDeltaForOperation? program before after (.terminateScope id origin input definition)
        commandId transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨snapshots, _, _, closedSelection, derived, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  obtain ⟨selected, kind⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selection
  have operation := regionalSelection_operation program before _ prepared.selection selection
  have rootMember := regionalSelection_root_member program before _ prepared.selection selection
  obtain ⟨hosting, positions, current, delta, identities, ends, hostRunning, positioned, opened, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have running : before.control = .running hosting := by
    unfold runningInstance? at hostRunning
    split at hostRunning
    · cases hostRunning; assumption
    · contradiction
  have valid : runtimePositionValid program hosting before = true := by
    unfold projectControlPosition? at positioned
    split at positioned
    · assumption
    · contradiction
  have cancellationClosed : regionalOwnershipClosed before
      (cancellationReferenceRetention before prepared.selection.root.id .retain) = true := by
    simpa only [regionalSelectionReferenceRetention, kind] using closed
  have projected : projectOpenFlowNodeOccurrences? program
      (cancelScopeSubtree before prepared.selection.root.id .retain) =
      some (current.filter fun entry => decide (entry.anchor = .scope prepared.selection.root.id) ||
        !flowNodeOccurrenceOwnedBySubtree program before prepared.selection.root.id entry .retain) := by
    cases parent : prepared.selection.root.parent with
    | some parentOwner =>
        simpa only [decide_true, Bool.true_and] using cancelScopeSubtree_child_open_projection program before hosting hosting
          prepared.selection.root .retain current valid running rootMember (by simp [parent]) unique cancellationClosed opened
    | none =>
        have rootHosting := selectedTerminateOwner_hosting program before hosting id origin input definition
          prepared.selection.root.id running selected
        rw [hosting_cancellation_public_filter_empty program before hosting prepared.selection.root current
          valid running rootMember parent rootHosting opened]
        exact cancelScopeSubtree_hosting_open_projection program before hosting prepared.selection.root current
          valid running rootMember parent rootHosting owners unique cancellationClosed opened
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : terminateScopeState? program before id origin input definition = some after := by
    simp only [fire?, snapshots] at fired
    change terminateScopeState? program before id origin input definition = some after at fired
    exact fired
  have afterProjection : projectOpenFlowNodeOccurrences? program after =
      projectOpenFlowNodeOccurrences? program (cancelScopeSubtree before prepared.selection.root.id .retain) := by
    unfold terminateScopeState? at result
    rw [selected] at result
    cases result
    rfl
  have retainedEnds : prepared.publicationTemplate.retainedEnds =
      regionalCancellationEnds program before prepared.region true current := by
    simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
    obtain ⟨endingIdentity, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
    cases lifecycle
    rw [template]
  obtain ⟨foldCurrent, foldOpened, folded⟩ := preparedRegional_lifecycle_fold program before
    (.terminateScope id origin input definition) prepared commandId transitionIndex found
  have same : foldCurrent = current := Option.some.inj (foldOpened.symm.trans opened)
  subst foldCurrent
  rw [retainedEnds, regionalCancellation_removal_filter program before hosting prepared.selection.root.id
    prepared.region current true valid running derived opened] at folded
  simp only [Bool.true_and] at folded
  refine ⟨after, applied, ?_⟩
  unfold flowNodeOccurrenceDeltaForOperation?
  rw [preparedRegional_lifecycle_candidate program before after _ prepared commandId transitionIndex found]
  simp only [Option.bind_some, acceptFlowNodeOccurrenceCandidate?, opened, afterProjection, projected,
    Option.bind_eq_bind, folded, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation
