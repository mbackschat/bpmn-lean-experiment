import BpmnSemantics.SemanticProcess.ParallelScopeRuntime
import BpmnSemantics.SemanticProcess.InternalRegionalRemovalValidity

/-! # Parallel scope wait-declaration preservation

RSI-BIND-04 must survive PMIS entry and retirement so later issuance can use
retained declaration provenance rather than assume reservation freshness.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- RSI-BIND-04 holds at actual Start because no wait has yet been issued. -/
theorem runningProgramStartState_wait_declarations (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) :
    waitDeclarationsValid program instanceId state = true := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  simp [waitDeclarationsValid, runningStartState, initialState]

private theorem issueParallelBodies_wait_declarations (program : Program) (instanceId : SemanticId)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (items : List String)
    (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (valid : waitDeclarationsValid program instanceId before = true)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    waitDeclarationsValid program instanceId after = true := by
  induction items generalizing before index iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      exact issued.1 ▸ valid
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      apply ih _ _ _ ?_ generated
      exact valid

/-- PMIS-ENTER-01 creates scopes and tokens; declaration provenance of retained waits is unchanged. -/
theorem enterParallelScope_preserves_wait_declarations (program : Program) (instanceId : SemanticId)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState)
    (valid : waitDeclarationsValid program instanceId before = true)
    (entered : enterParallelScope? entry before parent = some after) :
    waitDeclarationsValid program instanceId after = true := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact valid
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        apply issueParallelBodies_wait_declarations program instanceId entry parent
          _ 0 _ issued (first :: rest) ?_ generated
        exact valid

private theorem cancelParallelBodies_wait_declarations (program : Program) (instanceId : SemanticId)
    (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (valid : waitDeclarationsValid program instanceId state = true) :
    waitDeclarationsValid program instanceId
      (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state) = true := by
  induction iterations generalizing state with
  | nil => exact valid
  | cons first rest ih =>
      exact ih _ (cancelScopeSubtree_preserves_wait_declarations program state instanceId first.scope .remove valid)

/-- PMIS-END-01 and PMIS-CANCEL-01 reuse regional removal: retirement cannot introduce an undeclared wait. -/
theorem completeParallelScope_preserves_wait_declarations (program : Program) (instanceId : SemanticId)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) (before after : RuntimeState)
    (valid : waitDeclarationsValid program instanceId before = true)
    (completed : completeParallelScope? entry before target = some after) :
    waitDeclarationsValid program instanceId after = true := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · exact cancelScopeSubtree_preserves_wait_declarations program _ instanceId target .remove valid
  · exact cancelScopeSubtree_preserves_wait_declarations program _ instanceId target .remove valid
  · exact cancelParallelBodies_wait_declarations program instanceId (first :: rest) _
      (cancelScopeSubtree_preserves_wait_declarations program _ instanceId target .remove valid)

end BpmnSemantics.SemanticProcess
