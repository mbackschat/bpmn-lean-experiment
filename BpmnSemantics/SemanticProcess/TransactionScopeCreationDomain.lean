import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.TransactionCompensationTokenPreservation

/-! Prepared scope entry retains the existing root-only Compensation laws: the approved
Transaction shape excludes another child creation while its retention declaration is selected. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

private theorem transaction_scope_member (program : Program) (childId parentId : DefinitionScopeId)
    (found : compensationTransactionParentScope? program childId = some parentId)
    (definition : DefinitionScope) (member : definition ∈ program.definitionScopes) :
    definition.parentScopeId = none ∨ definition.id = childId := by
  unfold compensationTransactionParentScope? at found
  split at found
  · rename_i root child roots children
    split at found
    · rename_i checks
      have rootMember : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) := by
        rw [roots]; simp
      have childMember : child ∈ program.definitionScopes.filter (fun scope => scope.id == childId) := by
        rw [children]; simp
      obtain ⟨rootMember, rootParent⟩ := List.mem_filter.mp rootMember
      obtain ⟨childMember, childIdentity⟩ := List.mem_filter.mp childMember
      have length : program.definitionScopes.length = 2 := by
        simp only [Bool.and_eq_true, decide_eq_true_eq] at checks
        exact checks.1.1.1.1.1.1
      obtain ⟨first, second, shape⟩ : ∃ first second,
          program.definitionScopes = [first, second] :=
        ⟨_, _, List.eq_getElem_of_length_eq_two program.definitionScopes length⟩
      simp only [shape, List.mem_cons] at member rootMember childMember
      simp only [Bool.and_eq_true, bne_iff_ne, beq_iff_eq, decide_eq_true_eq] at checks
      simp only [beq_iff_eq] at childIdentity
      simp only [Option.isNone_iff_eq_none] at rootParent
      grind
    · contradiction
  · contradiction

private theorem transactionRetentionShape_excludes_rootDomain (program : Program)
    (retention : CompensationActivityRetentionDeclaration)
    (domain : RootCompensationExecutionDomain program)
    (valid : compensationTransactionRetentionShapeValid program retention = true) : False := by
  unfold compensationTransactionRetentionShapeValid at valid
  split at valid
  · simp only [Bool.and_eq_true] at valid
    have selected := valid.2
    split at selected
    · rename_i id origin scope input output boundary operations
      have member : .cancelTransaction id origin scope input output boundary ∈ program.operations := by
        have filtered := operations.symm ▸
          List.mem_singleton_self (SemanticOperation.cancelTransaction id origin scope input output boundary)
        exact (List.mem_filter.mp filtered).1
      exact domain _ member
    · contradiction
  · contradiction

/-- A valid root-only compensation account cannot select the child-retention validator. -/
theorem compensationActivityRetention_root_parent_absent (program : Program)
    (retention : CompensationActivityRetentionDeclaration)
    (present : program.compensationActivityRetention = some retention)
    (domain : RootCompensationExecutionDomain program)
    (valid : compensationActivityRetentionDeclarationValid program = true) :
    compensationTransactionParentScope? program retention.definitionScopeId = none := by
  have childInvalid : compensationTransactionRetentionShapeValid program retention = false := by
    apply Bool.eq_false_iff.mpr
    exact transactionRetentionShape_excludes_rootDomain program retention domain
  simp only [compensationActivityRetentionDeclarationValid, present, Bool.and_eq_true] at valid
  have flat := valid.1.1.1.1.1.1.1.1.1.1.1.1
  rw [childInvalid, Bool.or_false] at flat
  have flat := (Bool.and_eq_true_iff.mp flat).1
  change (match program.definitionScopes.filter (·.parentScopeId.isNone) with
    | [root] => root.id == retention.definitionScopeId && root.parentScopeId.isNone &&
        root.originElementId.value == program.processId.value &&
        (program.compensationExecution.isSome || program.definitionScopes.length = 1)
    | _ => false) = true at flat
  unfold compensationTransactionParentScope?
  split
  · rename_i root child roots children
    have childMember : child ∈ program.definitionScopes.filter
        (fun scope => scope.id == retention.definitionScopeId) := by rw [children]; simp
    have childId : child.id = retention.definitionScopeId := by
      simpa using (List.mem_filter.mp childMember).2
    simp only [roots, Bool.and_eq_true, beq_iff_eq] at flat
    have same : root.id = child.id := flat.1.1.1.trans childId.symm
    simp [same]
  · rfl

/-- Ordinary preparation excludes the selected child's register creation; the two-scope account leaves no other child entry. -/
theorem scopeCreation_rootCompensationDomain (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (origin : BpmnElementOrigin) (definition : DefinitionScope)
    (execution : compensationExecutionDeclarationValid program = true)
    (checks : internalScopeCreationPredecessorChecks program state operation selected origin definition = true)
    (definitionMember : definition ∈ program.definitionScopes)
    (invocationMember : ∀ id callOrigin input process scope entry returnOperation,
      operation = .invokeProcess id callOrigin input process scope entry returnOperation →
        operation ∈ program.operations) : RootCompensationExecutionDomain program := by
  cases declared : program.compensationExecution with
  | none => exact RootCompensationExecutionDomain.of_no_execution program declared execution
  | some declaration =>
      have scopeValid := execution
      simp only [compensationExecutionDeclarationValid, declared, Bool.and_eq_true, and_assoc] at scopeValid
      have scopeValid := scopeValid.1
      conv at scopeValid => lhs; whnf
      split at scopeValid
      · rename_i id triggerOrigin scope input output triggerSelected
        exact RootCompensationExecutionDomain.of_root_declaration program declaration declared execution
          id triggerOrigin scope input output triggerSelected
      · cases retentionPresent : program.compensationActivityRetention with
        | none => simp [retentionPresent] at scopeValid
        | some retention =>
            simp only [retentionPresent, Bool.and_eq_true] at scopeValid
            have retentionValid := scopeValid.1
            have transaction := scopeValid.2
            unfold compensationTransactionRetentionShapeValid at transaction
            split at transaction
            · rename_i parent actualExecution target parentFound _ _
              have memberShape := transaction_scope_member program retention.definitionScopeId
                parent parentFound definition definitionMember
              simp only [internalScopeCreationPredecessorChecks, Bool.and_eq_true] at checks
              have unchanged := checks.1
              have definitionMatches := checks.2.1.1.1.1.1.1.1.2
              cases operation with
              | enterScope id entryOrigin input entry scope =>
                  simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true,
                    decide_eq_true_eq] at definitionMatches
                  simp only [internalScopeCreationRetentionUnchanged, retentionPresent,
                    Option.map_some, decide_eq_true_eq] at unchanged
                  rcases memberShape with root | child
                  · simp [root] at definitionMatches
                  · exact False.elim (unchanged (by grind))
              | invokeProcess id callOrigin input process scope entry returnOperation =>
                  have member := invocationMember id callOrigin input process scope entry returnOperation rfl
                  simp only [compensationActivityRetentionDeclarationValid, retentionPresent,
                    Bool.and_eq_true, Bool.not_eq_true'] at retentionValid
                  have absent := retentionValid.2
                  have rejected := List.any_eq_false.mp absent _ member
                  contradiction
              | _ => simp [internalScopeCreationDefinitionMatches] at definitionMatches
            · contradiction
      · contradiction

theorem scopeCreation_runtime_rootCompensationDomain (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (origin : BpmnElementOrigin) (definition : DefinitionScope)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (checks : internalScopeCreationPredecessorChecks program state operation selected origin definition = true)
    (found : definitionScope? program selected.created.id.definitionScopeId = some definition)
    (invocationMember : ∀ id callOrigin input process scope entry returnOperation,
      operation = .invokeProcess id callOrigin input process scope entry returnOperation →
        operation ∈ program.operations) : RootCompensationExecutionDomain program := by
  have execution : compensationExecutionDeclarationValid program = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid
    have execution := valid.2.2
    simp only [compensationExecutionStateValid, Bool.and_eq_true] at execution
    exact execution.1
  have member : definition ∈ program.definitionScopes := by
    unfold definitionScope? at found
    split at found
    · rename_i chosen filtered
      cases found
      have member : definition ∈ program.definitionScopes.filter
          (fun scope => decide (scope.id = selected.created.id.definitionScopeId)) := by
        rw [filtered]; simp
      exact (List.mem_filter.mp member).1
    · contradiction
  exact scopeCreation_rootCompensationDomain program state operation selected origin definition
    execution checks member invocationMember

end BpmnSemantics.SemanticProcess
