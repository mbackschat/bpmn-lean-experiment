import BpmnSemantics.SemanticProcess.InternalEndPreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlLifecyclePublication
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDeltaProofs

/-! Ordinary End publishes an instantaneous occurrence and one consumed token. Acceptance is
derived from the unchanged open projection, independently of later batch numbering. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem selectInternalEnd_owner (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalEndSelection) (found : selectInternalEnd? state operation = some selected) :
    flowNodeSelectedOperationOwner? state operation = some selected.owner := by
  obtain ⟨_, id, origin, rfl, filtered⟩ := selectInternalEnd_facts state operation selected found
  simp [flowNodeSelectedOperationOwner?, onlyTokenOwner?, tokenOwners, filtered]

theorem selectInternalEnd_tokens_available (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalEndSelection) (found : selectInternalEnd? state operation = some selected) :
    internalLocalControlTokensAvailable state selected.tokens = true := by
  obtain ⟨_, _, _, _, filtered⟩ := selectInternalEnd_facts state operation selected found
  have owned := congrArg (List.filter (fun token : ControlToken => decide (token.owner = selected.owner))) filtered
  simp only [List.filter_filter, List.filter_cons, List.filter_nil, decide_true, ↓reduceIte] at owned
  have bucket : (state.tokens.filter (fun token =>
      decide (token.placeId = selected.input) && decide (token.owner = selected.owner))).length = 1 := by
    simpa only [Bool.and_comm, List.length_cons, List.length_nil] using congrArg List.length owned
  simp [internalLocalControlTokensAvailable, InternalEndSelection.tokens, bucket,
    SemanticProcessJson.isSafeWireNat, SemanticProcessJson.maxSafeWireNat]

theorem prepareInternalEnd_record (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (found : prepareInternalEnd? program state operation = some prepared) :
    internalTransitionRecord? program state operation = some
      { operationId := operation.id, operationKind := operation.kind,
        origin := operation.origin, owner := prepared.selection.owner } := by
  obtain ⟨_, selected, origin, _, _, _, selection, _, _, _, _, _, identityFound, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation prepared found
  exact internalTransitionRecord_of_selection program state operation selected.owner
    (candidateOperationFlowNodeIdentity_exact_operation program operation selected.owner selected.owner
      origin.elementId _ identityFound) (selectInternalEnd_owner state operation selected selection)

theorem prepareInternalEnd_candidate_lifecycle (program : Program) (state after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (commandId : SemanticId) (transitionIndex : Nat)
    (found : prepareInternalEnd? program state operation = some prepared) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state after operation commandId transitionIndex =
      some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨_, selected, origin, instanceId, identity, delta, selection, originFound, _, _, _, _,
    identityFound, _, rfl⟩ := prepareInternalEnd_facts program state operation prepared found
  have owned := selectInternalEnd_owner state operation selected selection
  unfold candidateFlowNodeOccurrenceDeltaForOperation?
  rw [owned]
  cases operation <;> simp only [internalEndOrigin?] at originFound <;> (try contradiction)
  cases originFound
  simp only [Option.bind_eq_bind, Option.bind_some, identityFound]
  rfl

theorem prepareInternalEnd_accepted_lifecycle (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepareInternalEnd? program state operation = some prepared) :
    flowNodeOccurrenceDeltaForOperation? program state (prepared.selection.apply state) operation
      commandId transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  have frame := prepared.selection.open_occurrences_frame program state instanceId running
  have folded := applyFlowNodeOccurrenceDelta_instantaneous current prepared.publicationTemplate.identity
    commandId transitionIndex
    (projectOpenFlowNodeOccurrences_anchor_nodup program state current projected)
    (projectOpenFlowNodeOccurrences_transitionAnchor_false program state current projected)
    (projectOpenFlowNodeOccurrences_sorted program state current projected)
  change applyFlowNodeOccurrenceDelta? current
    (prepared.publicationTemplate.lifecycle commandId transitionIndex) = some current at folded
  unfold flowNodeOccurrenceDeltaForOperation?
  rw [prepareInternalEnd_candidate_lifecycle program state _ operation prepared commandId transitionIndex found]
  simp only [Option.bind_some, acceptFlowNodeOccurrenceCandidate?, projected, frame,
    Option.bind_eq_bind, folded, ↓reduceIte]

theorem prepareInternalEnd_position (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd) (instanceId : SemanticId)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalEnd? program state operation = some prepared) :
    controlPositionDelta? program instanceId state (prepared.selection.apply state) =
      some prepared.publicationTemplate.positionDelta := by
  have beforePosition := runtimeStateWellFormed_position program instanceId state beforeWF
  have afterPosition := runtimeStateWellFormed_position program instanceId _
    (prepareInternalEnd_preserves_runtimeStateWellFormed program state operation prepared instanceId beforeWF found)
  obtain ⟨_, selected, _, _, _, delta, selection, _, _, _, _, _, _, deltaFound, rfl⟩ :=
    prepareInternalEnd_facts program state operation prepared found
  exact internalTokenPatch_position_delta program state (selected.apply state) selected.tokens delta instanceId
    beforePosition afterPosition rfl rfl deltaFound (selectInternalEnd_tokens_available state operation selected selection)

end BpmnSemantics.SemanticProcess.InternalCommutation
