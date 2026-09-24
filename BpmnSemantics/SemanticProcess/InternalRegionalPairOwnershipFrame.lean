import BpmnSemantics.SemanticProcess.InternalRegionalPairRegionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationFrames
import BpmnSemantics.SemanticProcess.InternalRegionalArmingRetention

/-! Regional ownership checks depend on the retained scope and Call graph, including historical identities. Exact classifier frames preserve the existing ownership-closure guards after independent removal. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- The exact retained graph preserves cancellation ownership even for historical IDs.
The two traversals retain their own successor population bounds. -/
theorem regional_pair_cancellation_classifiers (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    (∀ owner, occurrenceInSubtree after.scopeOccurrences right.selection.root.id owner =
      occurrenceInSubtree before.scopeOccurrences right.selection.root.id owner) ∧
    (∀ instanceId, (calledInstanceClosure after right.selection.root.id).contains instanceId =
      (calledInstanceClosure before right.selection.root.id).contains instanceId) := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have leftFootprint := leftFacts.2.2.2.2.2.1
  have rightFootprint := rightFacts.2.2.2.2.2.1
  have derived := rightFacts.2.2.2.2.1
  have spec := deriveInternalOccurrenceRegion_spec before _ _ derived
  have graph := (deriveInternalOccurrenceRegion_success before _ _ derived).1
  have disjoint := regional_pair_regions_disjoint before left.selection right.selection left.region right.region
    left.footprint right.footprint leftFootprint rightFootprint independent
  have outside (owner : ScopeOccurrenceId) (member : owner ∈ right.region.members) : left.region.contains owner = false := by
    apply Bool.eq_false_iff.mpr
    intro inside
    exact disjoint owner (List.contains_iff_mem.mp inside) member
  have noControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  obtain ⟨keepScope, keepCall, scopes, calls, scopeSurvives, callSurvives⟩ :=
    preparedRegional_graph_filters program before after hosting leftOperation left valid running leftFound applied noControl
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  obtain ⟨actual, actualApplied, actualValid⟩ := preparedRegional_preserves_runtimeStateWellFormed
    program before hosting leftOperation left valid leftFound
  have same : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  have afterRunning := (regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied).1.trans running
  have afterPosition : runtimePositionValid program hosting after = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at actualValid
    exact actualValid.1
  have unique := runtimePositionValid_scope_ids_nodup program hosting hosting before position running
  have parents := runtimePositionValid_scope_parents_live program hosting hosting before position running
  have afterParents := runtimePositionValid_scope_parents_live program hosting hosting after afterPosition afterRunning
  have subtree (owner : ScopeOccurrenceId) : occurrenceInSubtree after.scopeOccurrences right.selection.root.id owner =
      occurrenceInSubtree before.scopeOccurrences right.selection.root.id owner := by
    rw [scopes]
    apply occurrenceInSubtree_filter before.scopeOccurrences unique parents keepScope
      (by simpa only [scopes] using afterParents) right.selection.root.id owner
    intro occurrence member parent edge ancestry
    have childAncestry : ScopeAncestry before.scopeOccurrences right.selection.root.id occurrence.id :=
      .child ancestry ⟨occurrence, member, edge, rfl⟩
    have childSelected := (occurrenceInSubtree_iff_ancestry before.scopeOccurrences unique parents
      right.selection.root.id occurrence.id).mpr childAncestry
    have childInside := (regional_cancellation_membership program before hosting hosting position running
      right.selection.root.id right.region derived occurrence.id (List.mem_map.mpr ⟨occurrence, member, rfl⟩)).mpr
        (.inl childSelected)
    exact scopeSurvives occurrence member (outside _ childInside)
  have survives (record : CalledProcessOccurrence) (member : record ∈ before.calledProcessOccurrences)
      (selected : occurrenceInSubtree before.scopeOccurrences right.selection.root.id record.caller = true ∨
        record.caller.processInstanceId ∈ calledInstanceClosure before right.selection.root.id) : keepCall record = true := by
    have endpoints := exact_graph_call_endpoints_live before graph record member
    have caller := (regional_cancellation_membership program before hosting hosting position running
      right.selection.root.id right.region derived record.caller endpoints.1).mpr selected
    have target := spec.2.2.2.2.1 record.caller caller record.calledRoot (.inr ⟨record, member, rfl, rfl⟩)
    exact callSurvives record member (outside _ caller) (outside _ target)
  refine ⟨subtree, ?_⟩
  intro instanceId
  apply Bool.eq_iff_iff.mpr
  simpa only [List.contains_iff_mem] using calledInstanceClosure_of_graph_frame before after
    right.selection.root.id keepCall calls
    (calledProcessAssociationsValid_called_instances_nodup before hosting running
      (runtimePositionValid_called_associations program hosting hosting before position running))
    subtree (fun record member selected => survives record member (.inl selected))
    (fun record member selected => survives record member (.inr selected)) instanceId

theorem regional_pair_call_closure (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (parentless : right.selection.root.parent = none) :
    ∀ instanceId, (processInstanceClosureWithin after.calledProcessOccurrences
      [right.selection.root.id.processInstanceId] (after.calledProcessOccurrences.length + 1)).contains instanceId =
      (processInstanceClosureWithin before.calledProcessOccurrences
        [right.selection.root.id.processInstanceId] (before.calledProcessOccurrences.length + 1)).contains instanceId := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have leftFootprint := leftFacts.2.2.2.2.2.1
  have rightFootprint := rightFacts.2.2.2.2.2.1
  have disjoint := regional_pair_regions_disjoint before left.selection right.selection left.region right.region
    left.footprint right.footprint leftFootprint rightFootprint independent
  have noControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  obtain ⟨keepScope, keepCall, _, calls, _, callSurvives⟩ :=
    preparedRegional_graph_filters program before after hosting leftOperation left valid running leftFound applied noControl
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have rightSelection := (ownershipClosedSelection_facts program before rightOperation right.selection rightFacts.2.2.2.1).1
  have rootLive := regionalSelection_root_member program before rightOperation right.selection rightSelection
  intro instanceId
  rw [calls]
  apply Bool.eq_iff_iff.mpr
  simp only [List.contains_iff_mem]
  apply processInstanceClosureWithin_filter _ _ (by simp)
  intro record member reachable
  obtain ⟨callerOutside, targetOutside⟩ := cancellation_disjoint_reachable_call_endpoints program before hosting hosting
    position running left.selection.root.id left.region leftFacts.2.2.2.2.1 right.selection.root right.region
    rightFacts.2.2.2.2.1 rootLive parentless disjoint record member reachable
  apply callSurvives record member
  · simp [InternalOccurrenceRegion.contains, callerOutside]
  · simp [InternalOccurrenceRegion.contains, targetOutside]

theorem regional_pair_owner_retention (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    (regionalSelectionReferenceRetention after right.selection).scope =
        (regionalSelectionReferenceRetention before right.selection).scope ∧
      (regionalSelectionReferenceRetention after right.selection).activity =
        (regionalSelectionReferenceRetention before right.selection).activity := by
  obtain ⟨subtree, called⟩ := regional_pair_cancellation_classifiers program before after hosting leftOperation rightOperation
    left right valid running leftFound rightFound independent applied
  cases kind : right.selection.kind with
  | returning record =>
      have selected := (ownershipClosedSelection_facts program before rightOperation right.selection
        (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.1).1
      obtain ⟨binding, parentless⟩ := regionalSelection_return_root program before rightOperation right.selection record selected kind
      have closure := regional_pair_call_closure program before after hosting leftOperation rightOperation left right
        valid running leftFound rightFound independent applied parentless
      simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention, ← binding, closure, and_self]
  | completing choice =>
      cases choice <;> simp only [regionalSelectionReferenceRetention, kind, and_self]
  | interrupting parent =>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention, subtree, called, and_self]
  | terminating =>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention, subtree, called, and_self]

/-- ESL-RETAIN-01 changes actual withdrawals, while the existing region read still protects
all Activity endpoints in that region. This frames either explicit root disposition. -/
theorem regional_pair_cancellation_activity_frame (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (retainedRoot : Option ScopeOccurrenceId) :
    withdrawnByRegion (fun owner => occurrenceInSubtree after.scopeOccurrences right.selection.root.id owner ||
        (calledInstanceClosure after right.selection.root.id).contains owner.processInstanceId)
      after.activityOccurrences retainedRoot =
    withdrawnByRegion (fun owner => occurrenceInSubtree before.scopeOccurrences right.selection.root.id owner ||
        (calledInstanceClosure before right.selection.root.id).contains owner.processInstanceId)
      before.activityOccurrences retainedRoot := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have selected := (ownershipClosedSelection_facts program before leftOperation left.selection leftFacts.2.2.2.1).1
  have identities : waitIdentitiesUnique before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    simp_all only
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before leftOperation left leftFound
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  have fields := regionalSelection_reference_fields program before after leftOperation left.selection
    leftFacts.1 identities selected fired
  have classifiers := regional_pair_cancellation_classifiers program before after hosting leftOperation rightOperation
    left right valid running leftFound rightFound independent applied
  simp only [withdrawnByRegion, classifiers.1, classifiers.2, fields.2.1, List.filter_filter]
  apply List.filter_congr
  intro record member
  let cancelled := fun owner => occurrenceInSubtree before.scopeOccurrences right.selection.root.id owner ||
    (calledInstanceClosure before right.selection.root.id).contains owner.processInstanceId
  cases withdrawn : recordInRegion cancelled record retainedRoot with
  | false => simp only [Bool.false_and]
  | true =>
    have full : recordInRegion cancelled record = true := by
      cases ownerInside : cancelled record.owner with
      | true => simp [recordInRegion, ownerInside]
      | false =>
        cases body : record.body with
        | userTask _ | parallelUserTasks _ _ => simp [recordInRegion, ownerInside, body] at withdrawn
        | childScope child =>
          have inside := withdrawn
          simp only [recordInRegion, ownerInside, body, Bool.false_or, Bool.and_eq_true] at inside
          simpa [recordInRegion, ownerInside, body] using inside.1
    have regionMask := regional_activity_record_mask program before hosting hosting valid running
      right.selection.root.id right.region rightFacts.2.2.2.2.1 record member
    have regionInside : recordInRegion right.region.contains record = true := regionMask.symm.trans full
    have kept : (regionalSelectionReferenceRetention before left.selection).activity record = true := by
      cases keep : (regionalSelectionReferenceRetention before left.selection).activity record with
      | true => rfl
      | false =>
        have written := regionalStateFootprint_protects_withdrawn_activity before left.selection left.region
          left.footprint record member keep leftFacts.2.2.2.2.2.1
        have read := regionalStateFootprint_region_read before right.selection right.region right.footprint
          rightFacts.2.2.2.2.2.1
        have separated := regional_independent_write_read right.footprint left.footprint
          (regionalStateFootprintsIndependent_symmetric _ _ independent) _ _ written read
        have conflict : regionalStateAtomsConflict (.activityAssociation record) (.occurrenceRegion right.region) = true := by
          cases body : record.body <;>
            simpa [regionalStateAtomsConflict, regionalOwnsAtom, recordInRegion, body] using regionInside
        rw [conflict] at separated
        contradiction
    simp only [kept, Bool.and_self]

private theorem cancellation_local_data_closed (state : RuntimeState) (selected : InternalRegionalSelection)
    (global : regionalRetainedLocalDataClosed state (fun _ => true) (fun _ => true) = true)
    (cancelling : selected.kind = .terminating ∨ ∃ parent, selected.kind = .interrupting parent) :
    regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
      (regionalSelectionLocalDataRetention state selected) = true := by
  apply List.all_eq_true.mpr
  intro scope member
  cases retained : regionalSelectionLocalDataRetention state selected scope with
  | false => simp only [Bool.not_false, ↓reduceIte]
  | true =>
      cases tagged : scope.owner with
      | effectOccurrence id => simp only [Bool.not_true, Bool.false_eq_true, ↓reduceIte]
      | activityOccurrence id =>
          obtain ⟨record, census, _⟩ := regionalRetainedLocalDataClosed_owner state (fun _ => true) (fun _ => true)
            global scope member rfl id tagged
          have present : record ∈ state.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) := by
            rw [census]; simp
          obtain ⟨recordMember, named⟩ := List.mem_filter.mp present
          have kept : (regionalSelectionReferenceRetention state selected).activity record = true := by
            cases activityKept : (regionalSelectionReferenceRetention state selected).activity record with
            | true => rfl
            | false =>
                let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
                  (calledInstanceClosure state selected.root.id).contains owner.processInstanceId
                let retainedRoot := match selected.kind with | .terminating => some selected.root.id | _ => none
                have removed : recordInRegion cancelled record retainedRoot = true := by
                  rcases cancelling with kind | ⟨parent, kind⟩ <;>
                    simpa [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention, cancelled, retainedRoot, retainedCancellationRoot, kind] using activityKept
                have matching : (withdrawnByRegion cancelled state.activityOccurrences retainedRoot).any
                    (regionalLocalScopeNamesActivity scope) = true :=
                  List.any_eq_true.mpr ⟨record, List.mem_filter.mpr ⟨recordMember, removed⟩, named⟩
                dsimp only [cancelled, retainedRoot] at matching
                rcases cancelling with kind | ⟨parent, kind⟩ <;>
                  simp only [kind] at matching <;>
                  simp only [regionalSelectionLocalDataRetention, kind, retainedCancellationRoot, matching, Bool.not_true,
                    Bool.and_false, Bool.false_and, Bool.false_eq_true] at retained
          simp only [Bool.not_true, Bool.false_eq_true, ↓reduceIte, census, kept]

/-- Both preparations close references before execution. Their actual retention filters and
re-derived ownership classifiers preserve those same three guards in the successor. -/
theorem prepareInternalRegional_ownership_after_independent_regional
    (program : Program) (before after : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    regionalOwnershipClosed after (regionalSelectionReferenceRetention after right.selection) = true ∧
      regionalRetainedLocalDataClosed after (regionalSelectionReferenceRetention after right.selection).activity
        (regionalSelectionLocalDataRetention after right.selection) = true ∧
      regionalActivityOwnersClosed after (regionalSelectionReferenceRetention after right.selection) = true := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  obtain ⟨leftSelection, leftReferences⟩ := ownershipClosedSelection_facts program before leftOperation
    left.selection leftFacts.2.2.2.1
  obtain ⟨rightSelection, rightReferences⟩ := ownershipClosedSelection_facts program before rightOperation
    right.selection rightFacts.2.2.2.1
  have leftLocal := ownershipClosedSelection_local_data program before leftOperation left.selection leftFacts.2.2.2.1
  have rightLocal := ownershipClosedSelection_local_data program before rightOperation right.selection rightFacts.2.2.2.1
  have rightOwners := ownershipClosedSelection_activity_owners program before rightOperation right.selection rightFacts.2.2.2.1
  have identities : waitIdentitiesUnique before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    simp_all only
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before leftOperation left leftFound
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  obtain ⟨fields, locals⟩ := regionalSelection_retention_fields program before after leftOperation left.selection
    leftFacts.1 identities leftSelection fired
  have fixedReferences := regionalOwnershipClosed_after_filter before after _ _ fields rightReferences
  have fixedLocal := regionalRetainedLocalDataClosed_after_filter before after _ _ _ _ rightLocal leftLocal fields.2.1 locals
  have fixedOwners := regionalActivityOwnersClosed_after_filter before after _ _ rightOwners fields.1 fields.2.1
  have fixed (references : regionalSelectionReferenceRetention after right.selection =
      regionalSelectionReferenceRetention before right.selection)
      (localMask : regionalSelectionLocalDataRetention after right.selection =
        regionalSelectionLocalDataRetention before right.selection) :
      regionalOwnershipClosed after (regionalSelectionReferenceRetention after right.selection) = true ∧
      regionalRetainedLocalDataClosed after (regionalSelectionReferenceRetention after right.selection).activity
        (regionalSelectionLocalDataRetention after right.selection) = true ∧
      regionalActivityOwnersClosed after (regionalSelectionReferenceRetention after right.selection) = true := by
    rw [references, localMask]
    exact ⟨fixedReferences, fixedLocal, fixedOwners⟩
  have cancellation (disposition : SelectedScopeDisposition)
      (beforeMask : regionalSelectionReferenceRetention before right.selection =
        cancellationReferenceRetention before right.selection.root.id disposition)
      (afterMask : regionalSelectionReferenceRetention after right.selection =
        cancellationReferenceRetention after right.selection.root.id disposition)
      (kind : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent) :
      regionalOwnershipClosed after (regionalSelectionReferenceRetention after right.selection) = true ∧
      regionalRetainedLocalDataClosed after (regionalSelectionReferenceRetention after right.selection).activity
        (regionalSelectionLocalDataRetention after right.selection) = true ∧
      regionalActivityOwnersClosed after (regionalSelectionReferenceRetention after right.selection) = true := by
    obtain ⟨subtree, called⟩ := regional_pair_cancellation_classifiers program before after hosting leftOperation rightOperation
      left right valid running leftFound rightFound independent applied
    have ownerFrame (owner : ScopeOccurrenceId) :
        (occurrenceInSubtree after.scopeOccurrences right.selection.root.id owner ||
          (calledInstanceClosure after right.selection.root.id).contains owner.processInstanceId) =
        (occurrenceInSubtree before.scopeOccurrences right.selection.root.id owner ||
          (calledInstanceClosure before right.selection.root.id).contains owner.processInstanceId) := by
      rw [subtree, called]
    have classifier := funext ownerFrame
    refine ⟨?_, ?_, ?_⟩
    · rw [afterMask]
      exact cancellationOwnershipClosed_of_owner_frame before after right.selection.root.id disposition _ fields
        ownerFrame (by simpa only [beforeMask] using rightReferences)
    · exact cancellation_local_data_closed after right.selection
        (regionalRetainedLocalDataClosed_preserves_owners before after _ _ leftLocal fields.2.1 locals) kind
    · have scopeFrame : (cancellationReferenceRetention after right.selection.root.id disposition).scope =
          (cancellationReferenceRetention before right.selection.root.id disposition).scope := by
        funext occurrence
        cases disposition <;> simp only [cancellationReferenceRetention, ownerFrame]
      have activityFrame : (cancellationReferenceRetention after right.selection.root.id disposition).activity =
          (cancellationReferenceRetention before right.selection.root.id disposition).activity := by
        simp only [cancellationReferenceRetention, classifier]
      simpa only [regionalActivityOwnersClosed, afterMask, beforeMask, scopeFrame, activityFrame] using fixedOwners
  cases kind : right.selection.kind with
  | returning record =>
      obtain ⟨binding, parentless⟩ := regionalSelection_return_root program before rightOperation right.selection record rightSelection kind
      have closure := regional_pair_call_closure program before after hosting leftOperation rightOperation left right
        valid running leftFound rightFound independent applied parentless
      apply fixed
      · simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention, ← binding, closure]
      · simp only [regionalSelectionLocalDataRetention, kind, ← binding, closure]
  | completing choice =>
      apply fixed
      · cases choice <;> simp only [regionalSelectionReferenceRetention, kind]
      · simp only [regionalSelectionLocalDataRetention, kind]
  | interrupting parent =>
      exact cancellation .remove (by simp only [regionalSelectionReferenceRetention, kind])
        (by simp only [regionalSelectionReferenceRetention, kind]) (.inr ⟨parent, kind⟩)
  | terminating =>
      exact cancellation .retain (by simp only [regionalSelectionReferenceRetention, kind])
        (by simp only [regionalSelectionReferenceRetention, kind]) (.inl kind)

end BpmnSemantics.SemanticProcess.InternalCommutation
