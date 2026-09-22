import BpmnSemantics.SemanticProcess.InternalBoundedScopeCreationPair
import BpmnSemantics.SemanticProcess.InternalBoundedScopeRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalDataArmingCommutation

/-! Independent bounded entries retain distinct child, Timer, and Activity issuers and complete
association reads under the [bounded outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem boundedScope_pair_joint_separation (left right : InternalBoundedScopeSelection)
    (leftInstance rightInstance : SemanticId) (leftOwner rightOwner : RuntimeScopeOccurrence)
    (independent : regionalStateFootprintsIndependent
      (boundedScopeStateFootprint left leftInstance leftOwner)
      (boundedScopeStateFootprint right rightInstance rightOwner) = true) :
    left.timer.elementId ≠ right.timer.elementId ∧
      left.record.activityElementId.value ≠ right.record.activityElementId.value ∧
      timerWaitOccurrence left.timer ≠ timerWaitOccurrence right.timer ∧
      regionalActivityAssociationsConflict right.record left.record = false := by
  have separated := regional_independent_write_write _ _ independent
  have timer := separated (.ordinary (.activation .timer left.timer.elementId))
    (.ordinary (.activation .timer right.timer.elementId))
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
  have activity := separated (.ordinary (.activation .activity left.record.activityElementId))
    (.ordinary (.activation .activity right.record.activityElementId))
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
  have anchor := separated (.owned (.openWaitAnchor (timerWaitOccurrence left.timer)) left.creation.owner)
    (.owned (.openWaitAnchor (timerWaitOccurrence right.timer)) right.creation.owner)
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
  refine ⟨?_, ?_, ?_, ?_⟩
  · intro same; simp [regionalStateAtomsConflict, same] at timer
  · intro same
    have keySame : left.record.activityElementId = right.record.activityElementId := by
      cases leftKey : left.record.activityElementId
      cases rightKey : right.record.activityElementId
      simp_all
    simp [regionalStateAtomsConflict, keySame] at activity
  · intro same; simp [regionalStateAtomsConflict, same] at anchor
  · exact regional_independent_write_write _ _
      (regionalStateFootprintsIndependent_symmetric _ _ independent)
      (.activityAssociation right.record) (.activityAssociation left.record)
      (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
      (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])

theorem prepareInternalBoundedScope_after_bounded_scope
    (program : Program) (state : RuntimeState) (leftContract rightContract : InternalBoundedScopeContract)
    (left right : PreparedInternalBoundedScope)
    (leftFound : prepareInternalBoundedScope? program state leftContract = some left)
    (rightFound : prepareInternalBoundedScope? program state rightContract = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true) :
    prepareInternalBoundedScope? program (right.selection.apply state) leftContract = some left := by
  obtain ⟨leftSelected, leftInstance, leftOwner, leftDefinition, leftStart, leftDelta,
    leftSelection, leftRunning, _, _, leftOwnerExact, leftDefinitionFound, leftChecks, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state leftContract left leftFound
  obtain ⟨rightSelected, rightInstance, rightOwner, rightDefinition, rightStart, rightDelta,
    rightSelection, rightRunning, _, _, _, rightDefinitionFound, rightChecks, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state rightContract right rightFound
  have running : state.control = .running leftInstance := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have sameInstance : rightInstance = leftInstance := by
    rw [leftRunning] at rightRunning
    exact Option.some.inj rightRunning.symm
  subst rightInstance
  obtain ⟨timerDifferent, activityDifferent, anchorDifferent, recordsApart⟩ :=
    boundedScope_pair_joint_separation leftSelected rightSelected leftInstance leftInstance leftOwner rightOwner independent
  have separated := boundedScope_child_independent leftSelected leftInstance leftOwner rightSelected.creation.owner _
    (boundedScope_other_child_independent _ rightSelected leftInstance rightOwner independent)
  obtain ⟨leftEntry, leftEntryFound, rfl⟩ := selectInternalBoundedScope_facts state leftContract leftSelected leftSelection
  obtain ⟨rightEntry, rightEntryFound, rfl⟩ := selectInternalBoundedScope_facts state rightContract rightSelected rightSelection
  have rightChild := (boundedScope_entry_selection_input state rightContract rightEntry rightEntryFound).2.2
  have associations := fun valid => selectInternalScopeCreation_preserves_callAssociations state
    rightContract.entryOperation rightEntry rightEntryFound valid (by intro record kind; simp [rightChild] at kind)
  obtain ⟨entryAfter, ownerFrame, inputFrame, entryFrame, counterFrame⟩ :=
    scopeCreation_independent_reads program leftInstance state leftContract.entryOperation rightContract.entryOperation
      leftEntry rightEntry leftOwner rightOwner leftContract.origin rightContract.origin leftDefinition rightDefinition
      leftEntryFound rightEntryFound running leftOwnerExact leftDefinitionFound rightDefinitionFound
      leftChecks rightChecks associations separated
  let after := (makeInternalBoundedScopeSelection state rightContract rightEntry).apply state
  have selectedAfter := selectInternalBoundedScope_read_frame state after leftContract _ leftSelection
    (entryAfter.trans leftEntryFound.symm) (scopeCreation_apply_time state rightEntry)
    (by
      simpa only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, rightChild, timerActivationCount] using
        timerActivationCount_set_other state rightContract.timer.elementId leftContract.timer.elementId
          (timerActivationCount state rightContract.timer.elementId + 1) timerDifferent)
    (by
      have keys : (⟨leftContract.origin.elementId.value⟩ : TaskDefinitionId) ≠
          ⟨rightContract.origin.elementId.value⟩ := by
        intro same
        exact activityDifferent (congrArg TaskDefinitionId.value same)
      simpa only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, rightChild, activityActivationCount] using
        activityActivationCount_set_other state ⟨rightContract.origin.elementId.value⟩
          ⟨leftContract.origin.elementId.value⟩
          (activityActivationCount state ⟨rightContract.origin.elementId.value⟩ + 1) keys)
  apply prepareInternalBoundedScope_read_frame program state after leftContract _ leftFound selectedAfter
    (scopeCreation_apply_control state rightEntry) (scopeCreation_apply_time state rightEntry)
    ownerFrame inputFrame entryFrame counterFrame
  have anchorFrame : openWaitAnchorAbsent after (timerWaitOccurrence
      (makeInternalBoundedScopeSelection state leftContract leftEntry).timer) =
      openWaitAnchorAbsent state (timerWaitOccurrence
        (makeInternalBoundedScopeSelection state leftContract leftEntry).timer) := by
    simp only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, rightChild, openWaitAnchorAbsent, openWaitAnchors]
    simp only [makeInternalBoundedScopeSelection] at anchorDifferent
    simp [List.contains_eq_mem, insertTimerWait, mem_canonicalInsertBy, Ne.symm anchorDifferent]
  have recordFrame : after.activityOccurrences.any (regionalActivityAssociationsConflict ·
      (makeInternalBoundedScopeSelection state leftContract leftEntry).record) =
      state.activityOccurrences.any (regionalActivityAssociationsConflict ·
        (makeInternalBoundedScopeSelection state leftContract leftEntry).record) := by
    change (insertActivityOccurrence (makeInternalBoundedScopeSelection state rightContract rightEntry).record
      state.activityOccurrences).any _ = _
    simp only [insertActivityOccurrence_eq_canonicalInsertBy, List.any_eq_not_all_not, all_canonicalInsertBy,
      recordsApart, Bool.not_false, Bool.true_and]
  simp only [makeInternalBoundedScopePreparation, boundedScopeJointResourcesAvailable, anchorFrame, recordFrame]

theorem prepared_bounded_scope_pair
    (program : Program) (state : RuntimeState) (leftContract rightContract : InternalBoundedScopeContract)
    (left right : PreparedInternalBoundedScope)
    (leftFound : prepareInternalBoundedScope? program state leftContract = some left)
    (rightFound : prepareInternalBoundedScope? program state rightContract = some right)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true) :
    prepareInternalBoundedScope? program (right.selection.apply state) leftContract = some left ∧
      prepareInternalBoundedScope? program (left.selection.apply state) rightContract = some right ∧
      right.selection.apply (left.selection.apply state) = left.selection.apply (right.selection.apply state) := by
  refine ⟨prepareInternalBoundedScope_after_bounded_scope program state leftContract rightContract left right
      leftFound rightFound independent,
    prepareInternalBoundedScope_after_bounded_scope program state rightContract leftContract right left
      rightFound leftFound (regionalStateFootprintsIndependent_symmetric _ _ independent), ?_⟩
  obtain ⟨leftSelected, leftInstance, leftOwner, _, _, _, leftSelection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state leftContract left leftFound
  obtain ⟨rightSelected, rightInstance, rightOwner, _, _, _, rightSelection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state rightContract right rightFound
  obtain ⟨timerDifferent, activityDifferent, _, _⟩ :=
    boundedScope_pair_joint_separation leftSelected rightSelected leftInstance rightInstance leftOwner rightOwner independent
  have separated := boundedScope_child_independent leftSelected leftInstance leftOwner rightSelected.creation.owner _
    (boundedScope_other_child_independent _ rightSelected rightInstance rightOwner independent)
  obtain ⟨leftEntry, leftEntryFound, rfl⟩ := selectInternalBoundedScope_facts state leftContract leftSelected leftSelection
  obtain ⟨rightEntry, rightEntryFound, rfl⟩ := selectInternalBoundedScope_facts state rightContract rightSelected rightSelection
  have leftChild := (boundedScope_entry_selection_input state leftContract leftEntry leftEntryFound).2.2
  have rightChild := (boundedScope_entry_selection_input state rightContract rightEntry rightEntryFound).2.2
  have equality := scope_creation_child_patches_commute state leftEntry rightEntry leftInstance rightInstance
    leftOwner rightOwner leftChild canonical separated
  have tokens := congrArg RuntimeState.tokens equality
  have scopes := congrArg RuntimeState.scopeOccurrences equality
  have scopeCounts := congrArg RuntimeState.scopeActivations equality
  have timerOrder : orderedBy timerActivationBefore state.timerActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have activityOrder : orderedBy activationBefore state.activityActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have activityKeys : (⟨leftContract.origin.elementId.value⟩ : TaskDefinitionId) ≠
      ⟨rightContract.origin.elementId.value⟩ := by
    intro same
    exact activityDifferent (congrArg TaskDefinitionId.value same)
  have timers := insertTimerWait_commutes
    (makeInternalBoundedScopeSelection state rightContract rightEntry).timer
    (makeInternalBoundedScopeSelection state leftContract leftEntry).timer timerDifferent.symm state.timerWaits
  have activities := insertActivityOccurrence_commutes_of_distinct_element
    (makeInternalBoundedScopeSelection state rightContract rightEntry).record
    (makeInternalBoundedScopeSelection state leftContract leftEntry).record activityDifferent.symm state.activityOccurrences
  have timerCounts := setTimerActivationCount_commutes_of_ordered leftContract.timer.elementId rightContract.timer.elementId
    (timerActivationCount state leftContract.timer.elementId + 1)
    (timerActivationCount state rightContract.timer.elementId + 1) timerDifferent state.timerActivations timerOrder
  have activityCounts := setActivationCount_commutes_of_ordered
    ⟨leftContract.origin.elementId.value⟩ ⟨rightContract.origin.elementId.value⟩
    (activityActivationCount state ⟨leftContract.origin.elementId.value⟩ + 1)
    (activityActivationCount state ⟨rightContract.origin.elementId.value⟩ + 1) activityKeys
    state.activityActivations activityOrder
  simp only [InternalScopeCreationSelection.apply, leftChild, rightChild] at tokens scopes scopeCounts
  simp only [makeInternalBoundedScopeSelection] at timers activities
  simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
    makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, leftChild, rightChild]
  congr 1

end BpmnSemantics.SemanticProcess.InternalCommutation
