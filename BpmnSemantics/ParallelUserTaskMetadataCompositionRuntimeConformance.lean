module

public import BpmnSemantics.ParallelUserTaskMetadataCompositionFixtures

/-! # Parallel User Task metadata composition runtime conformance

Proved start, exact sibling preservation, and occurrence-refusal behavior for two concurrent metadata-bearing User Tasks.
-/

@[expose] public section

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- Start closes to exactly two distinct metadata-bearing waits with the unchanged legal activation pair. -/
def start_creates_exact_two_metadata_waits_and_activations : Bool := decide <|
    compositionStarted.outcome = .committed ∧
      compositionStarted.state.waits = [contentWait, riskWait] ∧
      compositionStarted.state.tokens = [] ∧
      compositionStarted.state.activations =
        [ { taskId := contentTaskId, count := 1 }
        , { taskId := riskTaskId, count := 1 } ] ∧
      compositionStarted.internalStepBoundExceeded = false ∧
      compositionStarted.ambiguousInternalChoice = false

/-- Exact completion of content removes only that occurrence and preserves the risk wait byte-for-byte. -/
def content_completion_preserves_exact_risk_sibling : Bool := decide <|
    contentFirst.outcome = .committed ∧
      contentFirst.state.waits = [riskWait] ∧
      contentFirst.state.variables.process.bindings = contentPatch ∧
      contentFirst.state.control = .running instanceId

/-- Exact completion of risk removes only that occurrence and preserves the content wait byte-for-byte. -/
def risk_completion_preserves_exact_content_sibling : Bool := decide <|
    riskFirst.outcome = .committed ∧
      riskFirst.state.waits = [contentWait] ∧
      riskFirst.state.variables.process.bindings = riskPatch ∧
      riskFirst.state.control = .running instanceId

/-- A wrong activation is rejected before value installation and preserves both complete waits. -/
def wrong_occurrence_preserves_both_metadata_waits : Bool := decide <|
    applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { taskInstanceId contentTaskId with activation := 2 } contentPatch) =
      { outcome := .rejected
        state := compositionStarted.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

/-- Repeating an already committed content occurrence is stale and preserves the exact remaining sibling. -/
def stale_content_occurrence_preserves_exact_risk_sibling : Bool := decide <|
    applyStimulus scenarioClosureLimit compositionProgram contentFirst.state
        (completionStimulus "stale-content" contentTaskId contentPatch) =
      { outcome := .rejected
        state := contentFirst.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

/-- Every executable check of this module, named for the driver's failure report. -/
def parallelUserTaskMetadataCompositionRuntimeConformanceChecks : List (String × Bool) := [
  ("start_creates_exact_two_metadata_waits_and_activations", start_creates_exact_two_metadata_waits_and_activations),
  ("content_completion_preserves_exact_risk_sibling", content_completion_preserves_exact_risk_sibling),
  ("risk_completion_preserves_exact_content_sibling", risk_completion_preserves_exact_content_sibling),
  ("wrong_occurrence_preserves_both_metadata_waits", wrong_occurrence_preserves_both_metadata_waits),
  ("stale_content_occurrence_preserves_exact_risk_sibling", stale_content_occurrence_preserves_exact_risk_sibling)
]

end BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
