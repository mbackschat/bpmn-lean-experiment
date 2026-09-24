import BpmnSemantics.SemanticProcess.InternalRegionalPairControlFrame
import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPairPublication
import BpmnSemantics.SemanticProcess.InternalRegionalCallFrames

/-! Each successor traversal uses its own retained graph and fuel. Existing Call-removal laws establish the same derived occurrence region without assuming graph or region equality. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem restricted_graph_exact (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (graph : scopeOwnershipGraphExact before = true)
    (valid : runtimePositionValid program hosting after = true)
    (running : after.control = .running hosting)
    (included : after.scopeOccurrences ⊆ before.scopeOccurrences) :
    scopeOwnershipGraphExact after = true := by
  have unique := runtimePositionValid_scope_ids_nodup program hosting hosting after valid running
  have calls := runtimePositionValid_called_associations program hosting hosting after valid running
  simp only [scopeOwnershipGraphExact, Bool.and_eq_true] at graph ⊢
  refine ⟨⟨decide_eq_true unique, List.all_eq_true.mpr ?_⟩, List.all_eq_true.mpr ?_⟩
  · intro scope member
    have original := List.all_eq_true.mp graph.1.2 scope (included member)
    obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
      program hosting hosting after valid running scope member
    cases parent : scope.parent with
    | none => simp
    | some owner =>
        simp only [parent, Bool.and_eq_true] at original ⊢
        refine ⟨?_, original.2⟩
        rcases binding with ⟨_, absent⟩ | ⟨actual, actualParent, _, _, live⟩
        · simp [parent] at absent
        · have same := Option.some.inj (actualParent.symm.trans parent)
          subst actual
          change ((after.scopeOccurrences.filter fun candidate => decide (candidate.id = owner)).length == 1) = true
          simpa only [exactLiveOccurrence, Bool.beq_eq_decide_eq] using live
  · intro record member
    obtain ⟨⟨caller, callerMember, callerId, _⟩, _⟩ :=
      calledProcessAssociationsValid_parentless_endpoints after calls record member
    have live := (runtimePositionValid_scope_parent_binding program hosting hosting after valid running caller callerMember).1
    refine Bool.and_eq_true_iff.mpr ⟨?_, ?_⟩
    · change ((after.scopeOccurrences.filter fun candidate => decide (candidate.id = record.caller)).length == 1) = true
      simpa only [exactLiveOccurrence, callerId, Bool.beq_eq_decide_eq] using live
    · unfold calledProcessAssociationsValid at calls
      split at calls
      · contradiction
      · split at calls
        · simp only [Bool.and_eq_true, List.all_eq_true] at calls
          have fields := calls.1.1 record member
          simpa only [Bool.decide_and, Bool.decide_eq_true, Bool.beq_eq_decide_eq] using fields.2
        · contradiction

theorem preparedRegional_graph_filters (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (control : .ordinary (.runtimeControl hosting) ∉ prepared.footprint.writes) :
    ∃ keepScope : RuntimeScopeOccurrence → Bool, ∃ keepCall : CalledProcessOccurrence → Bool,
      after.scopeOccurrences = before.scopeOccurrences.filter keepScope ∧
      after.calledProcessOccurrences = before.calledProcessOccurrences.filter keepCall ∧
      (∀ scope ∈ before.scopeOccurrences, prepared.region.contains scope.id = false → keepScope scope = true) ∧
      (∀ record ∈ before.calledProcessOccurrences,
        prepared.region.contains record.caller = false → prepared.region.contains record.calledRoot = false →
        keepCall record = true) := by
  obtain ⟨snapshots, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection closed).1
  have operationEq := regionalSelection_operation program before operation prepared.selection selected
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before operation prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  have inside : prepared.region.contains prepared.selection.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec before _ _ derived).2.1
  have scopeSurvives (scope : RuntimeScopeOccurrence) (outside : prepared.region.contains scope.id = false) :
      decide (scope.id ≠ prepared.selection.root.id) = true := by
    apply decide_eq_true
    intro same
    rw [same, inside] at outside
    contradiction
  cases operation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApply, kind, rootEq, rootLive, parentless, _, update, _⟩ :=
        preparedReturn_quiescent_fields program before hosting id origin process definition output prepared valid found
      have same : returned = after := Option.some.inj (returnedApply.symm.trans applied)
      subst returned
      obtain ⟨chosen, chosenKind, chosenRoot, census⟩ := regionalSelection_return_record program before
        id origin process definition output prepared.selection selected
      have sameRecord : record = chosen := by simpa [kind] using chosenKind
      subst chosen
      have rootId : root.id = record.calledRoot := rootEq.trans chosenRoot
      have rootDerived : deriveInternalOccurrenceRegion? before root.id = some prepared.region := by
        simpa only [rootEq] using derived
      have recordMember : record ∈ before.calledProcessOccurrences := by
        have present : record ∈ before.calledProcessOccurrences.filter (fun candidate =>
            decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) := by
          rw [census]; simp
        exact (List.mem_filter.mp present).1
      have scopes := (removeCalledProcessTree_owned_fields_eq_region program before hosting hosting valid running
        record root rootId rootLive parentless prepared.region rootDerived).1
      have calls := removeCalledProcessTree_calls_eq_region program before hosting hosting valid running
        record root rootId rootLive parentless prepared.region rootDerived
      refine ⟨(fun scope => !prepared.region.contains scope.id),
        (fun candidate => decide (candidate.id ≠ record.id) && !prepared.region.contains candidate.caller &&
          !prepared.region.contains candidate.calledRoot), ?_, ?_, ?_, ?_⟩
      · rw [← same]; exact scopes
      · rw [← same]; exact calls
      · intro scope _ outside; simp [outside]
      · intro candidate member callerOutside targetOutside
        have different : candidate.id ≠ record.id := by
          intro sameId
          have targetId := calledProcessAssociationsValid_same_id_same_target before
            (runtimePositionValid_called_associations program hosting hosting before position running)
            candidate record member recordMember sameId
          have live := scopeOwnershipGraphExact_target_live before
            (deriveInternalOccurrenceRegion_success before _ _ derived).1 candidate.caller candidate.calledRoot
            (.inr ⟨candidate, member, rfl, rfl⟩)
          have mask := regional_called_tree_mask program before hosting hosting position running root prepared.region
            rootDerived rootLive parentless candidate.calledRoot live
          have seed : (processInstanceClosureWithin before.calledProcessOccurrences [root.id.processInstanceId]
              (before.calledProcessOccurrences.length + 1)).contains candidate.calledRoot.processInstanceId = true := by
            apply List.contains_iff_mem.mpr
            rw [targetId, ← rootId]
            exact processInstanceClosureWithin_seed_subset _ _ _ (by simp)
          rw [seed, targetOutside] at mask
          contradiction
        simp [different, callerOutside, targetOutside]
  | completeScope id origin definition output =>
      obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition output
        prepared.selection selected
      have raw : completeSelectedScope? program before definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨ordinary, completed, _, scopes, calls, _⟩ := completeSelectedScope_position_fields program before after definition output raw
      have update := (completeScopeState_selected_update before ordinary definition output prepared.selection.root census completed).2
      obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before hosting prepared.selection prepared.region
        prepared.footprint running footprint
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
                refine ⟨(fun scope => decide (scope.id ≠ prepared.selection.root.id)), (fun _ => true), scopes, ?_, ?_, ?_⟩
                · rw [List.filter_eq_self.mpr (by simp)]
                  exact calls
                · intro scope _ outside; exact scopeSurvives scope outside
                · simp
              · contradiction
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨parent, _, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler prepared.selection selected raw
      refine ⟨(fun scope => !prepared.region.contains scope.id),
        (fun record => !prepared.region.contains record.caller && !prepared.region.contains record.calledRoot),
        ?_, ?_, ?_, ?_⟩
      · rw [update]
        exact cancelScopeSubtree_scopes_eq_prepared_region program before hosting hosting position running _ _ derived .remove
      · rw [update]
        exact cancelScopeSubtree_calls_eq_prepared_region program before hosting hosting position running _ _ derived .remove
      · intro scope _ outside; simp [outside]
      · intro record _ caller target; simp [caller, target]
  | terminateScope id origin input definition =>
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨chosen, _⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selected
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      refine ⟨(fun scope => decide (scope.id = prepared.selection.root.id) || !prepared.region.contains scope.id),
        (fun record => !prepared.region.contains record.caller && !prepared.region.contains record.calledRoot),
        ?_, ?_, ?_, ?_⟩
      · exact cancelScopeSubtree_scopes_eq_prepared_region program before hosting hosting position running _ _ derived .retain
      · exact cancelScopeSubtree_calls_eq_prepared_region program before hosting hosting position running _ _ derived .retain
      · intro scope _ outside; simp [outside]
      · intro record _ caller target; simp [caller, target]
  | _ => simp [selectInternalRegional?] at selected

/-- Independent complete preparations preserve the other operation's literal occurrence region.
The existing restriction law recomputes the closure with the successor's own population fuel. -/
theorem prepareInternalRegional_region_after_independent_regional
    (program : Program) (before after : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    deriveInternalOccurrenceRegion? after right.selection.root.id = some right.region := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have leftRegion := leftFacts.2.2.2.2.1
  have rightRegion := rightFacts.2.2.2.2.1
  have leftFootprint := leftFacts.2.2.2.2.2.1
  have rightFootprint := rightFacts.2.2.2.2.2.1
  have disjoint := regional_pair_regions_disjoint before left.selection right.selection left.region right.region
    left.footprint right.footprint leftFootprint rightFootprint independent
  have noControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  obtain ⟨keepScope, keepCall, scopes, calls, scopesSurvive, callsSurvive⟩ :=
    preparedRegional_graph_filters program before after hosting leftOperation left valid running leftFound applied noControl
  have rightSpec := deriveInternalOccurrenceRegion_spec before _ _ rightRegion
  have outside (owner : ScopeOccurrenceId) (member : owner ∈ right.region.members) : left.region.contains owner = false := by
    apply Bool.eq_false_iff.mpr
    intro inside
    exact disjoint owner (List.contains_iff_mem.mp inside) member
  have childrenSurvive : ∀ occurrence ∈ before.scopeOccurrences, ∀ parent,
      occurrence.parent = some parent → parent ∈ right.region.members → keepScope occurrence = true := by
    intro occurrence member parent parentEq parentMember
    exact scopesSurvive occurrence member (outside occurrence.id
      (rightSpec.2.2.2.2.1 parent parentMember occurrence.id (.inl ⟨occurrence, member, parentEq, rfl⟩)))
  have callSurvives : ∀ record ∈ before.calledProcessOccurrences,
      record.caller ∈ right.region.members → keepCall record = true := by
    intro record member caller
    exact callsSurvive record member (outside record.caller caller)
      (outside record.calledRoot (rightSpec.2.2.2.2.1 record.caller caller record.calledRoot
        (.inr ⟨record, member, rfl, rfl⟩)))
  obtain ⟨actual, actualApplied, afterValid⟩ := preparedRegional_preserves_runtimeStateWellFormed
    program before hosting leftOperation left valid leftFound
  have same : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  have afterRunning := (regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied).1.trans running
  have position : runtimePositionValid program hosting after = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  have graph := restricted_graph_exact program before after hosting
    (deriveInternalOccurrenceRegion_success before _ _ rightRegion).1 position afterRunning
    (by rw [scopes]; exact List.filter_sublist.subset)
  have rootFilter : after.scopeOccurrences.filter (fun scope => decide (scope.id = right.selection.root.id)) =
      before.scopeOccurrences.filter (fun scope => decide (scope.id = right.selection.root.id)) := by
    rw [scopes]
    apply regional_filter_retained
    intro scope member named
    apply scopesSurvive scope member
    rw [of_decide_eq_true named]
    exact outside _ rightSpec.2.1
  obtain ⟨region, derived⟩ : ∃ region, deriveInternalOccurrenceRegion? after right.selection.root.id = some region := by
    unfold deriveInternalOccurrenceRegion? at rightRegion ⊢
    simp only [graph, Bool.not_true, Bool.false_eq_true, ↓reduceIte, rootFilter]
    split at rightRegion
    · contradiction
    · split at rightRegion
      · exact ⟨_, rfl⟩
      · contradiction
  have sameRegion := deriveInternalOccurrenceRegion_filter_eq before after keepScope keepCall scopes calls
    right.selection.root.id right.region region rightRegion derived childrenSurvive callSurvives
  simpa only [sameRegion] using derived

end BpmnSemantics.SemanticProcess.InternalCommutation
