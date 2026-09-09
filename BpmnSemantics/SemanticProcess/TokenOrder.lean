import BpmnSemantics.SemanticProcess.TokenStorage
import BpmnSemantics.SemanticProcess.InternalArmingOrder

/-! # Canonical token order laws

The complete place and owner key orders token units without collapsing multiplicity. Permutation and canonical order together recover exact stored equality; mixed insertion/removal laws therefore require an ordered predecessor.
-/

namespace BpmnSemantics.SemanticProcess

private theorem controlTokenBefore_chain (left right : ControlToken) :
    controlTokenBefore left right =
      armingLexStep left.placeId.value right.placeId.value
        (armingLexStep left.owner.processInstanceId.value right.owner.processInstanceId.value
          (armingLexStep left.owner.definitionScopeId.value right.owner.definitionScopeId.value
            (decide (left.owner.activation < right.owner.activation)))) := rfl

theorem controlTokenBefore_asymm (left right : ControlToken) :
    controlTokenBefore left right = true → controlTokenBefore right left = false := by
  simp only [controlTokenBefore_chain]
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  simp only [decide_eq_true_eq, decide_eq_false_iff_not]
  exact Nat.lt_asymm

theorem controlTokenBefore_trans (a b c : ControlToken) :
    controlTokenBefore a b = true → controlTokenBefore b c = true →
      controlTokenBefore a c = true := by
  simp only [controlTokenBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem token_string_total (left right : String) (different : left ≠ right) :
    left < right ∨ right < left := by
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

theorem controlTokenBefore_comparable (left right : ControlToken) (different : left ≠ right) :
    controlTokenBefore left right = true ∨ controlTokenBefore right left = true := by
  rcases left with ⟨⟨leftPlace⟩, ⟨⟨leftInstance⟩, ⟨leftScope⟩, leftActivation⟩⟩
  rcases right with ⟨⟨rightPlace⟩, ⟨⟨rightInstance⟩, ⟨rightScope⟩, rightActivation⟩⟩
  by_cases placeSame : leftPlace = rightPlace
  · by_cases instanceSame : leftInstance = rightInstance
    · by_cases scopeSame : leftScope = rightScope
      · have activationDifferent : leftActivation ≠ rightActivation := by
          intro same
          simp_all
        have alternatives : leftActivation < rightActivation ∨ rightActivation < leftActivation := by
          omega
        simpa [controlTokenBefore, scopeOwnerBefore, placeSame, instanceSame, scopeSame]
          using alternatives
      · simpa [controlTokenBefore, scopeOwnerBefore, placeSame, instanceSame,
          scopeSame, Ne.symm scopeSame] using token_string_total _ _ scopeSame
    · simpa [controlTokenBefore, scopeOwnerBefore, placeSame,
        instanceSame, Ne.symm instanceSame] using token_string_total _ _ instanceSame
  · simpa [controlTokenBefore, placeSame, Ne.symm placeSame]
      using token_string_total _ _ placeSame

theorem controlTokenBefore_compose (a b c : ControlToken)
    (first : controlTokenBefore b a = false) (second : controlTokenBefore c b = false) :
    controlTokenBefore c a = false := by
  by_cases same : c = b
  · simpa [same] using first
  · rcases controlTokenBefore_comparable b c (Ne.symm same) with forward | backward
    · apply Bool.eq_false_iff.mpr
      intro inverted
      have contradiction := controlTokenBefore_trans b c a forward inverted
      simp [first] at contradiction
    · simp [second] at backward

theorem orderedBy_tokens_pairwise (tokens : List ControlToken) :
    orderedBy controlTokenBefore tokens = true ↔
      tokens.Pairwise (fun left right => controlTokenBefore right left = false) := by
  induction tokens with
  | nil => simp [orderedBy]
  | cons first rest ih =>
      rw [List.pairwise_cons]
      constructor
      · intro ordered
        have tail : orderedBy controlTokenBefore rest = true := by
          cases rest with
          | nil => rfl
          | cons second more =>
              simp only [orderedBy, Bool.and_eq_true] at ordered
              exact ordered.2
        refine ⟨?_, ih.mp tail⟩
        intro token member
        exact orderedBy_bound controlTokenBefore_compose first rest first ordered
          (by simp [controlTokenBefore, scopeOwnerBefore]) token (List.mem_cons_of_mem first member)
      · rintro ⟨bound, tail⟩
        have ordered := ih.mpr tail
        cases rest with
        | nil => rfl
        | cons second more =>
            simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
            exact ⟨bound second (by simp), ordered⟩

theorem orderedBy_tokens_sublist (tokens retained : List ControlToken)
    (sublist : retained.Sublist tokens) (ordered : orderedBy controlTokenBefore tokens = true) :
    orderedBy controlTokenBefore retained = true :=
  (orderedBy_tokens_pairwise retained).mpr
    (((orderedBy_tokens_pairwise tokens).mp ordered).sublist sublist)

theorem orderedBy_addToken (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (ordered : orderedBy controlTokenBefore tokens = true) :
    orderedBy controlTokenBefore (addToken tokens place owner) = true :=
  orderedBy_canonicalInsertBy controlTokenBefore controlTokenBefore_asymm
    { placeId := place, owner } tokens ordered

theorem orderedBy_addTokens (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) (ordered : orderedBy controlTokenBefore tokens = true) :
    orderedBy controlTokenBefore (addTokens tokens places owner) = true := by
  induction places with
  | nil => exact ordered
  | cons place rest ih => exact orderedBy_addToken _ place owner ih

theorem orderedBy_removeToken (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (ordered : orderedBy controlTokenBefore tokens = true) :
    orderedBy controlTokenBefore (removeToken tokens place owner) = true :=
  orderedBy_tokens_sublist tokens _ (removeToken_sublist tokens place owner) ordered

theorem orderedBy_token_filter (tokens : List ControlToken) (predicate : ControlToken → Bool)
    (ordered : orderedBy controlTokenBefore tokens = true) :
    orderedBy controlTokenBefore (tokens.filter predicate) = true :=
  orderedBy_filter controlTokenBefore_compose predicate tokens ordered

theorem canonical_tokens_eq_of_perm (left right : List ControlToken)
    (leftOrder : orderedBy controlTokenBefore left = true)
    (rightOrder : orderedBy controlTokenBefore right = true) (same : left.Perm right) :
    left = right := by
  apply List.Perm.eq_of_pairwise (le := fun a b => controlTokenBefore b a = false)
    ?_ ((orderedBy_tokens_pairwise left).mp leftOrder)
    ((orderedBy_tokens_pairwise right).mp rightOrder) same
  intro a b _ _ forward backward
  by_cases same : a = b
  · exact same
  · rcases controlTokenBefore_comparable a b same with before | after
    · simp [backward] at before
    · simp [forward] at after

theorem addToken_commutes (tokens : List ControlToken) (leftPlace rightPlace : ControlPlaceId)
    (leftOwner rightOwner : ScopeOccurrenceId) :
    addToken (addToken tokens leftPlace leftOwner) rightPlace rightOwner =
      addToken (addToken tokens rightPlace rightOwner) leftPlace leftOwner := by
  let left : ControlToken := { placeId := leftPlace, owner := leftOwner }
  let right : ControlToken := { placeId := rightPlace, owner := rightOwner }
  change canonicalInsertBy controlTokenBefore right (canonicalInsertBy controlTokenBefore left tokens) =
    canonicalInsertBy controlTokenBefore left (canonicalInsertBy controlTokenBefore right tokens)
  by_cases same : right = left
  · rw [same]
  · exact canonicalInsertBy_commutes_of_strict_order controlTokenBefore
      controlTokenBefore_asymm controlTokenBefore_trans right left
      (controlTokenBefore_comparable right left same) tokens

theorem removeToken_addToken (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (ordered : orderedBy controlTokenBefore tokens = true) :
    removeToken (addToken tokens place owner) place owner = tokens := by
  apply canonical_tokens_eq_of_perm _ _
    (orderedBy_removeToken _ place owner (orderedBy_addToken tokens place owner ordered)) ordered
  simpa [removeToken_eq_erase] using
    (removeToken_perm _ _ place owner (addToken_perm tokens place owner))

theorem addToken_removeToken (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (ordered : orderedBy controlTokenBefore tokens = true)
    (present : ({ placeId := place, owner } : ControlToken) ∈ tokens) :
    addToken (removeToken tokens place owner) place owner = tokens := by
  apply canonical_tokens_eq_of_perm _ _
    (orderedBy_addToken _ place owner (orderedBy_removeToken tokens place owner ordered)) ordered
  exact (addToken_perm _ place owner).trans
    (by simpa [removeToken_eq_erase] using (List.perm_cons_erase present).symm)

theorem addToken_removeToken_commute (tokens : List ControlToken)
    (insertPlace removePlace : ControlPlaceId) (insertOwner removeOwner : ScopeOccurrenceId)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (different : ({ placeId := insertPlace, owner := insertOwner } : ControlToken) ≠
      { placeId := removePlace, owner := removeOwner }) :
    removeToken (addToken tokens insertPlace insertOwner) removePlace removeOwner =
      addToken (removeToken tokens removePlace removeOwner) insertPlace insertOwner := by
  apply canonical_tokens_eq_of_perm _ _
    (orderedBy_removeToken _ removePlace removeOwner
      (orderedBy_addToken tokens insertPlace insertOwner ordered))
    (orderedBy_addToken _ insertPlace insertOwner
      (orderedBy_removeToken tokens removePlace removeOwner ordered))
  have erased := removeToken_perm _ _ removePlace removeOwner
    (addToken_perm tokens insertPlace insertOwner)
  have framed :
      removeToken ({ placeId := insertPlace, owner := insertOwner } :: tokens)
        removePlace removeOwner =
      { placeId := insertPlace, owner := insertOwner } :: removeToken tokens removePlace removeOwner := by
    simp [removeToken_eq_erase, List.erase_cons_tail, different]
  rw [framed] at erased
  exact erased.trans (addToken_perm _ insertPlace insertOwner).symm

theorem canonicalCollectionOrder_tokens (state : RuntimeState)
    (ordered : canonicalCollectionOrder state = true) :
    orderedBy controlTokenBefore state.tokens = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered
  simp_all

theorem canonicalCollectionOrder_tokens_update (state : RuntimeState) (tokens : List ControlToken)
    (ordered : canonicalCollectionOrder state = true)
    (tokenOrder : orderedBy controlTokenBefore tokens = true) :
    canonicalCollectionOrder { state with tokens } = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered ⊢
  simp_all

end BpmnSemantics.SemanticProcess
