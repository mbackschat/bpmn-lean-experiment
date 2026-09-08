import BpmnSemantics.SemanticProcess.InternalLocalControlPositionTemplateOrder

/-! Static signed-unit templates have canonical positive rows and exact complete-key lookup,
as required by the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem internalLocalControlTokenResidual_facts (owner : ScopeOccurrenceId) (flow : SequenceFlowId)
    (consumed produced : List ControlPlaceId) (place : ControlPlaceId)
    (position : PublicControlTokenPosition)
    (found : internalLocalControlTokenResidual owner flow consumed produced place = some position) :
    position.sequenceFlowId = flow ∧ position.owner = owner ∧
      position.multiplicity = consumed.count place - produced.count place ∧
      0 < position.multiplicity := by
  unfold internalLocalControlTokenResidual at found
  dsimp only at found
  split at found
  · contradiction
  · cases found
    exact ⟨rfl, rfl, rfl, by dsimp only; omega⟩

private theorem strict_iff_pairwise (positions : List PublicControlTokenPosition) :
    tokenPositionsStrict positions ↔ positions.Pairwise (fun left right => tokenPositionBefore left right = true) := by
  induction positions with
  | nil => simp [tokenPositionsStrict]
  | cons head tail ih => simp [tokenPositionsStrict, List.pairwise_cons, ih]

theorem localControl_residuals_strict (owner : ScopeOccurrenceId)
    (consumed produced : List ControlPlaceId) (origins : List (ControlPlaceId × BpmnSequenceFlowOrigin))
    (ordered : origins.Pairwise (fun left right => left.2.elementId.value < right.2.elementId.value)) :
    tokenPositionsStrict (origins.filterMap fun pair =>
      internalLocalControlTokenResidual owner pair.2.elementId consumed produced pair.1) := by
  apply (strict_iff_pairwise _).mpr
  apply ordered.filterMap
  intro left right before leftPosition leftFound rightPosition rightFound
  obtain ⟨leftFlow, _, _, _⟩ := internalLocalControlTokenResidual_facts _ _ _ _ _ _ leftFound
  obtain ⟨rightFlow, _, _, _⟩ := internalLocalControlTokenResidual_facts _ _ _ _ _ _ rightFound
  simp only [tokenPositionBefore, leftFlow, rightFlow]
  simp [String.ne_of_lt before, before]

theorem internalLocalControlPositionDelta?_ordered (program : Program) (patch : TokenPatch)
    (delta : PublicControlPositionDelta)
    (found : internalLocalControlPositionDelta? program patch = some delta) :
    ∃ origins : List (ControlPlaceId × BpmnSequenceFlowOrigin),
      origins.Pairwise (fun left right => left.2.elementId.value < right.2.elementId.value) ∧
      (∀ pair ∈ origins, internalLocalControlPlaceOrigin? program pair.1 patch.owner = some pair.2) ∧
      (∀ place, place ∈ patch.consumed ++ patch.produced ↔ ∃ origin, (place, origin) ∈ origins) ∧
      delta =
        { consumedTokens := origins.filterMap (fun pair =>
            internalLocalControlTokenResidual patch.owner pair.2.elementId patch.consumed patch.produced pair.1)
          producedTokens := origins.filterMap (fun pair =>
            internalLocalControlTokenResidual patch.owner pair.2.elementId patch.produced patch.consumed pair.1)
          enteredScopes := [], exitedScopes := [] } := by
  unfold internalLocalControlPositionDelta? at found
  obtain ⟨raw, mapped, result⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨places, resolved⟩ := localControl_resolved_origins program patch.owner _ raw mapped
  have unique : (raw.map Prod.fst).Nodup := by
    rw [places]
    exact localControl_eraseDups_nodup _
  refine ⟨sortBy _ raw, localControl_sort_flow_strict _ _
    (localControl_resolved_flow_nodup program patch.owner raw unique resolved), ?_, ?_, ?_⟩
  · intro pair member
    exact resolved pair ((mem_sortBy _ _ _).mp member)
  · intro place
    rw [← List.mem_eraseDups, ← places, List.mem_map]
    constructor
    · rintro ⟨⟨other, origin⟩, member, same⟩
      simp only at same
      subst other
      exact ⟨origin, (mem_sortBy _ _ _).mpr member⟩
    · rintro ⟨origin, member⟩
      exact ⟨(place, origin), (mem_sortBy _ _ _).mp member, rfl⟩
  · exact (Option.some.inj result).symm

theorem internalLocalControlPositionDelta?_strict (program : Program) (patch : TokenPatch)
    (delta : PublicControlPositionDelta)
    (found : internalLocalControlPositionDelta? program patch = some delta) :
    tokenPositionsStrict delta.consumedTokens ∧ tokenPositionsStrict delta.producedTokens ∧
      (∀ position ∈ delta.consumedTokens, 0 < position.multiplicity) ∧
      (∀ position ∈ delta.producedTokens, 0 < position.multiplicity) ∧
      delta.enteredScopes = [] ∧ delta.exitedScopes = [] := by
  obtain ⟨origins, ordered, _, _, rfl⟩ := internalLocalControlPositionDelta?_ordered program patch delta found
  refine ⟨localControl_residuals_strict _ _ _ _ ordered,
    localControl_residuals_strict _ _ _ _ ordered, ?_, ?_, rfl, rfl⟩
  all_goals
    intro position member
    obtain ⟨pair, _, residual⟩ := List.mem_filterMap.mp member
    exact (internalLocalControlTokenResidual_facts _ _ _ _ _ _ residual).2.2.2

theorem localControl_tokenMultiplicityAt_zero (positions : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition)
    (absent : ∀ position ∈ positions, ¬ (position.sequenceFlowId = target.sequenceFlowId ∧
      position.owner = target.owner)) : tokenMultiplicityAt positions target = 0 := by
  induction positions with
  | nil => rfl
  | cons head tail ih =>
      have different : sameTokenPosition target head = false := by
        apply Bool.eq_false_iff.mpr
        intro same
        have fields : target.sequenceFlowId = head.sequenceFlowId ∧ target.owner = head.owner := by
          simpa [sameTokenPosition] using same
        exact absent head (by simp) ⟨fields.1.symm, fields.2.symm⟩
      simpa [tokenMultiplicityAt, different] using ih (fun position member => absent position (by simp [member]))

theorem localControl_residuals_multiplicity (program : Program) (owner : ScopeOccurrenceId)
    (consumed produced : List ControlPlaceId) (origins : List (ControlPlaceId × BpmnSequenceFlowOrigin))
    (ordered : origins.Pairwise (fun left right => left.2.elementId.value < right.2.elementId.value))
    (resolved : ∀ pair ∈ origins, internalLocalControlPlaceOrigin? program pair.1 owner = some pair.2)
    (place : ControlPlaceId) (origin : BpmnSequenceFlowOrigin)
    (member : (place, origin) ∈ origins) :
    tokenMultiplicityAt (origins.filterMap fun pair =>
      internalLocalControlTokenResidual owner pair.2.elementId consumed produced pair.1)
      { sequenceFlowId := origin.elementId, owner, multiplicity := 1 } =
      consumed.count place - produced.count place := by
  by_cases zero : consumed.count place - produced.count place = 0
  · rw [zero]
    apply localControl_tokenMultiplicityAt_zero
    intro position memberPosition same
    obtain ⟨pair, pairMember, residual⟩ := List.mem_filterMap.mp memberPosition
    obtain ⟨flow, _, count, positive⟩ := internalLocalControlTokenResidual_facts _ _ _ _ _ _ residual
    have placeEq := internalLocalControlPlaceOrigin?_injective program pair.1 place owner pair.2 origin
      (resolved pair pairMember) (resolved (place, origin) member) (flow.symm.trans same.1)
    rw [placeEq, zero] at count
    omega
  · let position : PublicControlTokenPosition :=
      { sequenceFlowId := origin.elementId, owner, multiplicity := consumed.count place - produced.count place }
    have present : position ∈ origins.filterMap (fun pair =>
        internalLocalControlTokenResidual owner pair.2.elementId consumed produced pair.1) := by
      apply List.mem_filterMap.mpr
      exact ⟨(place, origin), member, by simp [internalLocalControlTokenResidual, zero, position]⟩
    exact (tokenMultiplicityAt_key_congr _
      { sequenceFlowId := origin.elementId, owner, multiplicity := 1 } position rfl).trans
      (tokenMultiplicityAt_of_mem _ position (localControl_residuals_strict _ _ _ _ ordered) present)

theorem internalLocalControlPositionDelta?_multiplicity (program : Program) (patch : TokenPatch)
    (delta : PublicControlPositionDelta)
    (found : internalLocalControlPositionDelta? program patch = some delta)
    (place : ControlPlaceId) (member : place ∈ patch.consumed ++ patch.produced)
    (origin : BpmnSequenceFlowOrigin)
    (originFound : internalLocalControlPlaceOrigin? program place patch.owner = some origin) :
    tokenMultiplicityAt delta.consumedTokens { sequenceFlowId := origin.elementId, owner := patch.owner, multiplicity := 1 } =
      patch.consumed.count place - patch.produced.count place ∧
    tokenMultiplicityAt delta.producedTokens { sequenceFlowId := origin.elementId, owner := patch.owner, multiplicity := 1 } =
      patch.produced.count place - patch.consumed.count place := by
  obtain ⟨origins, ordered, resolved, members, rfl⟩ := internalLocalControlPositionDelta?_ordered program patch delta found
  obtain ⟨candidate, candidateMember⟩ := (members place).mp member
  have same := (resolved (place, candidate) candidateMember).symm.trans originFound
  cases same
  exact ⟨localControl_residuals_multiplicity program _ _ _ _ ordered resolved place candidate candidateMember,
    localControl_residuals_multiplicity program _ _ _ _ ordered resolved place candidate candidateMember⟩

theorem internalLocalControlPositionDelta?_outside (program : Program) (patch : TokenPatch)
    (delta : PublicControlPositionDelta)
    (found : internalLocalControlPositionDelta? program patch = some delta)
    (target : PublicControlTokenPosition)
    (outside : ∀ place ∈ patch.consumed ++ patch.produced,
      ¬ (tokenOrigin program { placeId := place, owner := patch.owner } = target.sequenceFlowId ∧
        patch.owner = target.owner)) :
    tokenMultiplicityAt delta.consumedTokens target = 0 ∧
      tokenMultiplicityAt delta.producedTokens target = 0 := by
  obtain ⟨origins, _, resolved, members, rfl⟩ := internalLocalControlPositionDelta?_ordered program patch delta found
  constructor
  all_goals
    apply localControl_tokenMultiplicityAt_zero
    intro position member same
    obtain ⟨pair, pairMember, residual⟩ := List.mem_filterMap.mp member
    obtain ⟨flow, owner, _, _⟩ := internalLocalControlTokenResidual_facts _ _ _ _ _ _ residual
    apply outside pair.1 ((members pair.1).mpr ⟨pair.2, pairMember⟩)
    rw [internalLocalControlPlaceOrigin?_tokenOrigin program pair.1 patch.owner pair.2 (resolved pair pairMember)]
    exact ⟨flow.symm.trans same.1, owner.symm.trans same.2⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
