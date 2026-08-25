import BpmnSemantics.SemanticProcess.CommandAdmission

/-! # Flow-node occurrence Program-validity core

This module owns the shared owner-binding primitive and the structural scope and Call Activity correspondence used by flow-node occurrence Program validity. Wait-family and private Boundary Timer validation remain in `FlowNodeOccurrenceWaitProgramValidity`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- One complete runtime owner identity occurs exactly once. -/
def flowNodeOccurrenceOwnerLiveUnique (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Bool :=
  (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = owner)).length = 1

namespace FlowNodeOccurrenceProgramValidity.Internal

/-- Internal proof API for resolving one operation's exact definition-scope owner. -/
def operationOwnedBy (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) : Bool :=
  match program.operationScopes.filter fun binding => decide (binding.operationId = operation.id) with
  | [binding] => binding.scopeId = owner.definitionScopeId
  | _ => false

/-- Internal proof API for the owner identity shared by occurrence families. -/
def occurrenceOwnerValid (state : RuntimeState) (processInstanceId : SemanticId)
    (owner : ScopeOccurrenceId) (elementId : NodeId) (activation : Nat) : Bool :=
  !processInstanceId.value.isEmpty && !elementId.value.isEmpty && activation > 0 &&
    processInstanceId = owner.processInstanceId &&
    flowNodeOccurrenceOwnerLiveUnique state owner

/-- Internal proof API extracting exact operation ownership from a singleton declaring census. -/
theorem operationOwnedBy_of_exact_declaration (program : Program)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (declarers : List SemanticOperation) (declarersEq : declarers = [operation])
    (declared : declaredByExactlyOneOwnedOperation program declarers owner = true) :
    operationOwnedBy program operation owner = true := by
  simp only [declaredByExactlyOneOwnedOperation, declarersEq] at declared
  unfold operationOwningScope? at declared
  unfold operationOwnedBy
  split <;> simp_all

end FlowNodeOccurrenceProgramValidity.Internal

open FlowNodeOccurrenceProgramValidity.Internal

private def scopeOperationBindingValid (program : Program) (occurrence : RuntimeScopeOccurrence)
    (definition : DefinitionScope) : Bool :=
  match occurrence.parent with
  | none => true
  | some parent =>
      (program.operations.filter fun operation =>
        if !operationOwnedBy program operation parent then false
        else match operation with
        | .enterScope _ origin _ _ childScopeId
        | .enterBoundedScope _ origin _ _ childScopeId _ =>
            childScopeId = occurrence.id.definitionScopeId &&
              origin.elementId = definition.originElementId
        | _ => false).length = 1

private def runtimeScopeBindingValid (program : Program) (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  match program.definitionScopes.filter fun scope =>
      decide (scope.id = occurrence.id.definitionScopeId) with
  | [definition] =>
      !occurrence.id.processInstanceId.value.isEmpty &&
        !occurrence.id.definitionScopeId.value.isEmpty && occurrence.id.activation > 0 &&
        flowNodeOccurrenceOwnerLiveUnique state occurrence.id &&
        scopeOperationBindingValid program occurrence definition &&
        match definition.parentScopeId, occurrence.parent, state.control with
        | some expected, some parent, .running _ =>
            parent.processInstanceId = occurrence.id.processInstanceId &&
              parent.definitionScopeId = expected &&
              flowNodeOccurrenceOwnerLiveUnique state parent
        | none, none, .running hosting =>
            if occurrence.id.processInstanceId = hosting then
              definition.originElementId.value = program.processId.value
            else (state.calledProcessOccurrences.filter fun record => decide
              (record.calledRoot = occurrence.id &&
                record.calledProcessId.value = definition.originElementId.value)).length = 1
        | _, _, _ => false
  | _ => false

private def callRecordValid (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) : Bool :=
  occurrenceOwnerValid state record.id.processInstanceId record.caller
      ⟨record.id.elementId.value⟩ record.id.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation record.caller then false
      else match operation with
      | .invokeProcess _ origin _ calledProcessId calledRootScopeId _ returnOperationId =>
          origin.elementId.value = record.id.elementId.value &&
            calledProcessId = record.calledProcessId &&
            calledRootScopeId = record.calledRoot.definitionScopeId &&
            returnOperationId = record.returnOperationId
      | _ => false).length = 1

/-- Structural scope and Call Activity correspondence for open-occurrence projection. -/
def flowNodeOccurrenceStructuralProgramValidity (program : Program)
    (state : RuntimeState) : Bool :=
  state.scopeOccurrences.all (runtimeScopeBindingValid program state) &&
    state.calledProcessOccurrences.all (callRecordValid program state)

/-- Structural validity makes every exact live scope owner's Process identity nonempty. -/
theorem flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty (program : Program)
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (valid : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (live : exactLiveOccurrence state owner = true) :
    !owner.processInstanceId.value.isEmpty = true := by
  simp only [flowNodeOccurrenceStructuralProgramValidity, Bool.and_eq_true] at valid
  unfold exactLiveOccurrence at live
  simp only [decide_eq_true_eq] at live
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp live
  have occurrenceFiltered : occurrence ∈ state.scopeOccurrences.filter fun current =>
      decide (current.id = owner) := by
    rw [singleton]
    exact List.mem_cons_self
  have occurrenceMember : occurrence ∈ state.scopeOccurrences :=
    (List.mem_filter.mp occurrenceFiltered).1
  have occurrenceEq : occurrence.id = owner := by
    have := (List.mem_filter.mp occurrenceFiltered).2
    simpa only [decide_eq_true_eq] using this
  have occurrenceValid := List.all_eq_true.mp valid.1 occurrence occurrenceMember
  subst owner
  unfold runtimeScopeBindingValid at occurrenceValid
  generalize definitionsEq : (program.definitionScopes.filter fun scope =>
    decide (scope.id = occurrence.id.definitionScopeId)) = definitions at occurrenceValid
  cases definitions with
  | nil => simp at occurrenceValid
  | cons definition rest => cases rest with
    | nil =>
        simp only [Bool.and_eq_true] at occurrenceValid
        simpa using occurrenceValid.1.1.1.1.1
    | cons other tail => simp at occurrenceValid

/-- Structural validity exposes the Process identity checked for one live root owner. -/
theorem flowNodeOccurrenceStructuralProgramValidity_live_owner_process_binding (program : Program)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (instanceId : SemanticId)
    (valid : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (running : state.control = .running instanceId)
    (live : exactLiveOccurrence state owner = true) :
    (∃ occurrence parent definition,
      occurrence ∈ state.scopeOccurrences ∧ occurrence.id = owner ∧
      occurrence.parent = some parent ∧
      definition ∈ program.definitionScopes ∧
      definition.id = owner.definitionScopeId ∧
      definition.parentScopeId = some parent.definitionScopeId ∧
      parent.processInstanceId = owner.processInstanceId ∧
      flowNodeOccurrenceOwnerLiveUnique state parent = true) ∨
    (owner.processInstanceId = instanceId ∧
      ∃ definition,
        definition ∈ program.definitionScopes ∧
        definition.id = owner.definitionScopeId ∧
        definition.parentScopeId = none ∧
        definition.originElementId.value = program.processId.value) ∨
    ∃ record definition,
      record ∈ state.calledProcessOccurrences ∧
      record.calledRoot = owner ∧
      owner.processInstanceId ≠ instanceId ∧
      definition ∈ program.definitionScopes ∧
      definition.id = owner.definitionScopeId ∧
      definition.parentScopeId = none ∧
      record.calledProcessId.value = definition.originElementId.value := by
  simp only [flowNodeOccurrenceStructuralProgramValidity, Bool.and_eq_true] at valid
  unfold exactLiveOccurrence at live
  simp only [decide_eq_true_eq] at live
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp live
  have occurrenceFiltered : occurrence ∈ state.scopeOccurrences.filter fun current =>
      decide (current.id = owner) := by
    rw [singleton]
    exact List.mem_cons_self
  have occurrenceMember : occurrence ∈ state.scopeOccurrences :=
    (List.mem_filter.mp occurrenceFiltered).1
  have occurrenceEq : occurrence.id = owner := by
    simpa only [decide_eq_true_eq] using (List.mem_filter.mp occurrenceFiltered).2
  have occurrenceValid := List.all_eq_true.mp valid.1 occurrence occurrenceMember
  unfold runtimeScopeBindingValid at occurrenceValid
  generalize definitionsEq : (program.definitionScopes.filter fun scope =>
    decide (scope.id = occurrence.id.definitionScopeId)) = definitions at occurrenceValid
  cases definitions with
  | nil => simp at occurrenceValid
  | cons definition rest => cases rest with
    | cons other tail => simp at occurrenceValid
    | nil =>
        have definitionFiltered : definition ∈ program.definitionScopes.filter fun scope =>
            decide (scope.id = occurrence.id.definitionScopeId) := by
          rw [definitionsEq]
          exact List.mem_cons_self
        have definitionMember := (List.mem_filter.mp definitionFiltered).1
        have definitionId : definition.id = occurrence.id.definitionScopeId := by
          exact of_decide_eq_true (List.mem_filter.mp definitionFiltered).2
        simp only at occurrenceValid
        cases staticParentEq : definition.parentScopeId <;>
          cases runtimeParentEq : occurrence.parent <;>
          simp [staticParentEq, runtimeParentEq, running] at occurrenceValid
        · by_cases hosting : occurrence.id.processInstanceId = instanceId
          · simp only [if_pos hosting] at occurrenceValid
            refine Or.inr (Or.inl ⟨occurrenceEq ▸ hosting, definition, definitionMember,
              ?_, staticParentEq, occurrenceValid.2⟩)
            simpa [occurrenceEq] using definitionId
          · refine Or.inr (Or.inr ?_)
            simp only [if_neg hosting] at occurrenceValid
            obtain ⟨record, singleton⟩ := List.length_eq_one_iff.mp occurrenceValid.2
            have member : record ∈ state.calledProcessOccurrences.filter fun current =>
                decide (current.calledRoot = occurrence.id) &&
                  decide (current.calledProcessId.value = definition.originElementId.value) := by
              rw [singleton]
              exact List.mem_cons_self
            have accepted : decide (record.calledRoot = occurrence.id) = true ∧
                decide (record.calledProcessId.value = definition.originElementId.value) = true := by
              simpa only [Bool.and_eq_true] using (List.mem_filter.mp member).2
            exact ⟨record, definition, (List.mem_filter.mp member).1,
              (of_decide_eq_true accepted.1).trans occurrenceEq,
              occurrenceEq ▸ hosting, definitionMember,
              by simpa [occurrenceEq] using definitionId, staticParentEq,
              of_decide_eq_true accepted.2⟩
        · rename_i parent
          refine Or.inl ⟨occurrence, parent, definition, occurrenceMember, occurrenceEq,
            runtimeParentEq, definitionMember, ?_, ?_, ?_, ?_⟩
          · simpa [occurrenceEq] using definitionId
          · exact staticParentEq.trans (congrArg some occurrenceValid.2.1.2.symm)
          · simpa [occurrenceEq] using occurrenceValid.2.1.1
          · simpa [flowNodeOccurrenceOwnerLiveUnique] using occurrenceValid.2.2

/-- Structural validity classifies one live owner as nested, hosting-root, or exact called-root. -/
theorem flowNodeOccurrenceStructuralProgramValidity_live_owner_binding (program : Program)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (instanceId : SemanticId)
    (valid : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (running : state.control = .running instanceId)
    (live : exactLiveOccurrence state owner = true) :
    (∃ occurrence parent,
      occurrence ∈ state.scopeOccurrences ∧ occurrence.id = owner ∧
      occurrence.parent = some parent ∧
      parent.processInstanceId = owner.processInstanceId ∧
      flowNodeOccurrenceOwnerLiveUnique state parent = true) ∨
    owner.processInstanceId = instanceId ∨
    ∃ record, record ∈ state.calledProcessOccurrences ∧ record.calledRoot = owner := by
  rcases flowNodeOccurrenceStructuralProgramValidity_live_owner_process_binding
      program state owner instanceId valid running live with nested | hosting | called
  · obtain ⟨occurrence, parent, _, occurrenceMember, occurrenceEq, parentEq, _, _, _,
        sameInstance, parentLive⟩ := nested
    exact Or.inl ⟨occurrence, parent, occurrenceMember, occurrenceEq, parentEq,
      sameInstance, parentLive⟩
  · exact Or.inr (Or.inl hosting.1)
  · obtain ⟨record, _, member, root, _⟩ := called
    exact Or.inr (Or.inr ⟨record, member, root⟩)

theorem flowNodeOccurrenceStructuralProgramValidity_frame (program : Program)
    (before after : RuntimeState)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    flowNodeOccurrenceStructuralProgramValidity program after =
      flowNodeOccurrenceStructuralProgramValidity program before := by
  have scopeValidEq : runtimeScopeBindingValid program after =
      runtimeScopeBindingValid program before := by
    funext occurrence
    unfold runtimeScopeBindingValid flowNodeOccurrenceOwnerLiveUnique
    rw [control, scopes, calls]
  have callValidEq : callRecordValid program after = callRecordValid program before := by
    funext record
    unfold callRecordValid occurrenceOwnerValid flowNodeOccurrenceOwnerLiveUnique
    rw [scopes]
  simp [flowNodeOccurrenceStructuralProgramValidity, scopes, calls, scopeValidEq, callValidEq]

end BpmnSemantics.SemanticProcess
