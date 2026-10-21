import BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound

/-! # Concurrent scope-occurrence entry

CEA-OCCUR-01 for a merge target: entry issues a fresh occurrence of the child definition, parented by the
arriving token's owner, even while other occurrences of that definition are live. `enterScopeState?` keeps
refusing a second live occurrence for every other `enterScope`; the two agree whenever none is live.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The occurrence `enterConcurrentScopeState?` issues: the definition's next activation. -/
def concurrentScopeChild (state : RuntimeState) (instanceId : SemanticId)
    (childScopeId : DefinitionScopeId) : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := childScopeId
    activation := scopeActivationCount state childScopeId + 1 }

/-- Consumes the arriving `input` token of `parent` and starts a fresh child occurrence at `childEntry`.
Entry refuses without that token, because `removeToken` would otherwise consume nothing while the child is
still created. -/
def enterConcurrentScopeState? (state : RuntimeState) (parent : ScopeOccurrenceId)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId) : Option RuntimeState :=
  match state.control with
  | .running instanceId =>
      if parent.processInstanceId ≠ instanceId then none
      else if !state.tokens.contains { placeId := input, owner := parent } then none
      else
        let child := concurrentScopeChild state instanceId childScopeId
        some { state with
          tokens := addToken (removeToken state.tokens input parent) childEntry child
          scopeOccurrences := insertScopeOccurrence { id := child, parent := some parent }
            state.scopeOccurrences
          scopeActivations := setScopeActivationCount state.scopeActivations childScopeId child.activation }
  | _ => none

/-- The sole owner of a place's tokens owns one of them. -/
theorem onlyTokenOwner_mem (state : RuntimeState) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (only : onlyTokenOwner? state place = some owner) : { placeId := place, owner } ∈ state.tokens := by
  unfold onlyTokenOwner? at only
  split at only
  · contradiction
  · next first rest owners =>
      split at only
      · have head : first ∈ tokenOwners state place := by simp [owners]
        simp only [Option.some.injEq] at only
        subst only
        simp only [tokenOwners, List.mem_map, List.mem_filter, decide_eq_true_eq] at head
        obtain ⟨token, ⟨member, sameplace⟩, sameowner⟩ := head
        cases token
        simp_all
      · contradiction

/-- Without a live occurrence of the definition, concurrent entry is the existing entry, so every model
without a merge region keeps its exact execution. -/
theorem enterConcurrentScopeState_eq_enterScopeState (state : RuntimeState) (parent : ScopeOccurrenceId)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (owner : onlyTokenOwner? state input = some parent)
    (none_live : (state.scopeOccurrences.any fun occurrence =>
      occurrence.id.definitionScopeId == childScopeId) = false) :
    enterConcurrentScopeState? state parent input childEntry childScopeId =
      enterScopeState? state input childEntry childScopeId := by
  have arriving := onlyTokenOwner_mem state input parent owner
  unfold enterConcurrentScopeState? enterScopeState?
  cases state.control <;> simp [owner, none_live, concurrentScopeChild, arriving]

/-- The exact update of a successful entry, so frame consequences need not unfold the evaluator. -/
theorem enterConcurrentScopeState_update (state after : RuntimeState) (parent : ScopeOccurrenceId)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (entered : enterConcurrentScopeState? state parent input childEntry childScopeId = some after) :
    ∃ instanceId, state.control = .running instanceId ∧ parent.processInstanceId = instanceId ∧
      { placeId := input, owner := parent } ∈ state.tokens ∧
      after = { state with
        tokens := addToken (removeToken state.tokens input parent) childEntry
          (concurrentScopeChild state instanceId childScopeId)
        scopeOccurrences := insertScopeOccurrence
          { id := concurrentScopeChild state instanceId childScopeId, parent := some parent }
          state.scopeOccurrences
        scopeActivations := setScopeActivationCount state.scopeActivations childScopeId
          (scopeActivationCount state childScopeId + 1) } := by
  unfold enterConcurrentScopeState? at entered
  split at entered
  · next instanceId running =>
      split at entered
      · contradiction
      · next same =>
          split at entered
          · contradiction
          · next arriving =>
              simp only [Bool.not_eq_true', Bool.not_eq_false, List.contains_iff_mem] at arriving
              refine ⟨instanceId, running, Decidable.of_not_not same, arriving, ?_⟩
              exact (Option.some.inj entered).symm
  · contradiction

/-- CEA-OCCUR-01: under `RSI-BOUND-01`'s Scope branch, the issued occurrence differs from every live
occurrence the bound covers, so entry never reuses a live identity. Called roots are excluded exactly as
the bound excludes them. -/
theorem enterConcurrentScopeState_fresh (state : RuntimeState) (instanceId : SemanticId)
    (childScopeId : DefinitionScopeId) (bounded : scopeIdentityBound state = true)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ state.scopeOccurrences)
    (uncalled : (state.calledProcessOccurrences.any (·.calledRoot == occurrence.id)) = false) :
    occurrence.id ≠ concurrentScopeChild state instanceId childScopeId := by
  have below := List.all_eq_true.mp bounded occurrence member
  simp only [uncalled, Bool.false_or, decide_eq_true_eq] at below
  intro same
  rw [same] at below
  simp only [concurrentScopeChild] at below
  omega

end BpmnSemantics.SemanticProcess
