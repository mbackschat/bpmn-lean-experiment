import BpmnSemantics.SemanticProcess.InternalRegionalCallSequentialBinding
import BpmnSemantics.SemanticProcess.InternalRegionalCallPositionValidity

/-! Call-tree removal keeps issuance counters and immutable declaration bindings.
Owner liveness uses the existing exact census theorem; controller liveness additionally
uses the predecessor's program binding to align Activity identity and owner identity. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem filtered_call_owners_live {α : Type} (state : RuntimeState)
    (call : CalledProcessOccurrence) (values : List α) (owner : α → ScopeOccurrenceId)
    (keep : α → Bool)
    (live : values.all (fun value => exactLiveOccurrence state (owner value)) = true)
    (outside : ∀ value ∈ values, keep value = true →
      (owner value).processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
        [call.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    (values.filter keep).all
      (fun value => exactLiveOccurrence (removeCalledProcessTree state call) (owner value)) = true := by
  apply List.all_eq_true.mpr
  intro value member
  obtain ⟨prior, kept⟩ := List.mem_filter.mp member
  exact removeCalledProcessTree_preserves_live_owner state call (owner value)
    (List.all_eq_true.mp live value prior) (outside value prior kept)

theorem removeCalledProcessTree_preserves_wait_owners (state : RuntimeState)
    (call : CalledProcessOccurrence) (valid : waitOwnersLive state = true) :
    waitOwnersLive (removeCalledProcessTree state call) = true := by
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at valid ⊢
  refine ⟨filtered_call_owners_live state call state.waits (·.owner) _ valid.1 ?_,
    filtered_call_owners_live state call state.messageWaits (·.owner) _ valid.2.1 ?_,
    filtered_call_owners_live state call state.timerWaits (·.owner) _ valid.2.2.1 ?_,
    filtered_call_owners_live state call state.effectWaits (·.owner) _ valid.2.2.2.1 ?_,
    filtered_call_owners_live state call state.effectIncidents (·.wait.owner) _ valid.2.2.2.2.1 ?_,
    filtered_call_owners_live state call state.selectedBranchSets (·.owner) _ valid.2.2.2.2.2.1 ?_,
    filtered_call_owners_live state call state.eventRaces (·.owner) _ valid.2.2.2.2.2.2.1 ?_,
    filtered_call_owners_live state call state.calledProcessOccurrences (·.caller) _ valid.2.2.2.2.2.2.2.1 ?_,
    filtered_call_owners_live state call state.activityOccurrences (·.owner) _ valid.2.2.2.2.2.2.2.2 ?_⟩
  all_goals
    intro value _ kept
    simp only [Bool.and_eq_true, Bool.not_eq_true', Bool.eq_false_iff] at kept
    intro inside
    first
    | exact kept (List.contains_iff_mem.mpr inside)
    | exact kept.1.2 (List.contains_iff_mem.mpr inside)

theorem removeCalledProcessTree_preserves_identity_bound (state : RuntimeState)
    (call : CalledProcessOccurrence) (valid : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound (removeCalledProcessTree state call) = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at valid ⊢
  exact ⟨⟨all_filter _ _ _ valid.1.1, all_filter _ _ _ valid.1.2⟩,
    all_filter _ _ _ valid.2⟩

theorem removeCalledProcessTree_preserves_wait_declarations (program : Program)
    (state : RuntimeState) (instanceId : SemanticId) (call : CalledProcessOccurrence)
    (valid : waitDeclarationsValid program instanceId state = true) :
    waitDeclarationsValid program instanceId (removeCalledProcessTree state call) = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true, and_assoc] at valid ⊢
  refine ⟨?_, ?_, ?_, ?_, ?_⟩
  all_goals
    apply List.all_eq_true.mpr
    intro value member
    obtain ⟨kept, inInstance⟩ := List.mem_filter.mp member
    first
    | exact List.all_eq_true.mp valid.1 value (List.mem_filter.mpr ⟨(List.mem_filter.mp kept).1, inInstance⟩)
    | exact List.all_eq_true.mp valid.2.1 value (List.mem_filter.mpr ⟨(List.mem_filter.mp kept).1, inInstance⟩)
    | exact List.all_eq_true.mp valid.2.2.1 value (List.mem_filter.mpr ⟨(List.mem_filter.mp kept).1, inInstance⟩)
    | exact List.all_eq_true.mp valid.2.2.2.1 value (List.mem_filter.mpr ⟨(List.mem_filter.mp kept).1, inInstance⟩)
    | exact List.all_eq_true.mp valid.2.2.2.2 value (List.mem_filter.mpr ⟨(List.mem_filter.mp kept).1, inInstance⟩)

theorem removeCalledProcessTree_preserves_hidden_declarations (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (valid : hiddenRecordDeclarationsValid program state = true) :
    hiddenRecordDeclarationsValid program (removeCalledProcessTree state call) = true := by
  simp only [hiddenRecordDeclarationsValid, Bool.and_eq_true] at valid ⊢
  exact ⟨all_filter _ _ _ valid.1, all_filter _ _ _ valid.2⟩

theorem removeCalledProcessTree_preserves_controller_owners (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (valid : controllersOwnLiveActivity state = true)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true) :
    controllersOwnLiveActivity (removeCalledProcessTree state call) = true := by
  apply List.all_eq_true.mpr
  intro controller member
  have prior := (List.mem_filter.mp member).1
  rw [removeCalledProcessTree_controller_activity_census program state call controller member
    (List.all_eq_true.mp bindings controller prior)]
  exact List.all_eq_true.mp valid controller prior

end BpmnSemantics.SemanticProcess
