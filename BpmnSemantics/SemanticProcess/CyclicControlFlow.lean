import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Exclusive Merge runtime semantics

This module owns the declarative and executable state transition for the resumption-bounded cycle profile's Exclusive Merge. The relation permits one pass-through for each offered token occurrence. The executable evaluator implements the deterministic unique-offer subset selected by this profile and deliberately leaves multi-offer selection incomplete.
-/

namespace BpmnSemantics.SemanticProcess

private def tokenUsesMergeInput (inputs : List ControlPlaceId)
    (token : ControlToken) : Bool :=
  inputs.contains token.placeId

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

/-- Tokens offered to an Exclusive Merge, preserving their full multiplicity and owners. -/
def exclusiveMergeInputTokens (state : RuntimeState)
    (inputs : List ControlPlaceId) : List ControlToken :=
  state.tokens.filter (tokenUsesMergeInput inputs)

/-- Execute the selected profile's deterministic subset, where exactly one token is offered across all inputs. -/
def mergeExclusiveState? (state : RuntimeState)
    (inputs : List ControlPlaceId) (output : ControlPlaceId) :
    Option RuntimeState :=
  match exclusiveMergeInputTokens state inputs with
  | [token] =>
      some
        { state with
          tokens := addToken
            (removeToken state.tokens token.placeId token.owner)
            output token.owner }
  | _ => none

/-- General declarative Exclusive Merge relation: each offered token occurrence permits one ownership-preserving pass-through without synchronization or input priority. -/
inductive MergeExclusiveStep : RuntimeState -> List ControlPlaceId ->
    ControlPlaceId -> RuntimeState -> Prop where
  | permitted before inputs output token
      (offered : token ∈ exclusiveMergeInputTokens before inputs) :
      MergeExclusiveStep before inputs output
        { before with
          tokens := addToken
            (removeToken before.tokens token.placeId token.owner)
            output token.owner }

/-- Every executable Exclusive Merge transition satisfies its declarative relation. -/
theorem mergeExclusiveState_sound (before after : RuntimeState)
    (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (result : mergeExclusiveState? before inputs output = some after) :
    MergeExclusiveStep before inputs output after := by
  unfold mergeExclusiveState? at result
  generalize uniqueEq : exclusiveMergeInputTokens before inputs = offered at result
  cases offered with
  | nil => simp at result
  | cons token rest =>
      cases rest with
      | nil =>
          simp at result
          subst after
          exact .permitted before inputs output token (by simp [uniqueEq])
      | cons next tail => simp at result

/-- A concrete offered token always supplies its ownership-preserving declarative pass-through, independently of other offers. -/
theorem mergeExclusiveStep_of_offered_token (before : RuntimeState)
    (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (token : ControlToken) (present : token ∈ before.tokens)
    (offered : token.placeId ∈ inputs) :
    MergeExclusiveStep before inputs output
      { before with
        tokens := addToken
          (removeToken before.tokens token.placeId token.owner)
          output token.owner } := by
  apply MergeExclusiveStep.permitted
  simp [exclusiveMergeInputTokens, tokenUsesMergeInput, present, offered]

/-- On a singleton state whose token is offered, the executable subset passes that token through exactly. -/
theorem mergeExclusiveState_singleton_offer
    (before : RuntimeState) (inputs : List ControlPlaceId)
    (output : ControlPlaceId) (token : ControlToken)
    (singleton : before.tokens = [token])
    (offered : token.placeId ∈ inputs) :
    mergeExclusiveState? before inputs output =
      some
        { before with
          tokens := [{ placeId := output, owner := token.owner }] } := by
  simp [mergeExclusiveState?, exclusiveMergeInputTokens,
    tokenUsesMergeInput, singleton, offered, removeToken, addToken]

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
          simp [addToken]
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
