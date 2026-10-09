import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs

/-! # Admitted Fork and Join scope classification

PMIS-ADMIT-01 restricts the parent to its serial spine and declares exactly one
root and one repeated child definition. A resolved Fork or Join with a declared
owner therefore belongs to the child; the existing ancestry check supplies that
declaration premise before preparation without assuming a successor.
-/

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

open BpmnSemantics InternalCommutation

/-- The admitted parent path contains no Fork or Join, independently of runtime readiness. -/
theorem ParentSpineTrace.excludes_fork_join (entryId : OperationId)
    (operations : List SemanticOperation) (next : ControlPlaceId) (entered : Bool)
    (path : List SemanticOperation) (trace : ParentSpineTrace entryId operations next entered path) :
    ∀ operation ∈ path, operation.kind ≠ .duplicate ∧ operation.kind ≠ .synchronize := by
  induction trace with
  | finish operations next id origin input selected empty =>
      intro operation member
      have same : operation = .reachNoneEnd id origin input := List.mem_singleton.mp member
      simp [same, SemanticOperation.kind]
  | step operations next output entered nextEntered head tail selected edge rest ih =>
      intro operation member
      rcases List.mem_cons.mp member with same | later
      · subst operation
        cases head <;> simp_all [ParentSpineStep, SemanticOperation.kind]
      · exact ih operation later

private theorem length_two_members {α : Type} (values : List α) (left right : α)
    (length : values.length = 2) (leftMember : left ∈ values) (rightMember : right ∈ values)
    (different : left ≠ right) : ∀ value ∈ values, value = left ∨ value = right := by
  cases values with
  | nil => simp at length
  | cons first rest =>
      cases rest with
      | nil => simp at length
      | cons second tail =>
          have empty : tail = [] := by
            apply List.length_eq_zero_iff.mp
            simp only [List.length_cons] at length
            omega
          subst tail
          simp only [List.mem_cons, List.not_mem_nil, or_false] at leftMember rightMember
          intro value member
          simp only [List.mem_cons, List.not_mem_nil, or_false] at member
          rcases leftMember with rfl | rfl <;> rcases rightMember with rfl | rfl
          all_goals first | exact member | exact Or.symm member | simp_all

/-- The exact two-definition admission census separates the sole parentless root from its repeated child. -/
theorem analyzeProgram_definition_scope_classification (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) :
    ∃ root child,
      program.definitionScopes.filter (·.parentScopeId.isNone) = [root] ∧
      child.id = analysis.entry.childScopeId ∧ child.parentScopeId = some root.id ∧
      ∀ definition ∈ program.definitionScopes, definition = root ∨ definition = child := by
  obtain ⟨_, _, _, _, _, _, _, admittedEntries, _⟩ := analyzeProgram_body_certificate program analysis analyzed
  unfold analyzeProgram at analyzed
  split at analyzed <;> try contradiction
  rename_i guard
  have length : program.definitionScopes.length = 2 := by
    by_cases same : program.definitionScopes.length = 2
    · exact same
    · simp [same] at guard
  split at analyzed <;> try contradiction
  rename_i entries entry entryEq
  have entryIdentity : entry = analysis.entry := by simpa using entryEq.symm.trans admittedEntries
  split at analyzed <;> try contradiction
  rename_i roots root rootsEq
  split at analyzed <;> try contradiction
  rename_i children child childEq
  split at analyzed <;> try contradiction
  split at analyzed <;> try contradiction
  rename_i link
  have parent : child.parentScopeId = some root.id := by
    simp only [Bool.or_eq_true, bne_iff_ne, not_or] at link
    exact Classical.byContradiction link.2
  have rootFiltered : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
    rootsEq.symm ▸ List.mem_singleton_self root
  have childFiltered : child ∈ program.definitionScopes.filter (·.id == entry.childScopeId) :=
    childEq.symm ▸ List.mem_singleton_self child
  have rootParent : root.parentScopeId = none := by
    simpa using (List.mem_filter.mp rootFiltered).2
  have childId : child.id = analysis.entry.childScopeId := by
    simpa only [entryIdentity, beq_iff_eq] using (List.mem_filter.mp childFiltered).2
  have different : root ≠ child := by
    intro same
    subst child
    rw [rootParent] at parent
    contradiction
  exact ⟨root, child, rootsEq, childId, parent,
    length_two_members program.definitionScopes root child length
      (List.mem_filter.mp rootFiltered).1 (List.mem_filter.mp childFiltered).1 different⟩

/-- Exact declaration ownership places an operation in the corresponding admitted scope population. -/
theorem operation_owner_population (program : Program) (operation : SemanticOperation)
    (scope : DefinitionScopeId) (declared : operation ∈ program.operations)
    (owned : operationOwningScope? program operation.id = some scope) :
    operation ∈ program.operations.filter (fun candidate => program.operationScopes.any
      (fun binding => binding.operationId == candidate.id && binding.scopeId == scope)) := by
  apply List.mem_filter.mpr
  refine ⟨declared, ?_⟩
  unfold operationOwningScope? at owned
  generalize bindings : program.operationScopes.filter
    (fun binding => decide (binding.operationId = operation.id)) = candidates at owned
  cases candidates with
  | nil => simp at owned
  | cons binding rest =>
      cases rest with
      | cons other tail => simp at owned
      | nil =>
          have scopeEq := Option.some.inj owned
          have filtered : binding ∈ program.operationScopes.filter
              (fun binding => decide (binding.operationId = operation.id)) :=
            bindings.symm ▸ List.mem_singleton_self binding
          have operationEq := of_decide_eq_true (List.mem_filter.mp filtered).2
          exact List.any_eq_true.mpr ⟨binding, (List.mem_filter.mp filtered).1, by simp [operationEq, scopeEq]⟩

/-- Declaration ownership plus the parent-spine permutation excludes Fork and Join from every parent declaration, including Start and completion. -/
theorem analyzeProgram_parent_excludes_fork_join (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (root : DefinitionScope)
    (rootSelected : program.definitionScopes.filter (·.parentScopeId.isNone) = [root])
    (operation : SemanticOperation) (declared : operation ∈ program.operations)
    (owned : operationOwningScope? program operation.id = some root.id) :
    operation.kind ≠ .duplicate ∧ operation.kind ≠ .synchronize := by
  obtain ⟨actualRoot, parent, counts, start, completion, output, path, rootsEq, parentEq, _, _,
    completionSelected, startEq, trace, _, _, _, coverage, _⟩ := analyzeProgram_parent_spine program analysis analyzed
  have rootEq : actualRoot = root := by simpa using rootsEq.symm.trans rootSelected
  subst actualRoot
  have parentMember : operation ∈ parent :=
    parentEq.symm ▸ operation_owner_population program operation root.id declared owned
  have listed : operation ∈ start :: path ++ [completion] := coverage.mem_iff.mp parentMember
  rcases List.mem_cons.mp listed with same | later
  · have startKind : start.kind = .initiate := congrArg SemanticOperation.kind startEq
    simp [same, startKind]
  · rcases List.mem_append.mp later with pathMember | completionMember
    · exact trace.excludes_fork_join analysis.entry.id _ output false path operation pathMember
    · have completionKind : completion.kind = .completeScope := by
        have filtered : completion ∈ parent.filter (fun operation => match operation with
            | .completeScope .. => true | _ => false) :=
          completionSelected.symm ▸ List.mem_singleton_self completion
        have selected := (List.mem_filter.mp filtered).2
        cases completion <;> simp only [] at selected <;> try contradiction
        rfl
      have same : operation = completion := List.mem_singleton.mp completionMember
      simp [same, completionKind]

/-- Resolved Fork and Join operations with declared owner definitions belong to the repeated child; resolution alone does not validate arbitrary runtime definitions. -/
theorem resolved_fork_join_child_of_declared_owner (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (declaredOwner : candidate.owner.definitionScopeId ∈ program.definitionScopes.map (·.id))
    (kind : operation.kind = .duplicate ∨ operation.kind = .synchronize) :
    candidate.owner.definitionScopeId = analysis.entry.childScopeId := by
  obtain ⟨root, child, rootSelected, childId, _, classification⟩ :=
    analyzeProgram_definition_scope_classification program analysis analyzed
  obtain ⟨definition, member, identity⟩ := List.mem_map.mp declaredOwner
  rcases classification definition member with same | same
  · subst definition
    have owned := resolved_definition_owner program state candidate operation resolved
    rw [← identity] at owned
    have excluded := analyzeProgram_parent_excludes_fork_join program analysis analyzed root rootSelected
      operation (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1 owned
    rcases kind with fork | join
    · exact False.elim (excluded.1 fork)
    · exact False.elim (excluded.2 join)
  · subst definition
    exact identity.symm.trans childId

/-- A positive-fuel ancestry check requires an exact declared definition before traversing any parent edge. -/
theorem occurrenceOwnerRootValid_declared_definition (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (fuel : Nat)
    (ancestry : occurrenceOwnerRootValid program state (fuel + 1) owner = true) :
    owner.definitionScopeId ∈ program.definitionScopes.map (·.id) := by
  unfold occurrenceOwnerRootValid at ancestry
  generalize definitions : program.definitionScopes.filter (·.id == owner.definitionScopeId) = selected at ancestry
  cases selected with
  | nil => simp at ancestry
  | cons definition rest =>
      cases rest with
      | cons other tail => simp at ancestry
      | nil =>
          have filtered : definition ∈ program.definitionScopes.filter (·.id == owner.definitionScopeId) :=
            definitions.symm ▸ List.mem_singleton_self definition
          exact List.mem_map.mpr ⟨definition, (List.mem_filter.mp filtered).1,
            eq_of_beq (List.mem_filter.mp filtered).2⟩

/-- Existing pre-preparation ancestry closes declared-owner classification for every resolved Fork or Join. -/
theorem resolved_fork_join_child (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (ancestry : occurrenceOwnerRootValid program state (state.scopeOccurrences.length + 1) candidate.owner = true)
    (kind : operation.kind = .duplicate ∨ operation.kind = .synchronize) :
    candidate.owner.definitionScopeId = analysis.entry.childScopeId :=
  resolved_fork_join_child_of_declared_owner program analysis analyzed state candidate operation resolved
    (occurrenceOwnerRootValid_declared_definition program state candidate.owner state.scopeOccurrences.length ancestry) kind

end BpmnSemantics.SemanticProcess.ParallelScopeStart
