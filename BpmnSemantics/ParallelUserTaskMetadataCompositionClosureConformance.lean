module

public import BpmnSemantics.ParallelUserTaskMetadataCompositionFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! # Parallel User Task metadata composition closure conformance

Proved metadata-erased control equivalence, existing relation-family reuse, bounded closure, and the exact disjoint-versus-overlapping data-order boundary.
-/

@[expose] public section

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def eraseWaitMetadata (wait : UserTaskWait) : UserTaskWait :=
  { wait with
    task := { wait.task with metadata := none }
    metadata := none }

def eraseRuntimeMetadata (state : RuntimeState) : RuntimeState :=
  { state with waits := state.waits.map eraseWaitMetadata }

def eraseResultMetadata (result : StimulusResult) : StimulusResult :=
  { result with state := eraseRuntimeMetadata result.state }

def committedOperationKinds (result : TracedStimulusResult) :
    List SemanticOperationKind :=
  result.committedTransitions.filterMap fun
    | .externalStimulus _ => none
    | .internalOperation record => some record.operationKind

def emptyContentFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-content-empty" contentTaskId [])

def emptyRiskFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

def emptyContentThenRisk (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterContent := emptyContentFirst program started
  applyStimulus scenarioClosureLimit program afterContent.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

def emptyRiskThenContent (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterRisk := emptyRiskFirst program started
  applyStimulus scenarioClosureLimit program afterRisk.state
    (completionStimulus "complete-content-empty" contentTaskId [])

def submittedKeysDisjoint
    (left right : List VariableBinding) : Bool :=
  left.all fun leftBinding =>
    right.all fun rightBinding => decide (leftBinding.name ≠ rightBinding.name)

def overlappingContentPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean true }]

def overlappingRiskPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean false }]

def overlappingContentFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

def overlappingRiskFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

def overlappingContentThenRisk : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingContentFirst.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

def overlappingRiskThenContent : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingRiskFirst.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

/-- Erasing metadata commutes with start, either first completion, and both synchronization-to-closure orders. -/
def metadata_erasure_preserves_parallel_control_through_closure : Bool := decide <|
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
        emptyRiskThenContent erasedProgram erasedStarted

/-- The composed start and terminal closure use only the existing initiate, duplicate, await, synchronize, None End, and complete-scope relations. -/
def committed_relation_families_are_the_existing_parallel_account : Bool := decide <|
    committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          initialState startStimulus) =
      [ .initiate, .duplicate, .awaitUserTask, .awaitUserTask ] ∧
      committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          contentFirst.state
          (completionStimulus "complete-risk-traced" riskTaskId riskPatch)) =
      [ .synchronize, .reachNoneEnd, .completeScope ]

/-- Both completion orders reach the same terminal control state independently of their disjoint data proof. -/
def both_completion_orders_reach_same_terminal_control : Bool := decide <|
    contentThenRisk.state.control = .completed instanceId ∧
      riskThenContent.state.control = .completed instanceId ∧
      contentThenRisk.state.control = riskThenContent.state.control ∧
      contentThenRisk.internalStepBoundExceeded = false ∧
      riskThenContent.internalStepBoundExceeded = false

/-- Final Process data agrees for the exact catalog patches only under their explicit disjoint-key premise. -/
theorem disjoint_catalog_patches_reach_equal_final_process_data
    (_disjoint : submittedKeysDisjoint contentPatch riskPatch = true) :
    contentThenRisk.state.variables.process =
      riskThenContent.state.variables.process := by
  decide +kernel

/-- Overlapping submitted keys retain accepted command order, so no arbitrary commutativity claim is available. -/
def overlapping_patches_have_ordered_unequal_final_data : Bool := decide <|
    submittedKeysDisjoint overlappingContentPatch overlappingRiskPatch = false ∧
      overlappingContentThenRisk.state.variables.process ≠
        overlappingRiskThenContent.state.variables.process

/-- The start and post-completion closure thresholds are exactly those of the erased parallel account. -/
def closure_bounds_are_unchanged_by_metadata : Bool := decide <|
    (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 3 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 4 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded = true ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded = false ∧
      (applyStimulus 2 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = true ∧
      (applyStimulus 3 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = false

/-- Every executable check of this module, named for the driver's failure report. -/
def parallelUserTaskMetadataCompositionClosureConformanceChecks : List (String × Bool) := [
  ("metadata_erasure_preserves_parallel_control_through_closure", metadata_erasure_preserves_parallel_control_through_closure),
  ("committed_relation_families_are_the_existing_parallel_account", committed_relation_families_are_the_existing_parallel_account),
  ("both_completion_orders_reach_same_terminal_control", both_completion_orders_reach_same_terminal_control),
  ("overlapping_patches_have_ordered_unequal_final_data", overlapping_patches_have_ordered_unequal_final_data),
  ("closure_bounds_are_unchanged_by_metadata", closure_bounds_are_unchanged_by_metadata)
]

end BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
