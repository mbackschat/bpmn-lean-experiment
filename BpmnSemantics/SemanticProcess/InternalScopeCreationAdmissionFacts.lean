module

public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.ScopeCreationCallAssociations
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Admission facts for scope creation

The Call association invariant requires distinct caller and called definitions. The reviewed Call
admission account supplies that fact; local preparation alone does not establish it.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- A parentless scope's root walk can only stop at that scope itself. -/
private theorem processRootWithin_parentless_self (scopes : List DefinitionScope) (fuel : Nat)
    (root : DefinitionScope) (member : root ∈ scopes) (parentless : root.parentScopeId = none)
    (found : DefinitionScopeId) (walk : processRootWithin scopes (fuel + 1) root.id = some found) :
    found = root.id := by
  unfold processRootWithin at walk
  split at walk
  · next scope selected =>
      have rootIn : root ∈ scopes.filter (·.id == root.id) := List.mem_filter.mpr ⟨member, by simp⟩
      rw [selected] at rootIn
      have same := List.mem_singleton.mp rootIn
      subst same
      simp only [parentless, Option.some.injEq] at walk
      exact walk.symm
  · contradiction

theorem callOperationsPaired_invoke_input_scope_ne_calledRoot
    (program : Program) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRoot : DefinitionScopeId) (calledEntry : ControlPlaceId)
    (returnOperationId : OperationId) (inputScope : DefinitionScopeId)
    {data : CallDataInterface}
    (paired : callOperationsPaired program = true)
    (member : .invokeProcess id origin input calledProcessId calledRoot calledEntry
      returnOperationId data ∈ program.operations)
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
        have selected := paired.1.2
        rw [List.all_filterMap] at selected
        have selected := List.all_eq_true.mp selected
          (.invokeProcess id origin input calledProcessId calledRoot calledEntry returnOperationId data)
          member
        dsimp only at selected
        split at selected
        · split at selected
          · rename_i calledScope calledSelected
            simp only [Bool.and_eq_true, decide_eq_true_eq] at selected
            obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨rootEq, _⟩, callerRoot⟩, _⟩, inputFound⟩, _⟩, _⟩, _⟩, _⟩, _⟩ :=
              selected.1
            -- The invocation's scope holds its input, its Process root is never the called root, and the
            -- parentless called root is its own Process root.
            have calledIn := List.mem_singleton_self calledScope
            rw [← calledSelected] at calledIn
            obtain ⟨calledMember, calledNamed⟩ := List.mem_filter.mp calledIn
            have parentless : calledScope.parentScopeId = none := by
              simp only [decide_eq_true_eq, Option.isNone_iff_eq_none] at calledNamed
              exact calledNamed.1
            obtain ⟨fuel, fuelEq⟩ : ∃ fuel, program.definitionScopes.length = fuel + 1 :=
              ⟨_, (Nat.succ_pred_eq_of_pos (List.length_pos_of_mem calledMember)).symm⟩
            split at callerRoot
            · next callerScope found =>
                split at callerRoot
                · next callerRootId walked =>
                    simp only [decide_eq_true_eq] at callerRoot
                    have scopeEq := Option.some.inj (inputLookup.symm.trans (inputFound.trans found))
                    intro equal
                    have callerScopeEq : callerScope = calledScope.id :=
                      scopeEq.symm.trans (equal.symm.trans rootEq.symm)
                    rw [callerScopeEq, fuelEq] at walked
                    exact callerRoot (processRootWithin_parentless_self _ fuel calledScope calledMember parentless
                      callerRootId walked)
                · contradiction
            · contradiction
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
  cases operation with
  | invokeProcess _ _ _ _ _ _ _ data =>
      cases data
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
  | enterScope _ _ _ _ _ =>
      obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      split at selection
      · contradiction
      · cases selection
        contradiction
  | _ => contradiction

private theorem length_filter_le_of_imp {α : Type} (values : List α) (p q : α → Bool)
    (imp : ∀ value, p value = true → q value = true) :
    (values.filter p).length ≤ (values.filter q).length := by
  induction values with
  | nil => simp
  | cons value rest ih =>
      by_cases holds : p value = true
      · simp [List.filter_cons, holds, imp value holds, ih]
      · cases other : q value <;> simp [List.filter_cons, holds, other] <;> omega

/-- An admitted invocation declares the record it creates: it is the one invocation of its return
operation, and it is held by the scope of its input place (RSI-BIND-05). -/
theorem callOperationsPaired_invoke_record_declared (program : Program) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRoot : DefinitionScopeId) (calledEntry : ControlPlaceId) (returned : OperationId)
    (callerScope : DefinitionScopeId) {data : CallDataInterface}
    (paired : callOperationsPaired program = true)
    (member : .invokeProcess id origin input calledProcessId calledRoot calledEntry returned data ∈
      program.operations)
    (inputBinding : program.controlPlaceScopes.filter
      (fun ownership => decide (ownership.controlPlaceId = input)) =
      [{ controlPlaceId := input, scopeId := callerScope }])
    (record : CalledProcessOccurrence) (returnEq : record.returnOperationId = returned)
    (elementEq : record.id.elementId.value = origin.elementId.value)
    (processEq : record.calledProcessId = calledProcessId)
    (rootEq : record.calledRoot.definitionScopeId = calledRoot)
    (callerEq : record.caller.definitionScopeId = callerScope) :
    callRecordDeclared program record = true := by
  have inputLookup : (program.controlPlaceScopes.find? fun ownership =>
      decide (ownership.controlPlaceId = input)).map (·.scopeId) = some callerScope := by
    rw [← List.head?_filter, inputBinding]
    rfl
  have scope := (callOperationsPaired_invoke_input_scope program id origin input calledProcessId calledRoot
    calledEntry returned paired member).trans inputLookup
  obtain ⟨owner, ownerFound, ownerScope⟩ := Option.map_eq_some_iff.mp scope
  have ownerMember := List.mem_of_find?_eq_some ownerFound
  have ownerId : owner.operationId = id := by simpa using List.find?_some ownerFound
  have owned : ∃ candidate, candidate ∈ program.operationScopes ∧ candidate.operationId = id ∧
      candidate.scopeId = record.caller.definitionScopeId :=
    ⟨owner, ownerMember, ownerId, ownerScope.trans callerEq.symm⟩
  unfold callRecordDeclared
  apply decide_eq_true
  apply Nat.le_antisymm
  · apply Nat.le_trans _ (callOperationsPaired_invokes_by_return_le_one program returned paired)
    apply length_filter_le_of_imp
    intro operation selected
    cases operation <;> simp_all
  · exact List.length_pos_of_mem (List.mem_filter.mpr ⟨member, by
      simp [returnEq, elementEq, processEq, rootEq, owned]⟩)

/-- Batched Call creation declares its new record from the admitted invocation it selected. -/
theorem prepareInternalScopeCreation_called_record_declared
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalScopeCreation) (record : CalledProcessOccurrence)
    (programWF : programWellFormed program = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared)
    (called : prepared.selection.kind = .called record) :
    callRecordDeclared program record = true := by
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
  cases operation with
  | invokeProcess _ _ _ _ _ _ _ data =>
      cases data
      all_goals first
        | contradiction
        | obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
          dsimp only at selection
          repeat first | contradiction | split at selection
          all_goals cases selection
          all_goals first
            | contradiction
            | (cases called
               exact callOperationsPaired_invoke_record_declared program _ _ _ _ _ _ _ _ paired member
                 inputBinding _ rfl rfl rfl rfl rfl)
  | enterScope _ _ _ _ _ =>
      obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      split at selection
      · contradiction
      · cases selection
        contradiction
  | _ => contradiction

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
