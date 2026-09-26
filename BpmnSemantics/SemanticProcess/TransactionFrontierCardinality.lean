import BpmnSemantics.SemanticProcess.TransactionFrontierPhases
import BpmnSemantics.SemanticProcess.InternalSnapshotArmingExecution
import BpmnSemantics.SemanticProcess.InternalOccurrenceRegionLaws

/-! # Transaction single-token frontier cardinality

The admitted sole consumer and phase barriers constrain actual attempted operations. Sorting and
filtering those attempts preserve multiplicity, so the conclusion covers the production frontier,
not merely a set of enabled operation identities. Reachability must still establish the phase facts.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

private theorem filterMap_keeps_selected (values : List α) (keep : α → Bool)
    (select : α → Option β)
    (outside : ∀ value ∈ values, keep value = false → select value = none) :
    values.filterMap select = (values.filter keep).filterMap select := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
    have rest := ih (fun value member => outside value (List.mem_cons_of_mem head member))
    cases kept : keep head with
    | false => simp [kept, outside head List.mem_cons_self kept, rest]
    | true => simp [List.filterMap_cons, kept, rest]

/-- One token and blocked scope completion leave zero or one actual internal transition. -/
theorem transaction_single_token_frontier_cardinality
    (program : Program) (roles : TransactionAdmittedRoles program) (state : RuntimeState)
    (graph : transactionCancellationProgramGraph program = true)
    (token : ControlToken) (tokens : state.tokens = [token])
    (consumed : state.initiationPending = false)
    (blocked : ∀ id origin scope output,
      SemanticOperation.completeScope id origin scope output ∈ program.operations →
      attemptInternalOperation program (.completeScope id origin scope output) state =
        .disabled (.completeScope id origin scope output))
    (selected : SemanticOperation)
    (consumer : TransactionProgramRoles.soleConsumer? program token.placeId = some selected) :
    (snapshotInternalTransitionFrontier program state).transitions.length ≤ 1 := by
  let select : InternalOperationAttempt → Option (SemanticOperation × RuntimeState) := fun
    | .applied step => some (step.operation, step.successor)
    | .disabled _ | .refused _ _ => none
  let keep := fun operation => TransactionProgramRoles.operationInput? operation == some token.placeId
  have restrict := filterMap_keeps_selected program.operations keep
    (fun operation => select (attemptInternalOperation program operation state)) (by
      intro operation member outside
      cases applied : attemptInternalOperation program operation state with
      | disabled _ | refused _ _ => rfl
      | applied step =>
        have same := transaction_single_token_selects_only_consumer program roles state graph
          token tokens consumed blocked selected consumer operation member step applied
        have input := (TransactionProgramRoles.soleConsumer_facts program token.placeId
          selected consumer).2
        simp [keep, same, input] at outside)
  have filtered : program.operations.filter keep = [selected] :=
    TransactionProgramRoles.soleConsumer_exact program token.placeId selected consumer
  simp only [snapshotInternalTransitionFrontier, canonicalEnabledInternalTransitions,
    snapshot_sort_eq]
  rw [(sortBy_permutation _ _).length_eq]
  change (List.filterMap select (InternalCommutation.sortBy _ _)).length ≤ 1
  rw [((sortBy_permutation _ _).filterMap select).length_eq]
  rw [List.filterMap_map]
  change (program.operations.filterMap
    (fun operation => select (attemptInternalOperation program operation state))).length ≤ 1
  rw [restrict, filtered]
  cases result : select (attemptInternalOperation program selected state) <;>
    simp [result]

/-- Waiting or compensating phases with no token cannot offer a consuming transition. -/
theorem transaction_token_free_frontier_cardinality
    (program : Program) (roles : TransactionAdmittedRoles program) (state : RuntimeState)
    (graph : transactionCancellationProgramGraph program = true)
    (tokens : state.tokens = []) (consumed : state.initiationPending = false)
    (blocked : ∀ id origin scope output,
      SemanticOperation.completeScope id origin scope output ∈ program.operations →
      attemptInternalOperation program (.completeScope id origin scope output) state =
        .disabled (.completeScope id origin scope output)) :
    (snapshotInternalTransitionFrontier program state).transitions.length = 0 := by
  let select : InternalOperationAttempt → Option (SemanticOperation × RuntimeState) := fun
    | .applied step => some (step.operation, step.successor)
    | .disabled _ | .refused _ _ => none
  have empty : (program.operations.filterMap fun operation =>
      select (attemptInternalOperation program operation state)) = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    cases applied : attemptInternalOperation program operation state with
    | disabled _ | refused _ _ => rfl
    | applied step =>
      obtain ⟨input, consumes⟩ := transaction_applied_consumes_input program roles state graph
        consumed blocked operation member step applied
      have missing : onlyTokenOwner? state input = none := by
        simp [onlyTokenOwner?, tokenOwners, tokens]
      rw [transaction_consuming_attempt_without_token program state operation input roles.execution
        roles.executionPresent roles.snapshotsAbsent consumes missing] at applied
      contradiction
  simp only [snapshotInternalTransitionFrontier, canonicalEnabledInternalTransitions,
    snapshot_sort_eq]
  rw [(sortBy_permutation _ _).length_eq]
  change (List.filterMap select (InternalCommutation.sortBy _ _)).length = 0
  rw [((sortBy_permutation _ _).filterMap select).length_eq]
  rw [List.filterMap_map]
  exact congrArg List.length empty

end BpmnSemantics.SemanticProcess
