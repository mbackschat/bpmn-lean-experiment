module

public import BpmnSemantics.SemanticProcess.RuntimePositionValidity
public import BpmnSemantics.SemanticProcess.TokenStorage
import all BpmnSemantics.SemanticProcess.CallActivity

/-! Local token removal and insertion preserve runtime position under exact owner and place bindings. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The selected single-removal API specializes the finite removal frame. -/
theorem runtimePositionValid_removeToken_frame (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState) (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (_selected : onlyTokenOwner? before input = some owner)
    (controlFrame : after.control = before.control)
    (scopesFrame : after.scopeOccurrences = before.scopeOccurrences)
    (callsFrame : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (tokensFrame : after.tokens = removeToken before.tokens input owner) :
    runtimePositionValid program expectedInstanceId after = true := by
  apply runtimePositionValid_tokens_sublist_frame program expectedInstanceId before after valid
    controlFrame scopesFrame callsFrame
  rw [tokensFrame]
  exact removeToken_sublist before.tokens input owner

/-- Adding one token at a projection-unique place owned by a live scope preserves the runtime
position. The caller supplies the singleton static ownership witness because this layer validates a
runtime state against an arbitrary admitted Program and does not select an operation family. -/
theorem runtimePositionValid_addToken (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (live : exactLiveOccurrence state owner = true)
    (placeDeclared : ∃ declared, program.controlPlaces.filter (fun candidate =>
      decide (candidate.id = place)) = [declared])
    (placeOwner : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := owner.definitionScopeId }]) :
    runtimePositionValid program expectedInstanceId
      { state with tokens := addToken state.tokens place owner } = true := by
  let after : RuntimeState := { state with tokens := addToken state.tokens place owner }
  change runtimePositionValid program expectedInstanceId after = true
  have controlFrame : after.control = state.control := rfl
  have scopesFrame : after.scopeOccurrences = state.scopeOccurrences := rfl
  have callsFrame : after.calledProcessOccurrences = state.calledProcessOccurrences := rfl
  have exactLiveFrame (id : ScopeOccurrenceId) :
      exactLiveOccurrence after id = exactLiveOccurrence state id := by
    simp [exactLiveOccurrence, scopesFrame]
  have scopeValidFrame (instanceId : SemanticId) (occurrence : RuntimeScopeOccurrence) :
      scopeOccurrenceValid program instanceId after occurrence =
        scopeOccurrenceValid program instanceId state occurrence := by
    simp [scopeOccurrenceValid, runtimeParentValid, rootAssociationValid,
      calledRootBindingValid, exactLiveOccurrence, scopesFrame, callsFrame]
  have tokenValidFrame (token : ControlToken) :
      tokenBindingValid program after token = tokenBindingValid program state token := by
    simp [tokenBindingValid, exactLiveOccurrence, scopesFrame]
  have rootsFrame (instanceId : SemanticId) :
      hostingRootCount program instanceId after = hostingRootCount program instanceId state := by
    simp [hostingRootCount, scopesFrame]
  have associationsFrame :
      calledProcessAssociationsValid after = calledProcessAssociationsValid state := by
    exact calledProcessAssociationsValid_frame state after controlFrame scopesFrame callsFrame
  simp only [runtimePositionValid, Bool.and_eq_true] at valid ⊢
  have placeUnique : ∃ declared, uniqueControlPlace? program place = some declared := by
    obtain ⟨declared, placeSingleton⟩ := placeDeclared
    have declaredFiltered : declared ∈ program.controlPlaces.filter (fun candidate =>
        decide (candidate.id = place)) := by rw [placeSingleton]; simp
    obtain ⟨declaredMember, declaredId⟩ := List.mem_filter.mp declaredFiltered
    simp only [decide_eq_true_eq] at declaredId
    have projection := valid.1.2
    simp only [programProjectionBindingsValid, Bool.and_eq_true] at projection
    have originCount := List.all_eq_true.mp projection.1 declared declaredMember
    simp only [decide_eq_true_eq] at originCount
    obtain ⟨originPlace, originSingleton⟩ := List.length_eq_one_iff.mp originCount
    have declaredOriginMember : declared ∈ program.controlPlaces.filter (fun candidate =>
        decide (candidate.origin = declared.origin)) :=
      List.mem_filter.mpr ⟨declaredMember, by simp⟩
    rw [originSingleton] at declaredOriginMember
    have declaredEq : declared = originPlace := by simpa using declaredOriginMember
    have originEq : originPlace = declared := declaredEq.symm
    subst originPlace
    refine ⟨declared, ?_⟩
    unfold uniqueControlPlace?
    simp [placeSingleton, originSingleton]
  refine ⟨valid.1, ?_⟩
  unfold lifecyclePositionValid at valid ⊢
  rw [controlFrame]
  cases controlEq : state.control with
  | notStarted =>
      simp [controlEq] at valid
      unfold exactLiveOccurrence at live
      rw [valid.2.1] at live
      simp at live
  | completed instanceId =>
      simp [controlEq] at valid
      unfold exactLiveOccurrence at live
      rw [valid.2.1.2] at live
      simp at live
  | cancelled instanceId =>
      simp [controlEq] at valid
      unfold exactLiveOccurrence at live
      rw [valid.2.1.2] at live
      simp at live
  | failed instanceId failure =>
      simp [controlEq] at valid
      unfold exactLiveOccurrence at live
      rw [valid.2.1.2] at live
      simp at live
  | running instanceId =>
      simp only [controlEq, runningPositionValid, Bool.and_eq_true] at valid ⊢
      obtain ⟨⟨⟨⟨identity, roots⟩, calls⟩, scopes⟩, tokens⟩ := valid.2
      refine ⟨⟨⟨⟨identity, ?_⟩, ?_⟩, ?_⟩, ?_⟩
      · rw [rootsFrame]
        exact roots
      · rw [associationsFrame]
        exact calls
      · simp only [List.all_eq_true] at scopes ⊢
        intro occurrence member
        rw [scopesFrame] at member
        have prior := scopes occurrence member
        simpa [exactLiveFrame, scopeValidFrame] using prior
      change (addToken state.tokens place owner).all (tokenBindingValid program after) = true
      simp only [addToken_all, Bool.and_eq_true]
      refine ⟨?_, ?_⟩
      unfold tokenBindingValid controlPlaceScope?
      obtain ⟨declared, placeUnique⟩ := placeUnique
      rw [placeUnique, placeOwner]
      simp only [Bool.and_eq_true, decide_eq_true_eq]
      refine ⟨trivial, ?_⟩
      rw [exactLiveFrame]
      exact live
      · rw [List.all_eq_true] at tokens ⊢
        intro token member
        rw [tokenValidFrame]
        exact tokens token member

end BpmnSemantics.SemanticProcess
