import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalDependencies
import BpmnSemantics.SemanticProcess.InternalRegionalReturnQuiescence
import BpmnSemantics.SemanticProcess.InternalRegionalErrorPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionOpenProjection
import BpmnSemantics.SemanticProcess.InternalRegionalActivityRemoval
import BpmnSemantics.SemanticProcess.InternalRegionalTerminationPositionPublication

/-! Regional execution preserves observations outside its predecessor-selected removal region.
Filtering retains exact order and multiplicity, as required by complete local-control preparation. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regional_filter_retained {α : Type} (values : List α) (keep observe : α → Bool)
    (retained : ∀ value ∈ values, observe value = true → keep value = true) :
    (values.filter keep).filter observe = values.filter observe := by
  rw [List.filter_filter]
  apply List.filter_congr
  intro value member
  cases seen : observe value with
  | false => simp
  | true => simp [retained value member seen]

theorem regional_cancellation_control_filters (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (disposition : SelectedScopeDisposition)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? before root = some region)
    (scopeRead : RuntimeScopeOccurrence → Bool) (tokenRead : ControlToken → Bool)
    (branchRead : SelectedBranchSet → Bool)
    (scopes : ∀ scope ∈ before.scopeOccurrences, scopeRead scope = true → region.contains scope.id = false)
    (tokens : ∀ token ∈ before.tokens, tokenRead token = true → region.contains token.owner = false)
    (branches : ∀ branch ∈ before.selectedBranchSets, branchRead branch = true → region.contains branch.owner = false) :
    (cancelScopeSubtree before root disposition).scopeOccurrences.filter scopeRead = before.scopeOccurrences.filter scopeRead ∧
      (cancelScopeSubtree before root disposition).tokens.filter tokenRead = before.tokens.filter tokenRead ∧
      (cancelScopeSubtree before root disposition).selectedBranchSets.filter branchRead = before.selectedBranchSets.filter branchRead := by
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have scopeFields := cancelScopeSubtree_scopes_eq_prepared_region program before hosting hosting
    position running root region derived disposition
  have tokenFields := cancelScopeSubtree_tokens_eq_prepared_region program before hosting hosting
    position running root region derived disposition
  have branchFields := (cancelScopeSubtree_owned_work_eq_prepared_region program before hosting hosting
    valid running root region derived disposition).2.2.2.1
  rw [scopeFields, tokenFields, branchFields]
  refine ⟨?_, ?_, ?_⟩
  · cases disposition <;> apply regional_filter_retained <;>
      intro scope member seen <;> simp [scopes scope member seen]
  · apply regional_filter_retained
    intro token member seen
    simp [tokens token member seen]
  · apply regional_filter_retained
    intro branch member seen
    simp [branches branch member seen]

theorem regional_completion_control_fields (program : Program) (before after : RuntimeState)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (result : completeBoundedScope? program before definition output = some after) :
    after.logicalTimeMs = before.logicalTimeMs ∧ after.variables.process = before.variables.process ∧
      after.selectedBranchSets = before.selectedBranchSets := by
  have ordinaryFields (completed : RuntimeState)
      (ordinary : completeScopeState? before definition output = some completed) :
      completed.logicalTimeMs = before.logicalTimeMs ∧ completed.variables.process = before.variables.process ∧
        completed.selectedBranchSets = before.selectedBranchSets := by
    unfold completeScopeState? at ordinary
    split at ordinary
    · split at ordinary
      · simp at ordinary
      · unfold completeQuiescentScope? at ordinary
        repeat' split at ordinary
        all_goals first
          | (simp at ordinary; done)
          | (simp only [Option.some.injEq] at ordinary; subst completed; exact ⟨rfl, rfl, rfl⟩)
    · simp at ordinary
  unfold completeBoundedScope? at result
  cases ordinary : completeScopeState? before definition output with
  | none => simp [ordinary] at result
  | some completed =>
      simp only [ordinary] at result
      repeat' split at result
      all_goals first
        | (simp at result; done)
        | (simp only [Option.some.injEq] at result; subst after; exact ordinaryFields completed ordinary)

theorem regional_footprint_base (state : RuntimeState) (hosting : SemanticId)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (running : state.control = .running hosting)
    (found : regionalStateFootprint? state selected region = some footprint) :
    ∃ base, regionalBaseFootprint? state hosting selected region = some base ∧
      ∀ atom ∈ base.writes, atom ∈ footprint.writes := by
  have original := found
  simp only [regionalStateFootprint?, runningInstance?, running, Option.bind_eq_bind,
    Option.bind_some] at found
  obtain ⟨base, baseFound, _⟩ := Option.bind_eq_some_iff.mp found
  exact ⟨base, baseFound, regionalStateFootprint_base_write state selected region footprint base hosting
    running original baseFound⟩

/-- Exact observation filters survive a prepared regional step when its predecessor footprint
excludes their removals and continuations. Root completion is excluded by its control write. -/
theorem preparedRegional_control_filters (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (scopeRead : RuntimeScopeOccurrence → Bool) (tokenRead : ControlToken → Bool)
    (branchRead : SelectedBranchSet → Bool)
    (scopes : ∀ scope ∈ before.scopeOccurrences, scopeRead scope = true → prepared.region.contains scope.id = false)
    (tokens : ∀ token ∈ before.tokens, tokenRead token = true → prepared.region.contains token.owner = false)
    (branches : ∀ branch ∈ before.selectedBranchSets, branchRead branch = true → prepared.region.contains branch.owner = false)
    (continuations : ∀ owner output, .ordinary (.controlToken owner output) ∈ prepared.footprint.writes →
      .ordinary (.tokenOwners output) ∈ prepared.footprint.writes →
      tokenRead { placeId := output, owner } = false)
    (control : .ordinary (.runtimeControl hosting) ∉ prepared.footprint.writes) :
    after.control = before.control ∧ after.logicalTimeMs = before.logicalTimeMs ∧
      after.variables.process = before.variables.process ∧
      after.scopeOccurrences.filter scopeRead = before.scopeOccurrences.filter scopeRead ∧
      after.tokens.filter tokenRead = before.tokens.filter tokenRead ∧
      after.selectedBranchSets.filter branchRead = before.selectedBranchSets.filter branchRead := by
  obtain ⟨snapshots, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection closed).1
  have operationEq := regionalSelection_operation program before operation prepared.selection selected
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before operation prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before hosting
    prepared.selection prepared.region prepared.footprint running footprint
  have rootInside : prepared.region.contains prepared.selection.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec before _ _ derived).2.1
  have scopeFilter : (before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ prepared.selection.root.id))).filter scopeRead =
      before.scopeOccurrences.filter scopeRead := by
    apply regional_filter_retained
    intro scope member seen
    apply decide_eq_true
    intro same
    have outside := scopes scope member seen
    rw [same, rootInside] at outside
    contradiction
  cases operation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApply, kind, rootEq, _, _, _, update,
        scopeFields, _, _, _, _, _, _, branchFields, _, _⟩ :=
        preparedReturn_quiescent_fields program before hosting id origin process definition output prepared valid found
      have same : returned = after := Option.some.inj (returnedApply.symm.trans applied)
      rw [same] at update scopeFields branchFields
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have rejected := continuations record.caller output (baseWrites _ (by simp))
        (baseWrites _ (List.mem_append_left _ (regionalCensusWrites_contains_continuation before prepared.region [output] output (by simp))))
      refine ⟨?_, ?_, ?_, ?_, ?_, congrArg (List.filter branchRead) branchFields⟩
      · rw [update]; rfl
      · rw [update]; rfl
      · rw [update]; rfl
      · rw [scopeFields, rootEq]; exact scopeFilter
      · rw [update]
        exact filter_canonicalInsertBy_rejected _ tokenRead _ _ rejected
  | completeScope id origin definition output =>
      obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition output
        prepared.selection selected
      have raw : completeBoundedScope? program before definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨ordinary, completed, controlFields, scopeFields, _, tokenFields⟩ :=
        completeBoundedScope_position_fields program before after definition output raw
      have update := (completeScopeState_selected_update before ordinary definition output
        prepared.selection.root census completed).2
      obtain ⟨time, processFields, branchFields⟩ := regional_completion_control_fields program before after definition output raw
      cases parent : prepared.selection.root.parent with
      | none =>
        cases output with
        | none =>
          simp only [regionalBaseFootprint?, operationEq, kind, parent] at baseFound
          cases baseFound
          exact False.elim (control (baseWrites _ (by simp)))
        | some output => simp [parent, running] at update
      | some owner =>
        cases output with
        | none => simp [parent, running] at update
        | some output =>
          simp only [parent, running] at update
          split at update
          · cases update
            simp only [regionalBaseFootprint?, operationEq, kind, parent] at baseFound
            cases baseFound
            have rejected := continuations owner output (baseWrites _ (by simp)) (baseWrites _ (by simp))
            refine ⟨controlFields.trans running.symm, time, processFields, ?_, ?_, congrArg (List.filter branchRead) branchFields⟩
            · rw [scopeFields]; exact scopeFilter
            · rw [tokenFields]
              exact filter_canonicalInsertBy_rejected _ tokenRead _ _ rejected
          · contradiction
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨parent, kind, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler prepared.selection selected raw
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have rejected := continuations parent handler.output (baseWrites _ (by simp))
        (baseWrites _ (List.mem_append_left _ (regionalCensusWrites_contains_continuation before prepared.region [handler.output] handler.output (by simp))))
      obtain ⟨scopeFields, tokenFields, branchFields⟩ := regional_cancellation_control_filters program before hosting
        prepared.selection.root.id prepared.region .remove valid running derived scopeRead tokenRead branchRead scopes tokens branches
      rw [update]
      refine ⟨rfl, rfl, rfl, scopeFields, ?_, branchFields⟩
      change (addToken _ handler.output parent).filter tokenRead = _
      rw [show (addToken (cancelScopeSubtree before prepared.selection.root.id .remove).tokens handler.output parent).filter tokenRead =
        (cancelScopeSubtree before prepared.selection.root.id .remove).tokens.filter tokenRead from
          filter_canonicalInsertBy_rejected _ tokenRead _ _ rejected]
      exact tokenFields
  | terminateScope id origin input definition =>
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨chosen, _⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selected
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      obtain ⟨scopeFields, tokenFields, branchFields⟩ := regional_cancellation_control_filters program before hosting
        prepared.selection.root.id prepared.region .retain valid running derived scopeRead tokenRead branchRead scopes tokens branches
      exact ⟨rfl, rfl, rfl, scopeFields, tokenFields, branchFields⟩
  | _ =>
      simp [selectInternalRegional?] at selected

end BpmnSemantics.SemanticProcess.InternalCommutation
