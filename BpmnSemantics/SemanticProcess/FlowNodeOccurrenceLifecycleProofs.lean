import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! # Flow-node occurrence lifecycle fold-soundness laws

This module owns the quantified laws relating an accepted lifecycle delta to the independently
projected open occurrences: that an accepted operation or external-stimulus delta folds exactly to
the immediate successor projection, and that it preserves every prior open occurrence for which it
publishes no terminal.

Exactness of the four actual cancellation branches is the separate responsibility of
[`FlowNodeOccurrenceCancellationProofs`](FlowNodeOccurrenceCancellationProofs.lean), which consumes
these laws. Concrete executable witnesses remain in the conformance module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem contains_ended_anchor_iff (ended : List UnnumberedFlowNodeOccurrenceEnd)
    (anchor : SemanticFlowNodeOccurrenceAnchor) :
    (ended.map (·.anchor)).contains anchor = true ↔
      ∃ ending, ending ∈ ended ∧ ending.anchor = anchor := by
  simp

private theorem accepted_candidate_equals_independent_open_projection
    (program : Program) (before after : RuntimeState)
    (candidate delta : UnnumberedFlowNodeOccurrenceDelta)
    (accepted : acceptFlowNodeOccurrenceCandidate? program before after candidate = some delta) :
    ∃ openBefore openAfter,
      candidate = delta ∧
      projectOpenFlowNodeOccurrences? program before = some openBefore ∧
      projectOpenFlowNodeOccurrences? program after = some openAfter ∧
      applyFlowNodeOccurrenceDelta? openBefore delta = some openAfter := by
  unfold acceptFlowNodeOccurrenceCandidate? at accepted
  simp only [Option.bind_eq_bind] at accepted
  obtain ⟨openBefore, beforeEq, projected⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨openAfter, afterEq, folded⟩ := Option.bind_eq_some_iff.mp projected
  obtain ⟨foldResult, foldEq, selected⟩ := Option.bind_eq_some_iff.mp folded
  split at selected <;> simp_all

/-- Any accepted operation delta folds to the independently projected immediate successor. -/
theorem accepted_operation_delta_equals_independent_open_projection
    (program : Program) (before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) (transitionIndex : Nat)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (accepted : flowNodeOccurrenceDeltaForOperation? program before after operation
      commandId transitionIndex = some delta) :
    ∃ openBefore openAfter,
      projectOpenFlowNodeOccurrences? program before = some openBefore ∧
      projectOpenFlowNodeOccurrences? program after = some openAfter ∧
      applyFlowNodeOccurrenceDelta? openBefore delta = some openAfter := by
  unfold flowNodeOccurrenceDeltaForOperation? at accepted
  obtain ⟨candidate, _, acceptedCandidate⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨openBefore, openAfter, candidateEq, beforeEq, afterEq, folded⟩ :=
    accepted_candidate_equals_independent_open_projection program before after candidate delta
      acceptedCandidate
  exact ⟨openBefore, openAfter, beforeEq, afterEq, folded⟩

/-- External-stimulus acceptance has the same exact immediate-successor fold guarantee. -/
theorem accepted_stimulus_delta_equals_independent_open_projection
    (program : Program) (before after : RuntimeState) (stimulus : Stimulus)
    (transitionIndex : Nat) (delta : UnnumberedFlowNodeOccurrenceDelta)
    (accepted : flowNodeOccurrenceDeltaForStimulus? program before after stimulus
      transitionIndex = some delta) :
    ∃ openBefore openAfter,
      projectOpenFlowNodeOccurrences? program before = some openBefore ∧
      projectOpenFlowNodeOccurrences? program after = some openAfter ∧
      applyFlowNodeOccurrenceDelta? openBefore delta = some openAfter := by
  unfold flowNodeOccurrenceDeltaForStimulus? at accepted
  obtain ⟨candidate, _, acceptedCandidate⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨openBefore, openAfter, candidateEq, beforeEq, afterEq, folded⟩ :=
    accepted_candidate_equals_independent_open_projection program before after candidate delta
      acceptedCandidate
  exact ⟨openBefore, openAfter, beforeEq, afterEq, folded⟩

/-- An accepted delta preserves every prior open occurrence for which it publishes no terminal. -/
theorem accepted_delta_preserves_unended_open_occurrence
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (occurrence : OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after)
    (wasOpen : occurrence ∈ current)
    (unended : (delta.ended.map (·.anchor)).contains occurrence.anchor = false) :
    occurrence ∈ after := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  repeat' split at accepted <;> simp_all
  have resultEq : removeEndedFlowNodeOccurrences (availableAfterStarts current delta)
      delta.ended = after := accepted.2.2.2
  rw [← resultEq]
  rw [mem_removeEndedFlowNodeOccurrences]
  constructor
  · exact mem_sortFlowNodeOccurrenceStarts occurrence (current ++ delta.started) |>.2
      (List.mem_append_left delta.started wasOpen)
  · cases containsEq : (delta.ended.map (·.anchor)).contains occurrence.anchor with
    | false => rfl
    | true =>
        obtain ⟨ending, endingMember, anchorEq⟩ :=
          (contains_ended_anchor_iff delta.ended occurrence.anchor).mp containsEq
        exact False.elim (unended ending endingMember anchorEq)

end BpmnSemantics.SemanticProcess
