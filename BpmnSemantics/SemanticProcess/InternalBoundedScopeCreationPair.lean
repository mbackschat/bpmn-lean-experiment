import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationCommutation

/-! Bounded entry and ordinary child/Call creation share complete scope-selection laws under the
[bounded outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome).
The retained Activity and deadline add no reads to ordinary scope creation.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalBoundedScope_after_scope_creation
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (scope : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (scopeFound : prepareInternalScopeCreation? program state operation = some scope)
    (independent : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalBoundedScope? program (scope.selection.apply state) contract = some bounded := by
  have associations := fun valid => prepareInternalScopeCreation_preserves_callAssociations
    program state operation scope admitted valid scopeFound
  obtain ⟨selected, instanceId, owner, definition, start, delta, selection, runningInstance,
    _, _, ownerExact, definitionFound, checked, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨creation, scopeInstance, scopeOwner, scopeOrigin, scopeDefinition, scopeStart, scopeDelta,
    creationFound, scopeRunning, _, _, _, _, scopeDefinitionFound, scopeChecked, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation scope scopeFound
  have running : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have sameInstance : scopeInstance = instanceId := by
    rw [running] at scopeRunning
    exact ProcessControl.running.inj scopeRunning.symm
  subst scopeInstance
  have separated := boundedScope_child_independent selected instanceId owner creation.owner _ independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  obtain ⟨entryAfter, ownerFrame, inputFrame, entryFrame, counterFrame⟩ :=
    scopeCreation_independent_reads program instanceId state contract.entryOperation operation entry creation
      owner scopeOwner contract.origin scopeOrigin definition scopeDefinition entryFound creationFound running
      ownerExact definitionFound scopeDefinitionFound checked scopeChecked associations separated
  have boundedAfter := selectInternalBoundedScope_read_frame state (creation.apply state) contract _ selection
    (entryAfter.trans entryFound.symm) (scopeCreation_apply_time state creation)
    (by cases kind : creation.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl)
    (by cases kind : creation.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl)
  apply prepareInternalBoundedScope_read_frame program state (creation.apply state) contract _ found
    boundedAfter (scopeCreation_apply_control state creation) (scopeCreation_apply_time state creation)
    ownerFrame inputFrame entryFrame counterFrame
  cases kind : creation.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl

theorem prepareInternalScopeCreation_after_bounded_scope
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (scope : PreparedInternalScopeCreation)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (scopeFound : prepareInternalScopeCreation? program state operation = some scope)
    (independent : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalScopeCreation? program (bounded.selection.apply state) operation = some scope := by
  obtain ⟨selected, instanceId, owner, definition, start, delta, selection, runningInstance,
    _, _, _, definitionFound, checked, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨creation, scopeInstance, scopeOwner, scopeOrigin, scopeDefinition, scopeStart, scopeDelta,
    creationFound, scopeRunning, _, _, scopeOwnerExact, _, scopeDefinitionFound, scopeChecked, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation scope scopeFound
  have running : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have sameInstance : scopeInstance = instanceId := by
    rw [running] at scopeRunning
    exact ProcessControl.running.inj scopeRunning.symm
  subst scopeInstance
  have separated := localControlStateFootprintsNonInterfering_symm _ _
    (boundedScope_child_independent selected instanceId owner creation.owner _ independent)
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have associations := fun valid => selectInternalScopeCreation_preserves_callAssociations state
    contract.entryOperation entry entryFound valid (by intro record kind; simp [child] at kind)
  obtain ⟨selectionAfter, ownerFrame, inputFrame, entryFrame, counterFrame⟩ :=
    scopeCreation_independent_reads program instanceId state operation contract.entryOperation creation entry
      scopeOwner owner scopeOrigin contract.origin scopeDefinition definition creationFound entryFound running
      scopeOwnerExact scopeDefinitionFound definitionFound scopeChecked checked associations separated
  have preparedAfter := prepareInternalScopeCreation_read_frame program state (entry.apply state) operation _
    scopeFound selectionAfter (scopeCreation_apply_control state entry) (scopeCreation_apply_time state entry)
    ownerFrame inputFrame entryFrame counterFrame
  change prepareInternalScopeCreation? program (entry.apply state) operation = _
  exact preparedAfter

theorem prepared_bounded_scope_creation_pair
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (scope : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (scopeFound : prepareInternalScopeCreation? program state operation = some scope)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalBoundedScope? program (scope.selection.apply state) contract = some bounded ∧
      prepareInternalScopeCreation? program (bounded.selection.apply state) operation = some scope ∧
      scope.selection.apply (bounded.selection.apply state) = bounded.selection.apply (scope.selection.apply state) := by
  refine ⟨prepareInternalBoundedScope_after_scope_creation program state contract bounded operation scope
      admitted found scopeFound independent,
    prepareInternalScopeCreation_after_bounded_scope program state contract bounded operation scope
      found scopeFound independent, ?_⟩
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨creation, scopeInstance, scopeOwner, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation scope scopeFound
  have separated := boundedScope_child_independent selected instanceId owner creation.owner _ independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have equality := scope_creation_child_patches_commute state entry creation instanceId scopeInstance
    owner scopeOwner child canonical separated
  let joined := makeInternalBoundedScopeSelection state contract entry
  have extended := congrArg (fun candidate : RuntimeState =>
    { candidate with
      timerWaits := insertTimerWait joined.timer state.timerWaits
      timerActivations := setTimerActivationCount state.timerActivations joined.timer.elementId joined.timer.activation
      activityOccurrences := insertActivityOccurrence joined.record state.activityOccurrences
      activityActivations := setActivationCount state.activityActivations
        ⟨joined.record.activityElementId.value⟩ joined.record.activation }) equality
  cases kind : creation.kind <;>
    simpa only [makeInternalBoundedScopePreparation, makeInternalScopeCreationPreparation,
      InternalBoundedScopeSelection.apply, joined, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child, kind, setCallActivationCount] using extended

end BpmnSemantics.SemanticProcess.InternalCommutation
