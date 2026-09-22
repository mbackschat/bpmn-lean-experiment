import BpmnSemantics.SemanticProcess.ScopePositionInsertion
import BpmnSemantics.SemanticProcess.InternalLocalControlOriginFacts
import BpmnSemantics.SemanticProcess.ControlPositionDifferenceAlgebra
import BpmnSemantics.SemanticProcess.TokenPatchMultiplicity
import BpmnSemantics.SemanticProcess.InternalScopeCreationRuntimeValidity

/-! Actual control-position publication for prepared scope creation under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem patched_count (tokens : List ControlToken) (input entry : ControlPlaceId)
    (owner created : ScopeOccurrenceId) (target : ControlToken) :
    (addToken (removeToken tokens input owner) entry created).count target =
      tokens.count target - (if ({ placeId := input, owner } : ControlToken) == target then 1 else 0) +
        (if ({ placeId := entry, owner := created } : ControlToken) == target then 1 else 0) := by
  rw [(addToken_perm _ entry created).count_eq, List.count_cons, removeToken_eq_erase,
    List.count_erase]

private theorem patched_untouched (program : Program) (tokens : List ControlToken)
    (input entry : ControlPlaceId) (owner created : ScopeOccurrenceId)
    (target : PublicControlTokenPosition)
    (inputMiss : sameTokenPosition target
      { sequenceFlowId := tokenOrigin program { placeId := input, owner }, owner, multiplicity := 1 } = false)
    (entryMiss : sameTokenPosition target
      { sequenceFlowId := tokenOrigin program { placeId := entry, owner := created },
        owner := created, multiplicity := 1 } = false) :
    tokenMultiplicityAt (projectTokens program (addToken (removeToken tokens input owner) entry created)) target =
      tokenMultiplicityAt (projectTokens program tokens) target := by
  simp only [projectTokens_multiplicity, List.countP_eq_length_filter]
  rw [addToken_filter_length, entryMiss]
  simp only [Bool.false_eq_true, if_false, Nat.add_zero]
  congr 1
  exact filter_removeToken_of_rejected tokens input owner
    (fun token => sameTokenPosition target
      { sequenceFlowId := tokenOrigin program token, owner := token.owner, multiplicity := 1 }) inputMiss

private theorem selected_token_differences (program : Program) (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (consumed produced : BpmnSequenceFlowOrigin)
    (inputOrigin : internalLocalControlPlaceOrigin? program selected.input selected.owner = some consumed)
    (entryOrigin : internalLocalControlPlaceOrigin? program selected.entry selected.created.id = some produced)
    (different : selected.owner ≠ selected.created.id)
    (available : internalScopeCreationTokensAvailable state selected = true) :
    tokenDifference (projectTokens program state.tokens)
        (projectTokens program (addToken (removeToken state.tokens selected.input selected.owner)
          selected.entry selected.created.id)) =
      [{ sequenceFlowId := consumed.elementId, owner := selected.owner, multiplicity := 1 }] ∧
    tokenDifference (projectTokens program (addToken (removeToken state.tokens selected.input selected.owner)
          selected.entry selected.created.id)) (projectTokens program state.tokens) =
      [{ sequenceFlowId := produced.elementId, owner := selected.created.id, multiplicity := 1 }] := by
  let inputPosition : PublicControlTokenPosition :=
    { sequenceFlowId := consumed.elementId, owner := selected.owner, multiplicity := 1 }
  let entryPosition : PublicControlTokenPosition :=
    { sequenceFlowId := produced.elementId, owner := selected.created.id, multiplicity := 1 }
  let nextTokens := addToken (removeToken state.tokens selected.input selected.owner)
    selected.entry selected.created.id
  have inputPositive : 0 < state.tokens.count { placeId := selected.input, owner := selected.owner } := by
    rw [controlToken_count_eq_owned_filter]
    exact (internalScopeCreationTokensAvailable_facts state selected available).1
  have tokenDifferent : ({ placeId := selected.input, owner := selected.owner } : ControlToken) ≠
      { placeId := selected.entry, owner := selected.created.id } := by
    intro same
    exact different (congrArg ControlToken.owner same)
  have counts : ∀ target,
      tokenMultiplicityAt (tokenDifference (projectTokens program state.tokens)
        (projectTokens program nextTokens)) target = tokenMultiplicityAt [inputPosition] target ∧
      tokenMultiplicityAt (tokenDifference (projectTokens program nextTokens)
        (projectTokens program state.tokens)) target = tokenMultiplicityAt [entryPosition] target := by
    intro target
    rw [tokenMultiplicityAt_difference _ _ _ (projectTokens_strict program _),
      tokenMultiplicityAt_difference _ _ _ (projectTokens_strict program _)]
    by_cases inputMatch : sameTokenPosition target inputPosition = true
    · have key := (sameTokenPosition_iff_key_eq target inputPosition).mp inputMatch
      have atInput (positions : List PublicControlTokenPosition) :=
        tokenMultiplicityAt_key_congr positions target inputPosition key
      simp only [atInput]
      have afterCount := patched_count state.tokens selected.input selected.entry selected.owner
        selected.created.id { placeId := selected.input, owner := selected.owner }
      simp only [beq_self_eq_true, if_true, beq_eq_false_iff_ne.mpr (Ne.symm tokenDifferent),
        Bool.false_eq_true, if_false, Nat.add_zero] at afterCount
      have beforeCount := internalLocalControlPlaceOrigin?_projected_count program selected.input
        selected.owner consumed inputOrigin state.tokens selected.owner
      have projectedAfter := internalLocalControlPlaceOrigin?_projected_count program selected.input
        selected.owner consumed inputOrigin nextTokens selected.owner
      change tokenMultiplicityAt (projectTokens program state.tokens) inputPosition = _ at beforeCount
      change tokenMultiplicityAt (projectTokens program nextTokens) inputPosition = _ at projectedAfter
      rw [beforeCount, projectedAfter, afterCount]
      simp [tokenMultiplicityAt, sameTokenPosition, inputPosition, entryPosition, different]
      omega
    · have inputMiss : sameTokenPosition target inputPosition = false := Bool.eq_false_iff.mpr inputMatch
      by_cases entryMatch : sameTokenPosition target entryPosition = true
      · have key := (sameTokenPosition_iff_key_eq target entryPosition).mp entryMatch
        have atEntry (positions : List PublicControlTokenPosition) :=
          tokenMultiplicityAt_key_congr positions target entryPosition key
        simp only [atEntry]
        have afterCount := patched_count state.tokens selected.input selected.entry selected.owner
          selected.created.id { placeId := selected.entry, owner := selected.created.id }
        simp only [beq_self_eq_true, if_true, beq_eq_false_iff_ne.mpr tokenDifferent,
          Bool.false_eq_true, if_false, Nat.sub_zero] at afterCount
        have beforeCount := internalLocalControlPlaceOrigin?_projected_count program selected.entry
          selected.created.id produced entryOrigin state.tokens selected.created.id
        have projectedAfter := internalLocalControlPlaceOrigin?_projected_count program selected.entry
          selected.created.id produced entryOrigin nextTokens selected.created.id
        change tokenMultiplicityAt (projectTokens program state.tokens) entryPosition = _ at beforeCount
        change tokenMultiplicityAt (projectTokens program nextTokens) entryPosition = _ at projectedAfter
        rw [beforeCount, projectedAfter, afterCount]
        simp [tokenMultiplicityAt, sameTokenPosition, inputPosition, entryPosition, Ne.symm different]
      · have entryMiss : sameTokenPosition target entryPosition = false := Bool.eq_false_iff.mpr entryMatch
        have actual := patched_untouched program state.tokens selected.input selected.entry
          selected.owner selected.created.id target
          (by simpa only [internalLocalControlPlaceOrigin?_tokenOrigin program _ _ _ inputOrigin] using inputMiss)
          (by simpa only [internalLocalControlPlaceOrigin?_tokenOrigin program _ _ _ entryOrigin] using entryMiss)
        change tokenMultiplicityAt (projectTokens program nextTokens) target = _ at actual
        simp only [actual, Nat.sub_self]
        simp [tokenMultiplicityAt, inputMiss, entryMiss]
  constructor
  · exact tokenPositions_eq_of_multiplicities _ _
      (tokenPositionsStrict_difference _ _ (projectTokens_strict program _))
      (by simp [tokenPositionsStrict]) (tokenDifference_positive _ _)
      (by simp) (fun target => (counts target).1)
  · exact tokenPositions_eq_of_multiplicities _ _
      (tokenPositionsStrict_difference _ _ (projectTokens_strict program _))
      (by simp [tokenPositionsStrict]) (tokenDifference_positive _ _)
      (by simp) (fun target => (counts target).2)

/-- Ordinary and bounded child entry share their position delta even when the latter also
inserts private Activity and Timer records. Both callers derive position validity themselves. -/
theorem scopeCreationPositionDelta_of_components (program : Program) (instanceId : SemanticId)
    (state after : RuntimeState) (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (ownerRecord : RuntimeScopeOccurrence) (origin : BpmnElementOrigin) (definition : DefinitionScope)
    (delta : PublicControlPositionDelta)
    (beforePosition : runtimePositionValid program instanceId state = true)
    (afterPosition : runtimePositionValid program instanceId after = true)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (ownerExact : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = selected.owner)) = [ownerRecord])
    (checked : internalScopeCreationPredecessorChecks program state operation selected origin definition = true)
    (deltaFound : internalScopeCreationPositionDelta? program selected = some delta)
    (tokens : after.tokens = addToken (removeToken state.tokens selected.input selected.owner)
      selected.entry selected.created.id)
    (scopes : after.scopeOccurrences = insertScopeOccurrence selected.created state.scopeOccurrences) :
    controlPositionDelta? program instanceId state after = some delta := by
  have fresh := selectInternalScopeCreation_fresh state operation selected selection
  have ownerPresent : ownerRecord ∈ state.scopeOccurrences.filter
      (fun candidate => decide (candidate.id = selected.owner)) := by rw [ownerExact]; simp
  have ownerMember := (List.mem_filter.mp ownerPresent).1
  have ownerIdentity : ownerRecord.id = selected.owner := by
    simpa using (List.mem_filter.mp ownerPresent).2
  have different : selected.owner ≠ selected.created.id := by
    intro same
    exact fresh ownerRecord ownerMember (ownerIdentity.trans same)
  have available := (internalScopeCreationPredecessorChecks_facts program state operation
    selected origin definition checked).2.2.2.2.2.2.2.2
  obtain ⟨consumed, produced, createdDefinition, inputOrigin, entryOrigin, definitionFound,
    _, uniqueOrigin, rfl⟩ := internalScopeCreationPositionDelta_facts program selected delta deltaFound
  have uniqueBinding : uniqueDefinitionScope? program selected.created.id.definitionScopeId =
      some createdDefinition := by
    unfold definitionScope? at definitionFound
    split at definitionFound
    · cases definitionFound
      obtain ⟨originDefinition, singleton⟩ := List.length_eq_one_iff.mp uniqueOrigin
      simp_all only [uniqueDefinitionScope?]
    · contradiction
  have tokenDifferences := selected_token_differences program state selected consumed produced
    inputOrigin entryOrigin different available
  have scopeDifferences := projectScopes_insert_differences program state.scopeOccurrences
    selected.created createdDefinition uniqueBinding fresh
  simp only [controlPositionDelta?, projectControlPosition?, beforePosition, afterPosition,
    if_true, Option.bind_eq_bind, Option.bind_some, tokens, scopes,
    tokenDifferences.1, tokenDifferences.2, scopeDifferences.1, scopeDifferences.2]
  rfl

/-- Actual preparation determines the independently projected delta; successor validity follows
from the existing aggregate preservation law rather than a publication premise. -/
theorem internalScopeCreationPositionDelta_corresponds (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    controlPositionDelta? program instanceId state (prepared.selection.apply state) =
      some prepared.publicationTemplate.positionDelta := by
  have position (candidate : RuntimeState)
      (valid : runtimeStateWellFormed program instanceId candidate = true) :
      runtimePositionValid program instanceId candidate = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have beforePosition := position state beforeWF
  have afterPosition := position _
    (prepareInternalScopeCreation_preserves_runtimeStateWellFormed program instanceId state
      operation prepared programWF beforeWF found)
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta, selection, _, _, _,
    ownerExact, _, _, checked, _, deltaFound, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  apply scopeCreationPositionDelta_of_components program instanceId state _ operation selected
    ownerRecord origin definition delta beforePosition afterPosition selection ownerExact checked deltaFound
  all_goals cases kind : selected.kind <;>
    simp only [makeInternalScopeCreationPreparation, InternalScopeCreationSelection.apply, kind]

end BpmnSemantics.SemanticProcess.InternalCommutation
