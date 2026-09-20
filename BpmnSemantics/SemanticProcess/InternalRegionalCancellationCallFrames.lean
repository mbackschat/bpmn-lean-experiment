import BpmnSemantics.SemanticProcess.InternalRegionalCallFrames

/-! REG-OWN-FRAME-01 needs Call masks computed from the actual cancellation successor.
Predecessor region disjointness protects both endpoints of every reachable Call edge, so the
retained graph's own fuel computes the same forward closure without successor-validity premises. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

theorem exact_graph_call_endpoints_live (state : RuntimeState)
    (graph : scopeOwnershipGraphExact state = true)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences) :
    record.caller ∈ state.scopeOccurrences.map (·.id) ∧
      record.calledRoot ∈ state.scopeOccurrences.map (·.id) := by
  simp only [scopeOwnershipGraphExact, Bool.and_eq_true] at graph
  have fields := List.all_eq_true.mp graph.2 record member
  simp only [Bool.and_eq_true] at fields
  have callerCount : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.caller)).length = 1 := by
    have checked := fields.1
    change ((state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.caller)).length == 1) = true at checked
    exact beq_iff_eq.mp checked
  have rootCount : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.calledRoot) && occurrence.parent.isNone).length = 1 :=
    beq_iff_eq.mp fields.2
  obtain ⟨caller, callerSingleton⟩ := List.length_eq_one_iff.mp callerCount
  obtain ⟨called, calledSingleton⟩ := List.length_eq_one_iff.mp rootCount
  have callerMember : caller ∈ state.scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id = record.caller)) := by
    rw [callerSingleton]
    simp
  have calledMember : called ∈ state.scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id = record.calledRoot) && occurrence.parent.isNone) := by
    rw [calledSingleton]
    simp
  obtain ⟨callerLive, callerId⟩ := List.mem_filter.mp callerMember
  obtain ⟨calledLive, calledFields⟩ := List.mem_filter.mp calledMember
  exact ⟨List.mem_map.mpr ⟨caller, callerLive, of_decide_eq_true callerId⟩,
    List.mem_map.mpr ⟨called, calledLive, of_decide_eq_true (Bool.and_eq_true_iff.mp calledFields).1⟩⟩

/-- Both endpoints of every edge reachable from the other parentless root survive the exact
cancellation filter; directed transitive reachability protects the target as well as the caller. -/
theorem cancellation_disjoint_reachable_call_endpoints (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (leftRoot : ScopeOccurrenceId) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (rightRoot : RuntimeScopeOccurrence) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot.id = some rightRegion)
    (rightLive : rightRoot ∈ state.scopeOccurrences) (rightParent : rightRoot.parent = none)
    (disjoint : ∀ scopeId, scopeId ∈ leftRegion.members → scopeId ∈ rightRegion.members → False)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences)
    (reachable : record.caller.processInstanceId ∈
      processInstanceClosureWithin state.calledProcessOccurrences [rightRoot.id.processInstanceId]
        (state.calledProcessOccurrences.length + 1)) :
    record.caller ∉ leftRegion.members ∧ record.calledRoot ∉ leftRegion.members := by
  have endpoints := exact_graph_call_endpoints_live state
    (deriveInternalOccurrenceRegion_success state leftRoot leftRegion leftPrepared).1 record member
  have targetReachable := processInstanceClosureWithin_closed state.calledProcessOccurrences
    [rightRoot.id.processInstanceId] (by simp) record member reachable
  have callerInside := (regional_called_tree_membership program state expectedInstanceId instanceId
    valid running rightRoot rightRegion rightPrepared rightLive rightParent record.caller endpoints.1).mpr reachable
  have targetInside := (regional_called_tree_membership program state expectedInstanceId instanceId
    valid running rightRoot rightRegion rightPrepared rightLive rightParent record.calledRoot endpoints.2).mpr
      targetReachable
  exact ⟨fun inside => disjoint _ inside callerInside, fun inside => disjoint _ inside targetInside⟩

/-- Actual cancellation preserves the other Call closure with the retained graph's own fuel. -/
theorem processInstanceClosureWithin_cancelScopeSubtree (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (leftRoot : ScopeOccurrenceId) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (rightRoot : RuntimeScopeOccurrence) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot.id = some rightRegion)
    (rightLive : rightRoot ∈ state.scopeOccurrences) (rightParent : rightRoot.parent = none)
    (disjoint : ∀ scopeId, scopeId ∈ leftRegion.members → scopeId ∈ rightRegion.members → False)
    (disposition : SelectedScopeDisposition) (candidate : SemanticId) :
    candidate ∈ processInstanceClosureWithin
      (cancelScopeSubtree state leftRoot disposition).calledProcessOccurrences
      [rightRoot.id.processInstanceId]
      ((cancelScopeSubtree state leftRoot disposition).calledProcessOccurrences.length + 1) ↔
    candidate ∈ processInstanceClosureWithin state.calledProcessOccurrences
      [rightRoot.id.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
  rw [cancelScopeSubtree_calls_eq_prepared_region program state expectedInstanceId instanceId
    valid running leftRoot leftRegion leftPrepared disposition]
  apply processInstanceClosureWithin_filter _ _ (by simp)
  intro record member reachable
  obtain ⟨callerOutside, targetOutside⟩ := cancellation_disjoint_reachable_call_endpoints
    program state expectedInstanceId instanceId valid running leftRoot leftRegion leftPrepared
    rightRoot rightRegion rightPrepared rightLive rightParent disjoint record member reachable
  simp [InternalOccurrenceRegion.contains, callerOutside, targetOutside]

/-- All six owner-instance masks are literally equal after re-derivation on cancellation. -/
theorem callReferenceRetention_after_disjoint_cancellation (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (leftRoot : ScopeOccurrenceId) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (right : CalledProcessOccurrence) (rightRoot : RuntimeScopeOccurrence)
    (rightBinding : rightRoot.id = right.calledRoot) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot.id = some rightRegion)
    (rightLive : rightRoot ∈ state.scopeOccurrences) (rightParent : rightRoot.parent = none)
    (disjoint : ∀ scopeId, scopeId ∈ leftRegion.members → scopeId ∈ rightRegion.members → False)
    (disposition : SelectedScopeDisposition) :
    callReferenceRetention (cancelScopeSubtree state leftRoot disposition) right =
      callReferenceRetention state right := by
  have containsSame (candidate : SemanticId) :
      (processInstanceClosureWithin (cancelScopeSubtree state leftRoot disposition).calledProcessOccurrences
        [right.calledRoot.processInstanceId]
        ((cancelScopeSubtree state leftRoot disposition).calledProcessOccurrences.length + 1)).contains candidate =
      (processInstanceClosureWithin state.calledProcessOccurrences [right.calledRoot.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains candidate := by
    apply Bool.eq_iff_iff.mpr
    simpa only [List.contains_iff_mem, rightBinding] using
      processInstanceClosureWithin_cancelScopeSubtree program state expectedInstanceId instanceId
        valid running leftRoot leftRegion leftPrepared rightRoot rightRegion rightPrepared
        rightLive rightParent disjoint disposition candidate
  simp only [callReferenceRetention, containsSame]

/-- The re-derived Call ownership condition survives either cancellation disposition.
This does not assume or establish successor selection, publication, or aggregate validity. -/
theorem regionalOwnershipClosed_after_disjoint_cancellation (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (leftRoot : ScopeOccurrenceId) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (right : CalledProcessOccurrence) (rightRoot : RuntimeScopeOccurrence)
    (rightBinding : rightRoot.id = right.calledRoot) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot.id = some rightRegion)
    (rightLive : rightRoot ∈ state.scopeOccurrences) (rightParent : rightRoot.parent = none)
    (disjoint : ∀ scopeId, scopeId ∈ leftRegion.members → scopeId ∈ rightRegion.members → False)
    (disposition : SelectedScopeDisposition)
    (closed : regionalOwnershipClosed state (callReferenceRetention state right) = true) :
    regionalOwnershipClosed (cancelScopeSubtree state leftRoot disposition)
      (callReferenceRetention (cancelScopeSubtree state leftRoot disposition) right) = true := by
  rw [callReferenceRetention_after_disjoint_cancellation program state expectedInstanceId instanceId
    valid running leftRoot leftRegion leftPrepared right rightRoot rightBinding rightRegion
    rightPrepared rightLive rightParent disjoint disposition]
  exact regionalOwnershipClosed_after_filter state (cancelScopeSubtree state leftRoot disposition)
    (callReferenceRetention state right) (cancellationReferenceRetention state leftRoot disposition)
    (cancellationReferenceRetention_matches_removal state leftRoot disposition) closed

end BpmnSemantics.SemanticProcess
