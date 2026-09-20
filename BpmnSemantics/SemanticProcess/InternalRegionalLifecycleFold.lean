import BpmnSemantics.SemanticProcess.InternalRegionalLifecycleSelection
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceInstantaneousPublication

/-! Regional endings must pass the actual lifecycle fold before successor correspondence.
Uniqueness and membership come from the predecessor projection and selected ending census.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem applyFlowNodeOccurrenceDelta_retained_ends (current : List OpenSemanticFlowNodeOccurrence)
    (ends : List UnnumberedFlowNodeOccurrenceEnd)
    (unique : (current.map (·.anchor)).Nodup)
    (regular : ∀ entry ∈ current, transitionAnchor entry.anchor = false)
    (sorted : sortFlowNodeOccurrenceStarts current = current)
    (endsUnique : (ends.map (·.anchor)).Nodup)
    (endsPresent : ∀ ending ∈ ends, ending.anchor ∈ current.map (·.anchor)) :
    applyFlowNodeOccurrenceDelta? current (canonicalFlowNodeOccurrenceDelta [] ends) =
      some (removeEndedFlowNodeOccurrences current ends) := by
  have emptyStarts : sortFlowNodeOccurrenceStarts [] = [] := rfl
  have ordered := sortFlowNodeOccurrenceEnds_perm ends
  have orderedUnique : ((sortFlowNodeOccurrenceEnds ends).map (·.anchor)).Nodup :=
    (ordered.map (·.anchor)).nodup_iff.mpr endsUnique
  have present : ((sortFlowNodeOccurrenceEnds ends).map (·.anchor)).all
      (current.map (·.anchor)).contains = true := by
    apply List.all_eq_true.mpr
    intro anchor member
    obtain ⟨ending, endingMember, rfl⟩ := List.mem_map.mp member
    exact List.contains_iff_mem.mpr (endsPresent ending ((mem_sortFlowNodeOccurrenceEnds _ _).mp endingMember))
  have endsRegular : (sortFlowNodeOccurrenceEnds ends).filter (fun ending => transitionAnchor ending.anchor) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro ending member
    have anchored := endsPresent ending ((mem_sortFlowNodeOccurrenceEnds _ _).mp member)
    obtain ⟨entry, entryMember, same⟩ := List.mem_map.mp anchored
    rw [← same]
    exact Bool.eq_false_iff.mp (regular entry entryMember)
  have removed : removeEndedFlowNodeOccurrences current (sortFlowNodeOccurrenceEnds ends) =
      removeEndedFlowNodeOccurrences current ends := by
    apply List.filter_congr
    intro entry member
    apply congrArg Bool.not
    apply Bool.eq_iff_iff.mpr
    simp only [List.contains_iff_mem, List.mem_map, mem_sortFlowNodeOccurrenceEnds]
  have noRemaining : (removeEndedFlowNodeOccurrences current ends).any
      (fun entry => transitionAnchor entry.anchor) = false := by
    apply Bool.eq_false_iff.mpr
    intro present
    obtain ⟨entry, member, transition⟩ := List.any_eq_true.mp present
    have member := (List.mem_filter.mp member).1
    simp [regular entry member] at transition
  simp only [applyFlowNodeOccurrenceDelta?, canonicalFlowNodeOccurrenceDelta, availableAfterStarts,
    emptyStarts, List.append_nil, sorted, unique, orderedUnique, decide_true, Bool.not_true,
    present, Bool.or_false, Bool.false_eq_true, ↓reduceIte, List.filter_nil, List.all_nil,
    endsRegular, removed, noRemaining]

theorem regionalLifecycleTemplate_empty_ends (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence) (ends : List UnnumberedFlowNodeOccurrenceEnd)
    (selection : selectInternalRegional? program before operation = some selected)
    (lifecycle : regionalLifecycleTemplate? program before selected region current = some ([], ends)) :
    (ends.map (·.anchor)).Nodup ∧ ∀ ending ∈ ends, ending.anchor ∈ current.map (·.anchor) := by
  have single (anchor : SemanticFlowNodeOccurrenceAnchor) (terminal : FlowNodeOccurrenceTerminalKind)
      (census : (current.filter fun entry => entry.anchor == anchor).length = 1) :
      ([({ anchor, terminal } : UnnumberedFlowNodeOccurrenceEnd)].map (·.anchor)).Nodup ∧
        ∀ ending ∈ [({ anchor, terminal } : UnnumberedFlowNodeOccurrenceEnd)], ending.anchor ∈ current.map (·.anchor) := by
    constructor
    · simp
    · intro ending member
      have same := List.eq_of_mem_singleton member
      rw [same]
      obtain ⟨entry, singleton⟩ := List.length_eq_one_iff.mp census
      have present : entry ∈ current.filter (fun candidate => candidate.anchor == anchor) := by rw [singleton]; simp
      obtain ⟨entryMember, identity⟩ := List.mem_filter.mp present
      exact List.mem_map.mpr ⟨entry, entryMember, by simpa using identity⟩
  have facts := regionalSelection_lifecycle_facts program before operation selected selection
  have selectedOperation := regionalSelection_operation program before operation selected selection
  cases operation with
  | returnProcess id origin process definition output =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      split at lifecycle
      · cases lifecycle
        exact single _ _ (by assumption)
      · contradiction
  | completeScope id origin definition output =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      cases parentEq : selected.root.parent with
      | none =>
          simp only [parentEq] at lifecycle
          cases lifecycle
          simp
      | some parent =>
          simp only [parentEq] at lifecycle
          split at lifecycle
          · cases lifecycle
            exact single _ _ (by assumption)
          · contradiction
  | throwError id origin input error handler =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
  | terminateScope id origin input definition =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
  | _ => cases selected.kind <;> contradiction

theorem preparedRegional_noninstantaneous_lifecycle_fold (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (commandId : SemanticId) (transitionIndex : Nat)
    (found : prepareInternalRegional? program before operation = some prepared)
    (empty : prepared.publicationTemplate.instantaneous = []) :
    ∃ current, projectOpenFlowNodeOccurrences? program before = some current ∧
      applyFlowNodeOccurrenceDelta? current (prepared.publicationTemplate.lifecycle commandId transitionIndex) =
        some (removeEndedFlowNodeOccurrences current prepared.publicationTemplate.retainedEnds) := by
  obtain ⟨_, _, _, closedSelection, _, _, published⟩ := prepareInternalRegional_facts program before operation prepared found
  have selection := (ownershipClosedSelection_facts program before operation prepared.selection closedSelection).1
  obtain ⟨hosting, positions, current, delta, identities, ends, _, _, opened, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have identitiesEmpty : identities = [] := by simpa only [template] using empty
  subst identities
  obtain ⟨endsUnique, endsPresent⟩ := regionalLifecycleTemplate_empty_ends program before operation
    prepared.selection prepared.region current ends selection lifecycle
  have unique := projectOpenFlowNodeOccurrences_anchor_nodup program before current opened
  have noTransition := projectOpenFlowNodeOccurrences_transitionAnchor_false program before current opened
  have regular : ∀ entry ∈ current, transitionAnchor entry.anchor = false := by
    intro entry member
    exact Bool.eq_false_iff.mpr (fun transition => noTransition ⟨entry, member, transition⟩)
  have sorted := projectOpenFlowNodeOccurrences_sorted program before current opened
  have folded := applyFlowNodeOccurrenceDelta_retained_ends current ends unique regular sorted endsUnique endsPresent
  refine ⟨current, opened, ?_⟩
  rw [template]
  exact folded

theorem preparedRegional_completion_lifecycle_fold (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (commandId : SemanticId) (transitionIndex : Nat)
    (completion : match operation with | .returnProcess .. | .completeScope .. => True | _ => False)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ current, projectOpenFlowNodeOccurrences? program before = some current ∧
      applyFlowNodeOccurrenceDelta? current (prepared.publicationTemplate.lifecycle commandId transitionIndex) =
        some (removeEndedFlowNodeOccurrences current prepared.publicationTemplate.retainedEnds) := by
  apply preparedRegional_noninstantaneous_lifecycle_fold program before operation prepared commandId transitionIndex found
  obtain ⟨_, _, _, closedSelection, _, _, published⟩ := prepareInternalRegional_facts program before operation prepared found
  have selection := (ownershipClosedSelection_facts program before operation prepared.selection closedSelection).1
  have selectedOperation := regionalSelection_operation program before operation prepared.selection selection
  obtain ⟨_, _, _, _, identities, ends, _, _, _, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  cases operation <;> try contradiction
  all_goals
    cases kind : prepared.selection.kind
    all_goals
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      repeat' first
        | (solve | simp at lifecycle)
        | (solve | cases lifecycle; simp only [template])
        | split at lifecycle

end BpmnSemantics.SemanticProcess.InternalCommutation
