import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.InternalOperationOccurrence

/-! Laws of the occurrence-addressed merge-target scope operations: the entry and completion frames of CEA-ISOLATE-01 and
the evaluator-to-relation bridge into `OperationStep`. The bridge is a dispatcher and constructor-selection
check, because each relation arm's premise is the evaluator's own result; the semantic content sits in the
freshness, factoring, refusal and frame laws of `ScopeOccurrenceEntry` and `ScopeCompletion`. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- CEA-ISOLATE-01 for entry: every live occurrence stays live, waits and variables are untouched, and
tokens change only by consuming one `input` token of `parent` and starting the child. -/
theorem enterConcurrentScopeState_frame (state after : RuntimeState) (parent : ScopeOccurrenceId)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (entered : enterConcurrentScopeState? state parent input childEntry childScopeId = some after) :
    (∀ occurrence ∈ state.scopeOccurrences, occurrence ∈ after.scopeOccurrences) ∧
      after.waits = state.waits ∧ after.messageWaits = state.messageWaits ∧
      after.timerWaits = state.timerWaits ∧ after.effectWaits = state.effectWaits ∧
      after.variables = state.variables ∧
      ∃ child, after.tokens = addToken (removeToken state.tokens input parent) childEntry child := by
  obtain ⟨instanceId, _, _, rfl⟩ := enterConcurrentScopeState_update state after parent input childEntry
    childScopeId entered
  refine ⟨fun occurrence member => ?_, rfl, rfl, rfl, rfl, rfl, _, rfl⟩
  exact (mem_canonicalInsertBy _ _ _ _).mpr (Or.inr member)

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
  obtain ⟨tokens, occurrences, waits, messageWaits, timerWaits, effectWaits, control⟩ :=
    completeQuiescentScope_child_frame state completed occurrence parent output parentOf applied
  refine ⟨tokens, occurrences, ?_, waits, messageWaits, timerWaits, effectWaits, control⟩
  unfold completeQuiescentScope? at applied
  rw [parentOf] at applied
  cases running : state.control <;> simp only [running] at applied
  all_goals first
    | contradiction
    | (split at applied
       · simp only [Option.some.injEq] at applied
         subst applied
         rfl
       · contradiction)

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
    simp only [applyInternalOperationOccurrence?, control, resolved, Option.bind_eq_bind, Option.bind_some,
      target, ite_true] at applied
    exact .completeScopeOccurrence id origin scopeId parentOutput candidate.owner before after target applied

end InternalCommutation

end BpmnSemantics.SemanticProcess
