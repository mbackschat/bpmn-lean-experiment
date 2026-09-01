import BpmnSemantics.ParallelUserTaskMetadataCompositionFixtures

/-! # Parallel User Task metadata composition runtime conformance

Proved start, exact sibling preservation, and occurrence-refusal behavior for two concurrent metadata-bearing User Tasks.
-/

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- Start closes to exactly two distinct metadata-bearing waits with the unchanged legal activation pair. -/
theorem start_creates_exact_two_metadata_waits_and_activations :
    compositionStarted.outcome = .committed ∧
      compositionStarted.state.waits = [contentWait, riskWait] ∧
      compositionStarted.state.tokens = [] ∧
      compositionStarted.state.activations =
        [ { taskId := contentTaskId, count := 1 }
        , { taskId := riskTaskId, count := 1 } ] ∧
      compositionStarted.internalStepBoundExceeded = false ∧
      compositionStarted.ambiguousInternalChoice = false := by
  decide +kernel

/-- Exact completion of content removes only that occurrence and preserves the risk wait byte-for-byte. -/
theorem content_completion_preserves_exact_risk_sibling :
    contentFirst.outcome = .committed ∧
      contentFirst.state.waits = [riskWait] ∧
      contentFirst.state.variables.process.bindings = contentPatch ∧
      contentFirst.state.control = .running instanceId := by
  decide +kernel

/-- Exact completion of risk removes only that occurrence and preserves the content wait byte-for-byte. -/
theorem risk_completion_preserves_exact_content_sibling :
    riskFirst.outcome = .committed ∧
      riskFirst.state.waits = [contentWait] ∧
      riskFirst.state.variables.process.bindings = riskPatch ∧
      riskFirst.state.control = .running instanceId := by
  decide +kernel

/-- A wrong activation is rejected before value installation and preserves both complete waits. -/
theorem wrong_occurrence_preserves_both_metadata_waits :
    applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { taskInstanceId contentTaskId with activation := 2 } contentPatch) =
      { outcome := .rejected
        state := compositionStarted.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Repeating an already committed content occurrence is stale and preserves the exact remaining sibling. -/
theorem stale_content_occurrence_preserves_exact_risk_sibling :
    applyStimulus scenarioClosureLimit compositionProgram contentFirst.state
        (completionStimulus "stale-content" contentTaskId contentPatch) =
      { outcome := .rejected
        state := contentFirst.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

end BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
