import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationSelection
import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationClassifiers
import BpmnSemantics.SemanticProcess.InternalRegionalArmingOwnership

/-! Independent scope creation retains its new scope under the regional removal mask. Exact arbitrary-owner classifiers preserve all reference and local-data masks, including historical owners and attached-handler withdrawals. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedScopeCreation_regional_retention (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    regionalSelectionReferenceRetention (creation.selection.apply state) regional.selection =
        regionalSelectionReferenceRetention state regional.selection ∧
      regionalSelectionLocalDataRetention (creation.selection.apply state) regional.selection =
        regionalSelectionLocalDataRetention state regional.selection := by
  have classifiers := preparedScopeCreation_regional_classifiers program state operation creationOperation
    regional creation programValid valid regionalFound creationFound independent
  have selected := (ownershipClosedSelection_facts program state operation regional.selection
    (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.1).1
  cases kind : regional.selection.kind with
  | returning record =>
      obtain ⟨rootId, parentless⟩ := regionalSelection_return_root program state operation regional.selection record selected kind
      have called := classifiers.2.2 parentless
      simp only [rootId] at called
      simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, kind,
        callReferenceRetention, called, and_self]
  | completing withdrawal =>
      cases withdrawal <;> simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, kind, and_self]
  | interrupting parent | terminating =>
      simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, kind,
        cancellationReferenceRetention, classifiers.1, classifiers.2.1]
      cases creationKind : creation.selection.kind <;>
        simp only [InternalScopeCreationSelection.apply, creationKind, and_self]

theorem regional_completion_nonroot_of_control_read (state : RuntimeState) (hosting : SemanticId)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint)
    (running : state.control = .running hosting)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (noWrite : .ordinary (.runtimeControl hosting) ∉ footprint.writes)
    (withdrawal : InternalCompletionWithdrawal) (kind : selected.kind = .completing withdrawal) :
    selected.root.parent ≠ none := by
  intro parentless
  obtain ⟨base, baseFound, writes⟩ := regional_footprint_base state hosting selected region footprint running footprintFound
  cases operationEq : selected.operation <;>
    simp only [regionalBaseFootprint?, operationEq, kind, parentless] at baseFound
  all_goals repeat' first
    | contradiction
    | (solve | simp at baseFound)
    | (solve | cases baseFound; exact noWrite (writes _ (by simp)))
    | split at baseFound

theorem preparedScopeCreation_regional_nonroot (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true)
    (withdrawal : InternalCompletionWithdrawal) (kind : regional.selection.kind = .completing withdrawal) :
    regional.selection.root.parent ≠ none := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    _, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state creationOperation creation creationFound
  dsimp only [makeInternalScopeCreationPreparation] at independent
  have footprint := (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.2.1
  have noWrite : .ordinary (.runtimeControl hosting) ∉ regional.footprint.writes := by
    intro written
    have read : liftRegionalStateAtom selected.owner (.runtimeControl hosting) ∈
        (liftRegionalStateFootprint selected.owner (internalScopeCreationStateFootprint selected hosting ownerRecord)).reads :=
      List.mem_map.mpr ⟨_, by simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy], rfl⟩
    have conflict := regional_independent_read_write _ _ independent _ _ written read
    simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict
  exact regional_completion_nonroot_of_control_read state hosting regional.selection regional.region
    regional.footprint running footprint noWrite withdrawal kind

private theorem insertion_ownership (state : RuntimeState) (creation : InternalScopeCreationSelection)
    (keep : RegionalReferenceRetention) (kept : keep.scope creation.created = true) :
    regionalOwnershipClosed (creation.apply state) keep = regionalOwnershipClosed state keep ∧
      regionalActivityOwnersClosed (creation.apply state) keep = regionalActivityOwnersClosed state keep := by
  have references (record : ActivityOccurrence) :
      regionalActivityReferencesClosed (creation.apply state) keep record =
        regionalActivityReferencesClosed state keep record := by
    cases kind : creation.kind <;>
      simp [regionalActivityReferencesClosed, InternalScopeCreationSelection.apply, kind,
        insertScopeOccurrence, allMatchingRetained_insert_kept, kept]
  constructor
  · simp only [regionalOwnershipClosed, references]
    cases kind : creation.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  · cases kind : creation.kind <;>
      simp [regionalActivityOwnersClosed, InternalScopeCreationSelection.apply, kind,
        insertScopeOccurrence, allMatchingRetained_insert_kept, kept]

/-- The three complete ownership checks survive the inserted, retained scope and Call edge. -/
theorem prepareInternalRegional_ownership_after_independent_scopeCreation
    (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    regionalOwnershipClosed (creation.selection.apply state)
        (regionalSelectionReferenceRetention (creation.selection.apply state) regional.selection) = true ∧
      regionalRetainedLocalDataClosed (creation.selection.apply state)
        (regionalSelectionReferenceRetention (creation.selection.apply state) regional.selection).activity
        (regionalSelectionLocalDataRetention (creation.selection.apply state) regional.selection) = true ∧
      regionalActivityOwnersClosed (creation.selection.apply state)
        (regionalSelectionReferenceRetention (creation.selection.apply state) regional.selection) = true := by
  have retention := preparedScopeCreation_regional_retention program state operation creationOperation regional creation
    programValid valid regionalFound creationFound independent
  have nonroot := preparedScopeCreation_regional_nonroot program state operation creationOperation regional creation
    regionalFound creationFound independent
  have afterSelected := selectInternalRegional_after_independent_scopeCreation program state operation creationOperation
    regional creation programValid valid regionalFound creationFound independent
  have afterRegion := prepareInternalRegional_region_after_independent_scopeCreation program state operation creationOperation
    regional creation programValid valid regionalFound creationFound independent
  have afterValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed program creation.runtimeInstanceId
    state creationOperation creation programValid valid creationFound
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state creationOperation creation creationFound
  dsimp only [makeInternalScopeCreationPreparation] at retention afterSelected afterRegion afterValid independent ⊢
  have position : runtimePositionValid program hosting (selected.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  have afterRunning := (scopeCreation_apply_control state selected).trans running
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have outside := scopeCreation_regional_outside state regional.selection regional.region regional.footprint
    selected hosting ownerRecord facts.2.2.2.2.2.1 independent
  have live : selected.created ∈ (selected.apply state).scopeOccurrences := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
    all_goals exact (mem_insertScopeOccurrence _ _ _).mpr (.inl rfl)
  have liveId : selected.created.id ∈ (selected.apply state).scopeOccurrences.map (·.id) :=
    List.mem_map.mpr ⟨selected.created, live, rfl⟩
  have cancelled := (regional_cancellation_mask program (selected.apply state) hosting hosting position afterRunning
    regional.selection.root.id regional.region afterRegion selected.created.id liveId).symm.trans outside.2.1
  have different : selected.created.id ≠ regional.selection.root.id := by
    intro same
    have inside : regional.region.contains regional.selection.root.id = true :=
      List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec _ _ _ afterRegion).2.1
    simp [same, inside] at outside
  have kept : (regionalSelectionReferenceRetention (selected.apply state) regional.selection).scope selected.created = true := by
    cases kind : regional.selection.kind with
    | returning record =>
        obtain ⟨rootId, parentless⟩ := regionalSelection_return_root program (selected.apply state) operation
          regional.selection record afterSelected kind
        have removed := (regional_called_tree_mask program (selected.apply state) hosting hosting position afterRunning
          regional.selection.root regional.region afterRegion
          (regionalSelection_root_member program _ operation regional.selection afterSelected) parentless
          selected.created.id liveId).trans outside.2.1
        simp only [rootId] at removed
        simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention, removed, Bool.not_false]
    | completing withdrawal =>
        have parent := nonroot withdrawal kind
        cases parentEq : regional.selection.root.parent with
        | none => exact False.elim (parent parentEq)
        | some parent => cases withdrawal <;>
            simp [regionalSelectionReferenceRetention, kind, ordinaryCompletionReferenceRetention,
              boundedCompletionReferenceRetention, parentEq, different]
    | interrupting parent | terminating =>
        simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention,
          cancelled, Bool.not_false, Bool.or_true]
  rw [retention.1] at kept
  have insertion := insertion_ownership state selected (regionalSelectionReferenceRetention state regional.selection) kept
  rw [retention.1, retention.2]
  refine ⟨insertion.1.trans (ownershipClosedSelection_facts program state operation regional.selection facts.2.2.2.1).2,
    ?_, insertion.2.trans (ownershipClosedSelection_activity_owners program state operation regional.selection facts.2.2.2.1)⟩
  have localData := ownershipClosedSelection_local_data program state operation regional.selection facts.2.2.2.1
  cases kind : selected.kind <;>
    simpa only [regionalRetainedLocalDataClosed, InternalScopeCreationSelection.apply, kind] using localData

end BpmnSemantics.SemanticProcess.InternalCommutation
