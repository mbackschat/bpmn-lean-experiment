import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Normal scope completion

This module owns the quiescence predicate and the normal completion transition for one scope
occurrence: whether a scope *may* complete, and what completing it does. Regional cancellation is
owned by `ScopeCancellation`; token operations and wait construction remain in `RuntimeState`.

Completion is deliberately the only transition that may retire a scope occurrence normally, so a family
that layers extra withdrawal on it composes this owner rather than reimplementing quiescence.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def scopeQuiescent (state : RuntimeState) (owner : ScopeOccurrenceId) : Bool :=
  !(state.tokens.any fun token => token.owner == owner) &&
    !(state.waits.any fun wait => wait.owner == owner) &&
    !(state.messageWaits.any fun wait => wait.owner == owner) &&
    !(state.timerWaits.any fun wait => wait.owner == owner) &&
    !(state.effectWaits.any fun wait => wait.owner == owner) &&
    !(state.effectIncidents.any fun incident => incident.wait.owner == owner) &&
    !(state.selectedBranchSets.any fun record => record.owner == owner) &&
    !(state.eventRaces.any fun race => race.owner == owner) &&
    !(state.calledProcessOccurrences.any fun record => record.caller == owner) &&
    !(state.scopeOccurrences.any fun occurrence => occurrence.parent == some owner)

/-- The completion rewrite for one already-quiescent occurrence, selected by whether it is the root.

Separate from the gating above so each owner has one responsibility: the caller decides *whether* a
scope may complete, and this decides *what completing it does*. Root completion ends the instance and
clears its occurrence; a child hands exactly one continuation token to its live parent. -/
private def completeQuiescentScope? (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) (parentOutput : Option ControlPlaceId) :
    Option RuntimeState :=
  match occurrence.parent, parentOutput, state.control with
  | none, none, .running instanceId =>
      if state.initiationPending then none
      else some ({ state with
          control := .completed instanceId
          scopeOccurrences := [] })
  | some parent, some output, .running _ =>
      if state.scopeOccurrences.any fun candidate => candidate.id == parent then
        some ({ state with
            tokens := addToken state.tokens output parent
            scopeOccurrences := state.scopeOccurrences.filter fun candidate =>
              decide (candidate.id ≠ occurrence.id) })
      else none
  | _, _, _ => none

def completeScopeState? (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) : Option RuntimeState :=
  match state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id.definitionScopeId = scopeId) with
  | [occurrence] =>
      if !scopeQuiescent state occurrence.id then none
      else completeQuiescentScope? state occurrence parentOutput
  | _ => none

private theorem completeQuiescentScope_preserves_unrelated_components
    (state completed : RuntimeState) (occurrence : RuntimeScopeOccurrence)
    (parentOutput : Option ControlPlaceId)
    (completion : completeQuiescentScope? state occurrence parentOutput = some completed) :
    completed.timerWaits = state.timerWaits ∧
      completed.waits = state.waits ∧
      completed.scopeActivations = state.scopeActivations ∧
      completed.timerActivations = state.timerActivations ∧
      completed.endOccurrences = state.endOccurrences ∧
      completed.logicalTimeMs = state.logicalTimeMs := by
  unfold completeQuiescentScope? at completion
  -- Each arm either refuses or returns a record update; `simp at completion` is guarded by `done` so a
  -- partial rewrite cannot be mistaken for a closed branch.
  repeat' split at completion
  all_goals
    first
      | (simp at completion; done)
      | (simp only [Option.some.injEq] at completion
         subst completion
         exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩)

/-- Scope completion rewrites only control, scope occurrences, and tokens.

Every other component is carried through unchanged. A family layered on this transition needs that fact
to withdraw its own state and to separate its arms by logical time: without it, a law about the composed
transition cannot see that the shared completion left the timer, wait, activation, and end-history
components alone. -/
theorem completeScopeState_preserves_unrelated_components
    (state completed : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId)
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    completed.timerWaits = state.timerWaits ∧
      completed.waits = state.waits ∧
      completed.scopeActivations = state.scopeActivations ∧
      completed.timerActivations = state.timerActivations ∧
      completed.endOccurrences = state.endOccurrences ∧
      completed.logicalTimeMs = state.logicalTimeMs := by
  unfold completeScopeState? at completion
  split at completion
  · split at completion
    · simp at completion
    · exact completeQuiescentScope_preserves_unrelated_components state completed _
        parentOutput completion
  · simp at completion

/-- A uniquely identified live scope cannot complete while any owned token, wait, or child occurrence remains. -/
theorem completeScopeState_refuses_nonquiescent
    (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) (occurrence : RuntimeScopeOccurrence)
    (unique :
      state.scopeOccurrences.filter (fun candidate =>
        decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (blocked : scopeQuiescent state occurrence.id = false) :
    completeScopeState? state scopeId parentOutput = none := by
  simp [completeScopeState?, unique, blocked]

end BpmnSemantics.SemanticProcess
