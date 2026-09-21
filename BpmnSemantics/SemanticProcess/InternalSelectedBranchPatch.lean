import BpmnSemantics.SemanticProcess.InternalSelectedBranchDependencies

/-! Selected-record algebra for the approved local-control preparation boundary in
[the selected-join readiness amendment](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#selected-join-readiness-dependency-amendment).
-/

namespace BpmnSemantics.SemanticProcess

inductive InternalSelectedBranchPatch where
  | preserve
  | insert (record : SelectedBranchSet)
  | remove (record : SelectedBranchSet)
  deriving Repr, DecidableEq

def InternalSelectedBranchPatch.apply (records : List SelectedBranchSet) :
    InternalSelectedBranchPatch → List SelectedBranchSet
  | .preserve => records
  | .insert record => insertSelectedBranchSetCanonical record records
  | .remove record => records.erase record

def InternalSelectedBranchPatch.selectionKey : InternalSelectedBranchPatch → Option String
  | .preserve => none
  | .insert record | .remove record => some record.selectionKey

/-- The population dependency in the readiness amendment excludes a shared key across all owners. -/
def InternalSelectedBranchPatch.Separated (left right : InternalSelectedBranchPatch) : Prop :=
  ∀ key, left.selectionKey = some key → right.selectionKey ≠ some key

private theorem selectionBefore_chain (left right : SelectedBranchSet) :
    selectionBefore left right =
      armingLexStep left.owner.processInstanceId.value right.owner.processInstanceId.value
        (armingLexStep left.owner.definitionScopeId.value right.owner.definitionScopeId.value
          (armingLexStep left.owner.activation right.owner.activation
            (decide (left.selectionKey < right.selectionKey)))) := rfl

theorem selectionBefore_asymm (left right : SelectedBranchSet) :
    selectionBefore left right = true → selectionBefore right left = false := by
  simp only [selectionBefore_chain]
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => Nat.lt_asymm)
  simp only [decide_eq_true_eq, decide_eq_false_iff_not]
  exact String.lt_asymm

theorem selectionBefore_trans (a b c : SelectedBranchSet) :
    selectionBefore a b = true → selectionBefore b c = true →
      selectionBefore a c = true := by
  simp only [selectionBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => Nat.lt_asymm) (fun _ _ _ => Nat.lt_trans)
  simp only [decide_eq_true_eq]
  exact String.lt_trans

private theorem string_total (left right : String) (different : left ≠ right) :
    left < right ∨ right < left := by
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

theorem selectionBefore_comparable (left right : SelectedBranchSet)
    (different : left.selectionKey ≠ right.selectionKey) :
    selectionBefore left right = true ∨ selectionBefore right left = true := by
  simp only [selectionBefore_chain]
  apply armingLexStep_comparable string_total
  apply armingLexStep_comparable string_total
  apply armingLexStep_comparable (fun _ _ _ => by omega)
  simpa using string_total _ _ different

private theorem armingLexStep_compose {key : Type} [DecidableEq key] [LT key]
    [DecidableLT key] (total : ∀ x y : key, x ≠ y → x < y ∨ y < x)
    (trans : ∀ x y z : key, x < y → y < z → x < z)
    (a b c : key) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    armingLexStep b a ba = false → armingLexStep c b cb = false →
      armingLexStep c a ca = false := by
  by_cases ab : a = b
  · subst b
    by_cases ac : a = c
    · subst c; simpa [armingLexStep] using fall
    · simp [armingLexStep, Ne.symm ac]
  · by_cases bc : b = c
    · subst c
      simp only [armingLexStep, Ne.symm ab, ne_eq, not_false_eq_true,
        if_true, not_true_eq_false, if_false, decide_eq_false_iff_not]
      exact fun first _ => first
    · by_cases ac : a = c
      · subst c
        simp only [armingLexStep, ab, Ne.symm ab, ne_eq, not_false_eq_true,
          if_true, not_true_eq_false, if_false, decide_eq_false_iff_not]
        intro first second
        rcases total a b ab with forward | backward
        · exact False.elim (second forward)
        · exact False.elim (first backward)
      · simp only [armingLexStep, Ne.symm ab, Ne.symm bc, Ne.symm ac,
          ne_eq, not_false_eq_true, if_true, decide_eq_false_iff_not]
        intro first second reverse
        rcases total a b ab with forward | backward
        · exact second (trans _ _ _ reverse forward)
        · exact first backward

theorem selectionBefore_compose (a b c : SelectedBranchSet) :
    selectionBefore b a = false → selectionBefore c b = false →
      selectionBefore c a = false := by
  simp only [selectionBefore_chain]
  apply armingLexStep_compose string_total (fun _ _ _ => String.lt_trans)
  apply armingLexStep_compose string_total (fun _ _ _ => String.lt_trans)
  apply armingLexStep_compose (fun _ _ _ => by omega) (fun _ _ _ => Nat.lt_trans)
  simp only [decide_eq_false_iff_not]
  intro first second reverse
  by_cases same : a.selectionKey = b.selectionKey
  · exact second (by simpa [same] using reverse)
  · rcases string_total a.selectionKey b.selectionKey same with forward | backward
    · exact second (String.lt_trans reverse forward)
    · exact first backward

theorem insertSelectedBranchSetCanonical_eq_canonicalInsertBy
    (record : SelectedBranchSet) (records : List SelectedBranchSet) :
    insertSelectedBranchSetCanonical record records =
      canonicalInsertBy selectionBefore record records := by
  induction records with
  | nil => rfl
  | cons current rest ih =>
      simp only [insertSelectedBranchSetCanonical, canonicalInsertBy]
      split <;> simp_all

private theorem orderedBy_pairwise (before : α → α → Bool)
    (reflexive : ∀ a, before a a = false)
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (values : List α) :
    orderedBy before values = true ↔
      values.Pairwise (fun left right => before right left = false) := by
  induction values with
  | nil => simp [orderedBy]
  | cons first rest ih =>
      rw [List.pairwise_cons]
      constructor
      · intro ordered
        have tail : orderedBy before rest = true := by
          cases rest with
          | nil => rfl
          | cons second more =>
              simp only [orderedBy, Bool.and_eq_true] at ordered
              exact ordered.2
        refine ⟨?_, ih.mp tail⟩
        intro value member
        exact orderedBy_bound compose first rest first ordered (reflexive first) value
          (List.mem_cons_of_mem first member)
      · rintro ⟨bound, tail⟩
        have ordered := ih.mpr tail
        cases rest with
        | nil => rfl
        | cons second more =>
            simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
            exact ⟨bound second (by simp), ordered⟩

theorem orderedBy_selectedBranchSets_erase (records : List SelectedBranchSet)
    (record : SelectedBranchSet) (ordered : orderedBy selectionBefore records = true) :
    orderedBy selectionBefore (records.erase record) = true := by
  have pairwise := orderedBy_pairwise selectionBefore
    (fun value => by simp [selectionBefore]) selectionBefore_compose
  exact (pairwise _).mpr (((pairwise _).mp ordered).sublist List.erase_sublist)

theorem InternalSelectedBranchPatch.preserves_order (records : List SelectedBranchSet)
    (patch : InternalSelectedBranchPatch) (ordered : orderedBy selectionBefore records = true) :
    orderedBy selectionBefore (patch.apply records) = true := by
  cases patch with
  | preserve => exact ordered
  | insert record =>
      simp only [apply, insertSelectedBranchSetCanonical_eq_canonicalInsertBy]
      exact orderedBy_canonicalInsertBy selectionBefore selectionBefore_asymm record records ordered
  | remove record => exact orderedBy_selectedBranchSets_erase records record ordered

private theorem filter_erase_rejected [BEq α] [LawfulBEq α]
    (predicate : α → Bool) (record : α) (records : List α)
    (rejected : predicate record = false) :
    (records.erase record).filter predicate = records.filter predicate := by
  induction records with
  | nil => rfl
  | cons current rest ih =>
      by_cases same : current = record
      · subst current; simp [rejected]
      · rw [List.erase_cons_tail (by simpa using same)]
        simp [List.filter_cons, ih]

theorem InternalSelectedBranchPatch.filter_untouched (records : List SelectedBranchSet)
    (patch : InternalSelectedBranchPatch) (predicate : SelectedBranchSet → Bool)
    (untouched : ∀ record, patch = .insert record ∨ patch = .remove record →
      predicate record = false) :
    (patch.apply records).filter predicate = records.filter predicate := by
  cases patch with
  | preserve => rfl
  | insert record =>
      simp only [apply, insertSelectedBranchSetCanonical_eq_canonicalInsertBy]
      exact filter_canonicalInsertBy_rejected _ _ _ _ (untouched record (Or.inl rfl))
  | remove record => exact filter_erase_rejected _ _ _ (untouched record (Or.inr rfl))

theorem InternalSelectedBranchPatch.population_frame (records : List SelectedBranchSet)
    (patch : InternalSelectedBranchPatch) (key : String)
    (different : patch.selectionKey ≠ some key) :
    (patch.apply records).filter (fun record => decide (record.selectionKey = key)) =
      records.filter (fun record => decide (record.selectionKey = key)) := by
  apply patch.filter_untouched
  intro record mutation
  rcases mutation with rfl | rfl <;> simpa [selectionKey] using different

theorem InternalSelectedBranchPatch.owner_key_frame (records : List SelectedBranchSet)
    (patch : InternalSelectedBranchPatch) (owner : ScopeOccurrenceId) (key : String)
    (different : patch.selectionKey ≠ some key) :
    (patch.apply records).filter
        (fun record => decide (record.owner = owner ∧ record.selectionKey = key)) =
      records.filter (fun record => decide (record.owner = owner ∧ record.selectionKey = key)) := by
  apply patch.filter_untouched
  intro record mutation
  have keyDifferent : record.selectionKey ≠ key := by
    rcases mutation with rfl | rfl <;> simpa [selectionKey] using different
  simp [keyDifferent]

theorem canonicalInsertBy_erase [BEq α] [LawfulBEq α]
    (before : α → α → Bool)
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (inserted removed : α) (different : inserted ≠ removed) (values : List α)
    (ordered : orderedBy before values = true) :
    (canonicalInsertBy before inserted values).erase removed =
      canonicalInsertBy before inserted (values.erase removed) := by
  induction values with
  | nil => simp [canonicalInsertBy, different]
  | cons current rest ih =>
      have tail : orderedBy before rest = true := by
        cases rest with
        | nil => rfl
        | cons next more =>
            simp only [orderedBy, Bool.and_eq_true] at ordered
            exact ordered.2
      by_cases first : before inserted current = true
      · by_cases same : current = removed
        · subst current
          cases rest with
          | nil => simp [canonicalInsertBy, first, different]
          | cons next more =>
              have bound : before next removed = false := by
                simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
                exact ordered.1
              have nextFirst : before inserted next = true := by
                cases h : before inserted next with
                | true => rfl
                | false =>
                    have impossible := compose removed next inserted bound h
                    simp [first] at impossible
              simp [canonicalInsertBy, first, nextFirst, different]
        · simp [canonicalInsertBy, first, List.erase_cons_tail, different, same]
      · by_cases same : current = removed
        · subst current; simp [canonicalInsertBy, first]
        · simp [canonicalInsertBy, first, List.erase_cons_tail, same, ih tail]

theorem InternalSelectedBranchPatch.commute (records : List SelectedBranchSet)
    (left right : InternalSelectedBranchPatch)
    (ordered : orderedBy selectionBefore records = true) (separated : left.Separated right) :
    left.apply (right.apply records) = right.apply (left.apply records) := by
  cases left with
  | preserve => rfl
  | insert left =>
      cases right with
      | preserve => rfl
      | insert right =>
          have different : left.selectionKey ≠ right.selectionKey := by
            intro same
            exact separated left.selectionKey rfl (by simp [selectionKey, same])
          simp only [apply, insertSelectedBranchSetCanonical_eq_canonicalInsertBy]
          exact canonicalInsertBy_commutes_of_strict_order selectionBefore
            selectionBefore_asymm selectionBefore_trans left right
            (selectionBefore_comparable left right different) records
      | remove right =>
          have different : left ≠ right := by
            intro same; subst right
            exact separated left.selectionKey rfl rfl
          simp only [apply, insertSelectedBranchSetCanonical_eq_canonicalInsertBy]
          exact (canonicalInsertBy_erase selectionBefore selectionBefore_compose
            left right different records ordered).symm
  | remove left =>
      cases right with
      | preserve => rfl
      | insert right =>
          have different : right ≠ left := by
            intro same; subst right
            exact separated left.selectionKey rfl rfl
          simp only [apply, insertSelectedBranchSetCanonical_eq_canonicalInsertBy]
          exact canonicalInsertBy_erase selectionBefore selectionBefore_compose
            right left different records ordered
      | remove right =>
          simp only [apply]
          exact List.erase_comm right left

theorem InternalSelectedBranchPatch.owner_key_membership_frame
    (records : List SelectedBranchSet) (patch : InternalSelectedBranchPatch)
    (owner : ScopeOccurrenceId) (key : String)
    (different : patch.selectionKey ≠ some key) :
    (patch.apply records).any (fun record =>
        decide (record.owner = owner ∧ record.selectionKey = key)) =
      records.any (fun record => decide (record.owner = owner ∧ record.selectionKey = key)) := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.any_eq_true]
  constructor
  · rintro ⟨record, present, keyMatches⟩
    have filtered : record ∈ (patch.apply records).filter
        (fun record => decide (record.owner = owner ∧ record.selectionKey = key)) :=
      List.mem_filter.mpr ⟨present, keyMatches⟩
    rw [patch.owner_key_frame records owner key different] at filtered
    exact ⟨record, (List.mem_filter.mp filtered).1, keyMatches⟩
  · rintro ⟨record, present, keyMatches⟩
    have filtered : record ∈ records.filter
        (fun record => decide (record.owner = owner ∧ record.selectionKey = key)) :=
      List.mem_filter.mpr ⟨present, keyMatches⟩
    rw [← patch.owner_key_frame records owner key different] at filtered
    exact ⟨record, (List.mem_filter.mp filtered).1, keyMatches⟩

theorem InternalSelectedBranchPatch.owner_key_absence_frame
    (records : List SelectedBranchSet) (patch : InternalSelectedBranchPatch)
    (owner : ScopeOccurrenceId) (key : String)
    (different : patch.selectionKey ≠ some key) :
    (patch.apply records).any (fun record =>
        decide (record.owner = owner ∧ record.selectionKey = key)) = false ↔
      records.any (fun record =>
        decide (record.owner = owner ∧ record.selectionKey = key)) = false := by
  rw [patch.owner_key_membership_frame records owner key different]

theorem InternalSelectedBranchPatch.same_key_not_separated
    (left right : InternalSelectedBranchPatch) (key : String)
    (leftKey : left.selectionKey = some key) (rightKey : right.selectionKey = some key) :
    ¬ left.Separated right := fun separated => separated key leftKey rightKey

/-- Prepending violates exact stored commutation even when population keys are separate. -/
theorem selectedBranchSet_prepend_noncommute (left right : SelectedBranchSet)
    (different : left.selectionKey ≠ right.selectionKey) :
    [left, right] ≠ [right, left] := by
  intro same
  have recordsSame : left = right := (List.cons.inj same).1
  exact different (congrArg SelectedBranchSet.selectionKey recordsSame)

namespace InternalCommutation

theorem selectedBranchWriteAtoms_disjoint_keys
    (leftOwner rightOwner : ScopeOccurrenceId) (leftKey rightKey : String)
    (separated : listsDisjoint (selectedBranchWriteAtoms leftOwner leftKey)
      (selectedBranchWriteAtoms rightOwner rightKey) = true) :
    leftKey ≠ rightKey := by
  intro same
  subst rightKey
  simp only [listsDisjoint, List.all_eq_true] at separated
  have excluded := separated (.selectedBranchOwners leftKey)
    (selectedBranchOwners_mem_selectedBranchWriteAtoms leftOwner leftKey)
  have included := selectedBranchOwners_mem_selectedBranchWriteAtoms rightOwner leftKey
  simp [List.contains_eq_mem, included] at excluded

theorem selectedBranchWriteAtoms_selectedJoin_disjoint_key
    (state : RuntimeState) (owner : ScopeOccurrenceId) (writeKey readKey : String)
    (separated : listsDisjoint (selectedBranchWriteAtoms owner writeKey)
      (selectedJoinReadAtoms state readKey) = true) :
    writeKey ≠ readKey := by
  intro same
  subst readKey
  have conflict := selectedBranchWriteAtoms_conflict state owner writeKey
  simp [separated] at conflict

theorem selectedJoinReadAtoms_selectedBranchPatch_frame (state : RuntimeState)
    (key : String) (patch : InternalSelectedBranchPatch)
    (different : patch.selectionKey ≠ some key) :
    selectedJoinReadAtoms { state with selectedBranchSets := patch.apply state.selectedBranchSets }
        key = selectedJoinReadAtoms state key := by
  unfold selectedJoinReadAtoms
  rw [patch.population_frame state.selectedBranchSets key different]

theorem selectedJoinReadyRecords_selectedBranchPatch_frame (state : RuntimeState)
    (key : String) (patch : InternalSelectedBranchPatch)
    (different : patch.selectionKey ≠ some key) :
    (patch.apply state.selectedBranchSets).filter (selectedBranchJoinReady state key) =
      state.selectedBranchSets.filter (selectedBranchJoinReady state key) := by
  apply patch.filter_untouched
  intro record mutation
  have keyDifferent : record.selectionKey ≠ key := by
    rcases mutation with rfl | rfl <;>
      simpa [InternalSelectedBranchPatch.selectionKey] using different
  simp [selectedBranchJoinReady, keyDifferent]

end InternalCommutation

end BpmnSemantics.SemanticProcess
