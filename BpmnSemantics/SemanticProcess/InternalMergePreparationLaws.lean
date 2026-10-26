module

public import BpmnSemantics.SemanticProcess.InternalMergePreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlTokenValidity

/-! Prepared merge selections preserve runtime-state validity and leave open occurrences unchanged. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Complete predecessor provenance supplies output ownership; the existing patch law retains the full invariant. -/
theorem prepareInternalMerge_preserves_runtimeStateWellFormed (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (alternative : InternalAlternative)
    (prepared : PreparedInternalMerge) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalMerge? program state operation alternative = some prepared) :
    runtimeStateWellFormed program instanceId (prepared.selection.apply state) = true := by
  obtain ⟨_, selected, _, _, delta, selection, _, live, _, _, _, _, deltaFound, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  have outputs := internalLocalControlPositionDelta?_output_bindings program selected.tokens delta deltaFound
  obtain ⟨_, _, _, _, _, _, _, present⟩ :=
    selectInternalMerge_facts state operation alternative selected selection
  have executionValid : compensationExecutionStateValid program state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid
    exact valid.2.1.2
  have separated := selected.tokens.separatesActiveCancelOwners_of_owned_token program state
    executionValid ⟨selected.input, selected.owner⟩ present rfl
  exact selected.tokens.preserves_runtimeStateWellFormed program instanceId state valid separated live
    (fun place member => (outputs place member).1) (fun place member => (outputs place member).2)

theorem InternalMergeSelection.open_occurrences_frame (program : Program)
    (state : RuntimeState) (selected : InternalMergeSelection) (instanceId : SemanticId)
    (running : state.control = .running instanceId) :
    projectOpenFlowNodeOccurrences? program (selected.apply state) =
      projectOpenFlowNodeOccurrences? program state :=
  selected.tokens.open_occurrences_frame program state instanceId running

/-- The frame protects only the selected owned buckets, live owner, control and time; other offers may change. -/
theorem prepareInternalMerge_read_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (found : prepareInternalMerge? program before operation alternative = some prepared)
    (control : after.control = before.control) (time : after.logicalTimeMs = before.logicalTimeMs)
    (scope : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.owner)) =
      before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.owner)))
    (tokens : ∀ place ∈ prepared.selection.tokens.consumed ++ prepared.selection.tokens.produced,
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = prepared.selection.owner)) =
        before.tokens.filter (fun token => decide (token.placeId = place && token.owner = prepared.selection.owner))) :
    prepareInternalMerge? program after operation alternative = some prepared := by
  obtain ⟨snapshots, selected, instanceId, identity, delta, selection, running, live,
    nonempty, safeTime, available, identityFound, deltaFound, rfl⟩ :=
    prepareInternalMerge_facts program before operation alternative prepared found
  dsimp only [makeInternalMergePreparation] at scope tokens
  have selectionAfter := selectInternalMerge_read_frame before after operation alternative selected selection
    (tokens selected.input (by simp [InternalMergeSelection.tokens]))
  have liveAfter : exactLiveOccurrence after selected.owner = true := by
    simp only [exactLiveOccurrence, decide_eq_true_eq] at live ⊢
    exact (congrArg List.length scope).trans live
  have availableAfter := internalLocalControlTokensAvailable_read_frame before after selected.tokens tokens
  simp [prepareInternalMerge?, snapshots, selectionAfter, runningInstance?, control, running,
    liveAfter, nonempty, time, safeTime, availableAfter, available, identityFound, deltaFound,
    makeInternalMergePreparation]

end BpmnSemantics.SemanticProcess.InternalCommutation
