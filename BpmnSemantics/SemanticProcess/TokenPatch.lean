import BpmnSemantics.SemanticProcess.TokenOrder

/-! Token-producing local control requires finite removal/insertion laws over exact canonical storage.
The patch retains token units rather than a successor collection, preserving unrelated multiplicity.
-/

namespace BpmnSemantics.SemanticProcess

structure TokenPatch where
  owner : ScopeOccurrenceId
  consumed : List ControlPlaceId
  produced : List ControlPlaceId
  deriving Repr, DecidableEq

def TokenPatch.apply (tokens : List ControlToken) (patch : TokenPatch) : List ControlToken :=
  addTokens (removeTokens tokens patch.consumed patch.owner) patch.produced patch.owner

theorem removeTokens_sublist (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) : (removeTokens tokens places owner).Sublist tokens := by
  induction places generalizing tokens with
  | nil => exact .refl _
  | cons place rest ih =>
      exact (ih (removeToken tokens place owner)).trans (removeToken_sublist tokens place owner)

theorem orderedBy_removeTokens (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) (ordered : orderedBy controlTokenBefore tokens = true) :
    orderedBy controlTokenBefore (removeTokens tokens places owner) = true :=
  orderedBy_tokens_sublist tokens _ (removeTokens_sublist tokens places owner) ordered

theorem TokenPatch.preserves_order (tokens : List ControlToken) (patch : TokenPatch)
    (ordered : orderedBy controlTokenBefore tokens = true) :
    orderedBy controlTokenBefore (patch.apply tokens) = true :=
  orderedBy_addTokens _ patch.produced patch.owner
    (orderedBy_removeTokens tokens patch.consumed patch.owner ordered)

theorem removeTokens_removeToken_commute (tokens : List ControlToken)
    (places : List ControlPlaceId) (place : ControlPlaceId)
    (owner singleOwner : ScopeOccurrenceId) :
    removeToken (removeTokens tokens places owner) place singleOwner =
      removeTokens (removeToken tokens place singleOwner) places owner := by
  induction places generalizing tokens with
  | nil => rfl
  | cons first rest ih =>
      simpa only [removeTokens, List.foldl_cons, removeToken_commutes]
        using ih (removeToken tokens first owner)

theorem removeTokens_commute (tokens : List ControlToken)
    (left right : List ControlPlaceId) (leftOwner rightOwner : ScopeOccurrenceId) :
    removeTokens (removeTokens tokens left leftOwner) right rightOwner =
      removeTokens (removeTokens tokens right rightOwner) left leftOwner := by
  induction right generalizing tokens with
  | nil => rfl
  | cons first rest ih =>
      change removeTokens (removeToken (removeTokens tokens left leftOwner) first rightOwner)
        rest rightOwner = _
      rw [removeTokens_removeToken_commute, ih]
      rfl

theorem addTokens_addToken_commute (tokens : List ControlToken)
    (places : List ControlPlaceId) (place : ControlPlaceId)
    (owner singleOwner : ScopeOccurrenceId) :
    addToken (addTokens tokens places owner) place singleOwner =
      addTokens (addToken tokens place singleOwner) places owner := by
  induction places with
  | nil => rfl
  | cons first rest ih =>
      change addToken (addToken (addTokens tokens rest owner) first owner) place singleOwner = _
      rw [addToken_commutes, ih]
      rfl

theorem addTokens_commute (tokens : List ControlToken)
    (left right : List ControlPlaceId) (leftOwner rightOwner : ScopeOccurrenceId) :
    addTokens (addTokens tokens left leftOwner) right rightOwner =
      addTokens (addTokens tokens right rightOwner) left leftOwner := by
  induction right with
  | nil => rfl
  | cons first rest ih =>
      change addToken (addTokens (addTokens tokens left leftOwner) rest rightOwner)
        first rightOwner = _
      rw [ih, addTokens_addToken_commute]
      rfl

theorem addTokens_removeToken_commute (tokens : List ControlToken)
    (places : List ControlPlaceId) (place : ControlPlaceId)
    (owner removeOwner : ScopeOccurrenceId)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (different : ∀ inserted ∈ places,
      ({ placeId := inserted, owner } : ControlToken) ≠ { placeId := place, owner := removeOwner }) :
    removeToken (addTokens tokens places owner) place removeOwner =
      addTokens (removeToken tokens place removeOwner) places owner := by
  induction places with
  | nil => rfl
  | cons first rest ih =>
      change removeToken (addToken (addTokens tokens rest owner) first owner) place removeOwner = _
      rw [addToken_removeToken_commute _ first place owner removeOwner
        (orderedBy_addTokens tokens rest owner ordered) (different first (by simp))]
      rw [ih (fun inserted member => different inserted (by simp [member]))]
      rfl

theorem addTokens_removeTokens_commute (tokens : List ControlToken)
    (inserted removed : List ControlPlaceId) (insertOwner removeOwner : ScopeOccurrenceId)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (different : ∀ add ∈ inserted, ∀ erase ∈ removed,
      ({ placeId := add, owner := insertOwner } : ControlToken) ≠
        { placeId := erase, owner := removeOwner }) :
    removeTokens (addTokens tokens inserted insertOwner) removed removeOwner =
      addTokens (removeTokens tokens removed removeOwner) inserted insertOwner := by
  induction removed generalizing tokens with
  | nil => rfl
  | cons first rest ih =>
      change removeTokens (removeToken (addTokens tokens inserted insertOwner) first removeOwner)
        rest removeOwner = _
      rw [addTokens_removeToken_commute tokens inserted first insertOwner removeOwner ordered
        (fun add member => different add member first (by simp))]
      exact ih (removeToken tokens first removeOwner)
        (orderedBy_removeToken tokens first removeOwner ordered)
        (fun add addMember erase eraseMember => different add addMember erase (by simp [eraseMember]))

theorem TokenPatch.commutes (tokens : List ControlToken) (left right : TokenPatch)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (leftProduces : ∀ add ∈ left.produced, ∀ erase ∈ right.consumed,
      ({ placeId := add, owner := left.owner } : ControlToken) ≠
        { placeId := erase, owner := right.owner })
    (rightProduces : ∀ add ∈ right.produced, ∀ erase ∈ left.consumed,
      ({ placeId := add, owner := right.owner } : ControlToken) ≠
        { placeId := erase, owner := left.owner }) :
    right.apply (left.apply tokens) = left.apply (right.apply tokens) := by
  unfold TokenPatch.apply
  rw [addTokens_removeTokens_commute _ left.produced right.consumed left.owner right.owner
    (orderedBy_removeTokens tokens left.consumed left.owner ordered) leftProduces]
  rw [addTokens_removeTokens_commute _ right.produced left.consumed right.owner left.owner
    (orderedBy_removeTokens tokens right.consumed right.owner ordered) rightProduces]
  rw [removeTokens_commute tokens left.consumed right.consumed left.owner right.owner,
    addTokens_commute]

theorem filter_removeToken_of_rejected (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool)
    (rejected : predicate { placeId := place, owner } = false) :
    (removeToken tokens place owner).filter predicate = tokens.filter predicate := by
  rw [removeToken_eq_erase, ← List.erase_filter]
  apply List.erase_of_not_mem
  simp [rejected]

theorem filter_removeTokens_of_rejected (tokens : List ControlToken)
    (places : List ControlPlaceId) (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool)
    (rejected : ∀ place ∈ places, predicate { placeId := place, owner } = false) :
    (removeTokens tokens places owner).filter predicate = tokens.filter predicate := by
  induction places generalizing tokens with
  | nil => rfl
  | cons first rest ih =>
      change (removeTokens (removeToken tokens first owner) rest owner).filter predicate = _
      rw [ih _ (fun place member => rejected place (by simp [member]))]
      exact filter_removeToken_of_rejected tokens first owner predicate (rejected first (by simp))

theorem filter_addTokens_of_rejected (tokens : List ControlToken)
    (places : List ControlPlaceId) (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool)
    (rejected : ∀ place ∈ places, predicate { placeId := place, owner } = false) :
    (addTokens tokens places owner).filter predicate = tokens.filter predicate := by
  induction places with
  | nil => rfl
  | cons first rest ih =>
      change (canonicalInsertBy controlTokenBefore { placeId := first, owner }
        (addTokens tokens rest owner)).filter predicate = _
      rw [filter_canonicalInsertBy_rejected _ predicate _ _ (rejected first (by simp))]
      exact ih (fun place member => rejected place (by simp [member]))

theorem TokenPatch.filter_untouched (tokens : List ControlToken) (patch : TokenPatch)
    (predicate : ControlToken → Bool)
    (consumed : ∀ place ∈ patch.consumed, predicate { placeId := place, owner := patch.owner } = false)
    (produced : ∀ place ∈ patch.produced, predicate { placeId := place, owner := patch.owner } = false) :
    (patch.apply tokens).filter predicate = tokens.filter predicate := by
  unfold TokenPatch.apply
  rw [filter_addTokens_of_rejected _ _ _ predicate produced,
    filter_removeTokens_of_rejected _ _ _ predicate consumed]

theorem TokenPatch.owner_census_frame (state : RuntimeState) (patch : TokenPatch)
    (queried : ControlPlaceId)
    (consumed : queried ∉ patch.consumed) (produced : queried ∉ patch.produced) :
    tokenOwners { state with tokens := patch.apply state.tokens } queried = tokenOwners state queried := by
  unfold tokenOwners
  rw [patch.filter_untouched state.tokens (fun token => decide (token.placeId = queried))]
  · intro place member
    simp only [decide_eq_false_iff_not]
    intro same
    exact consumed (same ▸ member)
  · intro place member
    simp only [decide_eq_false_iff_not]
    intro same
    exact produced (same ▸ member)

theorem TokenPatch.owner_selection_frame (state : RuntimeState) (patch : TokenPatch)
    (queried : ControlPlaceId)
    (consumed : queried ∉ patch.consumed) (produced : queried ∉ patch.produced) :
    onlyTokenOwner? { state with tokens := patch.apply state.tokens } queried =
      onlyTokenOwner? state queried := by
  simp only [onlyTokenOwner?, patch.owner_census_frame state queried consumed produced]

end BpmnSemantics.SemanticProcess
