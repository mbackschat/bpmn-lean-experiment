import BpmnSemantics.SemanticProcess.InternalLocalControlSelection

/-! Complete predecessor read frames for the five local-control selectors in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

theorem onlyTokenOwner_read_frame (before after : RuntimeState) (place : ControlPlaceId)
    (census : tokenOwners after place = tokenOwners before place) :
    onlyTokenOwner? after place = onlyTokenOwner? before place := by
  simp only [onlyTokenOwner?, census]

theorem commonTokenOwner_read_frame (before after : RuntimeState) (inputs : List ControlPlaceId)
    (census : ∀ place ∈ inputs, tokenOwners after place = tokenOwners before place) :
    commonTokenOwner? after inputs = commonTokenOwner? before inputs := by
  cases inputs with
  | nil => rfl
  | cons first rest =>
      have head := onlyTokenOwner_read_frame before after first (census first (by simp))
      have tail (owner : ScopeOccurrenceId) :
          rest.all (fun input => onlyTokenOwner? after input == some owner) =
            rest.all (fun input => onlyTokenOwner? before input == some owner) := by
        apply Bool.eq_iff_iff.mpr
        simp only [List.all_eq_true]
        constructor <;> intro ready input member
        · rw [← onlyTokenOwner_read_frame before after input (census input (by simp [member]))]
          exact ready input member
        · rw [onlyTokenOwner_read_frame before after input (census input (by simp [member]))]
          exact ready input member
      simp only [commonTokenOwner?, head, tail]

private theorem selectedJoinReadyRecords_filter_key (state : RuntimeState) (key : String) :
    (state.selectedBranchSets.filter (fun record => decide (record.selectionKey = key))).filter
        (selectedBranchJoinReady state key) =
      state.selectedBranchSets.filter (selectedBranchJoinReady state key) := by
  rw [List.filter_filter]
  apply List.filter_congr
  intro record _
  by_cases same : record.selectionKey = key <;> simp [selectedBranchJoinReady, same]

/-- Every predecessor record under the key contributes readiness reads, including unready records;
the readiness amendment protects uniqueness across owners without protecting unrelated buckets. -/
theorem selectedJoinReadyRecords_read_frame (before after : RuntimeState) (key : String)
    (population : after.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) =
      before.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)))
    (buckets : ∀ record ∈ before.selectedBranchSets, record.selectionKey = key →
      ∀ input ∈ record.expectedInputs,
        after.tokens.filter (fun token => decide (token.placeId = input && token.owner = record.owner)) =
          before.tokens.filter (fun token => decide (token.placeId = input && token.owner = record.owner))) :
    after.selectedBranchSets.filter (selectedBranchJoinReady after key) =
      before.selectedBranchSets.filter (selectedBranchJoinReady before key) := by
  rw [← selectedJoinReadyRecords_filter_key after key,
    ← selectedJoinReadyRecords_filter_key before key, population]
  apply List.filter_congr
  intro record member
  obtain ⟨present, same⟩ := List.mem_filter.mp member
  have keyMatches : record.selectionKey = key := by simpa using same
  simp only [selectedBranchJoinReady, keyMatches, decide_true, Bool.true_and]
  apply Bool.eq_iff_iff.mpr
  simp only [List.all_eq_true]
  have readyFrame (input : ControlPlaceId) (expected : input ∈ record.expectedInputs) :
      selectedInputOwnedReady after record.owner input =
        selectedInputOwnedReady before record.owner input := by
    simp only [selectedInputOwnedReady, buckets record present keyMatches input expected]
  constructor <;> intro ready input expected
  · rw [← readyFrame input expected]
    exact ready input expected
  · rw [readyFrame input expected]
    exact ready input expected

theorem selectedBranch_owner_key_read_frame (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (key : String)
    (population : after.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) =
      before.selectedBranchSets.filter (fun record => decide (record.selectionKey = key))) :
    after.selectedBranchSets.any (fun record => decide (record.owner = owner && record.selectionKey = key)) =
      before.selectedBranchSets.any (fun record => decide (record.owner = owner && record.selectionKey = key)) := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.any_eq_true]
  constructor
  · rintro ⟨record, present, matched⟩
    have same : record.selectionKey = key := by
      simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
      exact matched.2
    have member : record ∈ after.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) :=
      List.mem_filter.mpr ⟨present, by simp [same]⟩
    rw [population] at member
    exact ⟨record, (List.mem_filter.mp member).1, matched⟩
  · rintro ⟨record, present, matched⟩
    have same : record.selectionKey = key := by
      simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
      exact matched.2
    have member : record ∈ before.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) :=
      List.mem_filter.mpr ⟨present, by simp [same]⟩
    rw [← population] at member
    exact ⟨record, (List.mem_filter.mp member).1, matched⟩

/-- The exact predecessor reads preserve all retained fields, with no successor selection or state
validity premise; the account permits shared reads and changes outside the visited populations. -/
theorem selectInternalLocalControl_read_frame (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (found : selectInternalLocalControl? before operation = some selected)
    (census : ∀ place ∈ selected.censusReads, tokenOwners after place = tokenOwners before place)
    (variables : ∀ name ∈ selected.variableReads,
      after.variables.process.bindings.filter (fun binding => decide (binding.name = name)) =
        before.variables.process.bindings.filter (fun binding => decide (binding.name = name)))
    (population : ∀ key, selected.selectedBranch.selectionKey = some key →
      after.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) =
        before.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)))
    (buckets : ∀ chosen, selected.branchResult = some (.selectedJoin chosen) →
      ∀ record ∈ before.selectedBranchSets, record.selectionKey = chosen.selectionKey →
        ∀ input ∈ record.expectedInputs,
          after.tokens.filter (fun token => decide (token.placeId = input && token.owner = record.owner)) =
            before.tokens.filter (fun token => decide (token.placeId = input && token.owner = record.owner))) :
    selectInternalLocalControl? after operation = some selected := by
  cases operation with
  | duplicate id origin input outputs =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      have same := onlyTokenOwner_read_frame before after input
        (census input (by simp [InternalLocalControlSelection.censusReads]))
      simp [selectInternalLocalControl?, same, owned]
  | synchronize id origin inputs output =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      have same := commonTokenOwner_read_frame before after inputs census
      simp [selectInternalLocalControl?, same, owned]
  | choose id origin input candidates defaultOutput defaultOrigin =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨branch, branchFound, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      have same := onlyTokenOwner_read_frame before after input
        (census input (by simp [InternalLocalControlSelection.censusReads]))
      have branchSame := prepare_internal_conditional_frame candidates defaultOutput defaultOrigin
        before.variables.process.bindings after.variables.process.bindings branch branchFound
        (fun name member => (variables name member).symm)
      simp [selectInternalLocalControl?, same, owned, branchSame]
  | selectMany id origin input candidates defaultBranch key =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · next fresh =>
          obtain ⟨branch, branchFound, found⟩ := Option.bind_eq_some_iff.mp found
          split at found
          · contradiction
          · next nonempty =>
              cases found
              have same := onlyTokenOwner_read_frame before after input
                (census input (by simp [InternalLocalControlSelection.censusReads]))
              have branchSame := prepare_internal_inclusive_frame candidates defaultBranch
                before.variables.process.bindings after.variables.process.bindings branch branchFound
                (fun name member => (variables name member).symm)
              have freshSame := selectedBranch_owner_key_read_frame before after owner key
                (population key rfl)
              simp only [selectInternalLocalControl?, same, owned, bind, Option.bind,
                freshSame, fresh, branchSame, nonempty]
              rfl
  | synchronizeSelected id origin inputs output key =>
      simp only [selectInternalLocalControl?] at found
      split at found
      · next record ready =>
          cases found
          have member : record ∈ before.selectedBranchSets.filter (selectedBranchJoinReady before key) := by
            rw [ready]
            simp
          have sameKey : record.selectionKey = key := by
            have matched := (List.mem_filter.mp member).2
            simp only [selectedBranchJoinReady, Bool.and_eq_true, decide_eq_true_eq] at matched
            exact matched.1
          have reads := selectedJoinReadyRecords_read_frame before after key
            (population key (by simp [InternalSelectedBranchPatch.selectionKey, sameKey]))
            (by simpa [sameKey] using buckets record rfl)
          simp [selectInternalLocalControl?, reads, ready]
      · contradiction
  | _ => simp [selectInternalLocalControl?] at found

/-- The readiness amendment includes the other owner's absent bucket: protecting only the chosen
record leaves a second same-key record free to invalidate the unique-ready selector. -/
theorem selectedJoin_second_owner_bucket_changes_selection
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (key : String) (input output : ControlPlaceId) (owner other : ScopeOccurrenceId)
    (different : owner ≠ other) :
    let first : SelectedBranchSet := ⟨owner, key, [input]⟩
    let second : SelectedBranchSet := ⟨other, key, [input]⟩
    let before := { state with tokens := [⟨input, owner⟩], selectedBranchSets := [first, second] }
    let after := { before with tokens := [⟨input, owner⟩, ⟨input, other⟩] }
    selectInternalLocalControl? before (.synchronizeSelected id origin [input] output key) =
        some
          { operation := .synchronizeSelected id origin [input] output key
            tokens := { owner, consumed := [input], produced := [output] }
            selectedBranch := .remove first, branchResult := some (.selectedJoin first) } ∧
      selectInternalLocalControl? after (.synchronizeSelected id origin [input] output key) = none := by
  simp [selectInternalLocalControl?, selectedBranchJoinReady, selectedInputOwnedReady,
    different, Ne.symm different]

/-- Token reads alone do not protect selected-join uniqueness when the same-key population grows;
the account therefore also retains the complete key census. -/
theorem selectedJoin_same_key_insertion_changes_selection
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (key : String) (input output : ControlPlaceId) (owner other : ScopeOccurrenceId)
    (different : owner ≠ other) :
    let first : SelectedBranchSet := ⟨owner, key, [input]⟩
    let second : SelectedBranchSet := ⟨other, key, [input]⟩
    let before := { state with tokens := [⟨input, owner⟩, ⟨input, other⟩], selectedBranchSets := [first] }
    let after := { before with selectedBranchSets := [first, second] }
    selectInternalLocalControl? before (.synchronizeSelected id origin [input] output key) =
        some
          { operation := .synchronizeSelected id origin [input] output key
            tokens := { owner, consumed := [input], produced := [output] }
            selectedBranch := .remove first, branchResult := some (.selectedJoin first) } ∧
      selectInternalLocalControl? after (.synchronizeSelected id origin [input] output key) = none := by
  simp [selectInternalLocalControl?, selectedBranchJoinReady, selectedInputOwnedReady,
    different, Ne.symm different]

end BpmnSemantics.SemanticProcess.InternalCommutation
