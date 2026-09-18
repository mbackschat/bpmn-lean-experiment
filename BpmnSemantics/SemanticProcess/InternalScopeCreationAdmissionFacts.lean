import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.ScopeCreationCallAssociations

/-! # Admission facts for scope creation

The Call association invariant requires distinct caller and called definitions. The reviewed Call
admission account supplies that fact; local preparation alone does not establish it.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem callOperationsPaired_invoke_input_scope_ne_calledRoot
    (program : Program) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRoot : DefinitionScopeId) (calledEntry : ControlPlaceId)
    (returnOperationId : OperationId) (inputScope : DefinitionScopeId)
    (paired : callOperationsPaired program = true)
    (member : .invokeProcess id origin input calledProcessId calledRoot calledEntry
      returnOperationId ∈ program.operations)
    (inputBinding : program.controlPlaceScopes.filter
      (fun ownership => decide (ownership.controlPlaceId = input)) =
      [{ controlPlaceId := input, scopeId := inputScope }]) :
    calledRoot ≠ inputScope := by
  have inputLookup : (program.controlPlaceScopes.find? fun ownership =>
      decide (ownership.controlPlaceId = input)).map (·.scopeId) = some inputScope := by
    rw [← List.head?_filter, inputBinding]
    rfl
  unfold callOperationsPaired at paired
  dsimp only at paired
  split at paired
  · next empty =>
      simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
      have absent := List.filterMap_eq_nil_iff.mp empty.1 _ member
      contradiction
  · split at paired
    · next entryRoot roots =>
        simp only [Bool.and_eq_true] at paired
        have selected := paired.2
        rw [List.all_filterMap] at selected
        have selected := List.all_eq_true.mp selected
          (.invokeProcess id origin input calledProcessId calledRoot calledEntry returnOperationId)
          member
        dsimp only at selected
        split at selected
        · split at selected
          · simp only [Bool.and_eq_true, decide_eq_true_eq] at selected
            obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨rootEq, different⟩, _⟩, _⟩, inputFound⟩, _⟩, _⟩, _⟩, _⟩, _⟩ :=
              selected
            change (program.controlPlaceScopes.find? fun ownership =>
              decide (ownership.controlPlaceId = input)).map (·.scopeId) =
                some entryRoot.id at inputFound
            rw [inputLookup] at inputFound
            have scopeEq := Option.some.inj inputFound
            exact fun equal => different (rootEq.trans (equal.trans scopeEq))
          · contradiction
        · contradiction
    · contradiction

/-- The paired Call contract rejects a caller input bound to its own called definition. -/
theorem callOperationsPaired_rejects_same_definition
    (program : Program) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRoot : DefinitionScopeId) (calledEntry : ControlPlaceId)
    (returnOperationId : OperationId)
    (member : .invokeProcess id origin input calledProcessId calledRoot calledEntry
      returnOperationId ∈ program.operations)
    (inputBinding : program.controlPlaceScopes.filter
      (fun ownership => decide (ownership.controlPlaceId = input)) =
      [{ controlPlaceId := input, scopeId := calledRoot }]) :
    callOperationsPaired program = false := by
  apply Bool.eq_false_iff.mpr
  intro paired
  exact callOperationsPaired_invoke_input_scope_ne_calledRoot program id origin input
    calledProcessId calledRoot calledEntry returnOperationId calledRoot paired member inputBinding rfl

theorem prepareInternalScopeCreation_called_definition_ne_owner
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalScopeCreation) (record : CalledProcessOccurrence)
    (programWF : programWellFormed program = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared)
    (called : prepared.selection.kind = .called record) :
    prepared.selection.created.id.definitionScopeId ≠
      prepared.selection.owner.definitionScopeId := by
  have paired : callOperationsPaired program = true := by
    simp only [programWellFormed, Bool.and_eq_true] at programWF
    grind
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, _, _, operations, _, _, _, _, _, position, preparedEq⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  have member : operation ∈ program.operations := by
    apply (List.mem_filter.mp (show operation ∈ program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) from
        operations.symm ▸ List.mem_cons_self)).1
  obtain ⟨consumed, _, _, inputOrigin, _⟩ :=
    internalScopeCreationPositionDelta_facts program selected delta position
  have inputBinding := (selectedInputOrigin?_exact_bindings program selected.input selected.owner
    consumed (internalLocalControlPlaceOrigin?_selectedInputOrigin _ _ _ _ inputOrigin)).2
  subst prepared
  dsimp only [makeInternalScopeCreationPreparation] at called ⊢
  unfold selectInternalScopeCreation? at selection
  obtain ⟨hosting, _, selection⟩ := Option.bind_eq_some_iff.mp selection
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      dsimp only at selection
      repeat first | contradiction | split at selection
      all_goals cases selection
      all_goals first
        | contradiction
        | exact callOperationsPaired_invoke_input_scope_ne_calledRoot
            program _ _ _ _ _ _ _ _ paired member inputBinding

theorem prepareInternalScopeCreation_preserves_callAssociations
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (valid : calledProcessAssociationsValid state = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    calledProcessAssociationsValid (prepared.selection.apply state) = true := by
  have selection : selectInternalScopeCreation? state operation = some prepared.selection := by
    obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
      selectedFound, _, _, _, _, _, _, _, _, _, preparedEq⟩ :=
        prepareInternalScopeCreation_facts program state operation prepared found
    simpa only [preparedEq, makeInternalScopeCreationPreparation] using selectedFound
  exact selectInternalScopeCreation_preserves_callAssociations state operation prepared.selection
    selection valid (fun record called => prepareInternalScopeCreation_called_definition_ne_owner
      program state operation prepared record programWF found called)

end BpmnSemantics.SemanticProcess.InternalCommutation
