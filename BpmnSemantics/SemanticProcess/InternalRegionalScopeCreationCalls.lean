import BpmnSemantics.SemanticProcess.InternalRegionalCompletionAdmission
import BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparationFrames

/-! The current paired Call account binds every invocation to the hosting definition and excludes that definition from called roots. This admission fact prevents a newly issued hosting Call from competing with a nested caller in Return's global declaration census. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics
open FlowNodeOccurrenceProgramValidity.Internal

private theorem paired_invocation_host (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (process : ProcessId) (root : DefinitionScopeId) (entry : ControlPlaceId) (returned : OperationId)
    (paired : callOperationsPaired program = true)
    (member : .invokeProcess id origin input process root entry returned ∈ program.operations) :
    ∃ entryRoot : DefinitionScope,
      program.definitionScopes.filter (fun scope => scope.parentScopeId.isNone &&
        scope.originElementId.value = program.processId.value) = [entryRoot] ∧
      (program.operationScopes.find? fun binding => decide (binding.operationId = id)).map (·.scopeId) = some entryRoot.id := by
  unfold callOperationsPaired at paired
  dsimp only at paired
  split at paired
  · rename_i empty
    simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
    have absent := List.filterMap_eq_nil_iff.mp empty.1 _ member
    contradiction
  · split at paired
    · rename_i hostingRoot roots
      simp only [Bool.and_eq_true] at paired
      have selected := paired.1.2
      rw [List.all_filterMap] at selected
      have selected := List.all_eq_true.mp selected _ member
      dsimp only at selected
      split at selected
      · split at selected
        · simp only [Bool.and_eq_true, decide_eq_true_eq, and_assoc] at selected
          exact ⟨hostingRoot, roots, selected.2.2.1⟩
        · contradiction
      · contradiction
    · contradiction

theorem regionalScopeCreation_call_caller_hosting (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (record : CalledProcessOccurrence)
    (position : runtimePositionValid program hosting state = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (running : state.control = .running hosting)
    (member : record ∈ state.calledProcessOccurrences) : record.caller.processInstanceId = hosting := by
  have programValid : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at position
    exact position.1.1
  have paired : callOperationsPaired program = true := by
    simp only [programWellFormed, Bool.and_eq_true] at programValid
    grind
  obtain ⟨id, origin, input, process, root, entry, returned, invocation, owned, _, _, _, _⟩ :=
    flowNodeOccurrenceStructuralProgramValidity_call_declarer program state record structural member
  obtain ⟨entryRoot, roots, declaredOwner⟩ :=
    paired_invocation_host program id origin input process root entry returned paired invocation
  have entryDefinition : record.caller.definitionScopeId = entryRoot.id := by
    unfold operationOwnedBy at owned
    split at owned
    · rename_i binding census
      have lookup : (program.operationScopes.find? fun candidate => decide (candidate.operationId = id)).map (·.scopeId) =
          some binding.scopeId := by
        rw [← List.head?_filter]
        change program.operationScopes.filter (fun candidate => decide (candidate.operationId = id)) = [binding] at census
        rw [census]
        rfl
      exact (of_decide_eq_true owned).symm.trans (Option.some.inj (lookup.symm.trans declaredOwner))
    · contradiction
  obtain ⟨⟨caller, callerMember, callerId, parentless⟩, _⟩ :=
    calledProcessAssociationsValid_parentless_endpoints state
      (runtimePositionValid_called_associations program hosting hosting state position running) record member
  have live := (runtimePositionValid_scope_parent_binding program hosting hosting state position running caller callerMember).1
  rcases flowNodeOccurrenceStructuralProgramValidity_live_owner_binding program state caller.id hosting structural running live
      with nested | hosted | called
  · obtain ⟨other, parent, present, identity, parentEq, _, _⟩ := nested
    have only := filter_key_eq_singleton_of_nodup state.scopeOccurrences (·.id) caller
      (runtimePositionValid_scope_ids_nodup program hosting hosting state position running) callerMember
    have present' : other ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = caller.id)) :=
      List.mem_filter.mpr ⟨present, decide_eq_true identity⟩
    rw [only] at present'
    have same := List.mem_singleton.mp present'
    simp [same, parentless] at parentEq
  · simpa only [callerId] using hosted
  · obtain ⟨parentCall, parentMember, calledRoot⟩ := called
    obtain ⟨invokeId, invokeOrigin, invokeInput, calledProcess, calledScope, calledEntry, returnedId,
      declaration, _, _, _, scopeEq, _⟩ :=
      flowNodeOccurrenceStructuralProgramValidity_call_declarer program state parentCall structural parentMember
    have excluded := callOperationsPaired_calledRoot_ne_entryRoot program entryRoot.id invokeId invokeOrigin invokeInput
      calledProcess calledScope calledEntry returnedId paired (by simp only [roots]) declaration
    exact False.elim (excluded (by rw [scopeEq, calledRoot, callerId, entryDefinition]))

theorem regionalScopeCreation_call_caller_eq (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (old newRecord : CalledProcessOccurrence)
    (operation : SemanticOperation) (creation : InternalScopeCreationSelection)
    (position : runtimePositionValid program hosting state = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (running : state.control = .running hosting)
    (member : old ∈ state.calledProcessOccurrences)
    (found : selectInternalScopeCreation? state operation = some creation)
    (called : creation.kind = .called newRecord) : old.caller = creation.owner := by
  have oldHosting := regionalScopeCreation_call_caller_hosting program state hosting old position structural running member
  have newHosting := (scopeCreation_selection_call_facts state operation creation newRecord hosting running found called).1
  have associations := runtimePositionValid_called_associations program hosting hosting state position running
  obtain ⟨⟨oldRoot, oldMember, oldIdentity, oldParent⟩, _⟩ :=
    calledProcessAssociationsValid_parentless_endpoints state associations old member
  obtain ⟨newRoot, newMember, newIdentity, newParent⟩ :
      ∃ root ∈ state.scopeOccurrences, root.id = creation.owner ∧ root.parent = none := by
    unfold selectInternalScopeCreation? at found
    simp only [running, bind, Option.bind] at found
    cases operation
    all_goals first
      | contradiction
      | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
        try dsimp only at found
        repeat first | contradiction | split at found
        all_goals cases found
        all_goals first
          | contradiction
          | rename_i callerRoot census matching _ _
            have parentless : callerRoot.parent = none := by simpa using (Bool.and_eq_true_iff.mp matching).2
            have identity := scope_identity_of_census state _ callerRoot census
            have present : callerRoot ∈ state.scopeOccurrences := by
              have singleton : callerRoot ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = callerRoot.id)) := by
                rw [identity, census]; simp
              exact (List.mem_filter.mp singleton).1
            exact ⟨callerRoot, present, identity, parentless⟩
  have roots := calledProcessAssociationsValid_parentless_root_unique state hosting running associations
    oldRoot newRoot oldMember newMember oldParent newParent (by rw [oldIdentity, newIdentity, oldHosting, newHosting])
  simpa only [oldIdentity, newIdentity] using roots

end BpmnSemantics.SemanticProcess.InternalCommutation
