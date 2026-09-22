import BpmnSemantics.SemanticProcess.InternalLocalControlOriginFacts
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.ControlPositionDifferenceAlgebra
import BpmnSemantics.SemanticProcess.TokenPatchMultiplicity
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionTemplateFacts
import BpmnSemantics.SemanticProcess.InternalCommutationPublication

/-! The publication bridge compares the retained token-unit template with independently projected
before/after counts under the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

theorem internalLocalControlTokensAvailable_consumption (state : RuntimeState) (patch : TokenPatch)
    (available : internalLocalControlTokensAvailable state patch = true)
    (place : ControlPlaceId) (member : place ∈ patch.consumed ++ patch.produced) :
    patch.consumed.count place ≤ state.tokens.count { placeId := place, owner := patch.owner } := by
  simp only [internalLocalControlTokensAvailable, List.all_eq_true] at available
  have checked := available place member
  simp only [Bool.and_eq_true, decide_eq_true_eq] at checked
  rw [controlToken_count_eq_owned_filter]
  simpa using checked.1.1

theorem internalLocalControl_projected_residuals (program : Program) (state : RuntimeState)
    (patch : TokenPatch) (place : ControlPlaceId) (origin : BpmnSequenceFlowOrigin)
    (available : internalLocalControlTokensAvailable state patch = true)
    (member : place ∈ patch.consumed ++ patch.produced)
    (found : internalLocalControlPlaceOrigin? program place patch.owner = some origin) :
    let target : PublicControlTokenPosition :=
      { sequenceFlowId := origin.elementId, owner := patch.owner, multiplicity := 1 }
    tokenMultiplicityAt (projectTokens program state.tokens) target -
        tokenMultiplicityAt (projectTokens program (patch.apply state.tokens)) target =
          patch.consumed.count place - patch.produced.count place ∧
      tokenMultiplicityAt (projectTokens program (patch.apply state.tokens)) target -
        tokenMultiplicityAt (projectTokens program state.tokens) target =
          patch.produced.count place - patch.consumed.count place := by
  dsimp only
  rw [internalLocalControlPlaceOrigin?_projected_count program place patch.owner origin found,
    internalLocalControlPlaceOrigin?_projected_count program place patch.owner origin found]
  exact patch.owned_multiplicity_delta state.tokens place
    (internalLocalControlTokensAvailable_consumption state patch available place member)

theorem projectTokens_tokenPatch_untouched (program : Program) (tokens : List ControlToken)
    (patch : TokenPatch) (target : PublicControlTokenPosition)
    (untouched : ∀ place ∈ patch.consumed ++ patch.produced,
      ¬(tokenOrigin program { placeId := place, owner := patch.owner } = target.sequenceFlowId ∧
        patch.owner = target.owner)) :
    tokenMultiplicityAt (projectTokens program (patch.apply tokens)) target =
      tokenMultiplicityAt (projectTokens program tokens) target := by
  rw [projectTokens_multiplicity, projectTokens_multiplicity,
    List.countP_eq_length_filter, List.countP_eq_length_filter]
  congr 1
  apply patch.filter_untouched
  all_goals
    intro place member
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [sameTokenPosition, decide_eq_true_eq, Bool.and_eq_true] at matched
  · exact untouched place (List.mem_append_left _ member) ⟨matched.1.symm, matched.2.symm⟩
  · exact untouched place (List.mem_append_right _ member) ⟨matched.1.symm, matched.2.symm⟩

theorem internalLocalControlPositionDelta?_token_differences (program : Program)
    (state : RuntimeState) (patch : TokenPatch) (delta : PublicControlPositionDelta)
    (found : internalLocalControlPositionDelta? program patch = some delta)
    (available : internalLocalControlTokensAvailable state patch = true) :
    tokenDifference (projectTokens program state.tokens)
        (projectTokens program (patch.apply state.tokens)) = delta.consumedTokens ∧
      tokenDifference (projectTokens program (patch.apply state.tokens))
        (projectTokens program state.tokens) = delta.producedTokens := by
  have counts : ∀ target,
      tokenMultiplicityAt (tokenDifference (projectTokens program state.tokens)
        (projectTokens program (patch.apply state.tokens))) target =
          tokenMultiplicityAt delta.consumedTokens target ∧
      tokenMultiplicityAt (tokenDifference (projectTokens program (patch.apply state.tokens))
        (projectTokens program state.tokens)) target =
          tokenMultiplicityAt delta.producedTokens target := by
    intro target
    rw [tokenMultiplicityAt_difference _ _ _ (projectTokens_strict program _),
      tokenMultiplicityAt_difference _ _ _ (projectTokens_strict program _)]
    by_cases touched : ∃ place ∈ patch.consumed ++ patch.produced,
        tokenOrigin program { placeId := place, owner := patch.owner } = target.sequenceFlowId ∧
          patch.owner = target.owner
    · obtain ⟨place, member, flow, owner⟩ := touched
      obtain ⟨origin, originFound⟩ := internalLocalControlPositionDelta?_place_origin program patch delta found place member
      let canonical : PublicControlTokenPosition :=
        { sequenceFlowId := origin.elementId, owner := patch.owner, multiplicity := 1 }
      have key : tokenPositionKey target = tokenPositionKey canonical :=
        Prod.ext (flow.symm.trans (internalLocalControlPlaceOrigin?_tokenOrigin program place patch.owner origin originFound))
          owner.symm
      have atKey (positions : List PublicControlTokenPosition) :=
        tokenMultiplicityAt_key_congr positions target canonical key
      simp only [atKey]
      have actual := internalLocalControl_projected_residuals program state patch place origin available member originFound
      have retained := internalLocalControlPositionDelta?_multiplicity program patch delta found place member origin originFound
      exact ⟨actual.1.trans retained.1.symm, actual.2.trans retained.2.symm⟩
    · have outside : ∀ place ∈ patch.consumed ++ patch.produced,
          ¬(tokenOrigin program { placeId := place, owner := patch.owner } = target.sequenceFlowId ∧
            patch.owner = target.owner) := by
        intro place member same
        exact touched ⟨place, member, same⟩
      have actual := projectTokens_tokenPatch_untouched program state.tokens patch target outside
      have retained := internalLocalControlPositionDelta?_outside program patch delta found target outside
      simp [actual, retained.1, retained.2]
  obtain ⟨consumedStrict, producedStrict, consumedPositive, producedPositive, _, _⟩ :=
    internalLocalControlPositionDelta?_strict program patch delta found
  constructor
  · exact tokenPositions_eq_of_multiplicities _ _
      (tokenPositionsStrict_difference _ _ (projectTokens_strict program _)) consumedStrict
      (tokenDifference_positive _ _) consumedPositive (fun target => (counts target).1)
  · exact tokenPositions_eq_of_multiplicities _ _
      (tokenPositionsStrict_difference _ _ (projectTokens_strict program _)) producedStrict
      (tokenDifference_positive _ _) producedPositive (fun target => (counts target).2)

private theorem localControl_scope_difference_self (positions : List PublicScopePosition) :
    scopeDifference positions positions = [] := by
  unfold scopeDifference
  apply List.filter_eq_nil_iff.mpr
  intro position member
  have present : (positions.any fun candidate => candidate == position) = true :=
    List.any_eq_true.mpr ⟨position, member, by simp⟩
  simp [present]

/-- Local-control, End, and Merge use the same token projection algebra once their family laws
have established position validity; no family-specific state invariant is assumed here. -/
theorem internalTokenPatch_position_delta (program : Program) (before after : RuntimeState)
    (patch : TokenPatch) (delta : PublicControlPositionDelta) (instanceId : SemanticId)
    (beforePosition : runtimePositionValid program instanceId before = true)
    (afterPosition : runtimePositionValid program instanceId after = true)
    (tokens : after.tokens = patch.apply before.tokens)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (found : internalLocalControlPositionDelta? program patch = some delta)
    (available : internalLocalControlTokensAvailable before patch = true) :
    controlPositionDelta? program instanceId before after = some delta := by
  have differences := internalLocalControlPositionDelta?_token_differences program before patch delta found available
  obtain ⟨_, _, _, _, entered, exited⟩ := internalLocalControlPositionDelta?_strict program patch delta found
  simp only [controlPositionDelta?, projectControlPosition?, beforePosition, afterPosition,
    if_true, Option.bind_eq_bind, Option.bind_some, tokens, scopes, differences.1, differences.2,
    localControl_scope_difference_self]
  cases delta
  simp_all

/-- Complete predecessor preparation determines the actual public position delta. Runtime validity
of the patched successor and equality of its independently projected delta are derived here. -/
theorem internalLocalControlPositionDelta?_corresponds (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl) (instanceId : SemanticId)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    controlPositionDelta? program instanceId state (prepared.selection.apply state) =
      some prepared.publicationTemplate.positionDelta := by
  have beforePosition := runtimeStateWellFormed_position program instanceId state beforeWF
  have afterPosition := runtimeStateWellFormed_position program instanceId _
    (prepareInternalLocalControl_preserves_runtimeStateWellFormed program state operation prepared instanceId
      programWF beforeWF running found)
  obtain ⟨selected, origin, selectedInstance, identity, delta, _, _, _, _, _, _, available,
    _, _, deltaFound, rfl⟩ := prepareInternalLocalControl_facts program state operation prepared found
  exact internalTokenPatch_position_delta program state (selected.apply state) selected.tokens delta instanceId
    beforePosition afterPosition rfl rfl deltaFound available

end BpmnSemantics.SemanticProcess.InternalCommutation
