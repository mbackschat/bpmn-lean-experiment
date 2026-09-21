import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies
import BpmnSemantics.SemanticProcess.InternalScopeCreationFootprintFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationRuntimeValidity

/-! Scope insertion adds a parent edge or a Call edge. The regional read footprint protects their source as well as their fresh destination, so an independent insertion cannot enlarge the selected occurrence region. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeCreation_regional_outside (state : RuntimeState)
    (regional : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (creation : InternalScopeCreationSelection)
    (hosting : SemanticId) (ownerRecord : RuntimeScopeOccurrence)
    (found : regionalStateFootprint? state regional region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint creation.owner
        (internalScopeCreationStateFootprint creation hosting ownerRecord)) = true) :
    region.contains creation.owner = false ∧ region.contains creation.created.id = false ∧
      creation.created.parent.any region.contains = false ∧
      (∀ record, creation.kind = .called record → region.ownsCall record = false) := by
  have regionRead := regionalStateFootprint_region_read state regional region footprint found
  have separate (atom : InternalStateAtom)
      (written : atom ∈ (internalScopeCreationStateFootprint creation hosting ownerRecord).writes) :
      regionalStateAtomsConflict (liftRegionalStateAtom creation.owner atom) (.occurrenceRegion region) = false :=
    regional_independent_write_read _ _ independent _ _
      (List.mem_map.mpr ⟨atom, written, rfl⟩) regionRead
  have owner := separate _ (scopeCreation_token_write creation hosting ownerRecord
    { placeId := creation.input, owner := creation.owner } (by simp))
  have parent := separate (.scopeParent creation.created.id creation.created.parent)
    (scopeCreation_creation_write creation hosting ownerRecord _ (by simp [internalScopeCreationCreationAtoms]))
  have outside : region.contains creation.created.id = false ∧
      creation.created.parent.any region.contains = false := by
    simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using parent
  refine ⟨?_, outside.1, outside.2, ?_⟩
  · simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using owner
  · intro record kind
    have edge := separate (.callAssociation record)
      (scopeCreation_creation_write creation hosting ownerRecord _ (by simp [internalScopeCreationCreationAtoms, kind]))
    simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using edge

private theorem derived_region_edge_frame (before after : RuntimeState)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (derived : deriveInternalOccurrenceRegion? before root = some region)
    (graph : scopeOwnershipGraphExact after = true)
    (rootCensus : after.scopeOccurrences.filter (fun scope => decide (scope.id = root)) =
      before.scopeOccurrences.filter (fun scope => decide (scope.id = root)))
    (edges : ∀ source ∈ region.members, ∀ target,
      OccurrenceRegionEdge after source target ↔ OccurrenceRegionEdge before source target) :
    deriveInternalOccurrenceRegion? after root = some region := by
  obtain ⟨next, nextDerived⟩ : ∃ next, deriveInternalOccurrenceRegion? after root = some next := by
    unfold deriveInternalOccurrenceRegion? at derived ⊢
    simp only [graph, Bool.not_true, Bool.false_eq_true, ↓reduceIte, rootCensus]
    split at derived
    · contradiction
    · split at derived
      · exact ⟨_, rfl⟩
      · contradiction
  have original := deriveInternalOccurrenceRegion_spec before root region derived
  have successor := deriveInternalOccurrenceRegion_spec after root next nextDerived
  have included : next.members ⊆ region.members :=
    successor.2.2.2.2.2 (fun owner => owner ∈ region.members) original.2.1
      (fun source target member edge => original.2.2.2.2.1 source member target
        ((edges source member target).mp edge))
  have retained : region.members ⊆ next.members := by
    have both := original.2.2.2.2.2 (fun owner => owner ∈ region.members ∧ owner ∈ next.members)
      ⟨original.2.1, successor.2.1⟩ (by
        intro source target members edge
        exact ⟨original.2.2.2.2.1 source members.1 target edge,
          successor.2.2.2.2.1 source members.2 target ((edges source members.1 target).mpr edge)⟩)
    exact fun _ member => (both _ member).2
  have beforeMembers := (deriveInternalOccurrenceRegion_success before root region derived).2.2.2
  have afterMembers := (deriveInternalOccurrenceRegion_success after root next nextDerived).2.2.2
  have equalMembers : next.members = region.members := by
    rw [afterMembers, beforeMembers]
    apply occurrenceRegionMembersWithin_eq_of_mem
    intro value
    rw [← afterMembers, ← beforeMembers]
    exact ⟨fun member => included member, fun member => retained member⟩
  have equalRoots : next.root = region.root := successor.1.trans original.1.symm
  have same : next = region := by
    cases next
    cases region
    cases equalRoots
    cases equalMembers
    rfl
  simpa only [same] using nextDerived

theorem scopeCreation_region_edges (state : RuntimeState) (creation : InternalScopeCreationSelection)
    (region : InternalOccurrenceRegion)
    (parentOutside : creation.created.parent.any region.contains = false)
    (callOutside : ∀ record, creation.kind = .called record → region.ownsCall record = false)
    (source : ScopeOccurrenceId) (member : source ∈ region.members) (target : ScopeOccurrenceId) :
    OccurrenceRegionEdge (creation.apply state) source target ↔ OccurrenceRegionEdge state source target := by
  have inside : region.contains source = true := List.contains_iff_mem.mpr member
  have scopes : (creation.apply state).scopeOccurrences = insertScopeOccurrence creation.created state.scopeOccurrences := by
    cases kind : creation.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have parentDifferent : creation.created.parent ≠ some source := by
    intro same
    simp [same, inside] at parentOutside
  have childEdges : (∃ scope ∈ (creation.apply state).scopeOccurrences, scope.parent = some source ∧ scope.id = target) ↔
      ∃ scope ∈ state.scopeOccurrences, scope.parent = some source ∧ scope.id = target := by
    rw [scopes]
    constructor
    · rintro ⟨scope, present, parent, identity⟩
      rcases (mem_insertScopeOccurrence _ _ _).mp present with same | old
      · subst scope; exact False.elim (parentDifferent parent)
      · exact ⟨scope, old, parent, identity⟩
    · rintro ⟨scope, present, parent, identity⟩
      exact ⟨scope, (mem_insertScopeOccurrence _ _ _).mpr (.inr present), parent, identity⟩
  unfold OccurrenceRegionEdge
  rw [childEdges]
  apply or_congr Iff.rfl
  cases kind : creation.kind with
  | child => simp only [InternalScopeCreationSelection.apply, kind]
  | called record =>
      have outside := callOutside record kind
      have different : record.caller ≠ source := by
        intro same
        simp [InternalOccurrenceRegion.ownsCall, same, inside] at outside
      simp only [InternalScopeCreationSelection.apply, kind, (sortCallRecords_perm _).mem_iff, List.mem_cons]
      constructor
      · rintro ⟨candidate, same | old, caller, calledRoot⟩
        · subst candidate; exact False.elim (different caller)
        · exact ⟨candidate, old, caller, calledRoot⟩
      · rintro ⟨candidate, present, caller, calledRoot⟩
        exact ⟨candidate, .inr present, caller, calledRoot⟩

private theorem insertion_graph_exact (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (inserted : RuntimeScopeOccurrence)
    (graph : scopeOwnershipGraphExact before = true)
    (valid : runtimePositionValid program hosting after = true)
    (running : after.control = .running hosting)
    (scopes : after.scopeOccurrences = insertScopeOccurrence inserted before.scopeOccurrences)
    (notSelf : ∀ parent, inserted.parent = some parent → parent ≠ inserted.id) :
    scopeOwnershipGraphExact after = true := by
  have unique := runtimePositionValid_scope_ids_nodup program hosting hosting after valid running
  have calls := runtimePositionValid_called_associations program hosting hosting after valid running
  simp only [scopeOwnershipGraphExact, Bool.and_eq_true] at graph ⊢
  refine ⟨⟨decide_eq_true unique, List.all_eq_true.mpr ?_⟩, List.all_eq_true.mpr ?_⟩
  · intro scope member
    obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
      program hosting hosting after valid running scope member
    cases parent : scope.parent with
    | none => simp
    | some owner =>
        simp only [Bool.and_eq_true]
        refine ⟨?_, ?_⟩
        · rcases binding with ⟨_, absent⟩ | ⟨actual, actualParent, _, _, live⟩
          · simp [parent] at absent
          · have same := Option.some.inj (actualParent.symm.trans parent)
            subst actual
            change ((after.scopeOccurrences.filter fun candidate => decide (candidate.id = owner)).length == 1) = true
            simpa only [exactLiveOccurrence, Bool.beq_eq_decide_eq] using live
        · rw [scopes, mem_insertScopeOccurrence] at member
          rcases member with rfl | old
          · exact decide_eq_true (notSelf owner parent)
          · have previous := List.all_eq_true.mp graph.1.2 scope old
            simp only [parent, Bool.and_eq_true] at previous
            exact previous.2
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

/-- Recompute the region with the enlarged graph's own fuel; independence excludes every new outgoing edge of the original region. -/
theorem prepareInternalRegional_region_after_independent_scopeCreation
    (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    deriveInternalOccurrenceRegion? (creation.selection.apply state) regional.selection.root.id = some regional.region := by
  have afterValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed
    program creation.runtimeInstanceId state creationOperation creation programValid valid creationFound
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, ownerExact, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state creationOperation creation creationFound
  dsimp only [makeInternalScopeCreationPreparation] at afterValid independent ⊢
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have derived := facts.2.2.2.2.1
  have footprint := facts.2.2.2.2.2.1
  have outside := scopeCreation_regional_outside state regional.selection regional.region regional.footprint
    selected hosting ownerRecord footprint independent
  have fresh := selectInternalScopeCreation_fresh state creationOperation selected selection
  have ownerMember : ownerRecord ∈ state.scopeOccurrences := by
    have present : ownerRecord ∈ state.scopeOccurrences.filter (fun scope => decide (scope.id = selected.owner)) := by
      rw [ownerExact]; simp
    exact (List.mem_filter.mp present).1
  have ownerId : ownerRecord.id = selected.owner := scope_identity_of_census state selected.owner ownerRecord ownerExact
  have newParent : selected.created.parent = match selected.kind with
      | .child => some selected.owner | .called _ => none := by
    unfold selectInternalScopeCreation? at selection
    obtain ⟨_, _, selection⟩ := Option.bind_eq_some_iff.mp selection
    cases creationOperation
    all_goals first
      | contradiction
      | obtain ⟨_, _, selection⟩ := Option.bind_eq_some_iff.mp selection
        dsimp only at selection
        repeat first | contradiction | split at selection
        all_goals cases selection <;> rfl
  have scopes : (selected.apply state).scopeOccurrences = insertScopeOccurrence selected.created state.scopeOccurrences := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have afterPosition : runtimePositionValid program hosting (selected.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  have graph := insertion_graph_exact program state (selected.apply state) hosting selected.created
    (deriveInternalOccurrenceRegion_success state _ _ derived).1 afterPosition
    ((scopeCreation_apply_control state selected).trans running) scopes (by
      intro parent parentEq
      cases kind : selected.kind with
      | child =>
          have same : parent = selected.owner := by simpa only [kind, parentEq, Option.some.injEq] using newParent
          subst parent
          simpa only [ownerId] using fresh ownerRecord ownerMember
      | called record => simp [kind, parentEq] at newParent)
  have regionSpec := deriveInternalOccurrenceRegion_spec state _ _ derived
  have rootDifferent : selected.created.id ≠ regional.selection.root.id := by
    intro same
    have inside : regional.region.contains regional.selection.root.id = true := List.contains_iff_mem.mpr regionSpec.2.1
    simp [same, inside] at outside
  exact derived_region_edge_frame state (selected.apply state) regional.selection.root.id regional.region
    derived graph (scopeCreation_apply_scope_filter state selected _ (by simpa using rootDifferent))
    (scopeCreation_region_edges state selected regional.region outside.2.2.1 outside.2.2.2)

end BpmnSemantics.SemanticProcess.InternalCommutation
