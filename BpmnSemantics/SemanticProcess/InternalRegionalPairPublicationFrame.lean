import BpmnSemantics.SemanticProcess.InternalRegionalPairFootprintFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairSelection
import BpmnSemantics.SemanticProcess.InternalRegionalPairLifecycleFrame
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch

/-! A preparation frame must preserve the publication template as well as readiness. Canonical positions and lifecycle populations assemble the unchanged complete regional artifact from predecessor facts. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem projected_scopes_ordered (program : Program) (scopes : List RuntimeScopeOccurrence) :
    orderedBy (fun a b : PublicScopePosition => scopeOwnerBefore a.id b.id) (projectScopes program scopes) = true := by
  induction scopes with
  | nil => rfl
  | cons scope rest ih =>
      rw [projected_cons]
      exact orderedBy_canonicalInsertBy _ (fun a b => scopeOwnerBefore_asymm a.id b.id) _ _ ih

theorem projectScopes_filter_by_id (program : Program) (scopes : List RuntimeScopeOccurrence)
    (keep : ScopeOccurrenceId → Bool) :
    projectScopes program (scopes.filter fun scope => keep scope.id) =
      (projectScopes program scopes).filter (fun position => keep position.id) := by
  induction scopes with
  | nil => rfl
  | cons scope rest ih =>
      rw [projected_cons]
      cases kept : keep scope.id with
      | false =>
          rw [filter_canonicalInsertBy_rejected _ (fun position : PublicScopePosition => keep position.id) _ _ kept]
          simpa only [List.filter_cons, kept, Bool.false_eq_true, ↓reduceIte] using ih
      | true =>
          rw [filter_canonicalInsertBy_retained _ (fun a b c => scopeOwnerBefore_compose a.id b.id c.id)
            _ _ _ (projected_scopes_ordered program rest) kept]
          simp only [List.filter_cons, kept, ↓reduceIte, projected_cons, ih]

/-- Position templates retain the exact sorted payloads in the other operation's region,
including aggregated token multiplicities and the selected completion scope. -/
theorem regionalPositionDelta_after_independent_regional (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    regionalPositionDelta? program right.selection right.region
        { controlTokens := projectTokens program after.tokens, scopes := projectScopes program after.scopeOccurrences } =
      regionalPositionDelta? program right.selection right.region
        { controlTokens := projectTokens program before.tokens, scopes := projectScopes program before.scopeOccurrences } := by
  have queries := regional_pair_region_queries program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied
  have fields := regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied
  have facts := prepareInternalRegional_facts program before rightOperation right rightFound
  have selected := (ownershipClosedSelection_facts program before rightOperation right.selection facts.2.2.2.1).1
  have operation := regionalSelection_operation program before rightOperation right.selection selected
  have tokens : (projectTokens program after.tokens).filter (fun token => right.region.contains token.owner) =
      (projectTokens program before.tokens).filter (fun token => right.region.contains token.owner) := by
    rw [← projectTokens_filter_by_owner, ← projectTokens_filter_by_owner, queries.2.1]
  have scopes : (projectScopes program after.scopeOccurrences).filter (fun scope => right.region.contains scope.id) =
      (projectScopes program before.scopeOccurrences).filter (fun scope => right.region.contains scope.id) := by
    rw [← projectScopes_filter_by_id, ← projectScopes_filter_by_id, queries.1]
  have rootScopes : (projectScopes program after.scopeOccurrences).filter (fun scope => scope.id == right.selection.root.id) =
      (projectScopes program before.scopeOccurrences).filter (fun scope => scope.id == right.selection.root.id) := by
    rw [← projectScopes_filter_by_id program after.scopeOccurrences (fun id => id == right.selection.root.id),
      ← projectScopes_filter_by_id program before.scopeOccurrences (fun id => id == right.selection.root.id)]
    have rootRead := (regionalStateFootprint_root_read before right.selection right.region right.footprint
      facts.2.2.2.2.2.1).1
    have predicate : (fun scope : RuntimeScopeOccurrence => scope.id == right.selection.root.id) =
        (fun scope => decide (scope.id = right.selection.root.id)) := by
      funext scope
      apply Bool.eq_iff_iff.mpr
      simp
    rw [predicate]
    exact congrArg (projectScopes program) (fields.2.2.2.1 right.selection.root.id rootRead)
  cases rightOperation with
  | completeScope id origin definition output =>
      obtain ⟨withdrawal, kind, _⟩ := regionalSelection_complete_census program before id origin definition output
        right.selection selected
      have leftFootprint := (prepareInternalRegional_facts program before leftOperation left leftFound).2.2.2.2.2.1
      have noControl := regional_pair_read_key_not_written _ _
        (regionalStateFootprintsIndependent_symmetric _ _ independent) _
        (regionalStateFootprint_control_read before left.selection left.region left.footprint hosting running leftFootprint)
      obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before hosting right.selection right.region
        right.footprint running facts.2.2.2.2.2.1
      cases parent : right.selection.root.parent with
      | none =>
          cases output with
          | none =>
              simp only [regionalBaseFootprint?, operation, kind, parent] at baseFound
              cases baseFound
              exact False.elim (noControl (baseWrites _ (by simp)))
          | some output => simp [regionalBaseFootprint?, operation, kind, parent] at baseFound
      | some parent => cases output <;> simp only [regionalPositionDelta?, operation, kind, parent, rootScopes]
  | _ => cases kind : right.selection.kind <;> simp only [regionalPositionDelta?, operation, kind, tokens, scopes]

private theorem unique_anchor_count (entries : List OpenSemanticFlowNodeOccurrence)
    (anchor : SemanticFlowNodeOccurrenceAnchor)
    (unique : (entries.map (·.anchor)).Nodup)
    (present : ∃ entry ∈ entries, entry.anchor = anchor) :
    (entries.filter (fun entry => entry.anchor == anchor)).length = 1 := by
  induction entries with
  | nil => simp at present
  | cons entry rest ih =>
      obtain ⟨absent, unique⟩ := List.nodup_cons.mp unique
      by_cases same : entry.anchor = anchor
      · have empty : rest.filter (fun value => value.anchor == anchor) = [] := by
          apply List.filter_eq_nil_iff.mpr
          intro value member kept
          apply absent
          exact List.mem_map.mpr ⟨value, member, (beq_iff_eq.mp kept).trans same.symm⟩
        simp [same, empty]
      · have inRest : ∃ value ∈ rest, value.anchor = anchor := by
          obtain ⟨value, member, named⟩ := present
          rcases List.mem_cons.mp member with rfl | member
          · exact False.elim (same named)
          · exact ⟨value, member, named⟩
        simpa [same] using ih unique inRest

theorem projected_scope_call_census (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (current : List OpenSemanticFlowNodeOccurrence)
    (running : state.control = .running hosting)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    (∀ record ∈ state.calledProcessOccurrences,
      (current.filter (fun entry => entry.anchor == .callActivity record.id)).length = 1) ∧
    (∀ scope ∈ state.scopeOccurrences, scope.parent ≠ none →
      (current.filter (fun entry => entry.anchor == .scope scope.id)).length = 1) := by
  have unique := projectOpenFlowNodeOccurrences_anchor_nodup program state current projected
  simp only [projectOpenFlowNodeOccurrences?, running] at projected
  split at projected
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at projected
    obtain ⟨waits, _, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨scopes, scopesEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨calls, callsEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    split at projected
    · cases projected
      constructor
      · intro record member
        obtain ⟨entry, present, found⟩ := mapM_input_member _ _ calls callsEq record member
        apply unique_anchor_count _ _ unique
        exact ⟨entry, by simp [mem_sortFlowNodeOccurrenceStarts, present], call_start_anchor program state record entry found⟩
      · intro scope member child
        have present : scope ∈ state.scopeOccurrences.filter (fun occurrence => occurrence.parent.isSome) := by
          exact List.mem_filter.mpr ⟨member, by cases parent : scope.parent <;> simp_all⟩
        obtain ⟨entry, present, found⟩ := mapM_input_member _ _ scopes scopesEq scope present
        apply unique_anchor_count _ _ unique
        exact ⟨entry, by simp [mem_sortFlowNodeOccurrenceStarts, present], scope_start_anchor program state scope entry found⟩
    · contradiction

theorem regionalNonCancellingLifecycle_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (current next : List OpenSemanticFlowNodeOccurrence)
    (selectedBefore : selectInternalRegional? program before operation = some selected)
    (selectedAfter : selectInternalRegional? program after operation = some selected)
    (openedBefore : projectOpenFlowNodeOccurrences? program before = some current)
    (openedAfter : projectOpenFlowNodeOccurrences? program after = some next)
    (normal : (∃ record, selected.kind = .returning record) ∨ ∃ withdrawal, selected.kind = .completing withdrawal) :
    regionalLifecycleTemplate? program after selected region next =
      regionalLifecycleTemplate? program before selected region current := by
  obtain ⟨hostingBefore, runningBefore⟩ := regionalSelection_running program before operation selected selectedBefore
  obtain ⟨hostingAfter, runningAfter⟩ := regionalSelection_running program after operation selected selectedAfter
  have beforeCensus := projected_scope_call_census program before hostingBefore current runningBefore openedBefore
  have afterCensus := projected_scope_call_census program after hostingAfter next runningAfter openedAfter
  rcases normal with ⟨record, kind⟩ | ⟨withdrawal, kind⟩
  · have oldCount := beforeCensus.1 record (returning_record_member program before operation selected record selectedBefore kind)
    have newCount := afterCensus.1 record (returning_record_member program after operation selected record selectedAfter kind)
    cases op : selected.operation <;> simp only [regionalLifecycleTemplate?, op, kind, oldCount, newCount, ↓reduceIte]
  · cases parent : selected.root.parent with
    | none => cases op : selected.operation <;> simp only [regionalLifecycleTemplate?, op, kind, parent]
    | some owner =>
        have child : selected.root.parent ≠ none := by simp [parent]
        have oldCount := beforeCensus.2 selected.root
          (regionalSelection_root_member program before operation selected selectedBefore) child
        have newCount := afterCensus.2 selected.root
          (regionalSelection_root_member program after operation selected selectedAfter) child
        cases op : selected.operation <;> simp only [regionalLifecycleTemplate?, op, kind, parent, oldCount, newCount, ↓reduceIte]

theorem regionalPublicationTemplate_after_independent_regional (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    regionalPublicationTemplate? program after right.selection right.region = some right.publicationTemplate := by
  have facts := prepareInternalRegional_facts program before rightOperation right rightFound
  have selected := (ownershipClosedSelection_facts program before rightOperation right.selection facts.2.2.2.1).1
  have selectedAfter := regionalSelection_after_independent_regional program before after hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent applied
  have fields := regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied
  obtain ⟨actual, actualApplied, afterWF⟩ := preparedRegional_preserves_runtimeStateWellFormed program before hosting
    leftOperation left valid leftFound
  have actualEq : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  have afterPosition : runtimePositionValid program hosting after = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterWF
    exact afterWF.1
  obtain ⟨runtimeId, positions, current, delta, identities, ends, instanceFound, projected, opened,
    positioned, lifecycle, template⟩ := regionalPublicationTemplate_facts program before
      right.selection right.region right.publicationTemplate facts.2.2.2.2.2.2
  have instanceEq : runtimeId = hosting := by simpa [runningInstance?, running] using instanceFound.symm
  subst runtimeId
  obtain ⟨previous, previousFound, nextFound⟩ := preparedRegional_open_projection_filter program before after hosting
    leftOperation left valid leftFound applied
  have previousEq : previous = current := Option.some.inj (previousFound.symm.trans opened)
  subst previous
  let next := removeEndedFlowNodeOccurrences current left.publicationTemplate.retainedEnds
  have lifecycleFrame : regionalLifecycleTemplate? program after right.selection right.region next =
      regionalLifecycleTemplate? program before right.selection right.region current := by
    cases kind : right.selection.kind with
    | returning record =>
        exact regionalNonCancellingLifecycle_frame program before after rightOperation right.selection right.region
          current next selected selectedAfter opened nextFound (Or.inl ⟨record, kind⟩)
    | completing withdrawal =>
        exact regionalNonCancellingLifecycle_frame program before after rightOperation right.selection right.region
          current next selected selectedAfter opened nextFound (Or.inr ⟨withdrawal, kind⟩)
    | interrupting parent | terminating =>
        have cancelling : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent := by
          first | exact Or.inl kind | exact Or.inr ⟨_, kind⟩
        obtain ⟨prior, following, priorFound, followingFound, endsFrame⟩ :=
          regionalCancellationEnds_after_independent_regional program before after hosting leftOperation rightOperation
            left right valid running leftFound rightFound independent applied cancelling
        have priorEq : prior = current := Option.some.inj (priorFound.symm.trans opened)
        have followingEq : following = next := Option.some.inj (followingFound.symm.trans nextFound)
        subst prior
        subst following
        cases op : right.selection.operation <;> simp only [regionalLifecycleTemplate?, op, kind, endsFrame]
  dsimp only [next] at lifecycleFrame
  have deltaFrame := regionalPositionDelta_after_independent_regional program before after hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent applied
  unfold projectControlPosition? at projected
  split at projected
  · cases projected
    rw [template]
    simp only [regionalPublicationTemplate?, runningInstance?, fields.1, running, projectControlPosition?,
      afterPosition, ↓reduceIte, nextFound, deltaFrame, positioned, lifecycleFrame, lifecycle,
      fields.2.1, Option.bind_eq_bind, Option.bind_some]
    rfl
  · contradiction

/-- The full predecessor-selected artifact survives the other regional operation.
The reverse direction is the same theorem with symmetric independence. -/
theorem prepareInternalRegional_after_independent_regional (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    prepareInternalRegional? program after rightOperation = some right := by
  obtain ⟨snapshots, declared, time, _, _, _, _⟩ := prepareInternalRegional_facts program before rightOperation right rightFound
  have selected := regionalSelection_after_independent_regional program before after hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent applied
  obtain ⟨references, locals, owners⟩ := prepareInternalRegional_ownership_after_independent_regional
    program before after hosting leftOperation rightOperation left right valid running leftFound rightFound independent applied
  have closed := ownershipClosedSelection_accepts_closed_references program after rightOperation right.selection
    selected references locals owners
  have region := prepareInternalRegional_region_after_independent_regional program before after hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent applied
  have footprint := regionalStateFootprint_after_independent_regional program before after hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent applied
  have publication := regionalPublicationTemplate_after_independent_regional program before after hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent applied
  have fields := regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied
  exact prepareInternalRegional_of_components program after rightOperation right.selection right.region
    right.footprint right.publicationTemplate snapshots declared (by rwa [fields.2.1]) closed region footprint publication

end BpmnSemantics.SemanticProcess.InternalCommutation
