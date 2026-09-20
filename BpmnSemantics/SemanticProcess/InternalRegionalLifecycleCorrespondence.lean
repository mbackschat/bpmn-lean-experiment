import BpmnSemantics.SemanticProcess.InternalRegionalOpenOwnership
import BpmnSemantics.SemanticProcess.InternalRegionalPreparation

/-! Regional cancellation templates agree with the evaluator's predecessor lifecycle selector.
The correspondence uses live projection ownership and the exact derived region, not a supplied mask.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regionalCancellation_owner_corresponds (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (valid : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (entry : OpenSemanticFlowNodeOccurrence) (ownership : regionalOpenOwnership state entry)
    (retainRoot : Bool) :
    regionalCancelsOpenOccurrence state region retainRoot entry =
      (flowNodeOccurrenceOwnedBySubtree state root entry &&
        !(retainRoot && entry.anchor == .scope root)) := by
  have rootEq := (deriveInternalOccurrenceRegion_spec state root region derived).1
  have ownerMask := regional_cancellation_mask program state hosting hosting valid running root region derived
    entry.owner ownership.1
  cases anchor : entry.anchor with
  | scope id =>
      obtain ⟨scope, member, identity, parent⟩ := ownership.2 id anchor
      have live : id ∈ state.scopeOccurrences.map (·.id) := List.mem_map.mpr ⟨scope, member, identity⟩
      have idMask := regional_cancellation_mask program state hosting hosting valid running root region derived id live
      have parentClosed : region.contains entry.owner = true → region.contains id = true := by
        intro inside
        apply List.contains_iff_mem.mpr
        exact (deriveInternalOccurrenceRegion_spec state root region derived).2.2.2.2.1 entry.owner
          (List.contains_iff_mem.mp inside) id (.inl ⟨scope, member, parent, identity⟩)
      simp only [regionalCancelsOpenOccurrence, flowNodeOccurrenceOwnedBySubtree, anchor, rootEq, ← idMask]
      cases ownerInside : region.contains entry.owner <;>
        cases scopeInside : region.contains id <;>
        apply Bool.eq_iff_iff.mpr <;> simp_all
  | wait _ | callActivity _ | compensationTrigger _ | compensationHandler _ =>
      simp only [regionalCancelsOpenOccurrence, flowNodeOccurrenceOwnedBySubtree, anchor, rootEq, ← ownerMask]
      apply Bool.eq_iff_iff.mpr
      simp
  | transition command index localIndex =>
      simp only [regionalCancelsOpenOccurrence, flowNodeOccurrenceOwnedBySubtree, anchor, Bool.false_and]

theorem regionalCancellationEnds_corresponds (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) (retainRoot : Bool) :
    regionalCancellationEnds state region retainRoot current =
      ((current.filter (flowNodeOccurrenceOwnedBySubtree state root)).map fun entry =>
        ({ anchor := entry.anchor, terminal := .cancelled } : UnnumberedFlowNodeOccurrenceEnd)).filter
          (fun ending => !(retainRoot && ending.anchor == .scope root)) := by
  unfold regionalCancellationEnds
  rw [List.filter_map, List.filter_filter]
  apply congrArg (List.map fun entry : OpenSemanticFlowNodeOccurrence =>
    ({ anchor := entry.anchor, terminal := .cancelled } : UnnumberedFlowNodeOccurrenceEnd))
  apply List.filter_congr
  intro entry member
  simpa only [Function.comp_apply, Bool.and_comm] using
    regionalCancellation_owner_corresponds program state hosting root region valid running derived entry
    (projectOpen_regional_ownership program state hosting current entry running projected member) retainRoot

theorem regionalError_cancellation_ends (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program hosting state = true) (running : state.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    ownedSubtreeCancellationEnds? program state root = some (regionalCancellationEnds state region false current) := by
  rw [regionalCancellationEnds_corresponds program state hosting root region current valid running derived projected false]
  simp only [ownedSubtreeCancellationEnds?, projected, Option.bind_eq_bind, Option.bind_some,
    Bool.false_and, Bool.not_false]
  rw [(List.filter_eq_self (p := fun _ : UnnumberedFlowNodeOccurrenceEnd => true)).mpr
    (by intro ending member; rfl)]
  rfl

theorem regionalTerminate_cancellation_ends (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program hosting state = true) (running : state.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    terminationSubtreeCancellationEnds? program state root = some (regionalCancellationEnds state region true current) := by
  rw [regionalCancellationEnds_corresponds program state hosting root region current valid running derived projected true]
  simp only [terminationSubtreeCancellationEnds?, ownedSubtreeCancellationEnds?, projected,
    Option.bind_eq_bind, Option.bind_some, Bool.true_and, pure, Pure.pure]
  apply congrArg some
  apply List.filter_congr
  intro ending member
  apply Bool.eq_iff_iff.mpr
  simp

/-- Complete preparation itself supplies the valid running predecessor, live projection,
and exact region needed by both actual cancellation lifecycle selectors. -/
theorem preparedRegional_cancellation_ends (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program state operation = some prepared) :
    ∃ current, projectOpenFlowNodeOccurrences? program state = some current ∧
      ownedSubtreeCancellationEnds? program state prepared.selection.root.id =
        some (regionalCancellationEnds state prepared.region false current) ∧
      terminationSubtreeCancellationEnds? program state prepared.selection.root.id =
        some (regionalCancellationEnds state prepared.region true current) := by
  obtain ⟨_, _, _, _, derived, _, published⟩ := prepareInternalRegional_facts program state operation prepared found
  obtain ⟨hosting, positions, current, _, _, _, running, projected, opened, _⟩ :=
    regionalPublicationTemplate_facts program state prepared.selection prepared.region prepared.publicationTemplate published
  have runningState : state.control = .running hosting := by
    unfold runningInstance? at running
    split at running
    · cases running; assumption
    · contradiction
  have valid : runtimePositionValid program hosting state = true := by
    unfold projectControlPosition? at projected
    split at projected
    · assumption
    · contradiction
  exact ⟨current, opened,
    regionalError_cancellation_ends program state hosting prepared.selection.root.id prepared.region current
      valid runningState derived opened,
    regionalTerminate_cancellation_ends program state hosting prepared.selection.root.id prepared.region current
      valid runningState derived opened⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
