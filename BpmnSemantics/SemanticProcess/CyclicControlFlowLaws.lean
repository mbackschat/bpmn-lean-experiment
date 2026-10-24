module

public import BpmnSemantics.SemanticProcess.CyclicControlFlow
public import BpmnSemantics.SemanticProcess.TokenStorage

/-! Exclusive merge preserves token and active-unit counts; these storage laws are separate from executable selection. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem removeToken_length_of_member (tokens : List ControlToken)
    (token : ControlToken) (member : token ∈ tokens) :
    (removeToken tokens token.placeId token.owner).length + 1 =
      tokens.length := by
  induction tokens with
  | nil => simp at member
  | cons head tail inductionHypothesis =>
      by_cases sameIdentity :
          head.placeId = token.placeId ∧ head.owner = token.owner
      · simp [removeToken, sameIdentity]
      · have tailMember : token ∈ tail := by
          simp at member
          rcases member with equality | member
          · subst head
            exact False.elim (sameIdentity ⟨rfl, rfl⟩)
          · exact member
        simp [removeToken, sameIdentity, inductionHypothesis tailMember]

/-- Every executable Exclusive Merge step consumes and produces one token, preserving total token cardinality. -/
theorem mergeExclusiveState_preserves_token_count
    (before after : RuntimeState) (inputs : List ControlPlaceId)
    (output : ControlPlaceId)
    (result : mergeExclusiveState? before inputs output = some after) :
    after.tokens.length = before.tokens.length := by
  unfold mergeExclusiveState? at result
  generalize offeredEq : exclusiveMergeInputTokens before inputs = offered at result
  cases offered with
  | nil => simp at result
  | cons token rest =>
      cases rest with
      | nil =>
          simp at result
          subst after
          simp only [addToken_length]
          exact removeToken_length_of_member before.tokens token
            (by
              have member : token ∈ before.tokens := by
                have filtered : token ∈ exclusiveMergeInputTokens before inputs := by
                  simp [offeredEq]
                exact (List.mem_filter.mp filtered).1
              simpa using member)
      | cons next tail => simp at result

/-- The executable subset preserves the combined cardinality of control tokens and live User Task waits. -/
theorem mergeExclusiveState_preserves_active_unit_count
    (before after : RuntimeState) (inputs : List ControlPlaceId)
    (output : ControlPlaceId)
    (result : mergeExclusiveState? before inputs output = some after) :
    after.tokens.length + after.waits.length =
      before.tokens.length + before.waits.length := by
  have tokenCount :=
    mergeExclusiveState_preserves_token_count before after inputs output result
  unfold mergeExclusiveState? at result
  generalize offeredEq : exclusiveMergeInputTokens before inputs = offered at result
  cases offered with
  | nil => simp at result
  | cons token rest =>
      cases rest with
      | nil =>
          simp at result
          subst after
          simpa using congrArg (fun count => count + before.waits.length) tokenCount
      | cons next tail => simp at result

end BpmnSemantics.SemanticProcess
