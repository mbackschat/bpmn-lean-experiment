import BpmnSemantics.SemanticProcess.InternalBoundedScopeRegionalRetention
import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalOwnership

/-! Bounded entry adds a child and its parent-owned Activity/Timer together. Regional reference
closure retains that complete group; local-data ownership reuses the Timer-task insertion law.+-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem boundedScope_new_references (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (bounded : PreparedInternalBoundedScope)
    (keep : RegionalReferenceRetention)
    (found : prepareInternalBoundedScope? program state contract = some bounded) :
    regionalActivityReferencesClosed state keep bounded.selection.record = true := by
  have timerFresh := prepared_bounded_scope_timer_keys_fresh program state contract bounded found
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have scopeFresh := selectInternalScopeCreation_fresh state contract.entryOperation entry entryFound
  simp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
    regionalActivityReferencesClosed, List.all_cons, List.all_nil, Bool.and_true,
    Bool.and_eq_true, allMatchingRetained, List.all_eq_true]
  constructor
  · intro scope member
    simp [scopeFresh scope member]
  · intro wait member
    have absent := (timerFresh wait member).1
    have unmatched : timerIdNamesWait
        { processInstanceId := entry.owner.processInstanceId, elementId := ⟨contract.timer.elementId.value⟩,
          activation := timerActivationCount state contract.timer.elementId + 1 } wait = false := by
      simp [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
        timerWaitKeyMatches, timerIdNamesWait, beq_iff_eq] at absent ⊢
      exact fun process element => absent process (congrArg NodeId.mk element)
    simp [unmatched]

theorem boundedScope_regional_ownership_frame (state : RuntimeState)
    (selected : InternalBoundedScopeSelection) (keep : RegionalReferenceRetention)
    (child : selected.creation.kind = .child)
    (scopeKept : keep.scope selected.creation.created = true)
    (timerKept : keep.timer selected.timer = true)
    (newReferences : regionalActivityReferencesClosed state keep selected.record = true)
    (newOwner : allMatchingRetained state.scopeOccurrences keep.scope
      (fun scope => decide (scope.id = selected.record.owner)) = true) :
    regionalOwnershipClosed (selected.apply state) keep = regionalOwnershipClosed state keep ∧
      regionalActivityOwnersClosed (selected.apply state) keep = regionalActivityOwnersClosed state keep := by
  have references (record : ActivityOccurrence) :
      regionalActivityReferencesClosed (selected.apply state) keep record =
        regionalActivityReferencesClosed state keep record := by
    simp [regionalActivityReferencesClosed, InternalBoundedScopeSelection.apply,
      InternalScopeCreationSelection.apply, child, insertScopeOccurrence, insertTimerWait,
      allMatchingRetained_insert_kept _ _ _ _ _ scopeKept,
      allMatchingRetained_insert_kept _ _ _ _ _ timerKept]
  constructor
  · simp only [regionalOwnershipClosed, references]
    simp [InternalBoundedScopeSelection.apply, InternalScopeCreationSelection.apply, child,
      insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newReferences,
      insertTimerWait, allMatchingRetained_insert_kept _ _ _ _ _ timerKept]
  · simp [regionalActivityOwnersClosed, InternalBoundedScopeSelection.apply,
      InternalScopeCreationSelection.apply, child, insertScopeOccurrence,
      allMatchingRetained_insert_kept _ _ _ _ _ scopeKept,
      insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newOwner]

theorem boundedScope_regional_local_data_preserved (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (bounded : PreparedInternalBoundedScope)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (prior : regionalRetainedLocalDataClosed state keepActivity keepLocal = true) :
    regionalRetainedLocalDataClosed (bounded.selection.apply state) keepActivity keepLocal = true := by
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  have absent : state.activityOccurrences.any (regionalActivityAssociationsConflict · selected.record) = false := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa using joint.2
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  apply regionalLocalDataClosed_insertActivity state _ _ keepActivity keepLocal rfl _ absent prior
  simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
    makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply,
    (boundedScope_entry_selection_input state contract entry entryFound).2.2]

theorem regionalOwnershipSelection_after_independent_bounded_scope
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true) :
    selectInternalOwnershipClosedRegional? program (bounded.selection.apply state) operation = some regional.selection := by
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have references := (ownershipClosedSelection_facts program state operation regional.selection facts.2.2.2.1).2
  have owners := ownershipClosedSelection_activity_owners program state operation regional.selection facts.2.2.2.1
  have locals := ownershipClosedSelection_local_data program state operation regional.selection facts.2.2.2.1
  have selectionFrame := selectInternalRegional_after_independent_bounded_scope program state contract bounded
    operation regional programValid valid found regionalFound independent
  have masks := boundedScope_regional_retention_frame program state contract bounded operation regional valid found regionalFound independent
  have kept := boundedScope_regional_insertions_retained program state contract bounded operation regional valid found regionalFound independent
  have outside := (boundedScope_regional_outside program state contract bounded operation regional found regionalFound independent).1
  have live := (boundedScope_owner_child_live program state contract bounded found).1
  have newReferences := boundedScope_new_references program state contract bounded
    (regionalSelectionReferenceRetention state regional.selection) found
  have localsAfter := boundedScope_regional_local_data_preserved program state contract bounded _ _ found locals
  have scopeKept := boundedScope_regional_scope_retained program state contract bounded operation regional valid found regionalFound independent
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  let selected := makeInternalBoundedScopeSelection state contract entry
  dsimp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection] at live outside
  have newOwner : allMatchingRetained state.scopeOccurrences
      (regionalSelectionReferenceRetention state regional.selection).scope
      (fun scope => decide (scope.id = selected.record.owner)) = true := by
    apply List.all_eq_true.mpr
    intro scope _
    by_cases same : scope.id = entry.owner
    · have kept := scopeKept scope (by rw [same]; exact live) (by rw [same]; exact outside)
      simpa only [selected, makeInternalBoundedScopeSelection, same, decide_true, Bool.not_true, Bool.false_or] using kept
    · simp [selected, makeInternalBoundedScopeSelection, same]
  have insertion := boundedScope_regional_ownership_frame state selected _
    (boundedScope_entry_selection_input state contract entry entryFound).2.2 kept.1 kept.2.1 newReferences newOwner
  have referencesAfter := insertion.1.trans references
  have ownersAfter := insertion.2.trans owners
  dsimp only [selected] at referencesAfter ownersAfter
  dsimp only [makeInternalBoundedScopePreparation] at selectionFrame masks localsAfter ⊢
  simp only [selectInternalOwnershipClosedRegional?, selectionFrame, Option.bind_eq_bind,
    Option.bind_some, masks.1, masks.2, referencesAfter, ownersAfter, localsAfter, Bool.true_and, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation
