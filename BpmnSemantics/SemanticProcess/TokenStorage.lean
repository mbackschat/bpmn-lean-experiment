import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Token storage multiplicity laws

Permutation witnesses separate exact token ownership and multiplicity from insertion order. These low-level laws remain available to start and position validation without importing the aggregate runtime invariant.
-/

namespace BpmnSemantics.SemanticProcess

theorem addToken_perm (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) :
    (addToken tokens place owner).Perm ({ placeId := place, owner } :: tokens) := by
  induction tokens with
  | nil => exact .refl _
  | cons current rest ih =>
      simp only [addToken, canonicalInsertBy]
      split
      · exact .refl _
      · exact (ih.cons current).trans (.swap _ _ _)

theorem addToken_length (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) :
    (addToken tokens place owner).length = tokens.length + 1 := by
  simpa using (addToken_perm tokens place owner).length_eq

theorem addToken_all (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool) :
    (addToken tokens place owner).all predicate =
      (predicate { placeId := place, owner } && tokens.all predicate) := by
  simpa only [List.all_cons] using (addToken_perm tokens place owner).all_eq

theorem addToken_filter_length (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool) :
    ((addToken tokens place owner).filter predicate).length =
      (tokens.filter predicate).length +
        if predicate { placeId := place, owner } then 1 else 0 := by
  have count := ((addToken_perm tokens place owner).filter predicate).length_eq
  cases selected : predicate { placeId := place, owner } <;>
    simpa [selected, Nat.add_comm] using count

theorem addTokens_perm (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) :
    (addTokens tokens places owner).Perm
      ((places.map fun place => { placeId := place, owner }) ++ tokens) := by
  induction places with
  | nil => exact .refl _
  | cons place rest ih =>
      exact (addToken_perm (addTokens tokens rest owner) place owner).trans
        (ih.cons { placeId := place, owner })

theorem addTokens_place_multiplicity (tokens : List ControlToken)
    (places : List ControlPlaceId) (owner : ScopeOccurrenceId) (query : ControlPlaceId) :
    ((addTokens tokens places owner).filter fun token => decide (token.placeId = query)).length =
      (tokens.filter fun token => decide (token.placeId = query)).length +
        (places.filter fun place => decide (place = query)).length := by
  have count := ((addTokens_perm tokens places owner).filter
    (fun token => decide (token.placeId = query))).length_eq
  simpa [List.filter_append, List.filter_map, Function.comp_def, Nat.add_comm] using count

theorem removeToken_eq_erase (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) :
    removeToken tokens place owner = tokens.erase { placeId := place, owner } := by
  induction tokens with
  | nil => rfl
  | cons current rest ih =>
      cases current with
      | mk currentPlace currentOwner =>
          by_cases samePlace : currentPlace = place <;>
            by_cases sameOwner : currentOwner = owner <;>
            simp_all [removeToken]

theorem removeToken_sublist (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) : (removeToken tokens place owner).Sublist tokens := by
  rw [removeToken_eq_erase]
  exact List.erase_sublist

theorem removeToken_perm (left right : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (same : left.Perm right) :
    (removeToken left place owner).Perm (removeToken right place owner) := by
  simpa only [removeToken_eq_erase] using same.erase { placeId := place, owner }

end BpmnSemantics.SemanticProcess
