import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlSelectionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalActivityRemoval

/-! Regional removal filters canonical collections. Local-control patches commute with that
filter only when every changed value survives and the predecessor has canonical order. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem filter_canonicalInsertBy_retained (before : α → α → Bool)
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (keep : α → Bool) (value : α) (values : List α)
    (ordered : orderedBy before values = true) (kept : keep value = true) :
    (canonicalInsertBy before value values).filter keep =
      canonicalInsertBy before value (values.filter keep) := by
  induction values with
  | nil => simp [canonicalInsertBy, kept]
  | cons current rest ih =>
      have tail : orderedBy before rest = true := by
        cases rest with
        | nil => rfl
        | cons next more => exact (Bool.and_eq_true_iff.mp ordered).2
      by_cases first : before value current = true
      · have ahead : ∀ next ∈ rest, before value next = true := by
          intro next member
          have bound : before next current = false := by
            cases rest with
            | nil => simp at member
            | cons second more =>
                have pair := (Bool.and_eq_true_iff.mp ordered).1
                exact orderedBy_bound compose second more current tail
                  (by simpa using pair) next member
          cases comparison : before value next with
          | true => rfl
          | false =>
              have impossible := compose current next value bound comparison
              simp [first] at impossible
        simp only [canonicalInsertBy, first, ↓reduceIte, List.filter_cons, kept]
        by_cases currentKept : keep current = true
        · simp [currentKept, canonicalInsertBy, first]
        · simp only [currentKept, Bool.false_eq_true, if_false]
          cases filtered : rest.filter keep with
          | nil => rfl
          | cons next more =>
              have member := (List.mem_filter.mp (show next ∈ rest.filter keep by simp [filtered])).1
              simp [canonicalInsertBy, ahead next member]
      · simp only [canonicalInsertBy, first]
        by_cases currentKept : keep current = true
        · simp [currentKept, canonicalInsertBy, first, ih tail]
        · simpa [List.filter_cons, currentKept] using ih tail

theorem TokenPatch.filter_retained (tokens : List ControlToken) (patch : TokenPatch)
    (keep : ControlToken → Bool) (ordered : orderedBy controlTokenBefore tokens = true)
    (produced : ∀ place ∈ patch.produced, keep { placeId := place, owner := patch.owner } = true) :
    (patch.apply tokens).filter keep = patch.apply (tokens.filter keep) := by
  have remove (places : List ControlPlaceId) (values : List ControlToken) :
      (removeTokens values places patch.owner).filter keep =
        removeTokens (values.filter keep) places patch.owner := by
    induction places generalizing values with
    | nil => rfl
    | cons first rest ih =>
        change (removeTokens (removeToken values first patch.owner) rest patch.owner).filter keep = _
        rw [ih, removeToken_eq_erase, ← List.erase_filter]
        simp only [removeTokens, List.foldl_cons, removeToken_eq_erase]
  have insert (places : List ControlPlaceId) (values : List ControlToken)
      (valid : orderedBy controlTokenBefore values = true)
      (retained : ∀ place ∈ places, keep { placeId := place, owner := patch.owner } = true) :
      (addTokens values places patch.owner).filter keep =
        addTokens (values.filter keep) places patch.owner := by
    induction places with
    | nil => rfl
    | cons first rest ih =>
        change (canonicalInsertBy controlTokenBefore { placeId := first, owner := patch.owner }
          (addTokens values rest patch.owner)).filter keep = _
        rw [filter_canonicalInsertBy_retained controlTokenBefore controlTokenBefore_compose keep _ _
          (orderedBy_addTokens values rest patch.owner valid) (retained first (by simp)),
          ih (fun place member => retained place (by simp [member]))]
        rfl
  unfold TokenPatch.apply
  rw [insert _ _ (orderedBy_removeTokens tokens patch.consumed patch.owner ordered) produced, remove]

theorem InternalSelectedBranchPatch.filter_retained (records : List SelectedBranchSet)
    (patch : InternalSelectedBranchPatch) (keep : SelectedBranchSet → Bool)
    (ordered : orderedBy selectionBefore records = true)
    (inserted : ∀ record, patch = .insert record → keep record = true) :
    (patch.apply records).filter keep = patch.apply (records.filter keep) := by
  cases patch with
  | preserve => rfl
  | insert record =>
      simp only [InternalSelectedBranchPatch.apply, insertSelectedBranchSetCanonical_eq_canonicalInsertBy]
      exact filter_canonicalInsertBy_retained selectionBefore selectionBefore_compose keep record records
        ordered (inserted record rfl)
  | remove record => exact (List.erase_filter).symm

theorem localControl_cancellation_commutes (program : Program) (before : RuntimeState)
    (control : InternalLocalControlSelection) (hosting : SemanticId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion) (disposition : SelectedScopeDisposition)
    (beforeWF : runtimeStateWellFormed program hosting before = true)
    (localWF : runtimeStateWellFormed program hosting (control.apply before) = true)
    (running : before.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? before root = some region)
    (localDerived : deriveInternalOccurrenceRegion? (control.apply before) root = some region)
    (tokens : ∀ place ∈ control.tokens.produced, region.contains control.owner = false)
    (branches : ∀ record, control.selectedBranch = .insert record → region.contains record.owner = false) :
    cancelScopeSubtree (control.apply before) root disposition =
      control.apply (cancelScopeSubtree before root disposition) := by
  have position (state : RuntimeState) (valid : runtimeStateWellFormed program hosting state = true) :
      runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have localRunning : (control.apply before).control = .running hosting := running
  have beforeTokens := cancelScopeSubtree_tokens_eq_prepared_region program before hosting hosting
    (position before beforeWF) running root region derived disposition
  have localTokens := cancelScopeSubtree_tokens_eq_prepared_region program (control.apply before) hosting hosting
    (position _ localWF) localRunning root region localDerived disposition
  have beforeBranches := (cancelScopeSubtree_owned_work_eq_prepared_region program before hosting hosting
    beforeWF running root region derived disposition).2.2.2.1
  have localBranches := (cancelScopeSubtree_owned_work_eq_prepared_region program (control.apply before) hosting hosting
    localWF localRunning root region localDerived disposition).2.2.2.1
  have order := runtimeStateWellFormed_canonicalCollectionOrder program hosting before beforeWF
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at order
  have tokenFrame := TokenPatch.filter_retained before.tokens control.tokens
    (fun token => !region.contains token.owner) order.1
    (by intro place member; simpa [InternalLocalControlSelection.owner] using tokens place member)
  have branchOrder : orderedBy selectionBefore before.selectedBranchSets = true := by
    simp_all only
  have branchFrame := InternalSelectedBranchPatch.filter_retained before.selectedBranchSets control.selectedBranch
    (fun record => !region.contains record.owner) branchOrder
    (by intro record inserted; simp [branches record inserted])
  calc
    cancelScopeSubtree (control.apply before) root disposition =
        { cancelScopeSubtree before root disposition with
          tokens := (cancelScopeSubtree (control.apply before) root disposition).tokens
          selectedBranchSets := (cancelScopeSubtree (control.apply before) root disposition).selectedBranchSets } := rfl
    _ = control.apply (cancelScopeSubtree before root disposition) := by
      rw [localTokens, localBranches]
      change { cancelScopeSubtree before root disposition with
        tokens := (control.tokens.apply before.tokens).filter (fun token => !region.contains token.owner)
        selectedBranchSets := (control.selectedBranch.apply before.selectedBranchSets).filter
          (fun record => !region.contains record.owner) } = _
      rw [tokenFrame, branchFrame, ← beforeTokens, ← beforeBranches]
      rfl

theorem localControl_addToken_commutes (before : RuntimeState) (control : InternalLocalControlSelection)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (ordered : orderedBy controlTokenBefore before.tokens = true)
    (different : ∀ place ∈ control.tokens.consumed,
      ({ placeId := output, owner } : ControlToken) ≠ { placeId := place, owner := control.owner }) :
    { control.apply before with tokens := addToken (control.apply before).tokens output owner } =
      control.apply { before with tokens := addToken before.tokens output owner } := by
  have commute := control.tokens.commutes before.tokens
    { owner, consumed := [], produced := [output] } ordered
    (by simp) (by simpa [InternalLocalControlSelection.owner] using different)
  change addToken (control.tokens.apply before.tokens) output owner =
    control.tokens.apply (addToken before.tokens output owner) at commute
  simp only [InternalLocalControlSelection.apply, commute]

theorem localControl_completion_commutes (program : Program) (before : RuntimeState)
    (control : InternalLocalControlSelection) (hosting : SemanticId)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (root : RuntimeScopeOccurrence)
    (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (quiet : scopeQuiescent (control.apply before) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (control.tokens.apply before.tokens) place owner =
        control.tokens.apply (addToken before.tokens place owner)) :
    completeBoundedScope? program (control.apply before) definition output =
      (completeBoundedScope? program before definition output).map control.apply := by
  have ordinary : completeScopeState? (control.apply before) definition output =
      (completeScopeState? before definition output).map control.apply := by
    simp only [completeScopeState?, InternalLocalControlSelection.apply, census]
    change (if !scopeQuiescent (control.apply before) root.id then none else _) = _
    rw [quiet]
    split
    · rfl
    · simp only [completeQuiescentScope?, running]
      cases parent : root.parent <;> cases produced : output <;> simp only [Option.map_none]
      all_goals try rfl
      · split <;> rfl
      · split
        · simp only [Option.map_some,
            continuation _ _ parent produced]
        · rfl
  have child : boundedScopeChildOccurrence? (control.apply before) definition =
      boundedScopeChildOccurrence? before definition := rfl
  have deadline (root parent : ScopeOccurrenceId) (timer : BoundaryTimerArm) :
      parentOwnedDeadline? (control.apply before) root parent timer = parentOwnedDeadline? before root parent timer := rfl
  unfold completeBoundedScope?
  rw [ordinary]
  cases result : completeScopeState? before definition output with
  | none => rfl
  | some completed =>
      simp only [Option.map_some, child, deadline]
      cases bounded : boundedScopeDefinitionForChild? program definition with
      | none => rfl
      | some boundary =>
          dsimp only
          cases childFound : boundedScopeChildOccurrence? before definition with
          | none => rfl
          | some occurrence =>
              dsimp only
              cases parentOwnedDeadline? before occurrence.1 occurrence.2 boundary.2 <;> rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
