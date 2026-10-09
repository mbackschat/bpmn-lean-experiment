import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import BpmnSemantics.SemanticProcess.InternalOccurrenceRegionLaws

/-! # Declaration selection for parallel reservation

PMIS-SELECT-01 preparation rechecks operation and input-flow ownership. These
checks follow exact occurrence resolution and the admitted Program graph,
without assuming preparation succeeds or introducing another selection rule.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

/-- Exact occurrence resolution binds the operation to the selected owner definition. -/
theorem resolved_definition_owner (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    operationOwningScope? program operation.id = some candidate.owner.definitionScopeId := by
  have declaration := resolveInternalOperationOccurrence_declaration program state candidate operation resolved
  obtain ⟨candidates, discovered, member⟩ :=
    resolveInternalOperationOccurrence_requires_exact_candidate program state candidate operation resolved
  unfold internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  split at discovered <;> try contradiction
  rename_i binding selected
  dsimp only at discovered
  split at discovered <;> try contradiction
  cases Option.some.inj discovered
  obtain ⟨owner, present, equal⟩ := List.mem_map.mp member
  have ownerEq : owner = candidate.owner := congrArg InternalOperationOccurrence.owner equal
  have scopeEq : owner.definitionScopeId = binding.scopeId :=
    eq_of_beq (List.mem_filter.mp ((mem_sortBy _ _ _).mp present)).2
  have filters : program.operationScopes.filter (fun ownership => decide (ownership.operationId = operation.id)) =
      [binding] := by
    simpa only [declaration.2, Bool.beq_eq_decide_eq] using selected
  simp only [operationOwningScope?, filters]
  rw [← scopeEq, ownerEq]

/-- An admitted resolved operation satisfies reservation's exact declaration and scope census. -/
theorem resolved_exactProgramSelection (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (wellFormed : programWellFormed program = true)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    exactProgramSelection program operation candidate.owner = true := by
  have member := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
  have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have operationsUnique : program.operations.Nodup :=
    List.Pairwise.of_map (S := (· ≠ ·)) (fun operation : SemanticOperation => operation.id.value)
      (fun _ _ different same => different (congrArg (fun operation : SemanticOperation => operation.id.value) same)) unique
  have exactOperation : program.operations.filter (fun other => decide (other = operation)) = [operation] :=
    filter_key_eq_singleton_of_nodup program.operations (fun operation => operation) operation
      (by simpa using operationsUnique) member
  have owned := resolved_definition_owner program state candidate operation resolved
  simp only [exactProgramSelection, exactOperation, List.length_singleton, decide_true, Bool.true_and]
  unfold operationOwningScope? at owned
  split at owned <;> try contradiction
  have scopeEq := Option.some.inj owned
  simp_all

/-- Resolver discovery's duplicate-owner guard establishes reservation's exact live occurrence census. -/
theorem resolved_exactLiveOccurrence (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    exactLiveOccurrence state candidate.owner = true := by
  obtain ⟨candidates, discovered, member⟩ :=
    resolveInternalOperationOccurrence_requires_exact_candidate program state candidate operation resolved
  unfold internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  split at discovered <;> try contradiction
  rename_i binding selected
  dsimp only at discovered
  split at discovered <;> try contradiction
  rename_i unique
  cases Option.some.inj discovered
  obtain ⟨owner, present, equal⟩ := List.mem_map.mp member
  have ownerEq : owner = candidate.owner := congrArg InternalOperationOccurrence.owner equal
  have rawMember := (mem_sortBy _ _ _).mp present
  have scopeEq := (List.mem_filter.mp rawMember).2
  have rawUnique := (sortBy_permutation scopeBefore _).nodup_iff.mp unique
  have singleton := filter_key_eq_singleton_of_nodup _ (fun owner => owner) owner
    (by simpa using rawUnique) rawMember
  have count := congrArg List.length singleton
  rw [ownerEq] at scopeEq count
  simp only [List.filter_filter, List.length_singleton] at count
  have sameFilter : (fun other : ScopeOccurrenceId =>
      decide (other = candidate.owner) && (other.definitionScopeId == binding.scopeId)) =
      (fun other => decide (other = candidate.owner)) := by
    funext other
    by_cases same : other = candidate.owner
    · subst other; simp [scopeEq]
    · simp [same]
  rw [sameFilter] at count
  simpa only [exactLiveOccurrence, List.filter_map, Function.comp_def, List.length_map, decide_eq_true_eq] using count

/-- Admission gives each resolved same-scope port its exact Sequence Flow origin used by reservation. -/
theorem resolved_selectedInputOrigin (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation) (input : ControlPlaceId)
    (wellFormed : programWellFormed program = true)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (sameScope : operationControlPlacesShareOwner operation = true)
    (port : input ∈ operationControlPlaces operation) :
    ∃ origin, selectedInputOrigin? program input candidate.owner = some origin := by
  have member := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
  have operationIds : (program.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have placeIds : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program wellFormed)
  obtain ⟨scope, place, operationBinding, placeBinding, declaration⟩ :=
    programGraphWellFormed_operationControlPlaceScope program operation input
      (programWellFormed_graph program wellFormed) operationIds placeIds member sameScope port
  have owned := resolved_definition_owner program state candidate operation resolved
  have scopeEq : scope = candidate.owner.definitionScopeId := by
    simpa only [operationOwningScope?, operationBinding, Option.some.injEq] using owned
  exact ⟨place.origin, by simp [selectedInputOrigin?, declaration, placeBinding, scopeEq]⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
