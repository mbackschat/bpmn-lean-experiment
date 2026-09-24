import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalPreparationFrame

/-! Regional selection reads control state, time, and owner censuses. Existing removal frames preserve those reads under regional footprint independence. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem completion_pending_frame (program : Program) (before after : RuntimeState)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (result : completeSelectedScope? program before definition output = some after) :
    after.initiationPending = before.initiationPending := by
  obtain ⟨ordinary, completed, timers, activities, rfl⟩ :=
    completeSelectedScope_ordinary_withdrawal program before after definition output result
  change ordinary.initiationPending = before.initiationPending
  unfold completeScopeState? at completed
  split at completed
  · split at completed
    · simp at completed
    · unfold completeQuiescentScope? at completed
      repeat' split at completed
      all_goals first
        | (simp at completed; done)
        | (simp only [Option.some.injEq] at completed; subst ordinary; rfl)
  · simp at completed

theorem preparedRegional_pending_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after) :
    after.initiationPending = before.initiationPending := by
  obtain ⟨snapshots, _, _, closed, _, _, _⟩ := prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection closed).1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before operation prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  cases operation with
  | returnProcess id origin process definition output =>
      have raw : returnProcessState? before id origin process definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      cases returnProcessState_sound before after id origin process definition output raw
      rfl
  | completeScope id origin definition output =>
      apply completion_pending_frame program before after definition output
      simp only [fire?, snapshots] at fired
      exact fired
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨_, _, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler prepared.selection selected raw
      rw [update]
      rfl
  | terminateScope id origin input definition =>
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have chosen := (regionalSelection_terminate_owner program before id origin input definition prepared.selection selected).1
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      rfl
  | _ => simp [selectInternalRegional?] at selected

/-- Both regional selectors use the same protected control and population queries. The
existing removal law supplies their exact results, including token multiplicity. -/
theorem regional_pair_control_frame (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    after.control = before.control ∧ after.logicalTimeMs = before.logicalTimeMs ∧
      after.variables.process = before.variables.process ∧
      (∀ owner, .ordinary (.scopeOccurrence owner) ∈ right.footprint.reads →
        after.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) =
          before.scopeOccurrences.filter (fun scope => decide (scope.id = owner))) ∧
      (∀ input, .ordinary (.tokenOwners input) ∈ right.footprint.reads →
        after.tokens.filter (fun token => decide (token.placeId = input)) =
          before.tokens.filter (fun token => decide (token.placeId = input))) := by
  have leftFootprint := (prepareInternalRegional_facts program before leftOperation left leftFound).2.2.2.2.2.1
  have rightFootprint := (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.2.2.1
  have noControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  have unchanged := preparedRegional_control_filters program before after hosting leftOperation left
    valid running leftFound applied (fun _ => false) (fun _ => false) (fun _ => false)
    (by simp) (by simp) (by simp) (by simp) noControl
  refine ⟨unchanged.1, unchanged.2.1, unchanged.2.2.1, ?_, ?_⟩
  · intro owner read
    have outside := regional_pair_read_owner_outside before left.selection left.region left.footprint right.footprint
      leftFootprint independent owner read
    have frame := preparedRegional_control_filters program before after hosting leftOperation left
      valid running leftFound applied (fun scope => decide (scope.id = owner)) (fun _ => false) (fun _ => false)
      (by
        intro scope _ named
        simpa only [of_decide_eq_true named] using outside)
      (by simp) (by simp) (by simp) noControl
    exact frame.2.2.2.1
  · intro input read
    have untouched := regional_pair_read_key_not_written _ _ independent _ read
    have removed := (preparedRegional_removed_censuses program before leftOperation left leftFound).1
    have frame := preparedRegional_control_filters program before after hosting leftOperation left
      valid running leftFound applied (fun _ => false) (fun token => decide (token.placeId = input)) (fun _ => false)
      (by simp)
      (by
        intro token member named
        have place := of_decide_eq_true named
        apply Bool.eq_false_iff.mpr
        intro inside
        exact untouched (place ▸ removed token member inside))
      (by simp)
      (by
        intro owner output _ written
        apply Bool.eq_false_iff.mpr
        intro named
        have place : output = input := of_decide_eq_true named
        exact untouched (place ▸ written)) noControl
    exact frame.2.2.2.2.1

/-- The other region's complete scope, token and branch populations survive literally.
Footprint recomputation and position publication consume these same filtered lists. -/
theorem regional_pair_region_queries (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    after.scopeOccurrences.filter (fun scope => right.region.contains scope.id) =
        before.scopeOccurrences.filter (fun scope => right.region.contains scope.id) ∧
      after.tokens.filter (fun token => right.region.contains token.owner) =
        before.tokens.filter (fun token => right.region.contains token.owner) ∧
      after.selectedBranchSets.filter (fun branch => right.region.contains branch.owner) =
        before.selectedBranchSets.filter (fun branch => right.region.contains branch.owner) := by
  have leftFootprint := (prepareInternalRegional_facts program before leftOperation left leftFound).2.2.2.2.2.1
  have rightFootprint := (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.2.2.1
  have disjoint := regional_pair_regions_disjoint before left.selection right.selection left.region right.region
    left.footprint right.footprint leftFootprint rightFootprint independent
  have outside (owner : ScopeOccurrenceId) (inside : right.region.contains owner = true) :
      left.region.contains owner = false := by
    apply Bool.eq_false_iff.mpr
    intro leftInside
    exact disjoint owner (List.contains_iff_mem.mp leftInside) (List.contains_iff_mem.mp inside)
  have noControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  have frame := preparedRegional_control_filters program before after hosting leftOperation left
    valid running leftFound applied (fun scope => right.region.contains scope.id)
    (fun token => right.region.contains token.owner) (fun branch => right.region.contains branch.owner)
    (fun scope _ seen => outside scope.id seen)
    (fun token _ seen => outside token.owner seen)
    (fun branch _ seen => outside branch.owner seen)
    (by
      intro owner output written _
      have separated := regional_independent_read_write _ _ independent _ _ written
        (regionalStateFootprint_region_read before right.selection right.region right.footprint rightFootprint)
      simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using separated)
    noControl
  exact frame.2.2.2

end BpmnSemantics.SemanticProcess.InternalCommutation
