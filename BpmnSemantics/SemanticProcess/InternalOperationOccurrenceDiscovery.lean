module

public import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! PMIS-SELECT-01 operation/owner discovery and exact resolution. Execution of a resolved occurrence
belongs to `InternalOperationOccurrence`; this module only decides which occurrences exist and which
declaration an occurrence names.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

/-- PMIS-SELECT-01 keeps operation identity paired with its complete scope occurrence. -/
structure InternalOperationOccurrence where
  operationId : OperationId
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

/-- Owner discovery is independent of token/data readiness, which belongs to the evaluator. -/
def internalOperationOccurrences? (program : Program) (state : RuntimeState) (id : OperationId) :
    Option (List InternalOperationOccurrence) := do
  let [_] := program.operations.filter (·.id == id) | none
  let [binding] := program.operationScopes.filter (·.operationId == id) | none
  let owners := sortBy scopeBefore
    ((state.scopeOccurrences.map (·.id)).filter (·.definitionScopeId == binding.scopeId))
  if owners.Nodup then some (owners.map fun owner => ⟨id, owner⟩) else none

/-- A removed owner never rebinds to a remaining occurrence of the same definition. -/
def resolveInternalOperationOccurrence? (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) : Option SemanticOperation := do
  let candidates ← internalOperationOccurrences? program state candidate.operationId
  if candidates.contains candidate then program.operations.find? (·.id == candidate.operationId) else none

/-- Revalidation cannot succeed without the exact candidate in current discovery. -/
theorem resolveInternalOperationOccurrence_requires_exact_candidate (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    ∃ candidates, internalOperationOccurrences? program state candidate.operationId = some candidates ∧
      candidate ∈ candidates := by
  unfold resolveInternalOperationOccurrence? at resolved
  cases discovered : internalOperationOccurrences? program state candidate.operationId with
  | none => simp [discovered] at resolved
  | some candidates =>
      refine ⟨candidates, rfl, ?_⟩
      by_cases present : candidate ∈ candidates
      · exact present
      · simp [discovered, present] at resolved

/-- Exact resolution supplies both the declaration and its discovery key. -/
theorem resolveInternalOperationOccurrence_declaration (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    operation ∈ program.operations ∧ operation.id = candidate.operationId := by
  unfold resolveInternalOperationOccurrence? at resolved
  obtain ⟨candidates, _, resolved⟩ := Option.bind_eq_some_iff.mp resolved
  split at resolved
  · exact ⟨List.mem_of_find?_eq_some resolved, by simpa using List.find?_some resolved⟩
  · contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
