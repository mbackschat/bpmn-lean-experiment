import BpmnSemantics.SemanticProcess.InternalMergePreparation
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDeltaProofs
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceInstantaneousPublication

/-! Retained Merge records bind the exact offered bucket used by strict replay, as required by the
[complete-frontier outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Complete preparation supplies exact Program provenance and the offered owned token; no unique-offer premise is added. -/
theorem prepareInternalMerge_record_replays (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (found : prepareInternalMerge? program state operation alternative = some prepared) :
    replayInternalTransition? program state prepared.selection.record =
      some (prepared.selection.apply state) := by
  obtain ⟨snapshots, selected, instanceId, identity, delta, selection, _, _, _, _, _, identityFound, _, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  obtain ⟨selectedOperation, _, id, origin, inputs, shape, offered, present⟩ :=
    selectInternalMerge_facts state operation alternative selected selection
  have selectedFromProgram := candidateOperationFlowNodeIdentity_exact_operation program operation
    selected.owner selected.owner operation.origin.elementId identity identityFound
  have selectedShape := selectedOperation.trans shape
  rw [shape] at selectedFromProgram
  simpa [InternalMergeSelection.record, makeInternalMergePreparation, selectedShape,
    InternalMergeSelection.apply, InternalMergeSelection.tokens, TokenPatch.apply, removeTokens, addTokens,
    SemanticOperation.id, SemanticOperation.kind, SemanticOperation.origin] using
    replayInternalTransition_merge_input program state id origin inputs selected.output selected.input
      selected.owner snapshots selectedFromProgram offered present

theorem prepareInternalMerge_accepted_lifecycle (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalMerge) (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true) :
    acceptFlowNodeOccurrenceCandidate? program state (prepared.selection.apply state)
      (prepared.publicationTemplate.lifecycle commandId transitionIndex) =
      some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  have frame := prepared.selection.open_occurrences_frame program state instanceId running
  have folded := applyFlowNodeOccurrenceDelta_instantaneous current prepared.publicationTemplate.identity
    commandId transitionIndex
    (projectOpenFlowNodeOccurrences_anchor_nodup program state current projected)
    (projectOpenFlowNodeOccurrences_transitionAnchor_false program state current projected)
    (projectOpenFlowNodeOccurrences_sorted program state current projected)
  change applyFlowNodeOccurrenceDelta? current
    (prepared.publicationTemplate.lifecycle commandId transitionIndex) = some current at folded
  simp only [acceptFlowNodeOccurrenceCandidate?, projected, frame, Option.bind_eq_bind,
    Option.bind_some, folded, ↓reduceIte]

theorem prepareInternalMerge_position (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (instanceId : SemanticId) (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalMerge? program state operation alternative = some prepared) :
    controlPositionDelta? program instanceId state (prepared.selection.apply state) =
      some prepared.publicationTemplate.positionDelta := by
  have beforePosition := runtimeStateWellFormed_position program instanceId state valid
  have afterPosition := runtimeStateWellFormed_position program instanceId _
    (prepareInternalMerge_preserves_runtimeStateWellFormed program state operation alternative prepared instanceId valid found)
  obtain ⟨_, selected, _, _, delta, _, _, _, _, _, available, _, deltaFound, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  exact internalTokenPatch_position_delta program state (selected.apply state) selected.tokens delta instanceId
    beforePosition afterPosition rfl rfl deltaFound available

/-- Retained metadata, lifecycle and position agree with independently accepted publication at every index. -/
theorem prepareInternalMerge_accepted_publication (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepareInternalMerge? program state operation alternative = some prepared) :
    actualInternalAlternativePublication? program instanceId state (prepared.selection.apply state)
      operation alternative commandId transitionIndex =
      some ((internalMergePublicationTemplate prepared).instantiate commandId transitionIndex) := by
  have replayed := prepareInternalMerge_record_replays program state operation alternative prepared found
  have lifecycle := prepareInternalMerge_accepted_lifecycle program state prepared instanceId commandId
    transitionIndex running projectable
  have position := prepareInternalMerge_position program state operation alternative prepared instanceId valid found
  obtain ⟨_, selected, hosting, identity, delta, selection, _, _, _, _, _, identityFound, _, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  dsimp only [makeInternalMergePreparation, InternalLocalControlPublicationTemplate.lifecycle]
    at replayed lifecycle position
  change acceptFlowNodeOccurrenceCandidate? program state (selected.apply state)
    (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity]) =
      some (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity]) at lifecycle
  have alternativeEq := (selectInternalMerge_facts state operation alternative selected selection).2.1
  rw [← alternativeEq] at selection ⊢
  simp only [InternalMergeSelection.alternative] at selection
  simp [actualInternalAlternativePublication?, InternalMergeSelection.alternative, selection,
    makeInternalMergePreparation, identityFound, replayed, lifecycle, position,
    internalMergePublicationTemplate, InternalTransitionPublicationTemplate.instantiate,
    InternalTransitionLifecycleTemplate.instantiate]

end BpmnSemantics.SemanticProcess.InternalCommutation
