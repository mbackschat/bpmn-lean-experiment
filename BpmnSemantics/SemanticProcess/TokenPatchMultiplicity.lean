import BpmnSemantics.SemanticProcess.TokenPatch

/-! Token patches retain complete unit counts for the publication bridge in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess

private theorem owned_token_beq (left right : ControlPlaceId) (owner : ScopeOccurrenceId) :
    (({ placeId := left, owner } : ControlToken) == { placeId := right, owner }) =
      (left == right) := by
  apply Bool.eq_iff_iff.mpr
  simp

theorem controlToken_count_eq_owned_filter (tokens : List ControlToken)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) :
    tokens.count { placeId := place, owner } =
      (tokens.filter fun token => decide (token.placeId = place && token.owner = owner)).length := by
  rw [List.count_eq_length_filter]
  congr 1
  apply List.filter_congr
  intro token _
  apply Bool.eq_iff_iff.mpr
  cases token
  simp

private theorem owned_token_map_count (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) (query : ControlPlaceId) :
    (places.map fun place => ({ placeId := place, owner } : ControlToken)).count
      { placeId := query, owner } = places.count query := by
  induction places with
  | nil => rfl
  | cons place rest ih =>
      simp only [List.map_cons, List.count_cons, owned_token_beq, ih]

theorem removeTokens_owned_count (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) (query : ControlPlaceId) :
    (removeTokens tokens places owner).count { placeId := query, owner } =
      tokens.count { placeId := query, owner } - places.count query := by
  induction places generalizing tokens with
  | nil => simp [removeTokens]
  | cons place rest ih =>
      change (removeTokens (removeToken tokens place owner) rest owner).count _ = _
      rw [ih, removeToken_eq_erase, List.count_erase, List.count_cons, owned_token_beq]
      omega

theorem addTokens_owned_count (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) (query : ControlPlaceId) :
    (addTokens tokens places owner).count { placeId := query, owner } =
      tokens.count { placeId := query, owner } + places.count query := by
  have counts := (addTokens_perm tokens places owner).count_eq { placeId := query, owner }
  simpa [owned_token_map_count, Nat.add_comm] using counts

/-- Removing exact units uses saturating subtraction; the publication residual law below separately
requires available consumption, as enforced by complete local-control preparation. -/
theorem TokenPatch.owned_multiplicity (tokens : List ControlToken) (patch : TokenPatch)
    (place : ControlPlaceId) :
    (patch.apply tokens).count { placeId := place, owner := patch.owner } =
      tokens.count { placeId := place, owner := patch.owner } - patch.consumed.count place +
        patch.produced.count place := by
  simp only [TokenPatch.apply, addTokens_owned_count, removeTokens_owned_count]

theorem TokenPatch.foreign_owner_multiplicity (tokens : List ControlToken) (patch : TokenPatch)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : patch.owner ≠ owner) :
    (patch.apply tokens).count { placeId := place, owner } =
      tokens.count { placeId := place, owner } := by
  rw [controlToken_count_eq_owned_filter, controlToken_count_eq_owned_filter]
  congr 1
  apply patch.filter_untouched
  all_goals intro touched _; simp [different]

theorem TokenPatch.owned_multiplicity_delta (tokens : List ControlToken) (patch : TokenPatch)
    (place : ControlPlaceId)
    (available : patch.consumed.count place ≤
      tokens.count { placeId := place, owner := patch.owner }) :
    tokens.count { placeId := place, owner := patch.owner } -
        (patch.apply tokens).count { placeId := place, owner := patch.owner } =
          patch.consumed.count place - patch.produced.count place ∧
      (patch.apply tokens).count { placeId := place, owner := patch.owner } -
        tokens.count { placeId := place, owner := patch.owner } =
          patch.produced.count place - patch.consumed.count place := by
  rw [patch.owned_multiplicity tokens place]
  omega

theorem TokenPatch.repeated_turnover_residual (token : ControlToken) :
    let patch : TokenPatch :=
      { owner := token.owner, consumed := [token.placeId], produced := [token.placeId, token.placeId] }
    (patch.apply [token]).count token = 2 := by
  have counts := TokenPatch.owned_multiplicity [token]
    { owner := token.owner, consumed := [token.placeId], produced := [token.placeId, token.placeId] }
    token.placeId
  cases token
  simpa using counts

end BpmnSemantics.SemanticProcess
