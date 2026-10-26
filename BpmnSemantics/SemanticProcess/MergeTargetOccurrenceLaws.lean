module

import BpmnSemantics.SemanticProcess.CollectionOrder
public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import BpmnSemantics.SemanticProcess.TokenStorage

/-! Laws of the occurrence-addressed merge-target scope operations: the entry and completion frames of CEA-ISOLATE-01 and
the evaluator-to-relation bridge into `OperationStep`. The bridge is a dispatcher and constructor-selection
check, because each relation arm's premise is the evaluator's own result; the semantic content sits in the
freshness, factoring, refusal and frame laws of `ScopeOccurrenceEntry` and `ScopeCompletion`. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- CEA-ISOLATE-01 for entry: every live occurrence stays live, waits and variables are untouched, and
tokens change only by consuming exactly one arriving `input` token of `parent` and starting the child. -/
theorem enterConcurrentScopeState_frame (state after : RuntimeState) (parent : ScopeOccurrenceId)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (entered : enterConcurrentScopeState? state parent input childEntry childScopeId = some after) :
    (∀ occurrence ∈ state.scopeOccurrences, occurrence ∈ after.scopeOccurrences) ∧
      after.waits = state.waits ∧ after.messageWaits = state.messageWaits ∧
      after.timerWaits = state.timerWaits ∧ after.effectWaits = state.effectWaits ∧
      after.variables = state.variables ∧
      (removeToken state.tokens input parent).length + 1 = state.tokens.length ∧
      ∃ child, after.tokens = addToken (removeToken state.tokens input parent) childEntry child := by
  obtain ⟨instanceId, _, _, arriving, rfl⟩ := enterConcurrentScopeState_update state after parent input
    childEntry childScopeId entered
  refine ⟨fun occurrence member => ?_, rfl, rfl, rfl, rfl, rfl, ?_, _, rfl⟩
  · exact (mem_canonicalInsertBy _ _ _ _).mpr (Or.inr member)
  · rw [removeToken_eq_erase, List.length_erase_of_mem arriving]
    exact Nat.sub_add_cancel (List.length_pos_of_mem arriving)

/-- CEA-ISOLATE-01 for completion: completing the child occurrence `owner` adds exactly one token for its
parent, removes only `owner` from the live occurrences and only its variable scopes, and leaves every wait
collection and the control unchanged, so no other occurrence of the same definition loses a component. -/
theorem completeScopeOccurrenceState_frame (state completed : RuntimeState) (owner parent : ScopeOccurrenceId)
    (scopeId : DefinitionScopeId) (output : ControlPlaceId)
    (child : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id = owner → occurrence.parent = some parent)
    (completion : completeScopeOccurrenceState? state owner scopeId (some output) = some completed) :
    completed.tokens = addToken state.tokens output parent ∧
      completed.scopeOccurrences = state.scopeOccurrences.filter (fun candidate => decide (candidate.id ≠ owner)) ∧
      completed.variables.scopes = state.variables.scopes.filter (fun scope => decide (scope.owner ≠ owner)) ∧
      completed.waits = state.waits ∧ completed.messageWaits = state.messageWaits ∧
      completed.timerWaits = state.timerWaits ∧ completed.effectWaits = state.effectWaits ∧
      completed.control = state.control := by
  obtain ⟨occurrence, member, same, _, _, applied⟩ :=
    completeScopeOccurrenceState_selected state completed owner scopeId (some output) completion
  have parentOf := child occurrence member same
  subst same
  exact completeQuiescentScope_child_frame state completed occurrence parent output parentOf applied

namespace InternalCommutation

/-- Every successful occurrence-addressed application of a merge-target scope operation is an
`OperationStep` through its occurrence-addressed constructor. -/
theorem applyInternalOperationOccurrence_mergeTarget_sound (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (target : isMergeTargetOperation program operation = true)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    OperationStep program operation before after := by
  have running : ∃ instanceId, before.control = .running instanceId := by
    cases control : before.control <;> simp [applyInternalOperationOccurrence?, control] at applied
    exact ⟨_, rfl⟩
  obtain ⟨_, control⟩ := running
  cases operation
  all_goals first | (simp [isMergeTargetOperation] at target; done) | skip
  case enterScope id origin input childEntry childScopeId =>
    simp only [applyInternalOperationOccurrence?, control, resolved, Option.bind_eq_bind, Option.bind_some,
      target, Bool.true_and] at applied
    split at applied
    · exact .enterConcurrentScope id origin input childEntry childScopeId candidate.owner before after
        target applied
    · contradiction
  case completeScope id origin scopeId parentOutput =>
    cases parentOutput with
    | none => simp [isMergeTargetOperation] at target
    | some output =>
        simp only [applyInternalOperationOccurrence?, control, resolved, Option.bind_eq_bind, Option.bind_some,
          target, ite_true] at applied
        exact .completeScopeOccurrence id origin scopeId output candidate.owner before after target applied

end InternalCommutation

end BpmnSemantics.SemanticProcess
