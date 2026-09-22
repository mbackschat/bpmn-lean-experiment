import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceInstantaneousPublication

/-! Complete local-control preparation determines the actual record and accepted lifecycle
publication under the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem selectInternalLocalControl_owner (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (found : selectInternalLocalControl? state operation = some selected) :
    flowNodeSelectedOperationOwner? state operation = some selected.owner := by
  cases operation with
  | duplicate id origin input outputs =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      exact owned
  | synchronize id origin inputs output =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      exact owned
  | choose id origin input candidates defaultOutput defaultOrigin =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨branch, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      exact owned
  | selectMany id origin input candidates defaultBranch key =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · obtain ⟨branch, _, found⟩ := Option.bind_eq_some_iff.mp found
        split at found
        · contradiction
        · cases found; exact owned
  | synchronizeSelected id origin inputs output key =>
      simp only [selectInternalLocalControl?] at found
      split at found
      · next record records =>
          cases found
          change (match state.selectedBranchSets.filter (selectedBranchJoinReady state key) with
            | [record] => some record.owner | _ => none) = some record.owner
          rw [records]
      · contradiction
  | _ => simp [selectInternalLocalControl?] at found

theorem internalLocalControl_candidate_lifecycle (program : Program) (state after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (commandId : SemanticId) (transitionIndex : Nat)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state after operation commandId
      transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨selected, origin, instanceId, identity, delta, selection, originFound, _, _, _, _, _, _,
    identityFound, _, rfl⟩ := prepareInternalLocalControl_facts program state operation prepared found
  have owned := selectInternalLocalControl_owner state operation selected selection
  have singleton : instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity] =
      (makeInternalLocalControlPreparation state selected instanceId identity delta).publicationTemplate.lifecycle
        commandId transitionIndex := rfl
  unfold candidateFlowNodeOccurrenceDeltaForOperation?
  rw [owned]
  cases operation <;> simp only [internalLocalControlOrigin?] at originFound <;>
    (try contradiction)
  all_goals cases originFound; simp only [Option.bind_eq_bind, Option.bind_some, identityFound,
    singleton, pure, Pure.pure]

theorem prepareInternalLocalControl_record (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    internalTransitionRecord? program state operation = some
      { operationId := operation.id, operationKind := operation.kind,
        origin := operation.origin, owner := prepared.selection.owner } := by
  obtain ⟨selected, origin, instanceId, identity, delta, selection, _, _, _, _, _, _, _,
    identityFound, _, rfl⟩ := prepareInternalLocalControl_facts program state operation prepared found
  exact internalTransitionRecord_of_selection program state operation selected.owner
    (candidateOperationFlowNodeIdentity_exact_operation program operation selected.owner
      selected.owner origin.elementId identity identityFound)
    (selectInternalLocalControl_owner state operation selected selection)

theorem prepareInternalLocalControl_accepted_lifecycle (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    flowNodeOccurrenceDeltaForOperation? program state (prepared.selection.apply state) operation
      commandId transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  have frame := prepareInternalLocalControl_open_occurrences_frame program state operation prepared
    instanceId beforeWF running found
  have folded := applyFlowNodeOccurrenceDelta_instantaneous current prepared.publicationTemplate.identity
    commandId transitionIndex
    (projectOpenFlowNodeOccurrences_anchor_nodup program state current projected)
    (projectOpenFlowNodeOccurrences_transitionAnchor_false program state current projected)
    (projectOpenFlowNodeOccurrences_sorted program state current projected)
  have deltaEq : instantaneousFlowNodeOccurrenceDelta commandId transitionIndex
      [prepared.publicationTemplate.identity] = prepared.publicationTemplate.lifecycle commandId transitionIndex := rfl
  rw [deltaEq] at folded
  unfold flowNodeOccurrenceDeltaForOperation?
  rw [internalLocalControl_candidate_lifecycle program state _ operation prepared commandId transitionIndex found]
  simp only [Option.bind_some, acceptFlowNodeOccurrenceCandidate?, projected, frame,
    Option.bind_eq_bind, folded, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation
