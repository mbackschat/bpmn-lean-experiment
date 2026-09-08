import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.TokenPatch

/-! # Local-control token-patch validity

The [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md) requires explicit
owned token removal to retain foreign-owner units at the same place. This owner derives runtime
validity from the token patch and static output bindings, without selecting an operation or assuming
its successor is valid.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem runtimePositionValid_removeTokens (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (places : List ControlPlaceId) (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program instanceId state = true) :
    runtimePositionValid program instanceId
      { state with tokens := removeTokens state.tokens places owner } = true := by
  exact runtimePositionValid_tokens_sublist_frame program instanceId state _ valid
    rfl rfl rfl (removeTokens_sublist state.tokens places owner)

theorem runtimePositionValid_addTokens (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (places : List ControlPlaceId) (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program instanceId state = true)
    (live : exactLiveOccurrence state owner = true)
    (declared : ∀ place ∈ places, ∃ declaration,
      program.controlPlaces.filter (fun candidate => decide (candidate.id = place)) = [declaration])
    (owned : ∀ place ∈ places, program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := owner.definitionScopeId }]) :
    runtimePositionValid program instanceId
      { state with tokens := addTokens state.tokens places owner } = true := by
  induction places with
  | nil => exact valid
  | cons first rest ih =>
      have restValid := ih (fun place member => declared place (by simp [member]))
        (fun place member => owned place (by simp [member]))
      exact runtimePositionValid_addToken program instanceId
        { state with tokens := addTokens state.tokens rest owner } first owner restValid live
        (declared first (by simp)) (owned first (by simp))

/-- Exact singleton output declarations and live scope ownership settle token production validity;
consumption retains arbitrary foreign-owner multiplicity through the sublist frame. -/
theorem TokenPatch.preserves_position (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (patch : TokenPatch)
    (valid : runtimePositionValid program instanceId state = true)
    (live : exactLiveOccurrence state patch.owner = true)
    (declared : ∀ place ∈ patch.produced, ∃ declaration,
      program.controlPlaces.filter (fun candidate => decide (candidate.id = place)) = [declaration])
    (owned : ∀ place ∈ patch.produced, program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := patch.owner.definitionScopeId }]) :
    runtimePositionValid program instanceId
      { state with tokens := patch.apply state.tokens } = true := by
  exact runtimePositionValid_addTokens program instanceId
    { state with tokens := removeTokens state.tokens patch.consumed patch.owner }
    patch.produced patch.owner
    (runtimePositionValid_removeTokens program instanceId state patch.consumed patch.owner valid)
    live declared owned

theorem TokenPatch.preserves_collection_order (state : RuntimeState) (patch : TokenPatch)
    (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder { state with tokens := patch.apply state.tokens } = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokens, activity⟩, tasks⟩, activations⟩, messages⟩,
    timers⟩, effects⟩, messageActivations⟩, timerActivations⟩, effectActivations⟩, variables⟩,
    branches⟩, races⟩, calls⟩, occurrences⟩, sequential⟩, parallel⟩ := ordered
  exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨patch.preserves_order state.tokens tokens, activity⟩, tasks⟩,
    activations⟩, messages⟩, timers⟩, effects⟩, messageActivations⟩, timerActivations⟩,
    effectActivations⟩, variables⟩, branches⟩, races⟩, calls⟩, occurrences⟩, sequential⟩, parallel⟩

/-- The live owner forces running control, where Compensation and all other non-token checks frame
through unchanged fields. Inclusive record changes require their own preservation proof. -/
theorem TokenPatch.preserves_runtimeStateWellFormed (program : Program)
    (instanceId : SemanticId) (state : RuntimeState) (patch : TokenPatch)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (live : exactLiveOccurrence state patch.owner = true)
    (declared : ∀ place ∈ patch.produced, ∃ declaration,
      program.controlPlaces.filter (fun candidate => decide (candidate.id = place)) = [declaration])
    (owned : ∀ place ∈ patch.produced, program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := patch.owner.definitionScopeId }]) :
    runtimeStateWellFormed program instanceId
      { state with tokens := patch.apply state.tokens } = true := by
  have ordered := patch.preserves_collection_order state
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state valid)
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩, waitOwners⟩,
    waitIds⟩, identity⟩, waits⟩, hidden⟩, _order⟩, activities⟩, timers⟩, messages⟩,
    activityIds⟩, controllers⟩, sequential⟩, parallel⟩, controllerIds⟩, exhausted⟩,
    notStarted⟩, compensation⟩ := valid
  obtain ⟨runningId, running⟩ :=
    runtimePositionValid_liveOccurrence_running program instanceId state patch.owner position live
  have executionFrame := compensationExecutionStateValid_running_frame program state
    { state with tokens := patch.apply state.tokens } runningId running
    rfl rfl rfl rfl rfl rfl
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨patch.preserves_position program instanceId state
    position live declared owned, races⟩, incidents⟩, waitOwners⟩, waitIds⟩, identity⟩,
    waits⟩, hidden⟩, ordered⟩, activities⟩, timers⟩, messages⟩, activityIds⟩, controllers⟩,
    sequential⟩, parallel⟩, controllerIds⟩, exhausted⟩, notStarted⟩,
    ⟨⟨⟨compensation.1.1.1, compensation.1.1.2⟩, compensation.1.2⟩, ?_⟩⟩
  rw [executionFrame]
  exact compensation.2

/-- Running open occurrences describe waits, scopes, and calls, so a token-only patch leaves the
actual projection unchanged, including whether projection succeeds. -/
theorem TokenPatch.open_occurrences_frame (program : Program) (state : RuntimeState)
    (patch : TokenPatch) (instanceId : SemanticId)
    (running : state.control = .running instanceId) :
    projectOpenFlowNodeOccurrences? program { state with tokens := patch.apply state.tokens } =
      projectOpenFlowNodeOccurrences? program state := by
  cases state
  cases running
  rfl

end BpmnSemantics.SemanticProcess
