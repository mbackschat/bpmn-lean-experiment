import BpmnSemantics.ParallelUserTaskMetadataCompositionFixtures

/-! # Parallel User Task metadata composition closure conformance

Proved metadata-erased control equivalence, existing relation-family reuse, bounded closure, and the exact disjoint-versus-overlapping data-order boundary.
-/

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def eraseWaitMetadata (wait : UserTaskWait) : UserTaskWait :=
  { wait with
    task := { wait.task with metadata := none }
    metadata := none }

private def eraseRuntimeMetadata (state : RuntimeState) : RuntimeState :=
  { state with waits := state.waits.map eraseWaitMetadata }

private def eraseResultMetadata (result : StimulusResult) : StimulusResult :=
  { result with state := eraseRuntimeMetadata result.state }

private def committedOperationKinds (result : TracedStimulusResult) :
    List SemanticOperationKind :=
  result.committedTransitions.filterMap fun
    | .externalStimulus _ => none
    | .internalOperation record => some record.operationKind

private def emptyContentFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-content-empty" contentTaskId [])

private def emptyRiskFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

private def emptyContentThenRisk (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterContent := emptyContentFirst program started
  applyStimulus scenarioClosureLimit program afterContent.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

private def emptyRiskThenContent (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterRisk := emptyRiskFirst program started
  applyStimulus scenarioClosureLimit program afterRisk.state
    (completionStimulus "complete-content-empty" contentTaskId [])

private def submittedKeysDisjoint
    (left right : List VariableBinding) : Bool :=
  left.all fun leftBinding =>
    right.all fun rightBinding => decide (leftBinding.name ≠ rightBinding.name)

private def overlappingContentPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean true }]

private def overlappingRiskPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean false }]

private def overlappingContentFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

private def overlappingRiskFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

private def overlappingContentThenRisk : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingContentFirst.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

private def overlappingRiskThenContent : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingRiskFirst.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

/-- Erasing metadata commutes with start, either first completion, and both synchronization-to-closure orders. -/
theorem metadata_erasure_preserves_parallel_control_through_closure :
    eraseResultMetadata compositionStarted = erasedStarted ∧
      eraseResultMetadata
          (emptyContentFirst compositionProgram compositionStarted) =
        emptyContentFirst erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyRiskFirst compositionProgram compositionStarted) =
        emptyRiskFirst erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyContentThenRisk compositionProgram compositionStarted) =
        emptyContentThenRisk erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyRiskThenContent compositionProgram compositionStarted) =
        emptyRiskThenContent erasedProgram erasedStarted := by
  decide +kernel

/-- The composed start and terminal closure use only the existing initiate, duplicate, await, synchronize, None End, and complete-scope relations. -/
theorem committed_relation_families_are_the_existing_parallel_account :
    committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          initialState startStimulus) =
      [ .initiate, .duplicate, .awaitUserTask, .awaitUserTask ] ∧
      committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          contentFirst.state
          (completionStimulus "complete-risk-traced" riskTaskId riskPatch)) =
      [ .synchronize, .reachNoneEnd, .completeScope ] := by
  decide +kernel

/-- Both completion orders reach the same terminal control state independently of their disjoint data proof. -/
theorem both_completion_orders_reach_same_terminal_control :
    contentThenRisk.state.control = .completed instanceId ∧
      riskThenContent.state.control = .completed instanceId ∧
      contentThenRisk.state.control = riskThenContent.state.control ∧
      contentThenRisk.internalStepBoundExceeded = false ∧
      riskThenContent.internalStepBoundExceeded = false := by
  decide +kernel

/-- Final Process data agrees for the exact catalog patches only under their explicit disjoint-key premise. -/
theorem disjoint_catalog_patches_reach_equal_final_process_data
    (_disjoint : submittedKeysDisjoint contentPatch riskPatch = true) :
    contentThenRisk.state.variables.process =
      riskThenContent.state.variables.process := by
  decide +kernel

/-- Overlapping submitted keys retain accepted command order, so no arbitrary commutativity claim is available. -/
theorem overlapping_patches_have_ordered_unequal_final_data :
    submittedKeysDisjoint overlappingContentPatch overlappingRiskPatch = false ∧
      overlappingContentThenRisk.state.variables.process ≠
        overlappingRiskThenContent.state.variables.process := by
  decide +kernel

/-- The start and post-completion closure thresholds are exactly those of the erased parallel account. -/
theorem closure_bounds_are_unchanged_by_metadata :
    (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 3 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 4 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded = true ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded = false ∧
      (applyStimulus 2 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = true ∧
      (applyStimulus 3 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = false := by
  decide +kernel

end BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
