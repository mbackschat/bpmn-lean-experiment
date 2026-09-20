import BpmnSemantics.SemanticProcess.InternalRegionalLifecycleFold

/-! Instantaneous entries sort after existing open occurrences and close in the same delta.
Their transient anchors must neither remove nor collide with retained regional occurrences.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem insertBy_append_separated (before : α → α → Bool) (value : α)
    (left right : List α) (earlier : ∀ other ∈ right, before value other = true) :
    insertBy before value (left ++ right) = insertBy before value left ++ right := by
  induction left with
  | nil =>
      cases right with
      | nil => rfl
      | cons head rest => simp [insertBy, earlier head (by simp)]
  | cons head rest ih =>
      simp only [List.cons_append, insertBy]
      split <;> simp_all

theorem sortFlowNodeOccurrenceStarts_append_separated (left right : List OpenSemanticFlowNodeOccurrence)
    (earlier : ∀ first ∈ left, ∀ second ∈ right, startBefore first second = true) :
    sortFlowNodeOccurrenceStarts (left ++ right) =
      sortFlowNodeOccurrenceStarts left ++ sortFlowNodeOccurrenceStarts right := by
  induction left with
  | nil => rfl
  | cons head rest ih =>
      have restEarlier : ∀ first ∈ rest, ∀ second ∈ right, startBefore first second = true := by
        intro first member second present
        exact earlier first (by simp [member]) second present
      change insertBy startBefore head (sortFlowNodeOccurrenceStarts (rest ++ right)) =
        insertBy startBefore head (sortFlowNodeOccurrenceStarts rest) ++ sortFlowNodeOccurrenceStarts right
      rw [ih restEarlier]
      apply insertBy_append_separated
      intro second member
      exact earlier head (by simp) second ((mem_sortFlowNodeOccurrenceStarts _ _).mp member)

theorem regular_start_before_transition (first second : OpenSemanticFlowNodeOccurrence)
    (regular : transitionAnchor first.anchor = false)
    (transient : transitionAnchor second.anchor = true) : startBefore first second = true := by
  simp only [startBefore]
  cases firstAnchor : first.anchor <;> cases secondAnchor : second.anchor <;>
    simp_all [transitionAnchor, flowNodeOccurrenceAnchorBefore]

theorem applyFlowNodeOccurrenceDelta_transient_ends (current starts : List OpenSemanticFlowNodeOccurrence)
    (ends : List UnnumberedFlowNodeOccurrenceEnd)
    (unique : (current.map (·.anchor)).Nodup)
    (regular : ∀ entry ∈ current, transitionAnchor entry.anchor = false)
    (sorted : sortFlowNodeOccurrenceStarts current = current)
    (startsUnique : (starts.map (·.anchor)).Nodup)
    (transient : ∀ entry ∈ starts, transitionAnchor entry.anchor = true)
    (startsSorted : sortFlowNodeOccurrenceStarts starts = starts)
    (endsUnique : (ends.map (·.anchor)).Nodup)
    (endsPresent : ∀ ending ∈ ends, ending.anchor ∈ current.map (·.anchor)) :
    applyFlowNodeOccurrenceDelta? current
      (canonicalFlowNodeOccurrenceDelta starts
        ((starts.map fun entry => { anchor := entry.anchor, terminal := .completed }) ++ ends)) =
      some (removeEndedFlowNodeOccurrences current ends) := by
  let combined : List UnnumberedFlowNodeOccurrenceEnd :=
    (starts.map fun entry => { anchor := entry.anchor, terminal := .completed }) ++ ends
  have separated : ∀ first ∈ current, ∀ second ∈ starts, startBefore first second = true := by
    intro first firstMember second secondMember
    exact regular_start_before_transition first second (regular first firstMember) (transient second secondMember)
  have available : sortFlowNodeOccurrenceStarts (current ++ starts) = current ++ starts := by
    rw [sortFlowNodeOccurrenceStarts_append_separated current starts separated, sorted, startsSorted]
  have disjoint : ∀ anchor ∈ current.map (·.anchor), anchor ∉ starts.map (·.anchor) := by
    intro anchor currentMember startsMember
    obtain ⟨first, firstMember, firstEq⟩ := List.mem_map.mp currentMember
    obtain ⟨second, secondMember, secondEq⟩ := List.mem_map.mp startsMember
    have same := firstEq.trans secondEq.symm
    have regular := regular first firstMember
    simp [same, transient second secondMember] at regular
  have freshUnique : ((current ++ starts).map (·.anchor)).Nodup := by
    rw [List.map_append, List.nodup_append]
    refine ⟨unique, startsUnique, ?_⟩
    intro first firstMember second secondMember same
    subst second
    exact disjoint first firstMember secondMember
  have combinedUnique : (combined.map (·.anchor)).Nodup := by
    simp only [combined, List.map_append, List.map_map, Function.comp_def, List.nodup_append]
    refine ⟨startsUnique, endsUnique, ?_⟩
    intro anchor startsMember second endsMember sameAnchor
    subst second
    obtain ⟨ending, endingMember, same⟩ := List.mem_map.mp endsMember
    exact disjoint anchor (same ▸ endsPresent ending endingMember) startsMember
  have orderedUnique : ((sortFlowNodeOccurrenceEnds combined).map (·.anchor)).Nodup :=
    ((sortFlowNodeOccurrenceEnds_perm combined).map (·.anchor)).nodup_iff.mpr combinedUnique
  have orderedMembership (anchor : SemanticFlowNodeOccurrenceAnchor) :
      anchor ∈ (sortFlowNodeOccurrenceEnds combined).map (·.anchor) ↔
        anchor ∈ starts.map (·.anchor) ∨ anchor ∈ ends.map (·.anchor) := by
    simp only [List.mem_map, mem_sortFlowNodeOccurrenceEnds, combined, List.mem_append, List.mem_map]
    constructor
    · rintro ⟨ending, (⟨entry, member, rfl⟩ | member), same⟩
      · exact .inl ⟨entry, member, same⟩
      · exact .inr ⟨ending, member, same⟩
    · rintro (⟨entry, member, same⟩ | ⟨ending, member, same⟩)
      · exact ⟨_, .inl ⟨entry, member, rfl⟩, same⟩
      · exact ⟨ending, .inr member, same⟩
  have present : ((sortFlowNodeOccurrenceEnds combined).map (·.anchor)).all
      ((current ++ starts).map (·.anchor)).contains = true := by
    apply List.all_eq_true.mpr
    intro anchor member
    apply List.contains_iff_mem.mpr
    rw [List.map_append, List.mem_append]
    rcases (orderedMembership anchor).mp member with start | ending
    · exact .inr start
    · obtain ⟨ending, endingMember, same⟩ := List.mem_map.mp ending
      exact .inl (same ▸ endsPresent ending endingMember)
  have startsClosed : (starts.filter fun entry => transitionAnchor entry.anchor).all
      (fun entry => ((sortFlowNodeOccurrenceEnds combined).map (·.anchor)).contains entry.anchor) = true := by
    apply List.all_eq_true.mpr
    intro entry member
    exact List.contains_iff_mem.mpr ((orderedMembership entry.anchor).mpr
      (.inl (List.mem_map.mpr ⟨entry, (List.mem_filter.mp member).1, rfl⟩)))
  have transitionsStarted : ((sortFlowNodeOccurrenceEnds combined).filter fun ending => transitionAnchor ending.anchor).all
      (fun ending => (starts.map (·.anchor)).contains ending.anchor) = true := by
    apply List.all_eq_true.mpr
    intro ending member
    obtain ⟨endingMember, isTransition⟩ := List.mem_filter.mp member
    have anchored : ending.anchor ∈ (sortFlowNodeOccurrenceEnds combined).map (·.anchor) :=
      List.mem_map.mpr ⟨ending, endingMember, rfl⟩
    rcases (orderedMembership ending.anchor).mp anchored with start | endingPresent
    · exact List.contains_iff_mem.mpr start
    · obtain ⟨oldEnd, oldMember, same⟩ := List.mem_map.mp endingPresent
      obtain ⟨entry, entryMember, entryEq⟩ := List.mem_map.mp (endsPresent oldEnd oldMember)
      have regular := regular entry entryMember
      simp [entryEq, same, isTransition] at regular
  have removed : removeEndedFlowNodeOccurrences (current ++ starts) (sortFlowNodeOccurrenceEnds combined) =
      removeEndedFlowNodeOccurrences current ends := by
    unfold removeEndedFlowNodeOccurrences
    rw [List.filter_append]
    have old : current.filter (fun entry => !((sortFlowNodeOccurrenceEnds combined).map (·.anchor)).contains entry.anchor) =
        current.filter (fun entry => !(ends.map (·.anchor)).contains entry.anchor) := by
      apply List.filter_congr
      intro entry member
      apply congrArg Bool.not
      apply Bool.eq_iff_iff.mpr
      simp only [List.contains_iff_mem, orderedMembership]
      exact or_iff_right (disjoint entry.anchor (List.mem_map.mpr ⟨entry, member, rfl⟩))
    have closed : starts.filter (fun entry => !((sortFlowNodeOccurrenceEnds combined).map (·.anchor)).contains entry.anchor) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro entry member
      have contained := List.contains_iff_mem.mpr ((orderedMembership entry.anchor).mpr
        (.inl (List.mem_map.mpr ⟨entry, member, rfl⟩)))
      simp only [contained, Bool.not_true, Bool.false_eq_true, not_false_eq_true]
    rw [old, closed, List.append_nil]
  have noRemaining : (removeEndedFlowNodeOccurrences current ends).any
      (fun entry => transitionAnchor entry.anchor) = false := by
    apply Bool.eq_false_iff.mpr
    intro present
    obtain ⟨entry, member, isTransition⟩ := List.any_eq_true.mp present
    simp [regular entry (List.mem_filter.mp member).1] at isTransition
  change applyFlowNodeOccurrenceDelta? current (canonicalFlowNodeOccurrenceDelta starts combined) = _
  simp only [applyFlowNodeOccurrenceDelta?, canonicalFlowNodeOccurrenceDelta, availableAfterStarts,
    startsSorted, available, freshUnique, orderedUnique, decide_true, Bool.not_true, present,
    Bool.or_false, Bool.false_eq_true, ↓reduceIte, startsClosed, transitionsStarted, removed, noRemaining]

theorem instantaneous_delta_small_shape (commandId : SemanticId) (transitionIndex : Nat)
    (identities : List FlowNodeIdentity) (bounded : identities.length ≤ 2) :
    ∃ starts, instantaneousFlowNodeOccurrenceDelta commandId transitionIndex identities =
        { started := starts, ended := starts.map fun entry => { anchor := entry.anchor, terminal := .completed } } ∧
      (starts.map (·.anchor)).Nodup ∧
      (∀ entry ∈ starts, transitionAnchor entry.anchor = true) ∧
      sortFlowNodeOccurrenceStarts starts = starts := by
  let numbered (identity : FlowNodeIdentity) (index : Nat) : OpenSemanticFlowNodeOccurrence :=
    { anchor := .transition commandId transitionIndex index, processId := identity.processId
      elementId := identity.elementId, owner := identity.owner }
  have pair (first second : FlowNodeIdentity) :
      ∃ starts, { started := sortFlowNodeOccurrenceStarts [numbered first 0, numbered second 1]
                  ended := sortFlowNodeOccurrenceEnds ([numbered first 0, numbered second 1].map
                    fun entry => { anchor := entry.anchor, terminal := .completed }) } =
          ( { started := starts, ended := starts.map fun entry => { anchor := entry.anchor, terminal := .completed } } :
            UnnumberedFlowNodeOccurrenceDelta) ∧
        (starts.map (·.anchor)).Nodup ∧
        (∀ entry ∈ starts, transitionAnchor entry.anchor = true) ∧
        sortFlowNodeOccurrenceStarts starts = starts := by
    refine ⟨[numbered first 0, numbered second 1], ?_, ?_, ?_, ?_⟩
    all_goals
      simp [numbered, transitionAnchor, sortFlowNodeOccurrenceStarts, sortFlowNodeOccurrenceEnds,
        BpmnSemantics.SemanticProcess.sortBy, insertBy, startBefore, flowNodeOccurrenceAnchorBefore]
  cases identities with
  | nil => exact ⟨[], rfl, by simp, by simp, rfl⟩
  | cons first rest =>
      cases rest with
      | nil =>
          refine ⟨[{ anchor := .transition commandId transitionIndex 0, processId := first.processId
                     elementId := first.elementId, owner := first.owner }], rfl, ?_, ?_, ?_⟩
          · simp
          · intro entry member
            have same := List.eq_of_mem_singleton member
            rw [same]
            rfl
          · rfl
      | cons second rest =>
          cases rest with
          | cons third rest => simp only [List.length_cons] at bounded; omega
          | nil =>
              unfold instantaneousFlowNodeOccurrenceDelta
              simp only [BpmnSemantics.SemanticProcess.sortBy, insertBy]
              split
              · exact pair first second
              · exact pair second first

theorem applyFlowNodeOccurrenceDelta_small_instantaneous_ends (current : List OpenSemanticFlowNodeOccurrence)
    (identities : List FlowNodeIdentity) (ends : List UnnumberedFlowNodeOccurrenceEnd)
    (commandId : SemanticId) (transitionIndex : Nat)
    (unique : (current.map (·.anchor)).Nodup)
    (regular : ∀ entry ∈ current, transitionAnchor entry.anchor = false)
    (sorted : sortFlowNodeOccurrenceStarts current = current)
    (bounded : identities.length ≤ 2)
    (endsUnique : (ends.map (·.anchor)).Nodup)
    (endsPresent : ∀ ending ∈ ends, ending.anchor ∈ current.map (·.anchor)) :
    applyFlowNodeOccurrenceDelta? current
      (instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex identities ends) =
      some (removeEndedFlowNodeOccurrences current ends) := by
  obtain ⟨starts, shape, startsUnique, transient, startsSorted⟩ :=
    instantaneous_delta_small_shape commandId transitionIndex identities bounded
  simp only [instantaneousFlowNodeOccurrenceDeltaWithEnds, shape]
  exact applyFlowNodeOccurrenceDelta_transient_ends current starts ends unique regular sorted
    startsUnique transient startsSorted endsUnique endsPresent

theorem regionalCancellationEnds_anchor_facts (state : RuntimeState) (current : List OpenSemanticFlowNodeOccurrence)
    (region : InternalOccurrenceRegion) (retainRoot : Bool) (unique : (current.map (·.anchor)).Nodup) :
    ((regionalCancellationEnds state region retainRoot current).map (·.anchor)).Nodup ∧
      ∀ ending ∈ regionalCancellationEnds state region retainRoot current, ending.anchor ∈ current.map (·.anchor) := by
  constructor
  · simp only [regionalCancellationEnds, List.map_map, Function.comp_def]
    exact unique.sublist (List.filter_sublist.map (fun entry : OpenSemanticFlowNodeOccurrence => entry.anchor))
  · intro ending member
    obtain ⟨entry, entryMember, same⟩ := List.mem_map.mp member
    rw [← same]
    exact List.mem_map.mpr ⟨entry, (List.mem_filter.mp entryMember).1, rfl⟩

theorem regionalLifecycleTemplate_fold_facts (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence) (identities : List FlowNodeIdentity)
    (ends : List UnnumberedFlowNodeOccurrenceEnd)
    (unique : (current.map (·.anchor)).Nodup)
    (selection : selectInternalRegional? program before operation = some selected)
    (lifecycle : regionalLifecycleTemplate? program before selected region current = some (identities, ends)) :
    identities.length ≤ 2 ∧ (ends.map (·.anchor)).Nodup ∧
      ∀ ending ∈ ends, ending.anchor ∈ current.map (·.anchor) := by
  have facts := regionalSelection_lifecycle_facts program before operation selected selection
  have selectedOperation := regionalSelection_operation program before operation selected selection
  have emptyCase (empty : identities = []) : identities.length ≤ 2 ∧ (ends.map (·.anchor)).Nodup ∧
      ∀ ending ∈ ends, ending.anchor ∈ current.map (·.anchor) := by
    subst identities
    exact ⟨by simp, regionalLifecycleTemplate_empty_ends program before operation selected region current ends selection lifecycle⟩
  cases operation with
  | returnProcess id origin process definition output =>
      apply emptyCase
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      split at lifecycle
      · cases lifecycle; rfl
      · contradiction
  | completeScope id origin definition output =>
      apply emptyCase
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      cases parentEq : selected.root.parent with
      | none => simp only [parentEq] at lifecycle; cases lifecycle; rfl
      | some parent =>
          simp only [parentEq] at lifecycle
          split at lifecycle
          · cases lifecycle; rfl
          · contradiction
  | throwError id origin input error handler =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
      exact ⟨by simp, regionalCancellationEnds_anchor_facts before current region false unique⟩
  | terminateScope id origin input definition =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
      exact ⟨by simp, regionalCancellationEnds_anchor_facts before current region true unique⟩
  | _ => cases selected.kind <;> contradiction

theorem preparedRegional_lifecycle_fold (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (commandId : SemanticId) (transitionIndex : Nat)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ current, projectOpenFlowNodeOccurrences? program before = some current ∧
      applyFlowNodeOccurrenceDelta? current (prepared.publicationTemplate.lifecycle commandId transitionIndex) =
        some (removeEndedFlowNodeOccurrences current prepared.publicationTemplate.retainedEnds) := by
  obtain ⟨_, _, _, closedSelection, _, _, published⟩ := prepareInternalRegional_facts program before operation prepared found
  have selection := (ownershipClosedSelection_facts program before operation prepared.selection closedSelection).1
  obtain ⟨_, _, current, _, identities, ends, _, _, opened, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have unique := projectOpenFlowNodeOccurrences_anchor_nodup program before current opened
  have noTransition := projectOpenFlowNodeOccurrences_transitionAnchor_false program before current opened
  have regular : ∀ entry ∈ current, transitionAnchor entry.anchor = false := by
    intro entry member
    exact Bool.eq_false_iff.mpr (fun transition => noTransition ⟨entry, member, transition⟩)
  have sorted := projectOpenFlowNodeOccurrences_sorted program before current opened
  obtain ⟨bounded, endsUnique, endsPresent⟩ := regionalLifecycleTemplate_fold_facts program before operation
    prepared.selection prepared.region current identities ends unique selection lifecycle
  have folded := applyFlowNodeOccurrenceDelta_small_instantaneous_ends current identities ends commandId transitionIndex
    unique regular sorted bounded endsUnique endsPresent
  refine ⟨current, opened, ?_⟩
  rw [template]
  exact folded

end BpmnSemantics.SemanticProcess.InternalCommutation
