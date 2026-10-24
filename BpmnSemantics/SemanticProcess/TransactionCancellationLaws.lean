module

public import BpmnSemantics.SemanticProcess.TransactionCancellation
public import BpmnSemantics.SemanticProcess.TokenStorage

/-! Transaction cancellation emits one parent continuation without emitting the normal output. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem transaction_join_adds_one_parent_token (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after) :
    ∃ parent,
      (after.tokens.filter (fun token => token.placeId == output && token.owner == parent)).length =
        (before.tokens.filter (fun token => token.placeId == output && token.owner == parent)).length + 1 := by
  cases joined with
  | joined occurrence parent selected parentSelected quiescent =>
      refine ⟨parent, ?_⟩
      simpa using addToken_filter_length before.tokens output parent
        (fun token => token.placeId == output && token.owner == parent)

theorem transaction_join_does_not_emit_normal_output (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output normalOutput : ControlPlaceId)
    (different : normalOutput ≠ output)
    (joined : TransactionCancellationJoin before owner output after) :
    (after.tokens.filter (fun token => token.placeId == normalOutput)).length =
      (before.tokens.filter (fun token => token.placeId == normalOutput)).length := by
  cases joined with
  | joined occurrence parent selected parentSelected quiescent =>
      simpa [Ne.symm different] using addToken_filter_length before.tokens output parent
        (fun token => token.placeId == normalOutput)

end BpmnSemantics.SemanticProcess
